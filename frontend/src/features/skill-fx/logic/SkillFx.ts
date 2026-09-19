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
import {skillDefinition} from '../../../client-data/Skills';
import {GLOW_COLOR, GLOW_WIDTH_PX, windUpGlowAlpha} from './SkillFxMath';
import {clearPools, Fx, FxAnchor, kindHandler, VISUAL_KINDS} from './SkillFxKinds';
import {planSpawns, PointOf, SkillVisual} from './SkillFxPlan';
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
 * All the deciding - which layers, between whom, when - is SkillFxPlan's, and
 * tested there without a renderer. What is left here is the Pixi half: resolve
 * each planned id to a game object, hand the kind an anchor that follows it,
 * and keep the budget.
 *
 * ⚑ An event may name an entity this client does not hold (§12): the server
 * ships an event whose caster is in view even when its victim has walked out
 * of it. There is nothing to draw between two points when one of them is
 * unknown, so the plan skips it - silently, never thrown.
 */
export function onSnapshot(events: readonly SkillEventData[], resolve: ResolveEntity): void {
    if (layer === null || events.length === 0) {
        return;
    }
    const now = performance.now();

    // One resolution per entity per snapshot: the planner asks for a position
    // and the spawn loop then asks for an anchor on the same object.
    const objects = new Map<number, GameObject | undefined>();
    const objectOf = (id: number): GameObject | undefined => {
        if (!objects.has(id)) {
            objects.set(id, resolve(id));
        }
        return objects.get(id);
    };
    const pointOf: PointOf = (id) => {
        const obj = objectOf(id);
        return obj ? {x: obj.shape.position.x, y: obj.shape.position.y} : undefined;
    };

    const anchors = new Map<number, FxAnchor>();
    const anchorOf = (id: number): FxAnchor => {
        let anchor = anchors.get(id);
        if (!anchor) {
            // Every id in a plan entry was resolved by pointOf above.
            anchor = anchorFor(objectOf(id));
            anchors.set(id, anchor);
        }
        return anchor;
    };

    planSpawns(events, visualOf, pointOf).forEach((entry) => {
        const def = entry.def;
        const handler = kindHandler(def.kind);
        spawnedByKind[def.kind] = (spawnedByKind[def.kind] ?? 0) + 1;
        if (!handler) {
            return;
        }
        const fx = handler.spawn({
            layer,
            source: anchorOf(entry.from),
            victim: anchorOf(entry.victim),
            color: parseTint(def.tint) ?? entry.baseColor,
            def,
            startAtMs: now + entry.delayMs,
            seed: entry.seed,
        });
        if (fx !== null) {
            push(fx);
        }
    });
}

/** The catalog half of the plan's input: a skill's layers and its colour. */
function visualOf(skillId: number): SkillVisual | undefined {
    const def = skillDefinition(skillId);
    const layers = def?.visual?.layers;
    return layers ? {layers, baseColor: skillFxColor(def, undefined)} : undefined;
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
