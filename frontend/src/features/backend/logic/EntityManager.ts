import _clone = require('lodash/clone');
import {isDefined, isFunction, removeElement} from '../../common/logic/Utils';
import {DebugCircle} from '../../internal-tools/develop/logic/DebugCircle';
import {GameObject, hpToDisplay} from '../../game-objects/logic/_GameObject';
import {StatusEffect} from '../../game-objects/logic/StatusEffect';
import {Character} from '../../game-objects/logic/Character';
import {Placeable} from '../../game-objects/logic/Placeable';
import {Resource} from '../../game-objects/logic/Resources';
import * as Equipment from '../../items/logic/Equipment';
import {EquipmentSlot} from '../../items/logic/Equipment';
import {BerryhunterApi} from './BerryhunterApi';
import {Develop} from '../../internal-tools/develop/logic/_Develop';
import {gameObjectId} from '../../common/logic/Types';
import {Vector} from '../../core/logic/Vector';
import {IMiniMapRendered} from '../../mini-map/logic/MiniMapInterfaces';
import {MiniMap} from '../../mini-map/logic/MiniMap';
import * as DarknessOverlay from '../../darkness/logic/DarknessOverlay';


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

            if (gameObject instanceof Resource) {
                gameObject.stock = entity.stock;
            }
        } else {
            switch (entity.type) {
                case Character:
                    gameObject = new Character(entity.id, entity.position.x, entity.position.y, entity.name, false);
                    break;
                case Placeable:
                    gameObject = new Placeable(entity.id, entity.item, entity.position.x, entity.position.y);
                    break;
                case DebugCircle:
                    if (!Develop.isActive()) {
                        return;
                    }
                // Fallthrough
                default:
                    gameObject = new entity.type(entity.id, entity.position.x, entity.position.y, entity.radius);
            }

            if (gameObject instanceof Resource) {
                gameObject.capacity = entity.capacity;
                gameObject.stock = entity.stock;
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

            /**
             * Handle equipment
             */
            let slotsToHandle = Object.keys(EquipmentSlot).map(k => EquipmentSlot[k as any]);
            removeElement(slotsToHandle, EquipmentSlot.PLACEABLE);

            if (isDefined(entity.equipment)) {
                entity.equipment.forEach((equippedItem) => {
                    let slot = Equipment.Helper.getItemEquipmentSlot(equippedItem);
                    removeElement(slotsToHandle, slot);
                    let currentlyEquippedItem = character.getEquippedItem(slot);
                    if (currentlyEquippedItem === equippedItem) {
                        return;
                    }
                    if (currentlyEquippedItem !== null) {
                        character.unequipItem(slot);
                    }
                    character.equipItem(equippedItem, slot);
                });
            }

            // All Slots that are not equipped according to backend are dropped.
            slotsToHandle.forEach(slot => {
                character.unequipItem(slot);
            });

            if (isDefined(entity.level) && isFunction(character['setLevel'])) {
                character['setLevel'](entity.level);
            }
            // Ring is driven solely by the server-authoritative active_skill_id
            // (0 = Nothing → no ring); the legacy activeAura field is ignored here.
            if (isDefined(entity.activeSkillId) && isFunction(character['setActiveSkill'])) {
                character['setActiveSkill'](entity.activeSkillId);
            }
            if (isDefined(entity.auraRadius) && isFunction(character['setAuraRadius'])) {
                character['setAuraRadius'](entity.auraRadius);
            }
        } else if (isDefined(entity.auraRadius) && isFunction(gameObject['setAuraRadius'])) {
            // Mob aura ring (mob-depth chunk 3c): wire-driven effective
            // radius in px, 0 while the aura is gated → ring hidden.
            gameObject['setAuraRadius'](entity.auraRadius);
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

        // Floating combat numbers (item 11): damage on mobs + other players,
        // heal/XP on other players (own player is handled in Player.ts).
        if (entity.damageTaken > 0) {
            gameObject.showFloatingNumber(hpToDisplay(entity.damageTaken), 'damage');
        }
        if (entity.healReceived > 0) {
            gameObject.showFloatingNumber(hpToDisplay(entity.healReceived), 'heal');
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
            this.objects[gameObject.id].hide();
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
}
