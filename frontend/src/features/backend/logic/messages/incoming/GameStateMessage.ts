import * as BackendConstants from '../../BackendConstants';
import * as Resources from '../../../../game-objects/logic/Resources';
import * as Mobs from '../../../../game-objects/logic/Mobs';
import {DebugCircle} from '../../../../internal-tools/develop/logic/DebugCircle';
import {Character} from '../../../../game-objects/logic/Character';
import {Corpse} from '../../../../game-objects/logic/Corpse';
import {isFunction} from '../../../../common/logic/Utils';
import {StatusEffectDefinition} from '../../../../game-objects/logic/StatusEffect'
import {AuraApi} from '../../AuraApi';

export class Spectator {
    id: number;
    position: { x, y };
    isSpectator: boolean = true;

    /**
     * @param {AuraApi.Spectator} spectator
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

    constructor(gameState: AuraApi.GameState) {
        this.tick = Number(gameState.tick());

        switch (gameState.playerType()) {
            case AuraApi.Player.Spectator:
                this.player = new Spectator(gameState.player(new AuraApi.Spectator()));
                break;
            case AuraApi.Player.Character:
                this.player = unmarshalEntity(
                    gameState.player(new AuraApi.Character()),
                    AuraApi.AnyEntity.Character);
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
 * @param {AuraApi.Vec2f|null} vec2f
 */
function unmarshalVec2f(vec2f) {
    return {
        x: vec2f.x(),
        y: vec2f.y(),
    }
}

/**
 * @param {AuraApi.Entity} wrappedEntity
 */
function unmarshalWrappedEntity(wrappedEntity: AuraApi.Entity) {
    const eType: AuraApi.AnyEntity = wrappedEntity.eType();

    if (eType === AuraApi.AnyEntity.NONE) {
        return null;
    }

    const entityCtors = {
        [AuraApi.AnyEntity.Character]: AuraApi.Character,
        [AuraApi.AnyEntity.Mob]:       AuraApi.Mob,
        [AuraApi.AnyEntity.Resource]:  AuraApi.Resource,
    };
    let entity = new entityCtors[eType]();

    /**
     * @type {AuraApi.Mob | AuraApi.Resource | AuraApi.Player}
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
        name: undefined,
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
        // aura ring colour bitmask + mob tier rank (triage items 7 / 15)
        auraCategory: undefined,
        tier: undefined,
        // mob definition id — the key into the /mobs catalog (nameplates)
        mobId: undefined,
        // buff/debuff kinds currently applied TO the entity — drives the pips
        appliedEffects: undefined,
    };

    if (eType === AuraApi.AnyEntity.Resource) {
        result.capacity = entity.capacity();
        result.stock = entity.stock();
    }

    if (eType === AuraApi.AnyEntity.Mob) {
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
        // effect-category bitmask of the active aura, 0 = no ring — colours the
        // aura ring (triage item 7).
        result.auraCategory = entity.auraCategory();
        // authored tier rank (0 normal / 1 elite / 2 boss) — drives the portrait
        // frame ring (triage item 15).
        result.tier = entity.tier();
        // species id: the client looks its display name + combat level up in
        // the /mobs catalog to render the level-tinted nameplate (feedback
        // pass C item 2). Long-present on the wire, first read here.
        result.mobId = entity.mobId();
        // buff/debuff kinds currently applied TO the mob — drives the pips.
        result.appliedEffects = entity.appliedEffects();
    }

    if (eType === AuraApi.AnyEntity.Character) {
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
        // effect-category bitmask of the active aura, 0 = no ring — colours the
        // aura ring (triage item 7).
        result.auraCategory = entity.auraCategory();
        // buff/debuff kinds currently applied TO the character — drives the pips.
        result.appliedEffects = entity.appliedEffects();
    }

    if (isFunction(entity.statusEffectsLength) &&
        isFunction(entity.statusEffects)) {
        result.statusEffects = unmarshalStatusEffects(entity.statusEffectsLength(), entity.statusEffects.bind(entity));
    }

    return result;
}

type GameObjectClass = (new (...args: any[]) => unknown) | undefined;

/**
 * Keyed by the generated AuraApi.EntityType enum, so the compiler rejects a
 * missing or extra entry. Since §28 Chunk 3 the schema also pins explicit enum
 * values, so a member removed there leaves a gap here rather than renumbering
 * — the wire value of every surviving sprite is stable forever.
 */
const gameObjectClasses: Record<AuraApi.EntityType, GameObjectClass> = {
    [AuraApi.EntityType.DebugCircle]: DebugCircle,
    [AuraApi.EntityType.RoundTree]: Resources.RoundTree,
    [AuraApi.EntityType.Character]: Character,
    [AuraApi.EntityType.Stone]: Resources.Stone,
    [AuraApi.EntityType.Dodo]: Mobs.Dodo,
    [AuraApi.EntityType.SaberToothCat]: Mobs.SaberToothCat,
    [AuraApi.EntityType.Mammoth]: Mobs.Mammoth,
    [AuraApi.EntityType.AngryMammoth]: Mobs.AngryMammoth,
    [AuraApi.EntityType.Totem]: Mobs.Totem,
    [AuraApi.EntityType.Rabbit]: Mobs.Rabbit,
    [AuraApi.EntityType.Companion]: Mobs.Companion,
    [AuraApi.EntityType.Brazier]: Mobs.Brazier,
    [AuraApi.EntityType.Healer]: Mobs.Healer,
    [AuraApi.EntityType.Campfire]: Mobs.Campfire,
    [AuraApi.EntityType.Corpse]: Corpse,
    [AuraApi.EntityType.Turnip]: Mobs.Turnip,
    [AuraApi.EntityType.House]: Resources.House,
    [AuraApi.EntityType.Wolf]: Mobs.Wolf,
    [AuraApi.EntityType.Bear]: Mobs.Bear,
    [AuraApi.EntityType.Boar]: Mobs.Boar,
    [AuraApi.EntityType.Stag]: Mobs.Stag,
    [AuraApi.EntityType.EliteWolf]: Mobs.EliteWolf,
    [AuraApi.EntityType.Bramble]: Mobs.Bramble,
    [AuraApi.EntityType.Signpost]: Resources.Signpost,
    [AuraApi.EntityType.Hermit]: Resources.Hermit,
    [AuraApi.EntityType.DogNpc]: Resources.DogNpc,
    [AuraApi.EntityType.Kobold]: Mobs.Kobold,
    [AuraApi.EntityType.KoboldRanged]: Mobs.KoboldRanged,
    [AuraApi.EntityType.Spider]: Mobs.Spider,
    [AuraApi.EntityType.VenomSpider]: Mobs.VenomSpider,
    [AuraApi.EntityType.PoisonPool]: Mobs.PoisonPool,
    [AuraApi.EntityType.Rockfall]: Mobs.Rockfall,
    [AuraApi.EntityType.Miner]: Resources.Miner,
    [AuraApi.EntityType.Bandit]: Mobs.Bandit,
    [AuraApi.EntityType.BanditRanged]: Mobs.BanditRanged,
    [AuraApi.EntityType.BanditHealer]: Mobs.BanditHealer,
    [AuraApi.EntityType.EliteBandit]: Mobs.EliteBandit,
    [AuraApi.EntityType.RallyDrummer]: Mobs.RallyDrummer,
    [AuraApi.EntityType.CityGuard]: Resources.CityGuard,
    [AuraApi.EntityType.VillageHealer]: Resources.VillageHealer,
    [AuraApi.EntityType.GateWall]: Resources.GateWall,
    [AuraApi.EntityType.ArmySoldier]: Mobs.ArmySoldier,
    [AuraApi.EntityType.Orc]: Mobs.Orc,
    [AuraApi.EntityType.SpikeBarricade]: Mobs.SpikeBarricade,
    [AuraApi.EntityType.FrontCaptain]: Resources.FrontCaptain,
    [AuraApi.EntityType.OrcWarlord]: Mobs.OrcWarlord,
    [AuraApi.EntityType.WarbannerTotem]: Mobs.WarbannerTotem,
    [AuraApi.EntityType.OrcGrunt]: Mobs.OrcGrunt,
    [AuraApi.EntityType.SoldierCompanion]: Mobs.SoldierCompanion,
    [AuraApi.EntityType.ShieldbearerCompanion]: Mobs.ShieldbearerCompanion,
    [AuraApi.EntityType.MedicCompanion]: Mobs.MedicCompanion,
    [AuraApi.EntityType.Troll]: Mobs.Troll,
    [AuraApi.EntityType.BanditPyromancer]: Mobs.BanditPyromancer,
    [AuraApi.EntityType.Farmer]: Resources.Farmer,
    [AuraApi.EntityType.Wanderer]: Resources.Wanderer,
    [AuraApi.EntityType.Traveller]: Resources.Traveller,
    [AuraApi.EntityType.TownCrier]: Resources.TownCrier,
    [AuraApi.EntityType.GiantSpider]: Mobs.GiantSpider,
    [AuraApi.EntityType.AlphaWolf]: Mobs.AlphaWolf,
    [AuraApi.EntityType.Marauder]: Mobs.Marauder,
    [AuraApi.EntityType.DireWolf]: Mobs.DireWolf,
    [AuraApi.EntityType.DireBear]: Mobs.DireBear,
    [AuraApi.EntityType.FireElemental]: Mobs.FireElemental,
    [AuraApi.EntityType.GreaterFireElemental]: Mobs.GreaterFireElemental,
    [AuraApi.EntityType.FireTotem]: Mobs.FireTotem,
    [AuraApi.EntityType.NpcPlaceholder]: Resources.NpcPlaceholder,
};

function unmarshalEntityType(entityType: AuraApi.EntityType) {
    return gameObjectClasses[entityType];
}

/**
 *
 * @param {AuraApi.AABB|null} aabb
 */
function unmarshalAABB(aabb) {
    return {
        LowerX: aabb.lower().x(),
        LowerY: aabb.lower().y(),
        UpperX: aabb.upper().x(),
        UpperY: aabb.upper().y(),
    };
}

function unmarshalStatusEffects(length, getter): StatusEffectDefinition[] {
    let definitions: StatusEffectDefinition[] = [];

    for (let i = 0; i < length; ++i) {
        definitions.push(BackendConstants.statusEffectLookupTable[getter(i)]);
    }

    return definitions;
}
