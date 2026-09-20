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
 * glow is readability, not dressing: it is NOT authored content, NOT under the
 * budget and NOT under the density slider.
 *
 * Since C2b it owns a second, event-free mechanism beside the glow: the
 * AMBIENT RECONCILER (§12d.4). An `on: ambient` layer is STATE ("while this
 * aura is the actor's active one"), and no event can carry state, so it is fed
 * the way the glow already is - from the per-snapshot aura fan-out, keyed by
 * game object.
 */
import {Container, Graphics} from 'pixi.js';
import type {GameObject} from '../../game-objects/logic/_GameObject';
import {GameSettingChangedEvent, PrerenderEvent} from '../../core/logic/Events';
import type {SkillEventData} from '../../backend/logic/SkillEventNumbers';
import {meter2px} from '../../../client-data/BasicConfig';
import {skillDefinition, SkillDefinition} from '../../../client-data/Skills';
import {GameSettings, VfxDensity} from '../../game-settings/logic/GameSettings';
import {GLOW_COLOR, GLOW_WIDTH_PX, windUpGlowAlpha} from './SkillFxMath';
import {clearPools, Fx, FxAnchor, kindHandler, VISUAL_KINDS} from './SkillFxKinds';
import {planAmbient, planSpawns, PointOf, SkillVisual} from './SkillFxPlan';
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

/** The live slider (§12d.1), mirrored here so no hot path reads a proxy. */
let density: VfxDensity = 'full';

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
        // The slider is browser-local state, read once here and then only on
        // change - GameSettings.get() parses localStorage on its first call.
        density = GameSettings.get().vfx.density;
        // ⚑ Returns nothing on purpose: a listener that returns TRUE is
        // UNSUBSCRIBED by Event.trigger, so the slider would work exactly once.
        GameSettingChangedEvent.subscribe((change) => {
            if (change.path === 'vfx.density') {
                applyDensity();
            }
        });
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
    ambients.forEach(dropAmbient);
    ambients.clear();
    glows.forEach(dropGlow);
    glows.clear();
    clearPools();
}

/** The harness surface (`window.game.skillFx()`). */
export function counters(): {
    live: number,
    /** live AMBIENT layers, which are state and sit outside the budget */
    ambient: number,
    /** live wind-up glows - readability, untouched by the slider */
    glows: number,
    spawnedByKind: { [kind: string]: number },
    evicted: number,
    density: VfxDensity,
} {
    let ambient = 0;
    ambients.forEach(entry => ambient += entry.layers.length);
    return {live: live.length, ambient, glows: glows.size, spawnedByKind: {...spawnedByKind}, evicted, density};
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

    planSpawns(events, visualOf, pointOf, density).forEach((entry) => {
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
            density,
            reachPx: entry.reachPx,
        });
        if (fx !== null) {
            push(fx);
        }
    });
}

/**
 * A skill's look, colour and reach never change while the page lives, and
 * visualOf is asked once per EVENT, so each skill is resolved once.
 *
 * ⚑ Only a skill the catalog actually HOLDS is cached: the catalog loads
 * asynchronously, and caching the "unknown skill" answer before it landed
 * would blank that skill's VFX for the rest of the session.
 */
const visuals = new Map<number, SkillVisual | undefined>();

/** The catalog half of the plan's input: a skill's layers, colour and reach. */
function visualOf(skillId: number): SkillVisual | undefined {
    if (visuals.has(skillId)) {
        return visuals.get(skillId);
    }
    const def = skillDefinition(skillId);
    if (!def) {
        return undefined;
    }
    const layers = def.visual?.layers;
    const visual = layers
        ? {layers, baseColor: skillFxColor(def, undefined), reachPx: reachPxOf(def)}
        : undefined;
    visuals.set(skillId, visual);
    return visual;
}

/**
 * The skill's authored reach in px: the widest effect radius at level 1. The
 * per-level growth is small and another actor's skill level is not on the wire,
 * so the base radius is the honest common answer. [PLACEHOLDER]
 */
function reachPxOf(def: SkillDefinition): number {
    const radius = Math.max(0, ...def.effects.map(effect => effect.radius ?? 0));
    return meter2px(radius);
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
    const onStage = (): boolean => {
        const shape = obj.shape;
        return !!shape && !shape.destroyed && shape.parent !== null;
    };
    return {
        radiusPx: obj.size,
        alive: onStage,
        point() {
            if (onStage()) {
                last = {x: obj.shape.position.x, y: obj.shape.position.y};
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
    updateAmbients(now);
    updateGlows();
}

// --- the ambient reconciler (§12d.4) ----------------------------------------

interface Ambient {
    /** the last skill id this owner was reconciled to; never 0 while held */
    skillId: number;
    /** the own character, which is the only actor `low` keeps emitters for */
    own: boolean;
    anchor: FxAnchor;
    layers: Fx[];
}

/**
 * Keyed by the game object for the glow's reason: a viewport re-entry builds a
 * NEW GameObject, so an id key would hand the fresh entity the dead one's mist.
 */
const ambients = new Map<GameObject, Ambient>();

/**
 * What this actor's active aura is, right now: a skill id, or 0 for none.
 *
 * Fed from the same per-snapshot sites as the wind-up glow - a Character with
 * its `active_skill_id`, a Mob with its species' `auraSkillId` while its aura
 * is ungated - which means this runs per entity per snapshot and MUST be free
 * when nothing changed. It is: an unchanged id returns on the first compare.
 *
 * ⚑ §10.1's carried question is answered here. An aura that is EQUIPPED but
 * not switched on sends `active_skill_id` 0, so it draws nothing: ambient
 * means "the aura is running", never "the aura is in the loadout".
 */
export function setAmbient(owner: GameObject, skillId: number, own: boolean): void {
    const held = ambients.get(owner);
    if (held) {
        if (held.skillId === skillId) {
            return;
        }
        // A switch: the old aura's layers go with it, whatever they were.
        dropAmbient(held);
        if (skillId === 0) {
            ambients.delete(owner);
            return;
        }
        held.skillId = skillId;
        spawnAmbient(held);
        return;
    }
    if (skillId === 0 || layer === null) {
        return;
    }
    const entry: Ambient = {skillId, own, anchor: anchorFor(owner), layers: []};
    ambients.set(owner, entry);
    spawnAmbient(entry);
}

/**
 * ⚑ Ambient layers are NOT under FX_BUDGET (§12d.4): they are state, like the
 * glow, and a campfire's mist must not be evicted by a combat burst. They are
 * counted separately by counters().
 */
function spawnAmbient(entry: Ambient): void {
    const visual = visualOf(entry.skillId);
    if (!visual || layer === null) {
        return;
    }
    const now = performance.now();
    planAmbient(visual.layers, density, entry.own).forEach((def) => {
        const handler = kindHandler(def.kind);
        if (!handler) {
            return;
        }
        spawnedByKind[def.kind] = (spawnedByKind[def.kind] ?? 0) + 1;
        const fx = handler.spawn({
            layer,
            // An ambient layer has one end: the actor it belongs to.
            source: entry.anchor,
            victim: entry.anchor,
            color: parseTint(def.tint) ?? visual.baseColor,
            def,
            startAtMs: now,
            seed: 0,
            density,
            // An ambient orbit hugs its owner: the ring already draws the range.
            reachPx: 0,
        });
        if (fx !== null) {
            entry.layers.push(fx);
        }
    });
}

function dropAmbient(entry: Ambient): void {
    entry.layers.forEach(fx => fx.dispose());
    entry.layers.length = 0;
}

function updateAmbients(now: number): void {
    if (ambients.size === 0) {
        return;
    }
    ambients.forEach((entry, owner) => {
        // The entity left the viewport, died, or faded out. Dropped rather
        // than hidden - a re-entry brings a new GameObject and re-registers.
        if (!entry.anchor.alive()) {
            dropAmbient(entry);
            ambients.delete(owner);
            return;
        }
        for (let i = entry.layers.length - 1; i >= 0; i--) {
            if (!entry.layers[i].update(now)) {
                entry.layers[i].dispose();
                entry.layers.splice(i, 1);
            }
        }
    });
}

/**
 * A slider change, applied at once rather than at the next cast (§12d.4).
 *
 * `off` disposes everything LIVE on the spot: the PO's ruling is literal, and
 * letting a bolt already in flight finish would leave the world dressed for
 * seconds after the player asked for it to stop. Ambient is rebuilt in every
 * direction, so a switch back to `full` brings the mist straight back without
 * waiting for the actor to change aura.
 *
 * ⚑ The wind-up glow is untouched by all of this. It is combat information.
 */
function applyDensity(): void {
    const next = GameSettings.get().vfx.density;
    if (next === density) {
        return;
    }
    density = next;
    if (density === 'off') {
        live.forEach(fx => fx.dispose());
        live.length = 0;
    }
    ambients.forEach((entry) => {
        dropAmbient(entry);
        spawnAmbient(entry);
    });
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
