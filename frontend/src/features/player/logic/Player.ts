import {Character} from '../../game-objects/logic/Character';
import {hpToDisplay} from '../../game-objects/logic/_GameObject';
import {StatusEffect} from '../../game-objects/logic/StatusEffect';
import {Controls} from '../../controls/logic/Controls';
import {Camera} from '../../camera/logic/Camera';
import {DamageState, VitalSigns, VitalSignValues} from '../../vital-signs/logic/VitalSigns';
import {isDefined} from '../../common/logic/Utils';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';
import {MiniMap} from '../../mini-map/logic/MiniMap';
import {PlayerCreatedEvent, PlayerDamagedEvent} from '../../core/logic/Events';
import * as DarknessOverlay from '../../darkness/logic/DarknessOverlay';
import {setLocalPlayerLevel} from '../../../client-data/Mobs';
import {setLocalPlayerMaxHealth} from '../../../client-data/Skills';
import {shieldBarSegments} from '../../game-objects/logic/ShieldBarMath';
import './PlayerJuice';

export class Player {
    character: Character;
    controls: Controls;
    camera: Camera;
    vitalSigns: VitalSigns;
    private readonly miniMap: MiniMap;
    private lastLevel: number | null = null;

    constructor(id: number, x: number, y: number, name: string, miniMap: MiniMap) {
        this.character = new Character(id, x, y, name, true);
        this.character.visibleOnMinimap = true;

        this.controls = new Controls(this.character);

        this.camera = new Camera(this.character);
        this.miniMap = miniMap;
        miniMap.add(this.character);
        miniMap.setPlayerCharacter(this.character);

        this.vitalSigns = new VitalSigns();
    }

    init() {
        PlayerCreatedEvent.trigger(this);
    }

    updateFromBackend(entity) {
        if (isDefined(entity.position)) {
            this.character.setPosition(entity.position.x, entity.position.y);
        }

        let damageState: DamageState = DamageState.None;
        if (entity.statusEffects.includes(StatusEffect.Damaged)) {
            damageState = DamageState.OneTime;
            PlayerDamagedEvent.trigger({player: this, damageState: damageState});
        } else if (entity.statusEffects.includes(StatusEffect.DamagedAmbient)) {
            damageState = DamageState.Continuous;
            PlayerDamagedEvent.trigger({player: this, damageState: damageState});
        }

        if (entity.statusEffects.includes(StatusEffect.BurstFired)) {
            this.character.showBurstRing(entity.burstRadius);
        }

        // Health is absolute HP now (item 11 Phase 1); the HUD bar works in a
        // 0..MAXIMUM_VALUES.health scale, so feed it the health fraction.
        // The fraction's denominator is total effective HP (N1,
        // shieldBarSegments) — with a shield up that exceeds the pool, the
        // health segment shrinks so health + shield together read as one bar.
        const {healthFraction, shieldFraction} = shieldBarSegments(
            entity.health ?? 0, entity.shieldHp ?? 0, entity.maxHealth ?? 0);
        let newVitalSigns: VitalSignValues = {
            health: Math.round(healthFraction * VitalSigns.MAXIMUM_VALUES.health),
            xp: Math.round((entity.levelProgress || 0) * VitalSigns.MAXIMUM_VALUES.xp),
        };
        this.vitalSigns.updateFromBackend(newVitalSigns, damageState);
        // Absolute numbers over the HUD bars (health + XP toward next level).
        HUD.updateBarTexts(
            entity.health ?? 0,
            entity.maxHealth ?? 0,
            entity.xpInLevel ?? 0,
            entity.xpForNextLevel ?? 0,
        );
        if (isDefined(entity.health)) {
            this.character.setHealth(entity.health, entity.maxHealth);
        }
        if (isDefined(entity.maxHealth)) {
            // The skill tooltip needs the real pool to show what a resource cost
            // will actually charge: the server floors every positive cost at
            // 1 HP, so on a small pool the authored fraction understates it.
            setLocalPlayerMaxHealth(entity.maxHealth);
        }
        // Shield segment on the HUD bar + own overhead bar (skill-vocab
        // chunk 2); 0 hides both.
        if (isDefined(entity.shieldHp)) {
            HUD.updateShield(healthFraction, shieldFraction);
            this.character.setShield(entity.shieldHp, entity.maxHealth);
        }
        if (isDefined(entity.auraCategory)) {
            this.character.setAuraCategories(entity.auraCategory);
        }
        // Own buff/debuff pips (applied_effects): the kinds currently applied
        // TO this player — a dot shows before its first damage tick lands.
        if (isDefined(entity.appliedEffects)) {
            this.character.setAppliedEffects(entity.appliedEffects);
        }
        if (isDefined(entity.auraRadius)) {
            this.character.setAuraRadius(entity.auraRadius);
        }
        // Own bare aura tick indicator (skill-vocab chunk 6): the wire cadence
        // + phase drive the orbiting dot, so a haste visibly speeds up your own
        // ring. Fed after setAuraRadius so the ring radius is set. Since N5 the
        // landed beat also drives the HUD metronome on the active aura slot —
        // the rhythm stays readable where the eyes are while switching loadout.
        if (isDefined(entity.auraTickInterval)) {
            const beatLanded = this.character.setAuraTick(
                entity.auraTickInterval, entity.auraTickPhase, entity.activeSkillId ?? 0);
            if (beatLanded) {
                HUD.pulseAuraMetronome();
            }
        }
        // Own light hole in the darkness overlay (chunk 3). Floored at a TINY
        // self-glow (PO ruling 2026-07-17: darkness stays fully dark — the
        // hole may cover the avatar itself and nothing more). Other entities
        // keep the raw wire value. [PLACEHOLDER]
        if (isDefined(entity.lightRadius)) {
            DarknessOverlay.setLightRadius(this.character,
                Math.max(entity.lightRadius, MIN_SELF_LIGHT_PX));
        }
        if (isDefined(entity.level)) {
            // Level-up notification: the server sends no event — detect the
            // level increase from the per-tick value, like the spellbook diff.
            // Fires here (before HUD.updateSpellbook in Backend), so on a
            // milestone level the "Level N!" banner queues ahead of the
            // "New skill" unlock banner from the same tick. The first snapshot
            // after join/respawn only seeds lastLevel — no banner.
            if (this.lastLevel !== null && entity.level > this.lastLevel) {
                AlertBanner.show(`Level ${entity.level}!`, 'levelup');
                this.character.showFloatingText('Level up!', LEVEL_UP_COLOR, LEVEL_UP_SIZE_FACTOR);
            }
            this.lastLevel = entity.level;
            this.character.setLevel(entity.level);
            // Mob nameplates tint by their distance from THIS level, so every
            // visible mob re-reads it on the next frame (feedback pass C
            // item 2) — levelling up recolours the world around you.
            setLocalPlayerLevel(entity.level);
        }

        // Floating combat numbers over the own character (item 11). The
        // crit-flagged share pops big (skill-vocab chunk 1); the remainder
        // shows as a regular damage number.
        const critTaken = entity.critTaken > 0 ? entity.critTaken : 0;
        if (critTaken > 0) {
            this.character.showFloatingNumber(hpToDisplay(critTaken), 'crit');
        }
        if (entity.damageTaken > critTaken) {
            this.character.showFloatingNumber(hpToDisplay(entity.damageTaken - critTaken), 'damage');
        }
        if (entity.healReceived > 0) {
            this.character.showFloatingNumber(hpToDisplay(entity.healReceived), 'heal');
        }
        // Resource spent (round-7 item 7): blue, so paying a cost never reads
        // as being attacked — before this, a cost was only the bar dropping.
        if (entity.costPaid > 0) {
            this.character.showFloatingNumber(hpToDisplay(entity.costPaid), 'cost');
        }
        if (entity.xpGained > 0) {
            this.character.showFloatingNumber(entity.xpGained, 'xp');
        }
        // Aura-hit VFX (item 11 Step 4): slash / fire stamped by a damage aura.
        if (entity.auraHitStyle > 0) {
            this.character.showAuraHit(entity.auraHitStyle);
        }
        // Campfire became the respawn anchor (chunk 4): confirm the bind.
        // Own player only — nobody else needs to see it.
        if (entity.campfireBound) {
            this.character.showFloatingText('Bound to campfire', 0xE37313);
        }
        // In-combat indicator: shown while the recent-combat window is open
        // (also the window during which loadout editing is locked server-side).
        HUD.updateCombatIndicator(!!entity.inCombat);
    }

    remove() {
        // The own character is added to the minimap here rather than through
        // the entity snapshot, so nothing else will ever take it off again.
        // Until CLEAR_MINIMAP_ON_DEATH was turned off, the wholesale clear on
        // death hid this: without it, every death left a frozen player dot
        // behind and the respawned character added a second one.
        this.miniMap.remove(this.character);
        this.character.remove();
        this.controls.destroy();
        this.camera.destroy();
        this.vitalSigns.destroy();
    }
}

// Minimum radius (px) of the own character's darkness hole — deliberately
// tiny, just covering the avatar sprite itself (PO: darkness stays fully
// dark). [PLACEHOLDER]
const MIN_SELF_LIGHT_PX = 40;

// Level-up overhead flash: gold matching the banner's unlock/levelup color,
// crit-sized so it pops over the simultaneous +XP number.
const LEVEL_UP_COLOR = 0xffd75e;
const LEVEL_UP_SIZE_FACTOR = 1.6;
