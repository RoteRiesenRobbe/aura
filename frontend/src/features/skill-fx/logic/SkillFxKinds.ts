/**
 * The seven motion kinds (plan-skill-vfx.md §4.1) and the registry that IS the
 * closed vocabulary. A kind is ENGINE code: a new one is a plan amendment, not
 * content, which is why SkillFxKinds.test.ts pins this registry's key set
 * against api/skill-vocabulary.json's `visualKinds` in BOTH directions.
 *
 * C2a builds four for real - `impact`, `strike`, `projectile`, `beam` - and
 * registers the other three as no-op stubs that log once. They are registered
 * rather than absent so the pin holds today and C2b only has to replace a body,
 * never the vocabulary.
 *
 * Kinds know nothing about entities: the manager hands them anchors that
 * answer "where is this now", which is what makes "follow, then finish" (a
 * bolt in flight does not vanish when its target dies) the manager's rule and
 * not seven copies of one.
 */
import {Container, Graphics} from 'pixi.js';
import {VisualLayer} from '../../../client-data/Skills';
import {
    BEAM_CURVE_MS,
    BeamCurve,
    beamExtend,
    beamFlash,
    clamp01,
    contactMs,
    flightMs,
    IMPACT_CURVE_MS,
    ImpactCurve,
    impactPhase,
    projectilePoint,
    STRIKE_CURVE_MS,
    StrikeCurve,
    strikePhase,
    swingDirection,
} from './SkillFxMath';
import {
    drawBeamExtendPlaceholder,
    drawBeamFlashPlaceholder,
    drawBladePlaceholder,
    drawHammerPlaceholder,
    drawImpactBurstPlaceholder,
    drawImpactSnapPlaceholder,
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
}

export interface Fx {
    /** @returns false once it has finished and may be released */
    update(nowMs: number): boolean;
    dispose(): void;
}

export interface KindHandler {
    /** true while C2b still owes this kind its body */
    readonly stub: boolean;
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

function strikeCurveOf(def: VisualLayer): StrikeCurve {
    // Absent = thrust (PO 2026-09-19).
    return def.curve === 'swing' || def.curve === 'overhead' ? def.curve : 'thrust';
}

/**
 * When this `strike` layer's weapon is ON the victim. Exported because the
 * manager sequences an `impact` beside a strike off it, the way it already
 * waits out a projectile's flight, and the two must not disagree about which
 * total the contact is a fraction of.
 */
export function strikeContactMsOf(def: VisualLayer): number {
    const curve = strikeCurveOf(def);
    return contactMs(curve, def.ms && def.ms > 0 ? def.ms : STRIKE_CURVE_MS[curve]);
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

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = impactCurveOf(ctx.def);
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : IMPACT_CURVE_MS[this.curve];
        resolveBody(ctx.def.body);
        this.g = acquire('impact');
        const sizePx = ctx.victim.radiusPx * scaleOf(ctx.def);
        if (this.curve === 'snap') {
            drawImpactSnapPlaceholder(this.g, ctx.color, sizePx);
        } else {
            drawImpactBurstPlaceholder(this.g, ctx.color, sizePx);
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
        this.g.position.set(to.x, to.y);
        this.g.scale.set(phase.scale);
        this.g.alpha = phase.alpha;
        return true;
    }

    dispose(): void {
        release('impact', this.g);
    }
}

// --- strike -----------------------------------------------------------------

/** The shortest weapon drawn, whatever the gap: a point-blank hit still reads. */
const STRIKE_MIN_LENGTH_PX = 40;
/** Base weapon thickness as a share of its length, and its floor in px. */
const STRIKE_THICKNESS_RATIO = 0.055;
const STRIKE_MIN_THICKNESS_PX = 4;
/** Where the hand is: this share of the attacker's radius out along the aim. */
const STRIKE_HAND_OFFSET = 0.6;
/** How far short of the victim's centre a weapon stops. */
const STRIKE_VICTIM_INSET = 0.3;
/** Redraw the weapon only once the gap has really moved. */
const STRIKE_REDRAW_EPSILON_PX = 2;

/**
 * A weapon anchored at the ATTACKER and carried to the victim (§12c): the
 * prototype's idea, generalised into three styles. The spear extends, the blade
 * sweeps, the hammer winds up and falls.
 *
 * Both ends are re-read per frame, so the weapon follows a caster who is moving
 * and a victim who is fleeing, and finishes toward the last known position of
 * whichever of them despawns first. The reach changes with them, so the body is
 * redrawn - but only when the gap has actually moved, which for a standing
 * exchange is once.
 */
class StrikeFx implements Fx {
    private readonly g: Graphics;
    private readonly curve: StrikeCurve;
    private readonly totalMs: number;
    private readonly sizeScale: number;
    private readonly sweepDirection: number;
    private drawnLengthPx = 0;

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = strikeCurveOf(ctx.def);
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : STRIKE_CURVE_MS[this.curve];
        this.sizeScale = scaleOf(ctx.def);
        this.sweepDirection = swingDirection(ctx.seed);
        resolveBody(ctx.def.body);
        this.g = acquire('strike');
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
        const to = this.ctx.victim.point();
        const aim = angle(from, to);
        const handX = from.x + Math.cos(aim) * this.ctx.source.radiusPx * STRIKE_HAND_OFFSET;
        const handY = from.y + Math.sin(aim) * this.ctx.source.radiusPx * STRIKE_HAND_OFFSET;
        const reach = Math.max(
            STRIKE_MIN_LENGTH_PX,
            Math.hypot(to.x - handX, to.y - handY) - this.ctx.victim.radiusPx * STRIKE_VICTIM_INSET);
        if (Math.abs(reach - this.drawnLengthPx) > STRIKE_REDRAW_EPSILON_PX) {
            this.drawnLengthPx = reach;
            this.draw(reach);
        }
        // `offset` moves the hand itself (the overhead's draw-back); `extend`
        // and `scale` are the weapon's own, so the head lands where the math
        // says it does whatever the gap is.
        this.g.position.set(
            handX + Math.cos(aim) * reach * phase.offset,
            handY + Math.sin(aim) * reach * phase.offset);
        this.g.rotation = aim + phase.angleOffset * this.sweepDirection;
        this.g.scale.set(phase.extend * phase.scale, phase.scale);
        this.g.alpha = phase.alpha;
        this.g.visible = true;
        return true;
    }

    private draw(lengthPx: number): void {
        const thickness = Math.max(
            STRIKE_MIN_THICKNESS_PX, lengthPx * STRIKE_THICKNESS_RATIO) * this.sizeScale;
        switch (this.curve) {
            case 'swing':
                drawBladePlaceholder(this.g, this.ctx.color, lengthPx, thickness);
                break;
            case 'overhead':
                drawHammerPlaceholder(this.g, this.ctx.color, lengthPx, thickness);
                break;
            default:
                drawSpearPlaceholder(this.g, this.ctx.color, lengthPx, thickness);
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

// --- the registry -----------------------------------------------------------

/** Stub kinds already logged, so the warning is once per kind, not per hit. */
const warnedStubs = new Set<string>();

function stubHandler(kind: string): KindHandler {
    return {
        stub: true,
        spawn(): null {
            if (!warnedStubs.has(kind)) {
                warnedStubs.add(kind);
                console.warn(`[skill-fx] kind "${kind}" is not built yet (C2b) - nothing drawn`);
            }
            return null;
        },
    };
}

export const KIND_REGISTRY: { [kind: string]: KindHandler } = {
    'impact': {stub: false, spawn: ctx => new ImpactFx(ctx)},
    'strike': {stub: false, spawn: ctx => new StrikeFx(ctx)},
    'projectile': {stub: false, spawn: ctx => new ProjectileFx(ctx)},
    'beam': {stub: false, spawn: ctx => new BeamFx(ctx)},
    'cast-pose': stubHandler('cast-pose'),
    'orbit': stubHandler('orbit'),
    'emitter': stubHandler('emitter'),
};

export function kindHandler(kind: string): KindHandler | undefined {
    return KIND_REGISTRY[kind];
}
