/**
 * The skill VFX manager (plan-skill-vfx.md C2a, §7.1).
 *
 * ONE world-space container on `layers.skillFx`, below `layers.darkness`, and
 * nothing hanging off any entity sprite: layers are positioned per frame from
 * the source and victim game objects, so they follow a moving victim and §39's
 * "seventh independently-anchored overlay" objection stays met.
 *
 * What it consumes is C1's honest wire: one `SkillEvent` per cast (FIRED) and
 * per landing (HIT), each naming its caster and skill. No inference, no
 * attribution filter - D1 says everyone's VFX draw, own and others alike.
 *
 * ⚑ A skill with no `visual` draws NOTHING (PO 2026-09-19). There is no engine
 * default; the content authors every damaging skill instead.
 *
 * It also owns the wind-up glow (D7): the ring highlight that used to be an
 * AuraTickIndicator on each entity's own shape now lives on this layer,
 * positioned per frame. One module owns the beat from wind-up to impact. The
 * glow is readability, not dressing: it is NOT authored content and NOT under
 * the budget.
 */
import {Container, Graphics} from 'pixi.js';
import type {GameObject} from '../../game-objects/logic/_GameObject';
import {PrerenderEvent} from '../../core/logic/Events';
import type {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {skillDefinition, VisualLayer} from '../../../client-data/Skills';
import {
    CHAIN_HOP_STAGGER_MS,
    chainOrder,
    flightMs,
    GLOW_COLOR,
    GLOW_WIDTH_PX,
    windUpGlowAlpha,
} from './SkillFxMath';
import {clearPools, Fx, FxAnchor, kindHandler, strikeContactMsOf, VISUAL_KINDS} from './SkillFxKinds';
import {parseTint, skillFxColor} from './SkillFxPalette';

/**
 * How many Fx may be alive at once, oldest evicted first. [PLACEHOLDER]
 * Sized for the world-scale case the prototype header flagged: a busy camp of
 * a dozen mobs all ticking is well inside it, and a pathological one degrades
 * by dropping its oldest frames rather than by dropping frames.
 */
export const FX_BUDGET = 96;

let layer: Container = null;
let subscribed = false;

/** Oldest first - the eviction order is the array order. */
const live: Fx[] = [];

const spawnedByKind: { [kind: string]: number } = {};
VISUAL_KINDS.forEach(kind => spawnedByKind[kind] = 0);
let evicted = 0;

/**
 * ⚑ Call this AFTER GameObject.setup(). Listeners fire in subscription order,
 * and the wind-up glow reads each entity's INTERPOLATED position: subscribed
 * first, it would read the position moveInterpolatedObjects is about to
 * overwrite and the ring would trail its own entity by a frame, every frame.
 * The speech bubble's follow group rides the same event for the same reason.
 */
export function setup(fxLayer: Container): void {
    layer = fxLayer;
    if (!subscribed) {
        PrerenderEvent.subscribe(update);
        subscribed = true;
    }
}

/**
 * Death, or leaving the world. The prototype's lesson: without this the own
 * player's corpse keeps a bolt in flight and an ambient layer running until
 * respawn. The frame subscription stays - setup() runs once per page.
 */
export function reset(): void {
    live.forEach(fx => fx.dispose());
    live.length = 0;
    glows.forEach(dropGlow);
    glows.clear();
    clearPools();
}

/** The harness surface (`window.game.skillFx()`). */
export function counters(): { live: number, spawnedByKind: { [kind: string]: number }, evicted: number } {
    return {live: live.length, spawnedByKind: {...spawnedByKind}, evicted};
}

// --- the feed ---------------------------------------------------------------

/** How Backend hands the manager a game object for an entity id. */
export type ResolveEntity = (id: number) => GameObject | undefined;

/**
 * One call per snapshot, from Backend.receiveSnapshot beside the floating
 * numbers (§12b.3: one feed, one call site).
 *
 * ⚑ An event may name an entity this client does not hold (§12): the server
 * ships an event whose caster is in view even when its victim has walked out
 * of it. There is nothing to draw between two points when one of them is
 * unknown, so it is skipped - silently, never thrown.
 */
export function onSnapshot(events: readonly SkillEventData[], resolve: ResolveEntity): void {
    if (layer === null || events.length === 0) {
        return;
    }
    const now = performance.now();

    // Chained beams first: a chain is a property of one (source, skill) GROUP
    // within one snapshot, so it cannot be decided event by event. Everything
    // else draws source→victim on its own.
    const chained = new Map<string, Landing[]>();
    const plain: Landing[] = [];
    events.forEach((event) => {
        const landing = landingFor(event, resolve);
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

    plain.forEach(landing => spawnLanding(landing, landing.source, now, 0));

    chained.forEach((group) => {
        const caster = group[0].source.point();
        // The hop order is over POSITIONS, so the ordered victims come back as
        // the landings they belong to.
        const hops = chainOrder(caster, group.map(l => ({...l.victim.point(), landing: l})));
        hops.forEach((hop, index) => {
            const fromLanding = index === 0 ? null : hops[index - 1].to.landing;
            const from = fromLanding === null ? hop.to.landing.source : fromLanding.victim;
            spawnLanding(hop.to.landing, from, now, index * CHAIN_HOP_STAGGER_MS);
        });
    });
}

/** One event resolved against the client's world: who, where, which layers. */
interface Landing {
    source: FxAnchor;
    victim: FxAnchor;
    layers: VisualLayer[];
    /** the skill's damage-type colour; a layer's own `tint` overrides it */
    baseColor: number;
    seed: number;
}

function isChainedBeam(def: VisualLayer): boolean {
    return def.kind === 'beam' && def.chain === true;
}

let seedCounter = 0;

function landingFor(event: SkillEventData, resolve: ResolveEntity): Landing | null {
    const def = skillDefinition(event.skillId);
    const authored = def?.visual?.layers;
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
    const source = resolve(event.source);
    if (!source) {
        return null;
    }
    // A FIRED event names no victim: the caster is both ends of it.
    const victim = event.fired ? source : resolve(event.victim);
    if (!victim) {
        return null;
    }
    return {
        source: anchorFor(source),
        victim: anchorFor(victim),
        layers,
        baseColor: skillFxColor(def, undefined),
        seed: seedCounter++,
    };
}

/**
 * Spawn one landing's layers, applying the implicit sequencing (§12b.3, widened
 * by §12c.1): an `impact` on the same trigger as a `projectile` starts when the
 * bolt ARRIVES, and one beside a `strike` starts when the weapon reaches the
 * victim. With both authored, the later of the two wins - the mark belongs to
 * whatever actually touched the victim last. No `delay` key anywhere in the
 * vocabulary.
 */
function spawnLanding(landing: Landing, from: FxAnchor, nowMs: number, baseDelayMs: number): void {
    const arrival = Math.max(projectileFlightMs(landing, from), strikeContactMs(landing));
    landing.layers.forEach((def) => {
        const handler = kindHandler(def.kind);
        spawnedByKind[def.kind] = (spawnedByKind[def.kind] ?? 0) + 1;
        if (!handler) {
            return;
        }
        const delay = baseDelayMs + (def.kind === 'impact' ? arrival : 0);
        const fx = handler.spawn({
            layer,
            source: from,
            victim: landing.victim,
            color: parseTint(def.tint) ?? landing.baseColor,
            def,
            startAtMs: nowMs + delay,
            seed: landing.seed,
        });
        if (fx !== null) {
            push(fx);
        }
    });
}

/** The first `projectile` layer's flight time, or 0 when there is none. */
function projectileFlightMs(landing: Landing, from: FxAnchor): number {
    const bolt = landing.layers.find(l => l.kind === 'projectile');
    if (!bolt) {
        return 0;
    }
    const a = from.point();
    const b = landing.victim.point();
    return flightMs(Math.hypot(b.x - a.x, b.y - a.y), bolt.speed ?? 0);
}

/** The first `strike` layer's contact moment, or 0 when there is none. */
function strikeContactMs(landing: Landing): number {
    const weapon = landing.layers.find(l => l.kind === 'strike');
    return weapon ? strikeContactMsOf(weapon) : 0;
}

function push(fx: Fx): void {
    while (live.length >= FX_BUDGET) {
        live.shift().dispose();
        evicted++;
    }
    live.push(fx);
}

/**
 * Follow, then finish (§12b.3). The anchor re-reads the entity's position
 * every frame while it is on screen and freezes at the last known one once it
 * despawns - a bolt in flight does not vanish when its target dies.
 */
function anchorFor(obj: GameObject): FxAnchor {
    let last = {x: obj.shape.position.x, y: obj.shape.position.y};
    return {
        radiusPx: obj.size,
        point() {
            const shape = obj.shape;
            if (shape && !shape.destroyed && shape.parent !== null) {
                last = {x: shape.position.x, y: shape.position.y};
            }
            return last;
        },
    };
}

// --- the per-frame update ---------------------------------------------------

function update(): void {
    const now = performance.now();
    for (let i = live.length - 1; i >= 0; i--) {
        if (!live[i].update(now)) {
            live[i].dispose();
            live.splice(i, 1);
        }
    }
    updateGlows();
}

// --- the wind-up glow (D7) --------------------------------------------------

interface Glow {
    owner: GameObject;
    g: Graphics;
    radiusPx: number;
    interval: number;
    phase: number;
}

/**
 * Keyed by the game object, not by entity id: a viewport re-entry builds a NEW
 * GameObject (EntityManager drops the old one), so an id key would hand the
 * fresh entity the dead one's ring.
 */
const glows = new Map<GameObject, Glow>();

/** The ring radius in px - exactly the value each caller's aura sprite uses. */
export function setGlowRadius(owner: GameObject, radiusPx: number): void {
    const glow = glows.get(owner);
    if (!glow) {
        // A gated aura calls this with 0 on every snapshot; it must not create
        // a ring for a mob that has none.
        if (radiusPx > 0) {
            const created = createGlow(owner);
            created.radiusPx = radiusPx;
            redrawGlow(created);
        }
        return;
    }
    if (glow.radiusPx !== radiusPx) {
        glow.radiusPx = radiusPx;
        redrawGlow(glow);
    }
}

/** interval + phase in game ticks; interval 0 = no active aura → hidden. */
export function setGlowTick(owner: GameObject, interval: number, phase: number): void {
    const glow = glows.get(owner);
    if (!glow) {
        if (interval > 0) {
            const created = createGlow(owner);
            created.interval = interval;
            created.phase = phase;
        }
        return;
    }
    glow.interval = interval;
    glow.phase = phase;
}

function createGlow(owner: GameObject): Glow {
    const glow: Glow = {owner, g: new Graphics(), radiusPx: 0, interval: 0, phase: 0};
    glow.g.visible = false;
    layer?.addChild(glow.g);
    glows.set(owner, glow);
    return glow;
}

// Redraw the stroked ring only when the radius changes; per-frame updates just
// move it and modulate its alpha, which is far cheaper.
function redrawGlow(glow: Glow): void {
    glow.g.clear();
    if (glow.radiusPx > 0) {
        glow.g.circle(0, 0, glow.radiusPx).stroke({
            width: GLOW_WIDTH_PX, color: GLOW_COLOR, alpha: 1,
        });
    }
}

function dropGlow(glow: Glow): void {
    glow.g.parent?.removeChild(glow.g);
    if (!glow.g.destroyed) {
        glow.g.destroy();
    }
}

function updateGlows(): void {
    if (glows.size === 0) {
        return;
    }
    glows.forEach((glow, owner) => {
        const shape = owner.shape;
        // Hidden or gone: the entity left the viewport, died, or faded out.
        // Dropped rather than hidden - a re-entry brings a new GameObject.
        if (!shape || shape.destroyed || shape.parent === null) {
            dropGlow(glow);
            glows.delete(owner);
            return;
        }
        const alpha = windUpGlowAlpha(glow.interval, glow.phase);
        if (alpha <= 0 || glow.radiusPx <= 0) {
            glow.g.visible = false;
            return;
        }
        glow.g.visible = true;
        glow.g.position.set(shape.position.x, shape.position.y);
        glow.g.alpha = alpha;
    });
}
