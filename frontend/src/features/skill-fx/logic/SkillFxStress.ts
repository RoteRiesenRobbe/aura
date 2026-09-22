/**
 * The C4 stress driver (plan-skill-vfx.md §12e.4): a ten-times-busier world,
 * synthesised client-side.
 *
 * ⚑ Why not a 10x server: the measured density ceiling is ~5.8x
 * (plan-world-scale.md §11, PhysicsSystem at 74 % of the tick), so a real boot
 * at 10x is tick-starved and emits FEWER events per wall second than a healthy
 * busy world. Measuring the client against it measures a broken server - and a
 * client-side driver also keeps the schema line at NONE.
 *
 * It feeds the REAL paths and nothing else: `SkillFx.onSnapshot` with wire-
 * shaped events, and `SkillFx.setAmbient` with the same three arguments the
 * per-snapshot aura fan-out uses. Nothing here reaches into the manager, so a
 * number it produces is a number the game's own feed would have produced.
 *
 * Dev-only: reachable through `window.game.skillFxStress()` and imported by
 * nothing else. Deterministic throughout - no Math.random in placement, skill
 * selection or pairing, so two runs are comparable.
 */
import type {GameObject} from '../../game-objects/logic/_GameObject';
import {GameSetupEvent, PrerenderEvent} from '../../core/logic/Events';
import type {IGame} from '../../core/logic/IGame';
import {AuraApi} from '../../backend/logic/AuraApi';
import type {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {allSkillDefinitions, SkillDefinition, VisualLayer} from '../../../client-data/Skills';
import {
    BEAM_CURVE_MS,
    CAST_POSE_DEFAULT_MS,
    EMITTER_DEFAULT_MS,
    flightMs,
    HIT_MARK_MS,
    ORBIT_DEFAULT_MS,
    strikeContactMsOf,
    strikeTotalMsOf,
    waveTotalMsOf,
} from './SkillFxMath';
import {onSnapshot, setAmbient} from './SkillFx';

/**
 * How many combat actors the synthetic fight is between. A busy camp, so the
 * pairing has real distances in it without the actor count itself being a
 * variable of the measurement. [PLACEHOLDER]
 */
const STRESS_ACTORS = 12;

/** The stub entity ids, kept far above anything the server hands out. */
const STUB_ID_BASE = 900_000;

/** Stub radius in px, about a player's. [PLACEHOLDER] */
const STUB_RADIUS_PX = 26;

export interface StressOptions {
    /** synthetic skill events per second, fed through onSnapshot */
    eventsPerSec?: number;
    /** actors holding a running aura, fed through setAmbient */
    ambientOwners?: number;
    /** how long it runs before stopping itself */
    seconds?: number;
    /**
     * Restrict the round robin to these catalog skill ids (C3a): every C4
     * number was measured on Graphics placeholders, and re-running a leg
     * against a body-carrying skill is how the sprite path is priced against
     * them. Absent or empty = the whole catalog, exactly as C4 measured it.
     */
    skillIds?: number[];
}

/**
 * How many events this frame owes, and what fraction of one it carries.
 *
 * ⚑ The remainder is CARRIED, never dropped: a headless page runs ~3 frames a
 * second, so a frame that owes 3.4 events must hand the next one that 0.4 or
 * the driver quietly under-runs the rate every table in C4 is scaled by. A bad
 * delta (a paused tab, the first frame) schedules nothing and leaves the carry
 * where it was - it is a missing frame, not a frame that owed zero.
 */
export function stressSchedule(
    ratePerSec: number, dtMs: number, carry: number,
): { count: number, carry: number } {
    const held = Number.isFinite(carry) ? carry : 0;
    if (!(ratePerSec > 0)) {
        return {count: 0, carry: 0};
    }
    if (!Number.isFinite(dtMs) || dtMs <= 0) {
        return {count: 0, carry: held};
    }
    const owed = held + ratePerSec * dtMs / 1000;
    const count = Math.floor(owed);
    return {count, carry: owed - count};
}

/**
 * How many Fx-milliseconds ONE event contributes: every layer it spawns, each
 * counted from the moment it enters `live` to the moment it leaves.
 *
 * ⚑ The delay counts. An Fx is pushed into `live` at SPAWN time even when its
 * first visible frame is 400 ms away, so the hit mark waiting for its bolt to
 * arrive occupies the budget for the whole flight - which is exactly the thing
 * a cap has to be sized against.
 *
 * ⭐ `damageHit` says whether the event is a landed Damage hit (§12g): the mark
 * is the ENGINE'S and never in `layers`, so the estimate adds its life and its
 * wait when told to. Every real strike now draws one, which is why the C4
 * numbers owe a rerun.
 *
 * ⚑ It is an ESTIMATE, and the curve fallbacks below mirror the private
 * `beamCurveOf` in SkillFxKinds. If those rules ever move, this drifts - it is
 * a sanity number printed beside a measured one, never a substitute for it.
 *
 * `ambient` layers count 0: they are state, they are not spawned by an event,
 * and they never end on a clock.
 */
export function eventLifetimeMs(
    layers: readonly VisualLayer[], distPx: number, damageHit = false,
): number {
    const bolt = layers.find(layer => layer.kind === 'projectile');
    const weapon = layers.find(layer => layer.kind === 'strike');
    // The implicit sequencing of SkillFxPlan: the mark starts when whatever
    // touched the victim actually got there, the later of the two.
    const arrival = Math.max(
        bolt ? flightMs(distPx, bolt.speed ?? 0) : 0,
        weapon ? strikeContactMsOf(weapon.curve, weapon.ms) : 0);
    let total = damageHit ? HIT_MARK_MS + arrival : 0;
    for (const layer of layers) {
        if (layer.on === 'ambient') {
            continue;
        }
        total += layerLifetimeMs(layer, distPx);
    }
    return total;
}

/** One layer's own on-screen duration, as its kind implements it. */
function layerLifetimeMs(def: VisualLayer, distPx: number): number {
    const authored = def.ms && def.ms > 0 ? def.ms : 0;
    switch (def.kind) {
        // ⚑ A bolt ignores `ms` entirely: its life IS its flight.
        case 'projectile':
            return flightMs(distPx, def.speed ?? 0);
        case 'strike':
            return strikeTotalMsOf(def.curve, def.ms);
        case 'wave':
            return waveTotalMsOf(def.ms);
        case 'beam':
            return authored || BEAM_CURVE_MS[def.curve === 'extend' ? 'extend' : 'flash'];
        case 'cast-pose':
            return authored || CAST_POSE_DEFAULT_MS;
        case 'orbit':
            return authored || ORBIT_DEFAULT_MS;
        case 'emitter':
            return authored || EMITTER_DEFAULT_MS;
        default:
            return authored;
    }
}

/**
 * How many Fx a steady rate holds alive, in theory: rate x the mean lifetime
 * one event spawns. Little's law, and the number that TRANSFERS - the measured
 * `liveMax` of a headless page is shaped by its ~3 fps, which delivers a
 * second's events as one batch and then draws nothing for 300 ms.
 */
export function estimateLiveFx(eventsPerSec: number, meanEventMs: number): number {
    if (!(eventsPerSec > 0) || !(meanEventMs > 0)) {
        return 0;
    }
    return eventsPerSec * meanEventMs / 1000;
}

// --- the stubs --------------------------------------------------------------

/**
 * Exactly what `anchorFor` and the reconciler read off a game object, and
 * nothing else: `shape.position`, `shape.destroyed`, `shape.parent`, `size`.
 * A real GameObject is a PixiJS display tree; standing 40 of those up would
 * measure the entity layer rather than the VFX one.
 *
 * ⚑ `parent` must be a non-null object: `anchorFor`'s liveness test is
 * `shape.parent !== null`, so a stub with a null one is born despawned and
 * every owner-anchored kind ends on its first frame.
 */
interface Stub {
    id: number;
    shape: { position: { x: number, y: number }, destroyed: boolean, parent: object };
    size: number;
}

let Game: IGame = null;
GameSetupEvent.subscribe((game: IGame) => {
    Game = game;
});

let subscribed = false;
let running = false;

let allStubs: Stub[] = [];
let actors: Stub[] = [];
let ambientStubs: Stub[] = [];
const byId = new Map<number, Stub>();

/** every catalog skill that authors a `fired` or a `hit` layer, id-ordered */
let eventSkills: SkillDefinition[] = [];
/** every catalog skill that authors an `ambient` layer, id-ordered */
let ambientSkills: SkillDefinition[] = [];

let ratePerSec = 0;
let carry = 0;
let eventsFed = 0;
/** monotonic: the skill, the trigger and the pairing are all derived from it */
let eventIndex = 0;
let startedAtMs = 0;
let runMs = 0;
let lastFrameMs = 0;
let meanEventMs = 0;
let layersPerEvent = 0;

export interface StressStatus {
    running: boolean;
    /** false + `why` when the driver refused to start */
    ok: boolean;
    why?: string;
    elapsedMs: number;
    eventsPerSec: number;
    eventsFed: number;
    /** what the frames actually delivered, which is the honest rate */
    deliveredPerSec: number;
    actors: number;
    ambientOwners: number;
    eventSkills: number;
    ambientSkills: number;
    /** mean Fx-milliseconds one synthetic event spawns, over the round robin */
    meanEventMs: number;
    /** mean Fx one synthetic event spawns: its layers, plus the mark on a hit (§12g) */
    layersPerEvent: number;
    /** Little's law against the requested rate, beside the measured liveMax */
    estimatedLive: number;
}

export function status(): StressStatus {
    const elapsed = startedAtMs === 0 ? 0 : (running ? performance.now() : lastFrameMs) - startedAtMs;
    return {
        running,
        ok: true,
        elapsedMs: Math.round(elapsed),
        eventsPerSec: ratePerSec,
        eventsFed,
        deliveredPerSec: elapsed > 0 ? +(eventsFed / (elapsed / 1000)).toFixed(2) : 0,
        actors: actors.length,
        ambientOwners: ambientStubs.length,
        eventSkills: eventSkills.length,
        ambientSkills: ambientSkills.length,
        meanEventMs: +meanEventMs.toFixed(1),
        layersPerEvent: +layersPerEvent.toFixed(2),
        estimatedLive: +estimateLiveFx(ratePerSec, meanEventMs).toFixed(1),
    };
}

/**
 * Stand the stubs up, start feeding, and stop after `seconds`.
 *
 * ⚑ It refuses before the catalog has landed: `visualOf` never caches an
 * unknown skill, so a driver that started early would round-robin over an
 * empty list and feed a perfectly steady rate of nothing.
 */
export function start(options: StressOptions = {}): StressStatus {
    stop();
    const catalog = allSkillDefinitions();
    if (catalog.length === 0) {
        return {...status(), ok: false, why: 'the skill catalog has not loaded yet'};
    }
    if (Game === null) {
        return {...status(), ok: false, why: 'the game has not set up yet'};
    }
    const wanted = options.skillIds;
    eventSkills = catalog.filter(def => authors(def, 'fired') || authors(def, 'hit'))
        .sort((a, b) => a.id - b.id);
    ambientSkills = catalog.filter(def => authors(def, 'ambient')).sort((a, b) => a.id - b.id);
    if (eventSkills.length === 0) {
        return {...status(), ok: false, why: 'no catalog skill authors a fired or hit layer'};
    }
    // ⚑ Applied AFTER the "does the catalog author anything at all" test, so
    // the two failures stay distinguishable: an empty catalog and a filter that
    // matched nothing are different mistakes and say so.
    if (wanted && wanted.length > 0) {
        eventSkills = restrictToIds(eventSkills, wanted);
        // An ambient list emptied by the filter is fine - `tick` already feeds
        // aura id 0 when there is nothing to hold, which is "no running aura".
        ambientSkills = restrictToIds(ambientSkills, wanted);
        if (eventSkills.length === 0) {
            return {
                ...status(), ok: false,
                why: `none of skillIds [${wanted.join(', ')}] authors a fired or hit layer`,
            };
        }
    }

    ratePerSec = options.eventsPerSec ?? 0;
    const owners = Math.max(0, Math.round(options.ambientOwners ?? 0));
    runMs = Math.max(1, options.seconds ?? 10) * 1000;

    placeStubs(STRESS_ACTORS + owners);
    actors = allStubs.slice(0, STRESS_ACTORS);
    ambientStubs = allStubs.slice(STRESS_ACTORS);

    measureTheMix();

    carry = 0;
    eventsFed = 0;
    eventIndex = 0;
    startedAtMs = performance.now();
    lastFrameMs = startedAtMs;
    running = true;
    if (!subscribed) {
        // ⚑ Returns nothing: a listener that returns TRUE is UNSUBSCRIBED by
        // Event.trigger, so the driver would feed exactly one frame.
        PrerenderEvent.subscribe(tick);
        subscribed = true;
    }
    return status();
}

/** Stops feeding and lets go of the stubs' layers; the counters stay readable. */
export function stop(): StressStatus {
    running = false;
    ambientStubs.forEach((stub, index) => setAmbient(asGameObject(stub), 0, index === 0));
    // Despawned rather than deleted: an owner-anchored layer still in flight
    // reads `alive()` and ends itself, exactly as it does for a dead mob.
    allStubs.forEach(stub => stub.shape.destroyed = true);
    allStubs = [];
    actors = [];
    ambientStubs = [];
    byId.clear();
    return status();
}

/**
 * The `skillIds` filter (C3a): the skills in `defs` whose id is wanted, in the
 * order `defs` already had them, so the round robin's walk is unchanged apart
 * from the skills it skips.
 *
 * An absent or empty list is "no filter" rather than "nothing": the driver's
 * default behaviour must stay byte-identical to what C4 measured, and
 * `skillIds: []` from a harness is far more likely to be a mistake than a
 * request for a run that feeds nothing.
 */
export function restrictToIds<T extends { id: number }>(
    defs: readonly T[], ids: readonly number[] | undefined,
): T[] {
    if (!ids || ids.length === 0) {
        return defs.slice();
    }
    const wanted = new Set(ids);
    return defs.filter(def => wanted.has(def.id));
}

function authors(def: SkillDefinition, on: string): boolean {
    return (def.visual?.layers ?? []).some(layer => layer.on === on);
}

/**
 * Whether event number `n` is a cast or a landing. A skill authoring both
 * alternates between them, which is the shape of a real fight's stream; one
 * authoring only `fired` layers is always a cast.
 */
function firedAt(def: SkillDefinition, n: number): boolean {
    const hit = authors(def, 'hit');
    return authors(def, 'fired') && (!hit || n % 2 === 1);
}

function layersAt(def: SkillDefinition, fired: boolean): VisualLayer[] {
    const trigger = fired ? 'fired' : 'hit';
    return (def.visual?.layers ?? []).filter(layer => layer.on === trigger);
}

/**
 * What the round robin costs on average, in layers and in Fx-milliseconds.
 * Walked once per start() over TWO passes of the skill list, because a skill
 * authoring both triggers spends one of each; the distance is the mean over
 * the grid's ordered actor pairs, since a bolt's life is its flight.
 */
function measureTheMix(): void {
    let distTotal = 0;
    let pairs = 0;
    for (const from of actors) {
        for (const to of actors) {
            if (from === to) {
                continue;
            }
            distTotal += Math.hypot(
                to.shape.position.x - from.shape.position.x,
                to.shape.position.y - from.shape.position.y);
            pairs++;
        }
    }
    const meanDistPx = pairs === 0 ? 0 : distTotal / pairs;
    let msTotal = 0;
    let layerTotal = 0;
    const steps = eventSkills.length * 2;
    for (let n = 0; n < steps; n++) {
        const def = eventSkills[n % eventSkills.length];
        const isFired = firedAt(def, n);
        const layers = layersAt(def, isFired);
        // Every fed hit is a Damage hit (nextEvent), so each one draws the mark.
        msTotal += eventLifetimeMs(layers, meanDistPx, !isFired);
        layerTotal += layers.length + (isFired ? 0 : 1);
    }
    meanEventMs = steps === 0 ? 0 : msTotal / steps;
    layersPerEvent = steps === 0 ? 0 : layerTotal / steps;
}

/**
 * A deterministic grid over what the camera is currently showing, derived from
 * the camera transform rather than from the player's position: the stubs are
 * where the pixels are, which is what makes the phone leg a fill-rate reading.
 */
function placeStubs(count: number): void {
    const group = Game.cameraGroup;
    const scale = group.scale.x || 1;
    const spanX = Game.width / scale;
    const spanY = Game.height / scale;
    const centerX = (Game.width / 2 - group.position.x) / scale;
    const centerY = (Game.height / 2 - group.position.y) / scale;
    const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / columns));
    allStubs = [];
    for (let i = 0; i < count; i++) {
        const column = i % columns;
        const row = Math.floor(i / columns);
        const stub: Stub = {
            id: STUB_ID_BASE + i,
            shape: {
                position: {
                    x: centerX - spanX / 2 + spanX * (column + 0.5) / columns,
                    y: centerY - spanY / 2 + spanY * (row + 0.5) / rows,
                },
                destroyed: false,
                parent: {},
            },
            size: STUB_RADIUS_PX,
        };
        allStubs.push(stub);
        byId.set(stub.id, stub);
    }
}

function asGameObject(stub: Stub): GameObject {
    return stub as unknown as GameObject;
}

// --- the feed ---------------------------------------------------------------

function tick(): void {
    if (!running) {
        return;
    }
    const now = performance.now();
    const dt = now - lastFrameMs;
    lastFrameMs = now;
    if (now - startedAtMs >= runMs) {
        stop();
        return;
    }
    // Re-asserted every frame, exactly as Character and Mobs do it: the
    // reconciler's unchanged-id early return is part of what C4 measures.
    ambientStubs.forEach((stub, index) => setAmbient(
        asGameObject(stub), ambientSkills.length === 0
            ? 0
            : ambientSkills[index % ambientSkills.length].id,
        // One own character, as a real client has: `low` keeps that one's
        // emitters and drops everybody else's, which is the cut it measures.
        index === 0));

    const scheduled = stressSchedule(ratePerSec, dt, carry);
    carry = scheduled.carry;
    if (scheduled.count === 0) {
        return;
    }
    const events: SkillEventData[] = [];
    for (let i = 0; i < scheduled.count; i++) {
        events.push(nextEvent());
    }
    eventsFed += events.length;
    onSnapshot(events, id => {
        const stub = byId.get(id);
        return stub ? asGameObject(stub) : undefined;
    });
}

/**
 * One wire-shaped event. The skill walks the authored list round-robin, so the
 * KIND MIX is the content's own; a skill authoring both triggers alternates
 * between them, which is what a real fight's fired/hit stream looks like.
 */
function nextEvent(): SkillEventData {
    const n = eventIndex++;
    const def = eventSkills[n % eventSkills.length];
    const isFired = firedAt(def, n);
    const sourceIndex = n % actors.length;
    const victimIndex = (sourceIndex + 1 + n % (actors.length - 1)) % actors.length;
    return {
        source: actors[sourceIndex].id,
        // A FIRED event names no victim on the wire.
        victim: isFired ? 0 : actors[victimIndex].id,
        skillId: def.id,
        amount: 1,
        kind: AuraApi.HitKind.Damage,
        fired: isFired,
    };
}
