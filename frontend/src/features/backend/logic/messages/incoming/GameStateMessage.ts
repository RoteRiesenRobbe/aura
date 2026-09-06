import * as BackendConstants from '../../BackendConstants';
import * as Resources from '../../../../game-objects/logic/Resources';
import * as Props from '../../../../game-objects/logic/Props';
import * as Mobs from '../../../../game-objects/logic/Mobs';
import {DebugCircle} from '../../../../internal-tools/develop/logic/DebugCircle';
import {Character} from '../../../../game-objects/logic/Character';
import {Corpse} from '../../../../game-objects/logic/Corpse';
import {isFunction} from '../../../../common/logic/Utils';
import {StatusEffectDefinition} from '../../../../game-objects/logic/StatusEffect'
import {AuraApi} from '../../AuraApi';
import {
    ConversationNode,
    ConversationRow,
    ConversationTree,
} from '../../../../conversation/logic/ConversationModel';
import {QuestProgress} from '../../../../journal/logic/JournalModel';

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
    // multiplier the cost-reduction passive puts on every resource cost the
    // owning player pays (R1/F2); 1 = no reduction
    costFactor: number;
    // multiplier the damageDealt passive (Strong) puts on every point of
    // damage the owning player deals (round-7 item 5); 1 = no bonus
    damageFactor: number;
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
    // baseline utility winding up (plan-downtime.md C1); 0 = none — shares the
    // two tick fields above with the slot cast (one cast at a time)
    castUtility: number;
    // Camp baseline-utility charges the owning player holds (C2); 0 = none.
    // The CAP is not on the wire — campChargeCap derives it from the level.
    campCharges: number;
    // The map's campfire markers (plan-world-map.md C2): the spawn-point ids
    // this character has dwelled at, and the one it would respawn at.
    //
    // ⚑ BOTH ARE UNDEFINED ON ALMOST EVERY TICK, and undefined means "no
    // change" — they are one-shots, published only on entering the world and on
    // completing a dwell. Reading an absent field as an empty set would blank
    // the markers on every tick but two.
    discoveredCampfires: string[] | undefined;
    homeCampfire: string | undefined;
    // one-tick rejection feedback: a cooldown activation refused by its
    // precondition — which skill and why (0 = none)
    activationRejectedSkillId: number;
    activationRejectedReason: number;
    // the conversant the owning player can talk to right now; 0 = none. Live
    // state, re-sent every tick while in range (chunk 3b-i)
    interactableEntityId: number;
    // the open conversation's personalised tree, or null when no panel is open
    // (chunk 3b-ii). ⚑ null IS the close signal — every server-side end
    // condition (range, combat, death, disconnect) reaches the client as the
    // field simply going absent.
    conversation: ConversationTree | null;
    // the owning player's running + completed quests, ids only (chunk C3); the
    // titles and diary prose come from the /quests catalog
    questProgress: QuestProgress[];

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
        this.costFactor = gameState.costFactor();
        this.damageFactor = gameState.damageFactor();

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
        this.castUtility = gameState.castUtility();
        this.campCharges = gameState.campCharges();
        this.homeCampfire = gameState.homeCampfire() ?? undefined;
        this.discoveredCampfires = unmarshalDiscoveredCampfires(gameState);

        this.activationRejectedSkillId = gameState.activationRejectedSkillId();
        this.activationRejectedReason = gameState.activationRejectedReason();

        this.interactableEntityId = Number(gameState.interactableEntityId());
        this.conversation = unmarshalConversation(gameState.conversation(null));
        this.questProgress = unmarshalQuestProgress(gameState);
    }
}

/**
 * Read the discovered-campfire set out of a snapshot (plan-world-map.md C2).
 *
 * ⚑ Returns `undefined` for an absent vector rather than `[]`, and the two mean
 * genuinely different things here: absent is "not published this tick" (the
 * case on all but two ticks of a session), while empty would be "you have
 * discovered nothing". Collapsing them blanks the markers continuously.
 */
function unmarshalDiscoveredCampfires(gameState: AuraApi.GameState): string[] | undefined {
    const length = gameState.discoveredCampfiresLength();
    if (length === 0) {
        return undefined;
    }
    const ids: string[] = [];
    for (let i = 0; i < length; ++i) {
        ids.push(gameState.discoveredCampfires(i));
    }
    return ids;
}

/**
 * Read the quest ledger out of a snapshot (chunk C3, §6). An absent vector is an
 * empty journal — the shipped state until a quest is accepted.
 */
function unmarshalQuestProgress(gameState: AuraApi.GameState): QuestProgress[] {
    const entries: QuestProgress[] = [];
    for (let i = 0; i < gameState.questProgressLength(); ++i) {
        const e = gameState.questProgress(i);

        const stages: string[] = [];
        for (let j = 0; j < e.stagesLength(); ++j) {
            stages.push(e.stages(j));
        }

        // The current stage's server-composed objective lines (Q2) — verbatim,
        // absent (= empty) on completed quests.
        const objectives: string[] = [];
        for (let j = 0; j < e.objectivesLength(); ++j) {
            objectives.push(e.objectives(j));
        }

        entries.push({
            questId: e.questId() ?? '',
            // ⚑ ORDERED: the walked path, oldest stage first (L6). The journal
            // renders the diary in this order, so it is data, not a set.
            stages,
            completed: e.completed(),
            objectives,
        });
    }
    return entries;
}

/**
 * Read the conversation tree out of a snapshot (chunk 3b-ii).
 *
 * @param c the nested table, or null when no panel is open
 */
function unmarshalConversation(c: AuraApi.Conversation | null): ConversationTree | null {
    if (c === null) {
        return null;
    }

    const nodes: ConversationNode[] = [];
    for (let i = 0; i < c.nodesLength(); ++i) {
        const node = c.nodes(i);

        const lines: string[] = [];
        for (let j = 0; j < node.linesLength(); ++j) {
            lines.push(node.lines(j));
        }

        const rows: ConversationRow[] = [];
        for (let j = 0; j < node.optionsLength(); ++j) {
            const o = node.options(j);
            rows.push({
                // ⚑ The AUTHORED indices (L21) — carried, never re-derived from
                // j. The server hides known rows, so j is not the definition's
                // index and echoing it back would teach the wrong skill.
                optionIndex: o.optionIndex(),
                grantIndex: o.grantIndex(),
                text: o.text() ?? '',
                next: o.next() ?? '',
                locked: o.locked(),
                requiredLevel: o.requiredLevel(),
                reply: o.reply() ?? '',
                confirmSeconds: o.confirmSeconds(),
                skillId: o.skillId(),
            });
        }

        nodes.push({id: node.id() ?? '', lines, rows});
    }

    return {
        entityId: Number(c.entityId()),
        actorName: c.actorName() ?? '',
        entryNode: c.entryNode() ?? '',
        nodes,
    };
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
        immuneHit: undefined,
        costPaid: undefined,
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
        // PROP definition NAME — a prop's identity, and the key into the
        // client's compiled-in prop defs. Sent for the PropPlaceholder
        // entityType only, which is the only prop whose shape and label are not
        // implied by its entityType (plan-prop-placeholders.md §4.2).
        propName: undefined,
        // effective combat level of a MOB instance (plan-mob-levels.md C2).
        // Deliberately NOT the `level` slot above: that one is character-only,
        // and reusing it would make isDefined(entity.level) newly true for
        // every mob, silently widening what the character path sees.
        mobLevel: undefined,
        // buff/debuff kinds currently applied TO the entity — drives the pips
        appliedEffects: undefined,
        // flight state of the OWNING player (plan-flight-paths.md C3) — never
        // set for anyone else, because a flyer is removed from the physics
        // space and so never reaches another viewer's snapshot at all (D13).
        flying: undefined,
        flightDest: undefined,
        flightArrivalTick: undefined,
    };

    if (eType === AuraApi.AnyEntity.Mob) {
        result.rotation = entity.rotation();
        result.health = entity.health();
        result.maxHealth = entity.maxHealth();
        result.burstRadius = entity.burstRadius();
        result.damageTaken = entity.damageTaken();
        // crit-flagged share of damageTaken — rendered big (skill-vocab chunk 1)
        result.critTaken = entity.critTaken();
        // a hit was fully mitigated this tick - the floating "Immune" label
        result.immuneHit = entity.immuneHit();
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
        // EFFECTIVE level of this instance, server-resolved (owner ?? per-spawn
        // override ?? species curveLevel; plan-mob-levels.md C2). The nameplate
        // and its tint read this instead of the catalog, so a level-25 wolf and
        // a level-1 wolf of the same species plate differently. 0 = old server;
        // the client then falls back to the catalog value.
        result.mobLevel = entity.level();
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
        // a hit was fully mitigated this tick - the floating "Immune" label
        result.immuneHit = entity.immuneHit();
        // resource cost paid this tick — the blue number (round-7 item 7)
        result.costPaid = entity.costPaid();
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
        // Flight state (plan-flight-paths.md C2/C3): drives the camera zoom-out,
        // the input lock and the in-flight indicator.
        //
        // ⚑ AUTHORITATIVE EVERY TICK, unlike the discovered-campfire one-shots
        // above: `flying` defaults to false on the wire, so an absent field
        // already reads as "on the ground". Wrapping it in the isDefined
        // ("undefined means no change") pattern would produce a client stuck in
        // flight that never lands.
        //
        // ⚑ arrival tick is a `ulong` → bigint in the generated binding; the
        // ETA arithmetic mixes it with the plain-number gameState.tick(), and
        // bigint ⊖ number throws. Narrowed here, like tick and the entity ids.
        //
        // The destination is only marshalled while airborne (codec/gamestate.go),
        // so the struct accessor returns null on every ground tick — null, not a
        // zero vector, because that is what an absent struct field is.
        result.flying = entity.flying();
        const flightDest = entity.flightDest();
        result.flightDest = flightDest === null ? null : unmarshalVec2f(flightDest);
        result.flightArrivalTick = Number(entity.flightArrivalTick());
    }

    if (eType === AuraApi.AnyEntity.Resource) {
        // The prop's authored orientation (plan-prop-scale.md C2). Props are
        // static, so unlike a mob's this is read once — EntityManager passes it
        // to the constructor and never touches it again.
        result.rotation = entity.rotation();
        // null for every real prop — the server writes the field only for a
        // placeholder, and an absent string reads as null. Normalised to ''
        // because PropPlaceholder is the only reader and it treats an empty
        // name as "unlabelled", which is exactly right for a prop that streamed
        // no name.
        result.propName = entity.propName() ?? '';
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
    [AuraApi.EntityType.Totem]: Mobs.Totem,
    [AuraApi.EntityType.Companion]: Mobs.Companion,
    [AuraApi.EntityType.Campfire]: Mobs.Campfire,
    [AuraApi.EntityType.Camp]: Mobs.Camp,
    [AuraApi.EntityType.Corpse]: Corpse,
    [AuraApi.EntityType.Turnip]: Mobs.Turnip,
    [AuraApi.EntityType.House]: Props.genericPropClasses.House,
    [AuraApi.EntityType.Wolf]: Mobs.Wolf,
    [AuraApi.EntityType.Bear]: Mobs.Bear,
    [AuraApi.EntityType.Boar]: Mobs.Boar,
    [AuraApi.EntityType.Stag]: Mobs.Stag,
    [AuraApi.EntityType.EliteWolf]: Mobs.EliteWolf,
    [AuraApi.EntityType.Bramble]: Mobs.Bramble,
    [AuraApi.EntityType.Signpost]: Mobs.Signpost,
    [AuraApi.EntityType.Hermit]: Mobs.Hermit,
    [AuraApi.EntityType.DogNpc]: Mobs.DogNpc,
    [AuraApi.EntityType.Kobold]: Mobs.Kobold,
    [AuraApi.EntityType.KoboldRanged]: Mobs.KoboldRanged,
    [AuraApi.EntityType.Spider]: Mobs.Spider,
    [AuraApi.EntityType.VenomSpider]: Mobs.VenomSpider,
    [AuraApi.EntityType.PoisonPool]: Mobs.PoisonPool,
    [AuraApi.EntityType.Rockfall]: Mobs.Rockfall,
    [AuraApi.EntityType.Miner]: Mobs.Miner,
    [AuraApi.EntityType.Bandit]: Mobs.Bandit,
    [AuraApi.EntityType.BanditRanged]: Mobs.BanditRanged,
    [AuraApi.EntityType.BanditHealer]: Mobs.BanditHealer,
    [AuraApi.EntityType.EliteBandit]: Mobs.EliteBandit,
    [AuraApi.EntityType.RallyDrummer]: Mobs.RallyDrummer,
    [AuraApi.EntityType.CityGuard]: Mobs.CityGuard,
    [AuraApi.EntityType.VillageHealer]: Mobs.VillageHealer,
    [AuraApi.EntityType.GateWall]: Props.genericPropClasses.GateWall,
    [AuraApi.EntityType.ArmySoldier]: Mobs.ArmySoldier,
    [AuraApi.EntityType.Orc]: Mobs.Orc,
    [AuraApi.EntityType.SpikeBarricade]: Mobs.SpikeBarricade,
    [AuraApi.EntityType.FrontCaptain]: Mobs.FrontCaptain,
    [AuraApi.EntityType.OrcWarlord]: Mobs.OrcWarlord,
    [AuraApi.EntityType.WarbannerTotem]: Mobs.WarbannerTotem,
    [AuraApi.EntityType.OrcGrunt]: Mobs.OrcGrunt,
    [AuraApi.EntityType.SoldierCompanion]: Mobs.SoldierCompanion,
    [AuraApi.EntityType.ShieldbearerCompanion]: Mobs.ShieldbearerCompanion,
    [AuraApi.EntityType.MedicCompanion]: Mobs.MedicCompanion,
    [AuraApi.EntityType.Troll]: Mobs.Troll,
    [AuraApi.EntityType.BanditPyromancer]: Mobs.BanditPyromancer,
    [AuraApi.EntityType.Farmer]: Mobs.Farmer,
    [AuraApi.EntityType.Wanderer]: Mobs.Wanderer,
    [AuraApi.EntityType.Traveller]: Mobs.Traveller,
    [AuraApi.EntityType.TownCrier]: Mobs.TownCrier,
    [AuraApi.EntityType.GiantSpider]: Mobs.GiantSpider,
    [AuraApi.EntityType.AlphaWolf]: Mobs.AlphaWolf,
    [AuraApi.EntityType.Marauder]: Mobs.Marauder,
    [AuraApi.EntityType.DireWolf]: Mobs.DireWolf,
    [AuraApi.EntityType.DireBear]: Mobs.DireBear,
    [AuraApi.EntityType.FireElemental]: Mobs.FireElemental,
    [AuraApi.EntityType.GreaterFireElemental]: Mobs.GreaterFireElemental,
    [AuraApi.EntityType.FireTotem]: Mobs.FireTotem,
    [AuraApi.EntityType.NpcPlaceholder]: Mobs.NpcPlaceholder,
    [AuraApi.EntityType.Tombstone]: Props.genericPropClasses.Tombstone,
    // Bespoke, and the only prop class that takes a 6th constructor argument
    // (the prop name) — see EntityManager's default branch.
    [AuraApi.EntityType.PropPlaceholder]: Props.PropPlaceholder,
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
