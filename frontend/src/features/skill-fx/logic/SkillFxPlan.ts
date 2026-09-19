/**
 * What one snapshot's skill events DRAW, as a plan (plan-skill-vfx.md §12b.3,
 * widened by §12c.1).
 *
 * The decisions are pure: which authored layers an event picks, between which
 * two entities each layer is drawn, and when it starts. Nothing here knows what
 * a renderer, a Pixi container or a GameObject is - `SkillFx.ts` turns a plan
 * into anchors, spawns and budget, and only that half needs a browser.
 *
 * The four rules, in one place:
 *
 * 1. `on: hit` draws once per HIT event whatever its HitKind (an Immune or an
 *    Absorb landing still landed); `on: fired` draws on a cast, with the caster
 *    at both ends. A skill with no `visual`, or none on this trigger, draws
 *    nothing - there is no engine default.
 * 2. An event naming an entity the client does not hold is skipped silently:
 *    there is nothing to draw between two points when one is unknown.
 * 3. A chain is a property of one (source, skill) GROUP within one snapshot, so
 *    it cannot be decided event by event: the group is ordered caster → nearest
 *    → nearest-to-that, hop N is anchored at victim N-1 and waits N staggers.
 * 4. Implicit sequencing, no `delay` key anywhere in the vocabulary: an
 *    `impact` starts when whatever touched the victim actually got there - the
 *    projectile's arrival, the strike's contact moment, the later of the two.
 */
import type {VisualLayer} from '../../../client-data/Skills';
import type {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {CHAIN_HOP_STAGGER_MS, chainOrder, flightMs, strikeContactMsOf} from './SkillFxMath';

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
}

/** undefined = this skill authors no visual at all. */
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
    source: number;
    victim: number;
    layers: readonly VisualLayer[];
    baseColor: number;
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
): SpawnPlan[] {
    const chained = new Map<string, Landing[]>();
    const plain: Landing[] = [];
    events.forEach((event) => {
        const landing = landingFor(event, visualOf, pointOf);
        if (landing === null) {
            return;
        }
        if (!event.fired && landing.layers.some(isChainedBeam)) {
            const key = `${event.source}:${event.skillId}`;
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
    plain.forEach(landing => emit(plan, landing, landing.source, landing.casterAt, 0));

    chained.forEach((group) => {
        // The hop order is over POSITIONS, so the ordered victims come back as
        // the landings they belong to.
        const hops = chainOrder<ChainVictim>(
            group[0].casterAt, group.map(l => ({...l.at, landing: l})));
        hops.forEach((hop, index) => {
            const previous = index === 0 ? null : hops[index - 1].to.landing;
            const landing = hop.to.landing;
            emit(
                plan, landing,
                previous === null ? landing.source : previous.victim,
                previous === null ? landing.casterAt : previous.at,
                index * CHAIN_HOP_STAGGER_MS);
        });
    });
    return plan;
}

function isChainedBeam(def: VisualLayer): boolean {
    return def.kind === 'beam' && def.chain === true;
}

function landingFor(
    event: SkillEventData, visualOf: VisualOf, pointOf: PointOf,
): Landing | null {
    const visual = visualOf(event.skillId);
    const authored = visual?.layers;
    if (!authored || authored.length === 0) {
        return null;
    }
    // `on: hit` draws once per HIT event whatever its HitKind - an Immune or
    // Absorb landing still landed.
    const trigger = event.fired ? 'fired' : 'hit';
    const layers = authored.filter(l => l.on === trigger);
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
        source: event.source,
        victim,
        layers,
        baseColor: visual.baseColor,
        seed: seedCounter++,
        casterAt,
        at,
    };
}

/**
 * One landing's layers, with the implicit sequencing applied: an `impact` on
 * the same trigger as a `projectile` starts when the bolt ARRIVES, and one
 * beside a `strike` when the weapon reaches the victim. With both authored, the
 * later of the two wins - the mark belongs to whatever touched the victim last.
 */
function emit(
    plan: SpawnPlan[], landing: Landing, from: number, fromAt: PlanPoint, baseDelayMs: number,
): void {
    const arrival = Math.max(projectileFlightMs(landing, fromAt), strikeContactMs(landing));
    landing.layers.forEach((def) => {
        plan.push({
            def,
            source: landing.source,
            from,
            victim: landing.victim,
            delayMs: baseDelayMs + (def.kind === 'impact' ? arrival : 0),
            baseColor: landing.baseColor,
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
