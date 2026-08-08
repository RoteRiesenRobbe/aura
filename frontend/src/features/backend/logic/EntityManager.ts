import _clone = require('lodash/clone');
import {Ticker} from 'pixi.js';
import {isDefined, isFunction} from '../../common/logic/Utils';
import {DebugCircle} from '../../internal-tools/develop/logic/DebugCircle';
import {GameObject, hpToDisplay} from '../../game-objects/logic/_GameObject';
import {StatusEffect} from '../../game-objects/logic/StatusEffect';
import {Character} from '../../game-objects/logic/Character';
import {Mob} from '../../game-objects/logic/Mobs';
import {AuraApi} from './AuraApi';
import {Develop} from '../../internal-tools/develop/logic/_Develop';
import {gameObjectId} from '../../common/logic/Types';
import {Vector} from '../../core/logic/Vector';
import {IMiniMapRendered} from '../../map/logic/MiniMapInterfaces';
import {MiniMap} from '../../map/logic/MiniMap';
import * as DarknessOverlay from '../../darkness/logic/DarknessOverlay';
import * as AttackLines from '../../game-objects/logic/AttackLines';


export class EntityManager {
    width: number;
    height: number;

    objects: {[key: gameObjectId]: GameObject} = {};
    private miniMap: MiniMap;

    constructor(width: number, height: number, miniMap: MiniMap) {
        this.width = width;
        this.height = height;

        this.miniMap = miniMap;
    }

    getObject(entityId: gameObjectId): GameObject {
        return this.objects[entityId];
    };

    addOrUpdate(entity) {
        let gameObject = this.getObject(entity.id);
        if (gameObject) {
            // FIXME Der Server sollte mir nur Entities liefern, die sich auch geändert haben
            if (gameObject.isMovable) {
                gameObject.setPosition(entity.position.x, entity.position.y);
                if (!gameObject.rotateOnPositioning) {
                    gameObject.setRotation(entity.rotation);
                }
                if (Develop.isActive()) {
                    gameObject['updateAABB'](entity.aabb);
                }
            }

        } else {
            switch (entity.type) {
                case Character:
                    gameObject = new Character(entity.id, entity.position.x, entity.position.y, entity.name, false);
                    break;
                case DebugCircle:
                    if (!Develop.isActive()) {
                        return;
                    }
                // Fallthrough
                default:
                    gameObject = new entity.type(entity.id, entity.position.x, entity.position.y, entity.radius);
            }

            this.objects[entity.id] = gameObject;

            if (gameObject.visibleOnMinimap) {
                this.miniMap.add(gameObject as unknown as IMiniMapRendered);
            }

            if (Develop.isActive()) {
                gameObject['updateAABB'](entity.aabb);
            }
        }

        if (entity.type === Character) {
            const character: Character = gameObject as Character;

            if (isDefined(entity.level) && isFunction(character['setLevel'])) {
                character['setLevel'](entity.level);
            }
            // Ring colours come from the server-resolved effect-category
            // bitmask (0 = no aura → no rings); triage item 7 replaced the
            // client-side skill-ID mapping this used to do.
            if (isDefined(entity.auraCategory) && isFunction(character['setAuraCategories'])) {
                character['setAuraCategories'](entity.auraCategory);
            }
            if (isDefined(entity.auraRadius) && isFunction(character['setAuraRadius'])) {
                character['setAuraRadius'](entity.auraRadius);
            }
        } else {
            // Mob aura ring (mob-depth chunk 3c): wire-driven effective
            // radius in px, 0 while the aura is gated → ring hidden. Categories
            // colour it the same way as a player's (triage item 7).
            if (isDefined(entity.auraCategory) && isFunction(gameObject['setAuraCategories'])) {
                gameObject['setAuraCategories'](entity.auraCategory);
            }
            if (isDefined(entity.auraRadius) && isFunction(gameObject['setAuraRadius'])) {
                gameObject['setAuraRadius'](entity.auraRadius);
            }
            // Portrait frame ring by authored tier (triage item 15).
            if (isDefined(entity.tier) && isFunction(gameObject['setTier'])) {
                gameObject['setTier'](entity.tier);
            }
            // Species id → the level-tinted nameplate, resolved against the
            // /mobs catalog (feedback pass C item 2). Sent every tick like the
            // rest; the mob rebuilds the plate only when the id actually
            // changes (i.e. once).
            if (isDefined(entity.mobId) && isFunction(gameObject['setMobId'])) {
                gameObject['setMobId'](entity.mobId);
            }
            // Effective level of THIS instance (plan-mob-levels.md C2), fed
            // after setMobId so the species is known when the plate text is
            // built. Sent every tick like the rest; the mob re-renders the
            // plate only when the number actually changes.
            if (isDefined(entity.mobLevel) && isFunction(gameObject['setLevel'])) {
                gameObject['setLevel'](entity.mobLevel);
            }
        }

        // Buff/debuff pips (applied_effects): the kinds currently applied TO
        // the entity — characters and mobs alike; 0 hides the strip.
        if (isDefined(entity.appliedEffects) && isFunction(gameObject['setAppliedEffects'])) {
            gameObject['setAppliedEffects'](entity.appliedEffects);
        }

        // Bare aura tick indicator (skill-vocab chunk 6): the wire cadence +
        // phase drive a dot orbiting the ring; characters and mobs alike, 0
        // interval hides it. Fed after setAuraRadius so the ring radius is set.
        // The active skill id keys the N5 beat detection on characters (an
        // aura switch resets the server accumulator, and the key is what stops
        // that reset reading as a beat); mobs carry none → 0.
        if (isDefined(entity.auraTickInterval) && isFunction(gameObject['setAuraTick'])) {
            gameObject['setAuraTick'](entity.auraTickInterval, entity.auraTickPhase, entity.activeSkillId ?? 0);
        }

        // Campfire bind circle (chunk 4): wire-driven dwell radius in px,
        // 0 for everything that is not a respawn anchor.
        if (isDefined(entity.dwellRadius) && isFunction(gameObject['setDwellRadius'])) {
            gameObject['setDwellRadius'](entity.dwellRadius);
        }

        // Light hole in the darkness overlay (chunk 3): characters and mobs
        // alike; 0 removes the hole. No-op while the zone has no dark areas.
        if (isDefined(entity.lightRadius)) {
            DarknessOverlay.setLightRadius(gameObject, entity.lightRadius);
        }

        if (Array.isArray(entity.statusEffects)) {
            gameObject.updateStatusEffects(entity.statusEffects);
            if (entity.statusEffects.includes(StatusEffect.BurstFired)) {
                gameObject.showBurstRing(entity.burstRadius);
            }
        }

        if (isDefined(entity.health) && isFunction(gameObject['setHealth'])) {
            gameObject['setHealth'](entity.health, entity.maxHealth);
        }

        // Shield segment on the overhead bar (skill-vocab chunk 2); 0 hides it.
        if (isDefined(entity.shieldHp) && isFunction(gameObject['setShield'])) {
            gameObject['setShield'](entity.shieldHp, entity.maxHealth);
        }

        // Floating combat numbers (item 11): damage on mobs + other players,
        // heal/XP on other players (own player is handled in Player.ts).
        // The crit-flagged share pops big (skill-vocab chunk 1); the
        // remainder shows as a regular damage number.
        const critTaken = entity.critTaken > 0 ? entity.critTaken : 0;
        if (critTaken > 0) {
            gameObject.showFloatingNumber(hpToDisplay(critTaken), 'crit');
        }
        if (entity.damageTaken > critTaken) {
            gameObject.showFloatingNumber(hpToDisplay(entity.damageTaken - critTaken), 'damage');
        }
        // PROTOTYPE (backlog §57): attack-attribution lines. Characters ONLY —
        // this block also fires for mobs taking the player's aura damage, and
        // without the guard every hit of yours would draw mob→mob lines.
        if (entity.damageTaken > 0 && gameObject instanceof Character) {
            AttackLines.noteHit(gameObject);
        }
        if (entity.healReceived > 0) {
            gameObject.showFloatingNumber(hpToDisplay(entity.healReceived), 'heal');
        }
        // Resource spent (round-7 item 7), blue — visible over other players
        // too, same as their damage and heal numbers.
        if (entity.costPaid > 0) {
            gameObject.showFloatingNumber(hpToDisplay(entity.costPaid), 'cost');
        }
        if (entity.xpGained > 0) {
            gameObject.showFloatingNumber(entity.xpGained, 'xp');
        }
        // Aura-hit VFX (item 11 Step 4): slash / fire stamped by a damage aura.
        if (entity.auraHitStyle > 0) {
            gameObject.showAuraHit(entity.auraHitStyle);
        }
    };

    newSnapshot(entities) {
        let removedObjects = _clone(this.objects);
        entities.forEach((entity) => {
            delete removedObjects[entity.id];
        });

        Object.values(removedObjects).forEach((gameObject: GameObject) => {
            // Mob pseudo-corpses (chunk 4): a removed mob briefly renders and
            // fades instead of popping out — client-only, zero wire. The
            // removal signal doesn't distinguish death from leaving the
            // viewport; out-of-view removals fade off-screen (accepted v1).
            if (gameObject instanceof Mob) {
                fadeOutAndHide(gameObject);
            } else {
                gameObject.hide();
            }
            if (gameObject.visibleOnMinimap) {
                this.miniMap.remove(gameObject as unknown as IMiniMapRendered);
            }
            delete this.objects[gameObject.id];
        }, this);
    };

    getObjectsInRange(position: Vector, distance: number) {
        return this.getObjectsInView();
    }

    getObjectsInView() {
        return Object.values(this.objects);
    };

    clear() {
        Object.values(this.objects).forEach(function (gameObject: GameObject) {
            gameObject.hide();
        });
        this.objects = {};
    }

    /**
     * Drops every minimap icon and rebuilds it from the entities that actually
     * exist right now (backlog §53).
     *
     * ⚑ WHY THE REBUILD IS NOT OPTIONAL. `MiniMap.clear()` alone would be a
     * one-way loss: icons are created in addOrUpdate, on an entity's FIRST
     * sighting only, so an object already in `this.objects` would never get a
     * second one. Anything still in view has to be re-added in the same breath.
     *
     * ⚑ Why it is needed at all: the pre-join spectator sits at the world
     * origin (core/game.go), so the client is streamed the ~24 props around
     * (0,0) and builds STATIC icons for them — and STATIC is documented as
     * "never removed", so they outlive the spectator and sit on ground the
     * character has never seen. Harmless while the minimap was 200 px wide;
     * visibly wrong once the full-screen map draws at ~7× that with fog of war
     * promising "you see what you have visited".
     */
    reseedMinimap() {
        this.miniMap.clear();
        Object.values(this.objects).forEach((gameObject: GameObject) => {
            if (gameObject.visibleOnMinimap) {
                this.miniMap.add(gameObject as unknown as IMiniMapRendered);
            }
        });
    }
}

// Corpse-fade duration for removed mobs. [PLACEHOLDER]
const MOB_FADE_DURATION_MS = 1500;

// Alpha-fades the (already unmanaged) game object's shape in place, then
// hides it — the showBurstRing ticker pattern. If the mob re-enters the
// viewport a fresh game object is built; the fading shape is independent.
function fadeOutAndHide(gameObject: GameObject) {
    const shape = gameObject.shape;
    // A fading corpse must read as harmless: hide the aura ring immediately
    // (its glow suggests damage is still ticking).
    if (isFunction(gameObject['setAuraRadius'])) {
        gameObject['setAuraRadius'](0);
    }
    // Same reason, and it has to happen HERE (R4): the object is already out of
    // `this.objects`, so Backend's next retarget cannot resolve the id and its
    // setInteractable(false) never lands — the "press E" cap would ride the
    // corpse for the whole fade over something that can no longer be talked to.
    if (isFunction(gameObject['setInteractable'])) {
        gameObject['setInteractable'](false);
    }
    const start = performance.now();
    const fade = () => {
        const t = (performance.now() - start) / MOB_FADE_DURATION_MS;
        if (t >= 1 || shape.destroyed) {
            Ticker.shared.remove(fade);
            if (!shape.destroyed) {
                gameObject.hide();
                shape.alpha = 1;
            }
            return;
        }
        shape.alpha = 1 - t;
    };
    Ticker.shared.add(fade);
}
