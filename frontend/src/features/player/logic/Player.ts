import {Character} from '../../game-objects/logic/Character';
import {StatusEffect} from '../../game-objects/logic/StatusEffect';
import {Controls} from '../../controls/logic/Controls';
import {Camera} from '../../camera/logic/Camera';
import {DamageState, VitalSigns, VitalSignValues} from '../../vital-signs/logic/VitalSigns';
import {isDefined} from '../../common/logic/Utils';
import {MiniMap} from '../../mini-map/logic/MiniMap';
import {PlayerCreatedEvent, PlayerDamagedEvent} from '../../core/logic/Events';
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

        let newVitalSigns: VitalSignValues = {
            health: entity.health,
            satiety: Math.round((entity.levelProgress || 0) * VitalSigns.MAXIMUM_VALUES.satiety),
            bodyHeat: VitalSigns.MAXIMUM_VALUES.bodyHeat
        };
        this.vitalSigns.updateFromBackend(newVitalSigns, damageState);
        if (isDefined(entity.health)) {
            this.character.setHealth(entity.health);
        }
        if (isDefined(entity.activeSkillId)) {
            this.character.setActiveSkill(entity.activeSkillId);
        }
        if (isDefined(entity.auraRadius)) {
            this.character.setAuraRadius(entity.auraRadius);
        }
        if (isDefined(entity.level)) {
            this.character.setLevel(entity.level);
        }
    }

    remove() {
        this.character.remove();
        this.controls.destroy();
        this.camera.destroy();
        this.vitalSigns.destroy();
    }
}
