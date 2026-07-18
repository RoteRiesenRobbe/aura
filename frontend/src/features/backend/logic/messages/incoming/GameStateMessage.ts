import * as BackendConstants from '../../BackendConstants';
import * as Resources from '../../../../game-objects/logic/Resources';
import * as Mobs from '../../../../game-objects/logic/Mobs';
import {DebugCircle} from '../../../../internal-tools/develop/logic/DebugCircle';
import {Character} from '../../../../game-objects/logic/Character';
import {Corpse} from '../../../../game-objects/logic/Corpse';
import {Placeable} from '../../../../game-objects/logic/Placeable';
import {isFunction} from '../../../../common/logic/Utils';
import {StatusEffectDefinition} from '../../../../game-objects/logic/StatusEffect'
import {BerryhunterApi} from '../../BerryhunterApi';

export class Spectator {
    id: number;
    position: { x, y };
    isSpectator: boolean = true;

    /**
     * @param {BerryhunterApi.Spectator} spectator
     */
    constructor(spectator) {
        this.id = Number(spectator.id());
        this.position = unmarshalVec2f(spectator.pos());
    }
}

export class GameStateMessage {
    tick: number;
    player;
    inventory;
    entities;
    spellbook: number[];
    // per-skill levels, positionally parallel to spellbook
    spellbookLevels: number[];
    // unspent skill points of the owning player
    skillPoints: number;
    auraSlots: number[];
    // equipped passive slot contents, positional (index i = slot i, 0 = empty)
    passiveSlots: number[];
    // equipped cooldown slot contents, positional (index i = slot i, 0 = empty)
    cooldownSlots: number[];
    // remaining cooldown ticks, positionally parallel to cooldownSlots; 0 = ready
    cooldownRemainingTicks: number[];
    // index of the active aura slot for the owning player; -1 = Nothing
    activeAuraSlot: number;
    // running cast of the owning player (skill-vocab chunk 4); all zero = no cast
    castSkillId: number;
    castTicksLeft: number;
    castTicksTotal: number;
    // one-tick rejection feedback: a cooldown activation refused by its
    // precondition — which skill and why (0 = none)
    activationRejectedSkillId: number;
    activationRejectedReason: number;

    constructor(gameState: BerryhunterApi.GameState) {
        this.tick = Number(gameState.tick());

        switch (gameState.playerType()) {
            case BerryhunterApi.Player.Spectator:
                this.player = new Spectator(gameState.player(new BerryhunterApi.Spectator()));
                break;
            case BerryhunterApi.Player.Character:
                this.player = unmarshalEntity(
                    gameState.player(new BerryhunterApi.Character()),
                    BerryhunterApi.AnyEntity.Character);
                break;
        }

        this.entities = [];
        for (let i = 0; i < gameState.entitiesLength(); ++i) {
            this.entities.push(unmarshalWrappedEntity(gameState.entities(i)));
        }

        this.spellbook = [];
        for (let i = 0; i < gameState.spellbookLength(); ++i) {
            this.spellbook.push(gameState.spellbook(i));
        }

        this.spellbookLevels = [];
        for (let i = 0; i < gameState.spellbookLevelsLength(); ++i) {
            this.spellbookLevels.push(gameState.spellbookLevels(i));
        }

        this.skillPoints = gameState.skillPoints();

        this.auraSlots = [];
        for (let i = 0; i < gameState.auraSlotsLength(); ++i) {
            this.auraSlots.push(gameState.auraSlots(i));
        }

        this.passiveSlots = [];
        for (let i = 0; i < gameState.passiveSlotsLength(); ++i) {
            this.passiveSlots.push(gameState.passiveSlots(i));
        }

        this.cooldownSlots = [];
        for (let i = 0; i < gameState.cooldownSlotsLength(); ++i) {
            this.cooldownSlots.push(gameState.cooldownSlots(i));
        }

        this.cooldownRemainingTicks = [];
        for (let i = 0; i < gameState.cooldownRemainingTicksLength(); ++i) {
            this.cooldownRemainingTicks.push(gameState.cooldownRemainingTicks(i));
        }

        this.activeAuraSlot = gameState.activeAuraSlot();

        this.castSkillId = gameState.castSkillId();
        this.castTicksLeft = gameState.castTicksLeft();
        this.castTicksTotal = gameState.castTicksTotal();

        this.activationRejectedSkillId = gameState.activationRejectedSkillId();
        this.activationRejectedReason = gameState.activationRejectedReason();
    }
}

/**
 *
 * @param {BerryhunterApi.Vec2f|null} vec2f
 */
function unmarshalVec2f(vec2f) {
    return {
        x: vec2f.x(),
        y: vec2f.y(),
    }
}

/**
 * @param {BerryhunterApi.Entity} wrappedEntity
 */
function unmarshalWrappedEntity(wrappedEntity: BerryhunterApi.Entity) {
    const eType: BerryhunterApi.AnyEntity = wrappedEntity.eType();

    if (eType === BerryhunterApi.AnyEntity.NONE) {
        return null;
    }

    const entityCtors = {
        [BerryhunterApi.AnyEntity.Character]: BerryhunterApi.Character,
        [BerryhunterApi.AnyEntity.Mob]:       BerryhunterApi.Mob,
        [BerryhunterApi.AnyEntity.Resource]:  BerryhunterApi.Resource,
        [BerryhunterApi.AnyEntity.Placeable]: BerryhunterApi.Placeable,
    };
    let entity = new entityCtors[eType]();

    /**
     * @type {BerryhunterApi.Mob | BerryhunterApi.Resource | BerryhunterApi.Player}
     */
    entity = wrappedEntity.e(entity);

    return unmarshalEntity(entity, eType);
}

function unmarshalEntity(entity, eType) {
    let id = Number(entity.id());

    if (id === 0) {
        return null;
    }

    let result = {
        id: id,
        position: unmarshalVec2f(entity.pos()),
        radius: entity.radius(),
        type: unmarshalEntityType(entity.entityType()),
        aabb: unmarshalAABB(entity.aabb()),
        capacity: undefined,
        stock: undefined,
        item: undefined,
        rotation: undefined,
        isSpectator: undefined,
        isHit: undefined,
        currentAction: undefined,
        name: undefined,
        equipment: undefined,
        health: undefined,
        maxHealth: undefined,
        level: undefined,
        levelProgress: undefined,
        auraRadius: undefined,
        lightRadius: undefined,
        activeSkillId: undefined,
        statusEffects: undefined,
        burstRadius: undefined,
        damageTaken: undefined,
        critTaken: undefined,
        shieldHp: undefined,
        healReceived: undefined,
        xpGained: undefined,
        auraHitStyle: undefined,
        xpInLevel: undefined,
        xpForNextLevel: undefined,
        campfireBound: undefined,
        inCombat: undefined,
        dwellRadius: undefined,
        auraTickInterval: undefined,
        auraTickPhase: undefined,
    };

    if (eType === BerryhunterApi.AnyEntity.Resource) {
        result.capacity = entity.capacity();
        result.stock = entity.stock();
    }

    if (eType === BerryhunterApi.AnyEntity.Placeable) {
        result.item = unmarshalItem(entity.item());
    }

    if (eType === BerryhunterApi.AnyEntity.Mob) {
        result.rotation = entity.rotation();
        result.health = entity.health();
        result.maxHealth = entity.maxHealth();
        result.burstRadius = entity.burstRadius();
        result.damageTaken = entity.damageTaken();
        // crit-flagged share of damageTaken — rendered big (skill-vocab chunk 1)
        result.critTaken = entity.critTaken();
        // current absorb capacity, 0 = unshielded (skill-vocab chunk 2)
        result.shieldHp = entity.shieldHp();
        result.healReceived = entity.healReceived();
        result.auraHitStyle = entity.auraHitStyle();
        // effective radius of the active aura in px, 0 while gated — drives
        // the ring visibility (mob-depth chunk 3c).
        result.auraRadius = entity.auraRadius();
        // light emitted in px, 0 = none — hole-punches the darkness overlay.
        result.lightRadius = entity.lightRadius();
        // campfire bind radius in px, 0 = not a respawn anchor — drives the
        // inner dwell circle (chunk 4).
        result.dwellRadius = entity.dwellRadius();
        // active aura's tick cadence + phase (game ticks), 0 while gated —
        // drives the tick indicator; reading a mob's beat to dodge its ticks
        // is the design-critical use case (skill-vocab chunk 6).
        result.auraTickInterval = entity.auraTickInterval();
        result.auraTickPhase = entity.auraTickPhase();
    }

    if (eType === BerryhunterApi.AnyEntity.Character) {
        result.isSpectator = false;

        result.rotation = entity.rotation();
        result.isHit = entity.isHit();

        result.name = entity.name();

        result.health = entity.health();
        result.maxHealth = entity.maxHealth();
        result.level = entity.level();
        result.levelProgress = entity.levelProgress() / 0xffffffff;
        result.auraRadius = entity.auraRadius();
        // light emitted in px, 0 = none — hole-punches the darkness overlay.
        result.lightRadius = entity.lightRadius();
        result.activeSkillId = entity.activeSkillId();
        result.burstRadius = entity.burstRadius();
        result.damageTaken = entity.damageTaken();
        // crit-flagged share of damageTaken — rendered big (skill-vocab chunk 1)
        result.critTaken = entity.critTaken();
        // current absorb capacity, 0 = unshielded (skill-vocab chunk 2)
        result.shieldHp = entity.shieldHp();
        result.healReceived = entity.healReceived();
        result.xpGained = entity.xpGained();
        result.auraHitStyle = entity.auraHitStyle();
        result.xpInLevel = entity.xpInLevel();
        result.xpForNextLevel = entity.xpForNextLevel();
        // one-tick stamp: a campfire became the respawn anchor (chunk 4)
        result.campfireBound = entity.campfireBound();
        // true while inside the recent-combat window — drives the HUD combat indicator
        result.inCombat = entity.inCombat();
        // active aura's tick cadence + phase (game ticks), 0 while none active —
        // drives the tick indicator on the own player + other players (chunk 6).
        result.auraTickInterval = entity.auraTickInterval();
        result.auraTickPhase = entity.auraTickPhase();
    }

    if (isFunction(entity.statusEffectsLength) &&
        isFunction(entity.statusEffects)) {
        result.statusEffects = unmarshalStatusEffects(entity.statusEffectsLength(), entity.statusEffects.bind(entity));
    }

    return result;
}

/**
 * Has to be in sync with BerryhunterApi.EntityType
 */
const gameObjectClasses = [
    DebugCircle,
    undefined,
    Resources.RoundTree,
    Resources.MarioTree,
    Character,
    Resources.Stone,
    Resources.Bronze,
    Resources.Iron,
    Resources.BerryBush,
    Mobs.Dodo,
    Mobs.SaberToothCat,
    Mobs.Mammoth,
    Placeable,
    Resources.Titanium,
    Resources.Flower,
    Mobs.AngryMammoth,
    Resources.TitaniumShard,
    Mobs.Totem,
    Mobs.Rabbit,
    Mobs.Companion,
    Mobs.Brazier,
    Mobs.Healer,
    Mobs.Campfire,
    Corpse,
    Mobs.Turnip,
    Resources.House,
    Mobs.Wolf,
    Mobs.Bear,
    Mobs.Boar,
    Mobs.Stag,
    Mobs.EliteWolf,
    Mobs.Bramble,
    Resources.Signpost,
    Resources.Hermit,
    Resources.DogNpc,
    Mobs.Kobold,
    Mobs.KoboldRanged,
    Mobs.Spider,
    Mobs.VenomSpider,
    Mobs.PoisonPool,
    Mobs.Rockfall,
    Resources.Miner,
];

function unmarshalEntityType(entityType) {
    return gameObjectClasses[entityType];
}

/**
 *
 * @param {BerryhunterApi.AABB|null} aabb
 */
function unmarshalAABB(aabb) {
    return {
        LowerX: aabb.lower().x(),
        LowerY: aabb.lower().y(),
        UpperX: aabb.upper().x(),
        UpperY: aabb.upper().y(),
    };
}

/**
 * @param {number} itemId
 */
function unmarshalItem(itemId) {
    return BackendConstants.itemLookupTable[itemId];
}

function unmarshalStatusEffects(length, getter): StatusEffectDefinition[] {
    let definitions: StatusEffectDefinition[] = [];

    for (let i = 0; i < length; ++i) {
        definitions.push(BackendConstants.statusEffectLookupTable[getter(i)]);
    }

    return definitions;
}
