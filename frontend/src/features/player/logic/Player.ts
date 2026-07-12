import {Character} from '../../game-objects/logic/Character';
import {hpToDisplay} from '../../game-objects/logic/_GameObject';
import {StatusEffect} from '../../game-objects/logic/StatusEffect';
import {Controls} from '../../controls/logic/Controls';
import {Camera} from '../../camera/logic/Camera';
import {DamageState, VitalSigns, VitalSignValues} from '../../vital-signs/logic/VitalSigns';
import {isDefined} from '../../common/logic/Utils';
import * as HUD from '../../user-interface/HUD/logic/HUD';
import {MiniMap} from '../../mini-map/logic/MiniMap';
import {PlayerCreatedEvent, PlayerDamagedEvent} from '../../core/logic/Events';
import * as DarknessOverlay from '../../darkness/logic/DarknessOverlay';
import './PlayerJuice';

export class Player {
    character: Character;
    controls: Controls;
    camera: Camera;
    vitalSigns: VitalSigns;

    constructor(id: number, x: number, y: number, name: string, miniMap: MiniMap) {
        this.character = new Character(id, x, y, name, true);
        this.character.visibleOnMinimap = true;

        this.controls = new Controls(this.character, this.isCraftInProgress.bind(this));

        this.camera = new Camera(this.character);
        miniMap.add(this.character);
        miniMap.setPlayerCharacter(this.character);

        this.vitalSigns = new VitalSigns();
    }

    init() {
        PlayerCreatedEvent.trigger(this);
    }

    // Crafting was removed with the item system (Block 2); never in progress.
    isCraftInProgress() {
        return false;
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
        // 0..MAXIMUM_VALUES.health scale, so feed it the health/maxHealth fraction.
        const healthFraction = entity.maxHealth > 0 ? (entity.health / entity.maxHealth) : 0;
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
        if (isDefined(entity.activeSkillId)) {
            this.character.setActiveSkill(entity.activeSkillId);
        }
        if (isDefined(entity.auraRadius)) {
            this.character.setAuraRadius(entity.auraRadius);
        }
        // Own light hole in the darkness overlay (chunk 3); 0 removes it.
        if (isDefined(entity.lightRadius)) {
            DarknessOverlay.setLightRadius(this.character, entity.lightRadius);
        }
        if (isDefined(entity.level)) {
            this.character.setLevel(entity.level);
        }

        // Floating combat numbers over the own character (item 11).
        if (entity.damageTaken > 0) {
            this.character.showFloatingNumber(hpToDisplay(entity.damageTaken), 'damage');
        }
        if (entity.healReceived > 0) {
            this.character.showFloatingNumber(hpToDisplay(entity.healReceived), 'heal');
        }
        if (entity.xpGained > 0) {
            this.character.showFloatingNumber(entity.xpGained, 'xp');
        }
        // Aura-hit VFX (item 11 Step 4): slash / fire stamped by a damage aura.
        if (entity.auraHitStyle > 0) {
            this.character.showAuraHit(entity.auraHitStyle);
        }
    }

    remove() {
        this.character.remove();
        this.controls.destroy();
        this.camera.destroy();
        this.vitalSigns.destroy();
    }
}
