/**
 * What one snapshot's skill events DRAW, as a plan (plan-skill-vfx.md §12b.3,
 * widened by §12c.1).
 *
 * The decisions are pure: which authored layers an event picks, between which
 * two entities each layer is drawn, and when it starts. Nothing here knows what
 * a renderer, a Pixi container or a GameObject is - `SkillFx.ts` turns a plan
 * into anchors, spawns and budget, and only that half needs a browser.
 *
 * The rules, in one place:
 *
 * 1. `on: hit` draws once per HIT event whatever its HitKind (an Immune or an
 *    Absorb landing still landed); `on: fired` draws on a cast, with the caster
 *    at both ends. A skill with no `visual`, or none on this trigger, draws
 *    no AUTHORED layer - there is no engine default for those.
 * 2. An event naming an entity the client does not hold is skipped silently:
 *    there is nothing to draw between two points when one is unknown.
 * 3. A chain is a property of one (source, skill) GROUP within one snapshot, so
 *    it cannot be decided event by event: the group is ordered caster → nearest
 *    → nearest-to-that, hop N is anchored at victim N-1 and waits N staggers.
 * 4. Implicit sequencing, no `delay` key anywhere in the vocabulary: the hit
 *    mark starts when whatever touched the victim actually got there - the
 *    projectile's arrival, the strike's contact moment, the later of the two.
 * 5. ⭐ The hit mark is the ENGINE'S (§12g.1 call 2, the one exception to "no
 *    engine default"): every landed Damage or Crit hit plans one on the victim,
 *    LAST in the landing, whether or not the skill authors anything, and no
 *    file may author it (the server refuses `impact` at load). A Heal, an
 *    Absorb or an Immune landing draws none, and neither does a cast.
 * 6. ⭐ An over-time effect draws its look on APPLICATION, not per tick
 *    (§12h call 1). The wire's `phase` is a second axis beside the HitKind:
 *    `Applied` (a DoT/HoT applied or refreshed) plans the skill's
 *    `on: applied` layers between caster and victim and NO mark, whatever the
 *    kind, since nothing landed; `Tick` plans NO authored layer, only the
 *    mark when the tick is Damage or Crit (a heal tick draws nothing); `Direct`
 *    is rules 1 and 5 unchanged. The trigger is part of the chain key and the
 *    pose key, so an application and a direct hit of one skill in one
 *    snapshot never chain together or share a pose.
 */
import type {VisualLayer} from '../../../client-data/Skills';
import {AuraApi} from '../../backend/logic/AuraApi';
import type {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import type {VfxDensity} from '../../game-settings/logic/GameSettings';
import {
    CHAIN_HOP_STAGGER_MS,
    chainOrder,
    flightMs,
    HIT_MARK_KIND,
    strikeContactMsOf,
} from './SkillFxMath';
import {NEUTRAL_COLOR} from './SkillFxPalette';

/** The one layer no content authors: the planner appends it to a damage landing. */
const HIT_MARK_LAYER: VisualLayer = {kind: HIT_MARK_KIND, on: 'hit'};

function drawsHitMark(event: SkillEventData): boolean {
    return !event.fired
        && event.phase !== AuraApi.HitPhase.Applied
        && (event.kind === AuraApi.HitKind.Damage || event.kind === AuraApi.HitKind.Crit);
}

/**
 * Which authored moment an event is (rule 6), or null for a TICK: a tick of an
 * over-time effect draws no authored layer at all, only the engine's mark. A
 * FIRED event is checked first because a cast is always `Direct` on the wire.
 */
function triggerOf(event: SkillEventData): 'fired' | 'hit' | 'applied' | null {
    if (event.fired) {
        return 'fired';
    }
    switch (event.phase) {
        case AuraApi.HitPhase.Applied:
            return 'applied';
        case AuraApi.HitPhase.Tick:
            return null;
        default:
            return 'hit';
    }
}

/** Where an entity is, in world space - the only geometry the plan needs. */
export interface PlanPoint {
    x: number;
    y: number;
}

/** A skill's authored VFX, already resolved against the catalog. */
export interface SkillVisual {
    layers: readonly VisualLayer[];
    /** the skill's damage-type colour; a layer's own `tint` still overrides it */
    baseColor: number;
    /** the skill's authored reach in px, 0 for none: a cast's `orbit` circles AT it */
    reachPx?: number;
}

/**
 * undefined = the catalog does not hold this skill. A held skill with no
 * `visual` answers an EMPTY layer list, so its hit mark still gets its colour.
 */
export type VisualOf = (skillId: number) => SkillVisual | undefined;
/** undefined = this client does not hold that entity. */
export type PointOf = (entityId: number) => PlanPoint | undefined;

/** One authored layer, resolved to who, between whom, and when. */
export interface SpawnPlan {
    def: VisualLayer;
    /** the casting entity, the same on every hop of a chain */
    source: number;
    /** which entity this layer is anchored AT: the source, or the previous chain victim */
    from: number;
    victim: number;
    /** ms after the snapshot's own moment */
    delayMs: number;
    baseColor: number;
    /** the skill's reach in px, 0 for none (see SkillVisual) */
    reachPx: number;
    /** per LANDING, so one landing's layers share a bolt shape and a sweep direction */
    seed: number;
}

/**
 * ⚑ Deliberately monotonic across snapshots, never reset: `swingDirection`
 * reads its parity, so a per-snapshot index would make every lone hit of a
 * standing fight swing the same way - the metronome the seed exists to avoid.
 */
let seedCounter = 0;

/** One event resolved against the client's world: who, where, which layers. */
interface Landing {
    /**
     * `source:skill:trigger`, the key one snapshot's poses are deduplicated on
     * and chains are grouped by (rule 6: an application never shares either
     * with a direct hit of the same skill)
     */
    castKey: string;
    source: number;
    victim: number;
    layers: readonly VisualLayer[];
    baseColor: number;
    reachPx: number;
    seed: number;
    /** where the caster is */
    casterAt: PlanPoint;
    /** where the victim is */
    at: PlanPoint;
}

interface ChainVictim extends PlanPoint {
    landing: Landing;
}

/**
 * The whole of one snapshot, in draw order: the plain landings in event order
 * first, then each chain group in the order its first event arrived.
 */
export function planSpawns(
    events: readonly SkillEventData[], visualOf: VisualOf, pointOf: PointOf,
    density: VfxDensity = 'full',
): SpawnPlan[] {
    // `off` is literal (PO, §12d.1): no authored layer draws, old kinds
    // included. Before the seed counter moves, so a session spent at `off`
    // does not silently advance every later swing's direction.
    if (density === 'off') {
        return [];
    }
    const chained = new Map<string, Landing[]>();
    const plain: Landing[] = [];
    events.forEach((event) => {
        const landing = landingFor(event, visualOf, pointOf);
        if (landing === null) {
            return;
        }
        if (!event.fired && landing.layers.some(isChainedBeam)) {
            const key = landing.castKey;
            const group = chained.get(key);
            if (group) {
                group.push(landing);
            } else {
                chained.set(key, [landing]);
            }
        } else {
            plain.push(landing);
        }
    });

    const plan: SpawnPlan[] = [];
    const posed = new Set<string>();
    plain.forEach(landing => emit(plan, posed, landing, landing.source, landing.casterAt, 0));

    chained.forEach((group) => {
        // The hop order is over POSITIONS, so the ordered victims come back as
        // the landings they belong to.
        const hops = chainOrder<ChainVictim>(
            group[0].casterAt, group.map(l => ({...l.at, landing: l})));
        hops.forEach((hop, index) => {
            const previous = index === 0 ? null : hops[index - 1].to.landing;
            const landing = hop.to.landing;
            emit(
                plan, posed, landing,
                previous === null ? landing.source : previous.victim,
                previous === null ? landing.casterAt : previous.at,
                index * CHAIN_HOP_STAGGER_MS);
        });
    });
    return plan;
}

/**
 * Which of a skill's layers the ambient reconciler holds for one owner
 * (plan-skill-vfx.md §12d.4). Ambient is STATE, not an event, so this is the
 * whole of the deciding: everything else about it is the Pixi half's.
 *
 * The density rules are the PO's (§12d.1): `off` draws no authored layer at
 * all, and `low` drops ambient EMITTERS for everyone but the own character -
 * an ambient ORBIT still draws on every actor, at every density but `off`.
 */
export function planAmbient(
    layers: readonly VisualLayer[], density: VfxDensity, own: boolean,
): VisualLayer[] {
    if (density === 'off') {
        return [];
    }
    return layers.filter(l =>
        l.on === 'ambient' && !(density === 'low' && !own && l.kind === 'emitter'));
}

function isChainedBeam(def: VisualLayer): boolean {
    return def.kind === 'beam' && def.chain === true;
}

function landingFor(
    event: SkillEventData, visualOf: VisualOf, pointOf: PointOf,
): Landing | null {
    const visual = visualOf(event.skillId);
    // `on: hit` draws once per HIT event whatever its HitKind - an Immune or
    // Absorb landing still landed. The mark is the one thing that reads the
    // kind, and it goes LAST so the authored layers keep their order. An
    // application or a tick picks its trigger by phase (rule 6).
    const trigger = triggerOf(event);
    const layers = trigger === null
        ? []
        : (visual?.layers ?? []).filter(l => l.on === trigger);
    if (drawsHitMark(event)) {
        layers.push(HIT_MARK_LAYER);
    }
    if (layers.length === 0) {
        return null;
    }
    const casterAt = pointOf(event.source);
    if (!casterAt) {
        return null;
    }
    // A FIRED event names no victim: the caster is both ends of it.
    const victim = event.fired ? event.source : event.victim;
    const at = event.fired ? casterAt : pointOf(victim);
    if (!at) {
        return null;
    }
    return {
        castKey: `${event.source}:${event.skillId}:${trigger}`,
        source: event.source,
        victim,
        layers,
        // A skill the catalog does not hold still marks its hits: neutral,
        // because nobody knows its damage type.
        baseColor: visual?.baseColor ?? NEUTRAL_COLOR,
        reachPx: visual?.reachPx ?? 0,
        seed: seedCounter++,
        casterAt,
        at,
    };
}

/**
 * One landing's layers, with the implicit sequencing applied: the hit mark
 * beside a `projectile` starts when the bolt ARRIVES, and one beside a `strike`
 * when the weapon reaches the victim. With both authored, the later of the two
 * wins - the mark belongs to whatever touched the victim last.
 */
function emit(
    plan: SpawnPlan[], posed: Set<string>, landing: Landing,
    from: number, fromAt: PlanPoint, baseDelayMs: number,
): void {
    const arrival = Math.max(projectileFlightMs(landing, fromAt), strikeContactMs(landing));
    landing.layers.forEach((def) => {
        // An archer holds ONE bow: a multi-target beat draws its pose once,
        // aimed at the first victim, while every victim still gets its arrow.
        if (def.kind === 'cast-pose') {
            if (posed.has(landing.castKey)) {
                return;
            }
            posed.add(landing.castKey);
        }
        plan.push({
            def,
            source: landing.source,
            from,
            victim: landing.victim,
            delayMs: baseDelayMs + (def.kind === HIT_MARK_KIND ? arrival : 0),
            baseColor: landing.baseColor,
            reachPx: landing.reachPx,
            seed: landing.seed,
        });
    });
}

/** The first `projectile` layer's flight time from this anchor, or 0 for none. */
function projectileFlightMs(landing: Landing, fromAt: PlanPoint): number {
    const bolt = landing.layers.find(l => l.kind === 'projectile');
    if (!bolt) {
        return 0;
    }
    return flightMs(
        Math.hypot(landing.at.x - fromAt.x, landing.at.y - fromAt.y), bolt.speed ?? 0);
}

/** The first `strike` layer's contact moment, or 0 when there is none. */
function strikeContactMs(landing: Landing): number {
    const weapon = landing.layers.find(l => l.kind === 'strike');
    return weapon ? strikeContactMsOf(weapon.curve, weapon.ms) : 0;
}
