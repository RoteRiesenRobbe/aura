/**
 * The seven motion kinds (plan-skill-vfx.md §4.1) and the registry that IS the
 * closed vocabulary. A kind is ENGINE code: a new one is a plan amendment, not
 * content, which is why SkillFxKinds.test.ts pins this registry's key set
 * against api/skill-vocabulary.json's `visualKinds` in BOTH directions.
 *
 * C2a built four for real - `impact`, `strike`, `projectile`, `beam` - and
 * registered the other three as no-op stubs; C2b filled those in, so all seven
 * draw and no kind is a stub any more.
 *
 * Kinds know nothing about entities: the manager hands them anchors that
 * answer "where is this now" and "is it still on the stage", which is what
 * makes both entity rules the manager's and not seven copies of one:
 *
 * - a `projectile` or a `beam` FINISHES toward the last known position (a bolt
 *   in flight does not vanish when its target dies), and
 * - a `cast-pose`, an `orbit` or an `emitter` STOPS with its owner (§7.1).
 */
import {Container, Graphics} from 'pixi.js';
import {VisualLayer} from '../../../client-data/Skills';
import type {VfxDensity} from '../../game-settings/logic/GameSettings';
import {
    BEAM_CURVE_MS,
    BeamCurve,
    beamExtend,
    beamFlash,
    CAST_POSE_DEFAULT_MS,
    castPoseAlpha,
    clamp01,
    densityCount,
    EMITTER_DEFAULT_COUNT,
    EMITTER_DEFAULT_MS,
    EmitterMotion,
    emitterMotionOf,
    emitterParticle,
    flightMs,
    IMPACT_CURVE_MS,
    ImpactCurve,
    impactPhase,
    snapOpenOf,
    ORBIT_DEFAULT_COUNT,
    ORBIT_DEFAULT_MS,
    ORBIT_RADIUS_PAD_PX,
    orbitAlpha,
    orbitPoint,
    overheadSide,
    projectilePoint,
    StrikeCurve,
    strikeCurveOf,
    strikeTotalMsOf,
    strikePhase,
    swingDirection,
} from './SkillFxMath';
import {
    drawBeamExtendPlaceholder,
    drawBeamFlashPlaceholder,
    drawBladePlaceholder,
    drawCastPoseBowPlaceholder,
    drawHammerPlaceholder,
    drawImpactBurstPlaceholder,
    drawHeldAxePlaceholder,
    drawImpactJawPlaceholder,
    JAW_OPEN_GAP_FACTOR,
    drawOrbitWedgePlaceholder,
    drawParticlePlaceholder,
    drawProjectilePlaceholder,
    drawSpearPlaceholder,
    resolveBody,
} from './SkillFxBodies';

/** The seven names, in the fixture's order. */
export const VISUAL_KINDS = [
    'impact', 'strike', 'projectile', 'beam', 'cast-pose', 'orbit', 'emitter',
] as const;

export type VisualKind = typeof VISUAL_KINDS[number];

/**
 * Where one end of an Fx is right now. The manager keeps these pointed at live
 * game objects and freezes them at the last known position when an entity
 * despawns, so nothing here has to know what a GameObject is.
 */
export interface FxAnchor {
    point(): { x: number, y: number };
    /**
     * Whether the anchored entity is still on the stage. The three
     * owner-anchored kinds end when it is not - a bolt is the one that carries
     * on to the last known position (§7.1).
     */
    alive(): boolean;
    /** the anchored entity's own radius in px, for sizing a placeholder */
    readonly radiusPx: number;
}

export interface FxSpawnContext {
    layer: Container;
    source: FxAnchor;
    victim: FxAnchor;
    color: number;
    def: VisualLayer;
    /** when this layer's first frame draws (performance.now() ms) */
    startAtMs: number;
    /** deterministic per-spawn seed, so a bolt's kinks are reproducible */
    seed: number;
    /** the live slider: only an emitter's particle COUNT reads it (§12d.1) */
    density: VfxDensity;
    /** the skill's reach in px, 0 for none: a cast's `orbit` circles at it */
    reachPx: number;
}

export interface Fx {
    /** @returns false once it has finished and may be released */
    update(nowMs: number): boolean;
    dispose(): void;
}

export interface KindHandler {
    spawn(ctx: FxSpawnContext): Fx | null;
}

// --- Graphics pools ---------------------------------------------------------
//
// Pooled per kind and capped: a burst of 40 impacts allocates once and every
// tick after that reuses. The cap keeps a one-off fight from retaining a
// screenful of Graphics for the rest of the session.

const POOL_CAP_PER_KIND = 32;
const pools: { [kind: string]: Graphics[] } = {};

function acquire(kind: string): Graphics {
    const pooled = pools[kind]?.pop();
    if (pooled && !pooled.destroyed) {
        pooled.clear();
        pooled.visible = true;
        pooled.alpha = 1;
        pooled.rotation = 0;
        pooled.scale.set(1);
        pooled.position.set(0, 0);
        return pooled;
    }
    return new Graphics();
}

function release(kind: string, g: Graphics): void {
    g.parent?.removeChild(g);
    if (g.destroyed) {
        return;
    }
    g.clear();
    const pool = pools[kind] ?? (pools[kind] = []);
    if (pool.length >= POOL_CAP_PER_KIND) {
        g.destroy();
        return;
    }
    pool.push(g);
}

/** Drops every pooled Graphics (reset(): the own player left the world). */
export function clearPools(): void {
    for (const kind of Object.keys(pools)) {
        pools[kind].forEach(g => g.destroy());
        pools[kind] = [];
    }
}

// --- shared layer parameters ------------------------------------------------

function scaleOf(def: VisualLayer): number {
    return def.scale && def.scale > 0 ? def.scale : 1;
}

function impactCurveOf(def: VisualLayer): ImpactCurve {
    // Anything else, including a stale `thrust` from before the C2a amendment,
    // is a burst (§12c.1).
    return def.curve === 'snap' ? 'snap' : 'burst';
}

function beamCurveOf(def: VisualLayer): BeamCurve {
    // Absent = flash (PO 2026-09-19).
    return def.curve === 'extend' ? 'extend' : 'flash';
}

function angle(from: { x: number, y: number }, to: { x: number, y: number }): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

// --- impact -----------------------------------------------------------------

/**
 * A small ROUND mark on the VICTIM (§12c.1): a ring bursting outward, or two
 * jaws snapping shut. It is never rotated by the caster's direction - the
 * attacker's half of a melee hit is the `strike` kind's job. The victim's
 * position is re-read per frame, so the mark stays on a mob that is walking
 * away from the hit that landed on it.
 */
class ImpactFx implements Fx {
    private readonly g: Graphics;
    private readonly curve: ImpactCurve;
    private readonly totalMs: number;
    private readonly sizePx: number;
    /** the second body of a `snap`; null for a burst */
    private lowerJaw: Graphics | null = null;

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = impactCurveOf(ctx.def);
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : IMPACT_CURVE_MS[this.curve];
        resolveBody(ctx.def.body);
        this.g = acquire('impact');
        this.sizePx = ctx.victim.radiusPx * scaleOf(ctx.def);
        // A bite is TWO bodies, each drawn once: the jaws close by moving
        // together, never by shrinking and never by a per-frame redraw.
        if (this.curve === 'snap') {
            drawImpactJawPlaceholder(this.g, ctx.color, this.sizePx, -1);
            this.lowerJaw = acquire('impact');
            drawImpactJawPlaceholder(this.lowerJaw, ctx.color, this.sizePx, 1);
            this.lowerJaw.visible = false;
            ctx.layer.addChild(this.lowerJaw);
        } else {
            drawImpactBurstPlaceholder(this.g, ctx.color, this.sizePx);
        }
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const phase = impactPhase(this.curve, elapsed, this.totalMs);
        if (phase.done) {
            return false;
        }
        const to = this.ctx.victim.point();
        this.g.visible = true;
        if (this.lowerJaw !== null) {
            const gap = this.sizePx * JAW_OPEN_GAP_FACTOR * snapOpenOf(phase.scale);
            this.g.position.set(to.x, to.y - gap);
            this.lowerJaw.position.set(to.x, to.y + gap);
            this.lowerJaw.alpha = phase.alpha;
            this.lowerJaw.visible = true;
        } else {
            this.g.position.set(to.x, to.y);
            this.g.scale.set(phase.scale);
        }
        this.g.alpha = phase.alpha;
        return true;
    }

    dispose(): void {
        release('impact', this.g);
        if (this.lowerJaw !== null) {
            release('impact', this.lowerJaw);
            this.lowerJaw = null;
        }
    }
}

// --- strike -----------------------------------------------------------------

/**
 * The weapon's length when the skill authors no reach (a fallback only), as a
 * share of the attacker's radius. [PLACEHOLDER]
 */
const STRIKE_FALLBACK_LENGTH_FACTOR = 1.5;
/** The shortest weapon drawn, whatever the reach. */
const STRIKE_MIN_LENGTH_PX = 40;
/** Weapon thickness as a share of its length, and its floor in px. */
const STRIKE_THICKNESS_RATIO = 0.055;
const STRIKE_MIN_THICKNESS_PX = 4;
/** Where the hand is: this share of the attacker's radius out along the aim. */
const STRIKE_HAND_OFFSET = 0.6;

/**
 * A weapon HELD by the attacker and aimed at the victim (§12c): the spear
 * stabs, the blade sweeps, the hammer winds up and falls.
 *
 * ⚑ The hilt never leaves the hand, and the weapon spans from the hand to the
 * SKILL'S MAX RANGE, not to the victim (PO 2026-09-20, two rulings in one day:
 * a weapon sized to the gap "reads as strange", and a fixed weapon carried to
 * the victim left its hilt "in thin air, where the character could not have it
 * in hand"). So it has one size per skill, shows the reach it threatens, and
 * passes THROUGH a victim standing closer than that reach, by ruling.
 *
 * The attacker's end is re-read per frame and the aim follows the victim, so
 * the weapon tracks both and finishes toward the last known position of
 * whichever of them despawns first. The body is drawn once.
 */
class StrikeFx implements Fx {
    private readonly g: Graphics;
    private readonly curve: StrikeCurve;
    private readonly totalMs: number;
    private readonly lengthPx: number;
    /** the swing's alternating side; an overhead latches its own at first draw */
    private sweepDirection: number;
    private sideLatched = false;

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = strikeCurveOf(ctx.def.curve);
        this.totalMs = strikeTotalMsOf(ctx.def.curve, ctx.def.ms);
        const handPx = ctx.source.radiusPx * STRIKE_HAND_OFFSET;
        this.lengthPx = Math.max(
            STRIKE_MIN_LENGTH_PX,
            ctx.reachPx > 0
                ? ctx.reachPx - handPx
                : ctx.source.radiusPx * STRIKE_FALLBACK_LENGTH_FACTOR);
        this.sweepDirection = swingDirection(ctx.seed);
        resolveBody(ctx.def.body);
        this.g = acquire('strike');
        this.draw();
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const phase = strikePhase(this.curve, elapsed, this.totalMs);
        if (phase.done) {
            return false;
        }
        const from = this.ctx.source.point();
        const aim = angle(from, this.ctx.victim.point());
        // An overhead is raised toward the top of the screen. Latched once: a
        // victim crossing the vertical mid-swing must not flip the hammer.
        if (this.curve === 'overhead' && !this.sideLatched) {
            this.sweepDirection = overheadSide(aim);
            this.sideLatched = true;
        }
        const handPx = this.ctx.source.radiusPx * STRIKE_HAND_OFFSET;
        // `offset` moves the hand itself (the overhead's draw-back); `extend`
        // is the stab growing out of the hand. Both in units of the weapon.
        const along = handPx + this.lengthPx * phase.offset;
        this.g.position.set(from.x + Math.cos(aim) * along, from.y + Math.sin(aim) * along);
        this.g.rotation = aim + phase.angleOffset * this.sweepDirection;
        this.g.scale.set(phase.extend * phase.scale, phase.scale);
        this.g.alpha = phase.alpha;
        this.g.visible = true;
        return true;
    }

    private draw(): void {
        const thickness = Math.max(
            STRIKE_MIN_THICKNESS_PX, this.lengthPx * STRIKE_THICKNESS_RATIO) * scaleOf(this.ctx.def);
        switch (this.curve) {
            case 'swing':
                drawBladePlaceholder(this.g, this.ctx.color, this.lengthPx, thickness);
                break;
            case 'overhead':
                drawHammerPlaceholder(this.g, this.ctx.color, this.lengthPx, thickness);
                break;
            default:
                drawSpearPlaceholder(this.g, this.ctx.color, this.lengthPx, thickness);
        }
    }

    dispose(): void {
        release('strike', this.g);
    }
}

// --- projectile -------------------------------------------------------------

/**
 * A body flying caster→victim at the authored speed. The launch point is fixed
 * at spawn (the caster has already released it); the target is tracked while
 * the victim lives and frozen at its last known position afterwards.
 */
class ProjectileFx implements Fx {
    private readonly g: Graphics;
    private readonly from: { x: number, y: number };
    private readonly flightMsTotal: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.from = ctx.source.point();
        const to = ctx.victim.point();
        this.flightMsTotal = flightMs(
            Math.hypot(to.x - this.from.x, to.y - this.from.y), ctx.def.speed ?? 0);
        resolveBody(ctx.def.body);
        this.g = acquire('projectile');
        drawProjectilePlaceholder(this.g, ctx.color, ctx.victim.radiusPx * scaleOf(ctx.def));
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const t = elapsed / this.flightMsTotal;
        if (t >= 1) {
            return false;
        }
        const to = this.ctx.victim.point();
        const p = projectilePoint(this.from.x, this.from.y, to.x, to.y, t);
        this.g.visible = true;
        this.g.position.set(p.x, p.y);
        this.g.rotation = angle(this.from, to);
        this.g.alpha = 1;
        return true;
    }

    dispose(): void {
        release('projectile', this.g);
    }
}

// --- beam -------------------------------------------------------------------

/** Default stroke width when a `beam` layer authors none. [PLACEHOLDER] */
const BEAM_DEFAULT_WIDTH_PX = 4;

/**
 * A body stretched caster→victim. `flash` (lightning) runs a jagged bolt
 * through an attack/peak/fade envelope; `extend` (flame pillars) grows a
 * ribbon out of the caster end and pulls it home.
 */
class BeamFx implements Fx {
    private readonly g: Graphics;
    private readonly curve: BeamCurve;
    private readonly totalMs: number;
    private readonly widthPx: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = beamCurveOf(ctx.def);
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : BEAM_CURVE_MS[this.curve];
        this.widthPx = (ctx.def.width && ctx.def.width > 0 ? ctx.def.width : BEAM_DEFAULT_WIDTH_PX)
            * scaleOf(ctx.def);
        resolveBody(ctx.def.body);
        this.g = acquire('beam');
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const from = this.ctx.source.point();
        const to = this.ctx.victim.point();
        if (this.curve === 'extend') {
            const phase = beamExtend(elapsed, this.totalMs);
            if (phase.done) {
                return false;
            }
            const e = clamp01(phase.extent);
            drawBeamExtendPlaceholder(
                this.g, this.ctx.color,
                from.x, from.y,
                from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e,
                this.widthPx, phase.alpha);
        } else {
            const phase = beamFlash(elapsed, this.totalMs);
            if (phase.done) {
                return false;
            }
            drawBeamFlashPlaceholder(
                this.g, this.ctx.color, from.x, from.y, to.x, to.y,
                this.widthPx * phase.width, phase.intensity, this.ctx.seed);
        }
        this.g.visible = true;
        return true;
    }

    dispose(): void {
        release('beam', this.g);
    }
}

// --- cast-pose --------------------------------------------------------------

/**
 * Where the pose's centre sits: this share of the caster's radius out along the
 * aim. Small on purpose: the bow's arc has its own radius, so its limb clears
 * the avatar while the string crosses the body like a drawn bow.
 */
const CAST_POSE_HAND_OFFSET = 0.2;
/** Body size as a share of the caster's radius. [PLACEHOLDER] */
const CAST_POSE_SIZE_FACTOR = 1.1;

/**
 * A body shown ON the caster for a beat after a cast went off (§4.1, the bow).
 *
 * ⚑ It appears at RELEASE, not before it (§12d.4): FIRED is emitted when a
 * cast is consumed, so the bow is drawn as the arrow leaves. It is an
 * owner-anchored kind, so it ends with its caster rather than finishing.
 */
class CastPoseFx implements Fx {
    private readonly g: Graphics;
    private readonly totalMs: number;
    private readonly offsetPx: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : CAST_POSE_DEFAULT_MS;
        this.offsetPx = ctx.source.radiusPx * CAST_POSE_HAND_OFFSET;
        resolveBody(ctx.def.body);
        this.g = acquire('cast-pose');
        drawCastPoseBowPlaceholder(
            this.g, ctx.color, ctx.source.radiusPx * CAST_POSE_SIZE_FACTOR * scaleOf(ctx.def));
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.ctx.source.alive()) {
            return false;
        }
        const alpha = castPoseAlpha(elapsed, this.totalMs);
        if (alpha <= 0) {
            return false;
        }
        const at = this.ctx.source.point();
        // On `hit` the pose AIMS at its victim (PO 2026-09-20); on `fired`
        // source and victim are one anchor, the angle is 0 and it faces +X.
        const to = this.ctx.victim.point();
        const angle = Math.atan2(to.y - at.y, to.x - at.x);
        this.g.visible = true;
        this.g.position.set(
            at.x + Math.cos(angle) * this.offsetPx, at.y + Math.sin(angle) * this.offsetPx);
        this.g.rotation = angle;
        this.g.alpha = alpha;
        return true;
    }

    dispose(): void {
        release('cast-pose', this.g);
    }
}

// --- orbit ------------------------------------------------------------------

/** Body size as a share of the caster's radius. [PLACEHOLDER] */
const ORBIT_SIZE_FACTOR = 0.5;
/** A HELD orbit body starts this share of the wielder's radius out from the centre. */
const ORBIT_HAND_OFFSET = 0.6;

/**
 * N bodies circling the caster (§4.1: the two spinning axes). One Graphics per
 * body, pooled like every other kind.
 *
 * Its two triggers differ only in how long it lives (§12d.3): a `fired` orbit
 * runs for its `ms` and fades in and out inside it, an `ambient` one lives
 * exactly as long as the reconciler holds it. Density never thins an orbit -
 * `low` is about particles (PO, §12d.1).
 */
class OrbitFx implements Fx {
    private readonly bodies: Graphics[] = [];
    private readonly anchor: FxAnchor;
    private readonly count: number;
    private readonly radiusPx: number;
    /** a cast's orbit at the skill's reach: held axes, not free-floating wedges */
    private readonly held: boolean;
    /** 0 = ambient: no duration of its own. */
    private readonly totalMs: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.anchor = ctx.source;
        this.count = Math.max(1, Math.round(ctx.def.count ?? ORBIT_DEFAULT_COUNT));
        // A cast's orbit IS the ability's reach (PO 2026-09-20): the weapon
        // starts at the player and its head reaches the range, showing where
        // someone could be hit. An ambient one hugs its owner, whose ring
        // already draws the range.
        const atReach = ctx.def.on !== 'ambient' && ctx.reachPx > 0;
        this.radiusPx = atReach ? ctx.reachPx : this.anchor.radiusPx + ORBIT_RADIUS_PAD_PX;
        this.totalMs = ctx.def.on === 'ambient'
            ? 0
            : (ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : ORBIT_DEFAULT_MS);
        resolveBody(ctx.def.body);
        this.held = atReach;
        const sizePx = this.anchor.radiusPx * ORBIT_SIZE_FACTOR * scaleOf(ctx.def);
        for (let i = 0; i < this.count; i++) {
            const g = acquire('orbit');
            if (atReach) {
                drawHeldAxePlaceholder(g, ctx.color, this.radiusPx - this.anchor.radiusPx * ORBIT_HAND_OFFSET);
            } else {
                drawOrbitWedgePlaceholder(g, ctx.color, sizePx);
            }
            g.visible = false;
            ctx.layer.addChild(g);
            this.bodies.push(g);
        }
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.anchor.alive()) {
            return false;
        }
        const alpha = orbitAlpha(elapsed, this.totalMs);
        if (alpha <= 0 && elapsed > 0) {
            return false;
        }
        const at = this.anchor.point();
        for (let i = 0; i < this.bodies.length; i++) {
            const p = orbitPoint(i, this.count, elapsed, this.radiusPx);
            const g = this.bodies[i];
            g.visible = alpha > 0;
            const heading = Math.atan2(p.y, p.x);
            if (this.held) {
                // Held: the haft starts at the wielder's hand and the head
                // rides the inside of the range ring.
                const hand = this.anchor.radiusPx * ORBIT_HAND_OFFSET;
                g.position.set(at.x + Math.cos(heading) * hand, at.y + Math.sin(heading) * hand);
            } else {
                g.position.set(at.x + p.x, at.y + p.y);
            }
            // Both bodies point outward along +X.
            g.rotation = heading;
            g.alpha = alpha;
        }
        return true;
    }

    dispose(): void {
        this.bodies.forEach(g => release('orbit', g));
        this.bodies.length = 0;
    }
}

// --- emitter ----------------------------------------------------------------

/** One particle's body radius, as a share of the anchor's radius. [PLACEHOLDER] */
const PARTICLE_SIZE_FACTOR = 0.16;
/**
 * ...and its ceiling, before `scale`: a campfire is a big anchor, and motes
 * sized to IT read as boulders next to an avatar (PO 2026-09-20).
 */
const PARTICLE_MAX_RADIUS_PX = 6;

/**
 * Particles from the anchor's disc, with a motion and a per-particle lifetime
 * (§12d.3). `ambient` LOOPS - `count` particles alive at once as a steady
 * stream, phase-offset so they never arrive together - while `fired` and `hit`
 * are one burst that is over after `ms`.
 *
 * The anchor is the caster for `ambient` / `fired` and the victim for `hit`
 * (§12d.3), and like the other two owner-anchored kinds it stops with it.
 */
class EmitterFx implements Fx {
    private readonly bodies: Graphics[] = [];
    private readonly anchor: FxAnchor;
    private readonly motion: EmitterMotion;
    private readonly loop: boolean;
    private readonly count: number;
    private readonly lifeMs: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.anchor = ctx.def.on === 'hit' ? ctx.victim : ctx.source;
        this.motion = emitterMotionOf(ctx.def.motion);
        this.loop = ctx.def.on === 'ambient';
        // ⚑ The ONE place the slider touches a body count (§12d.1).
        this.count = densityCount(
            Math.round(ctx.def.count ?? EMITTER_DEFAULT_COUNT), ctx.density);
        this.lifeMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : EMITTER_DEFAULT_MS;
        resolveBody(ctx.def.body);
        const radiusPx = scaleOf(ctx.def) * Math.min(
            PARTICLE_MAX_RADIUS_PX, Math.max(3, this.anchor.radiusPx * PARTICLE_SIZE_FACTOR));
        for (let i = 0; i < this.count; i++) {
            const g = acquire('emitter');
            drawParticlePlaceholder(g, ctx.color, radiusPx);
            g.visible = false;
            ctx.layer.addChild(g);
            this.bodies.push(g);
        }
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.anchor.alive() || this.count === 0) {
            return false;
        }
        if (!this.loop && elapsed >= this.lifeMs) {
            return false;
        }
        const at = this.anchor.point();
        for (let i = 0; i < this.bodies.length; i++) {
            const p = emitterParticle(
                this.motion, i, this.count, elapsed, this.lifeMs,
                this.anchor.radiusPx, this.loop);
            const g = this.bodies[i];
            g.visible = p.alpha > 0;
            g.position.set(at.x + p.x, at.y + p.y);
            g.alpha = p.alpha;
            g.scale.set(p.scale);
        }
        return true;
    }

    dispose(): void {
        this.bodies.forEach(g => release('emitter', g));
        this.bodies.length = 0;
    }
}

// --- the registry -----------------------------------------------------------

export const KIND_REGISTRY: { [kind: string]: KindHandler } = {
    'impact': {spawn: ctx => new ImpactFx(ctx)},
    'strike': {spawn: ctx => new StrikeFx(ctx)},
    'projectile': {spawn: ctx => new ProjectileFx(ctx)},
    'beam': {spawn: ctx => new BeamFx(ctx)},
    'cast-pose': {spawn: ctx => new CastPoseFx(ctx)},
    'orbit': {spawn: ctx => new OrbitFx(ctx)},
    'emitter': {spawn: ctx => new EmitterFx(ctx)},
};

export function kindHandler(kind: string): KindHandler | undefined {
    return KIND_REGISTRY[kind];
}
