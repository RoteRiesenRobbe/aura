/**
 * Skill VFX, as pure numbers (plan-skill-vfx.md C2a, §7.2).
 *
 * Everything that decides WHERE a bolt, weapon or beam node is and HOW visible
 * it is lives here, so it can be tested without a renderer - the
 * AscensionChannelMath precedent, harvested from the skill-visuals prototype.
 *
 * ⚑ Nothing here is random. A lightning bolt's kinks are derived from the node
 * index and a caller-supplied seed, so the same bolt always draws the same
 * shape and a test can assert a position rather than a range. The prototype's
 * client-side skill-id table and its `withinReach` inference do NOT come over:
 * attribution is on the wire since C1.
 *
 * Every constant below is [PLACEHOLDER] until the PO look.
 */
import type {VfxDensity} from '../../game-settings/logic/GameSettings';

// --- shared -----------------------------------------------------------------

const TAU = Math.PI * 2;

export function clamp01(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(p: number): number {
    return 1 - Math.pow(1 - p, 3);
}

function easeInCubic(p: number): number {
    return p * p * p;
}

/** Symmetric: 0.5 at p = 0.5 exactly, which is what makes a sweep's zero crossing a fact. */
function easeInOutCubic(p: number): number {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// --- projectiles ------------------------------------------------------------

/** Flight speed when a `projectile` layer authors none, and the clamps. */
export const PROJECTILE_SPEED_PX_PER_S = 700;
export const PROJECTILE_MIN_MS = 140;
export const PROJECTILE_MAX_MS = 900;

/**
 * Flight duration for a bolt covering distPx at the layer's authored speed.
 * Clamped: a point-blank hit still reads as a throw, and a max-range one never
 * drifts its impact so far from the tick that cause and effect come apart.
 */
export function flightMs(distPx: number, speedPxPerS: number): number {
    const speed = speedPxPerS > 0 ? speedPxPerS : PROJECTILE_SPEED_PX_PER_S;
    const ms = (distPx / speed) * 1000;
    return Math.min(PROJECTILE_MAX_MS, Math.max(PROJECTILE_MIN_MS, ms));
}

/** Straight-line flight, eased in slightly so the launch reads as a launch. */
export function projectilePoint(
    fromX: number, fromY: number, toX: number, toY: number, t: number,
): { x: number, y: number } {
    const p = clamp01(t);
    const eased = p * p * (3 - 2 * p); // smoothstep
    return {x: fromX + (toX - fromX) * eased, y: fromY + (toY - fromY) * eased};
}

// --- impact curves ----------------------------------------------------------

/**
 * The `impact` kind's curve set (api/skill-vocabulary.json `visualCurves`).
 *
 * ⚑ `thrust` LEFT this set at the C2a amendment (§12c.1) and is now a `strike`
 * style: an impact is a small ROUND mark on the victim, never directional.
 */
export type ImpactCurve = 'burst' | 'snap';

/** Default lifetime per curve when the layer authors no `ms`. */
export const IMPACT_CURVE_MS: Record<ImpactCurve, number> = {
    burst: 220,
    snap: 180,
};

export interface ImpactPhase {
    /** body size as a share of the victim's own radius */
    scale: number;
    alpha: number;
    done: boolean;
}

/** The snap's close share: the jaws shut in the first half, then fade. */
const SNAP_CLOSE_FRACTION = 0.5;
/** The snap's `scale` runs from wide open down by this much as the jaws shut. */
const SNAP_OPEN_SCALE = 1.3;
const SNAP_CLOSE_TRAVEL = 0.75;
/** How far a burst ring grows, as a share of the victim's radius. */
const BURST_START_SCALE = 0.3;
const BURST_END_SCALE = 0.9;

/**
 * How far open the jaws are for a snap's `scale`: 1 = wide open, 0 = shut. The
 * jaws close by MOVING, not by shrinking, so the renderer wants the travel
 * rather than the size (PO 2026-09-20).
 */
export function snapOpenOf(scale: number): number {
    return clamp01((scale - (SNAP_OPEN_SCALE - SNAP_CLOSE_TRAVEL)) / SNAP_CLOSE_TRAVEL);
}

/**
 * One impact body over time. `snap` closes two jaws onto the victim's centre
 * (bites, gore); `burst` expands a small ring outward while fading (spells,
 * elemental hits, AoE, DoT applications, a missile's arrival).
 *
 * An unknown or legacy `curve` draws a burst rather than throwing: content can
 * outlive a vocabulary change, and a stale file must still show a hit.
 */
export function impactPhase(curve: ImpactCurve, elapsedMs: number, totalMs: number): ImpactPhase {
    const total = totalMs > 0 ? totalMs : (IMPACT_CURVE_MS[curve] ?? IMPACT_CURVE_MS.burst);
    if (elapsedMs >= total) {
        return {scale: BURST_END_SCALE, alpha: 0, done: true};
    }
    const p = clamp01(elapsedMs / total);
    if (curve === 'snap') {
        const close = easeOutCubic(clamp01(p / SNAP_CLOSE_FRACTION));
        const alpha = p <= SNAP_CLOSE_FRACTION
            ? 1
            : 1 - (p - SNAP_CLOSE_FRACTION) / (1 - SNAP_CLOSE_FRACTION);
        return {scale: SNAP_OPEN_SCALE - SNAP_CLOSE_TRAVEL * close, alpha, done: false};
    }
    return {
        scale: BURST_START_SCALE + (BURST_END_SCALE - BURST_START_SCALE) * easeOutCubic(p),
        alpha: 1 - p,
        done: false,
    };
}

// --- strike styles ----------------------------------------------------------
//
// The caster-anchored melee kind (§12c): a weapon starts at the ATTACKER and
// travels to the victim, which is the half of a melee hit `impact` never had.
// Everything below is in reach units - fractions of the caster→victim gap - so
// one set of numbers drives a spear at 40 px and a hammer at 200.

/** The `strike` kind's curve set (PO 2026-09-19, §12c.1). */
export type StrikeCurve = 'thrust' | 'swing' | 'overhead';

/** Default lifetime per style when the layer authors no `ms`. */
export const STRIKE_CURVE_MS: Record<StrikeCurve, number> = {
    thrust: 200,
    swing: 280,
    overhead: 460,
};

export interface StrikePhase {
    /** how far along the reach the weapon extends, 0..1 */
    extend: number;
    /** radians added to the caster→victim aim, for the sweep (direction +1) */
    angleOffset: number;
    /** signed share of the reach the weapon's ORIGIN is moved along the aim */
    offset: number;
    /** weapon size multiplier: the overhead's raise toward the camera */
    scale: number;
    alpha: number;
    done: boolean;
}

/** Where each style's weapon is ON the victim, as a share of its lifetime. */
const THRUST_CONTACT_FRACTION = 0.45;
const SWING_CONTACT_FRACTION = 0.5;
const OVERHEAD_CONTACT_FRACTION = 0.7;

/** The swing's half arc: the blade sweeps -50° to +50° around the aim. */
export const SWING_HALF_ARC_RAD = (50 * Math.PI) / 180;
/** Where the swing starts fading, so the arc is gone before the next tick. */
const SWING_FADE_FRACTION = 0.6;

/** The overhead's wind-up share, its hold after landing, and its geometry. */
export const OVERHEAD_WINDUP_FRACTION = 0.45;
const OVERHEAD_HOLD_FRACTION = 0.82;
const OVERHEAD_RAISE_SCALE = 1.3;
/**
 * How far off the aim the raised weapon is held: a quarter turn (PO 2026-09-20,
 * from a sketch: the hammer stands 90 degrees off the line to the victim, then
 * swings down onto it).
 */
export const OVERHEAD_RAISE_RAD = Math.PI / 2;

const STRIKE_CONTACT_FRACTION: Record<StrikeCurve, number> = {
    thrust: THRUST_CONTACT_FRACTION,
    swing: SWING_CONTACT_FRACTION,
    overhead: OVERHEAD_CONTACT_FRACTION,
};

/**
 * The moment the weapon reaches the victim: the end of a thrust's extension,
 * the sweep crossing the aim, the hammer landing. The manager starts an
 * `impact` beside a `strike` here, exactly as it waits out a projectile's
 * flight (§12c.1).
 */
export function contactMs(curve: StrikeCurve, totalMs: number): number {
    const total = totalMs > 0 ? totalMs : (STRIKE_CURVE_MS[curve] ?? STRIKE_CURVE_MS.thrust);
    return total * (STRIKE_CONTACT_FRACTION[curve] ?? THRUST_CONTACT_FRACTION);
}

/** Which weapon style a `strike` layer authors; absent = thrust (PO 2026-09-19). */
export function strikeCurveOf(curve: string | undefined): StrikeCurve {
    return curve === 'swing' || curve === 'overhead' ? curve : 'thrust';
}

/**
 * When an authored `strike` layer's weapon is ON the victim.
 *
 * ⚑ It lives HERE, beside `contactMs`, rather than with the kind that draws it:
 * SkillFxPlan sequences an `impact` off it and must stay renderer-free, and the
 * planner and the kind must not disagree about which total the contact is a
 * fraction of. (`impactCurveOf` / `beamCurveOf` stay in SkillFxKinds - nothing
 * outside the drawing reads them.)
 */
export function strikeContactMsOf(curve: string | undefined, ms: number | undefined): number {
    return contactMs(strikeCurveOf(curve), strikeTotalMsOf(curve, ms));
}

/**
 * A strike's whole duration: the authored `ms`, else the style's default. The
 * ONE place that fallback lives, because the weapon animates against this
 * total and its impact fires at a fraction of it: two copies that drift would
 * land the mark before or after the weapon.
 */
export function strikeTotalMsOf(curve: string | undefined, ms: number | undefined): number {
    return ms && ms > 0 ? ms : STRIKE_CURVE_MS[strikeCurveOf(curve)];
}

/**
 * One weapon over time. The far end of the weapon (its head) sits at
 * `offset + extend * scale` reach units from the attacker, and no style puts it
 * past 1 before its contact moment: a wind-up that overshoots the victim reads
 * as a hit that landed early.
 *
 * `angleOffset` assumes a +1 sweep; the caller multiplies by
 * `swingDirection(seed)` so repeated hits alternate without being random.
 */
export function strikePhase(curve: StrikeCurve, elapsedMs: number, totalMs: number): StrikePhase {
    const total = totalMs > 0 ? totalMs : (STRIKE_CURVE_MS[curve] ?? STRIKE_CURVE_MS.thrust);
    if (elapsedMs >= total) {
        return {extend: 1, angleOffset: 0, offset: 0, scale: 1, alpha: 0, done: true};
    }
    const p = clamp01(elapsedMs / total);
    switch (curve) {
        case 'swing': {
            // The blade pivots at the hand at full reach and sweeps through the
            // victim; the symmetric ease puts the crossing exactly at contact.
            const alpha = p <= SWING_FADE_FRACTION
                ? 1
                : 1 - (p - SWING_FADE_FRACTION) / (1 - SWING_FADE_FRACTION);
            return {
                extend: 1,
                angleOffset: -SWING_HALF_ARC_RAD + 2 * SWING_HALF_ARC_RAD * easeInOutCubic(p),
                offset: 0,
                scale: 1,
                alpha,
                done: false,
            };
        }
        case 'overhead': {
            // A held weapon pivoting at the hand: it never stretches and never
            // leaves it. `angleOffset` assumes the +1 side; the caller picks
            // the side with overheadSide, NOT swingDirection.
            if (p < OVERHEAD_WINDUP_FRACTION) {
                // Raised a quarter turn off the aim, lifting toward the camera.
                const u = easeOutCubic(p / OVERHEAD_WINDUP_FRACTION);
                return {
                    extend: 1,
                    angleOffset: -OVERHEAD_RAISE_RAD,
                    offset: 0,
                    scale: 1 + (OVERHEAD_RAISE_SCALE - 1) * u,
                    alpha: 1,
                    done: false,
                };
            }
            if (p < OVERHEAD_CONTACT_FRACTION) {
                // The fall: heavy, so it accelerates down onto the victim.
                const t = (p - OVERHEAD_WINDUP_FRACTION)
                    / (OVERHEAD_CONTACT_FRACTION - OVERHEAD_WINDUP_FRACTION);
                const u = easeInCubic(t);
                return {
                    extend: 1,
                    angleOffset: -OVERHEAD_RAISE_RAD * (1 - u),
                    offset: 0,
                    // Back to its own size EARLY in the fall (ease-out against
                    // the angle's ease-in), so the raise never carries the
                    // head past its reach as the weapon comes onto the aim.
                    scale: OVERHEAD_RAISE_SCALE - (OVERHEAD_RAISE_SCALE - 1) * easeOutCubic(t),
                    alpha: 1,
                    done: false,
                };
            }
            // Landed: it rests on the victim for a beat, then fades.
            const alpha = p <= OVERHEAD_HOLD_FRACTION
                ? 1
                : 1 - (p - OVERHEAD_HOLD_FRACTION) / (1 - OVERHEAD_HOLD_FRACTION);
            return {extend: 1, angleOffset: 0, offset: 0, scale: 1, alpha, done: false};
        }
        default: {
            // The prototype's stab: out fast, then pulled back while fading.
            if (p <= THRUST_CONTACT_FRACTION) {
                const u = easeOutCubic(p / THRUST_CONTACT_FRACTION);
                return {
                    extend: 0.3 + 0.7 * u,
                    angleOffset: 0, offset: 0, scale: 1, alpha: 1, done: false,
                };
            }
            const u = (p - THRUST_CONTACT_FRACTION) / (1 - THRUST_CONTACT_FRACTION);
            return {
                extend: 1 - 0.35 * u,
                angleOffset: 0, offset: 0, scale: 1, alpha: 1 - u, done: false,
            };
        }
    }
}

/**
 * Which side of the aim an overhead is raised on: the one that puts the raised
 * weapon toward the TOP of the screen (−y), so "overhead" reads as overhead
 * whichever way the victim stands. The raised weapon sits at
 * `aim - side * OVERHEAD_RAISE_RAD`, whose y is `-side * cos(aim)`.
 */
export function overheadSide(aimRad: number): 1 | -1 {
    return Math.cos(aimRad) >= 0 ? 1 : -1;
}

/** Which way a swing sweeps, alternating per landing so a fight is not a metronome. */
export function swingDirection(seed: number): 1 | -1 {
    return Math.abs(Math.round(seed)) % 2 === 0 ? 1 : -1;
}

// --- beam envelopes ---------------------------------------------------------

/** The `beam` kind's curve set (PO 2026-09-19, §12b.1). */
export type BeamCurve = 'flash' | 'extend';

/** Default lifetime per beam curve when the layer authors no `ms`. */
export const BEAM_CURVE_MS: Record<BeamCurve, number> = {
    flash: 220,
    extend: 420,
};

/** Where the flash peaks: weak for this share, bright there, fading after. */
const FLASH_ATTACK_FRACTION = 0.25;
/** The flash's width floor, as a share of its authored width. */
const FLASH_MIN_WIDTH = 0.35;

export interface BeamFlashPhase {
    /** 0..1 brightness */
    intensity: number;
    /** width multiplier, following the brightness */
    width: number;
    done: boolean;
}

/** Lightning: weak, then bright and bold, then fade (§4.3). */
export function beamFlash(elapsedMs: number, totalMs: number): BeamFlashPhase {
    const total = totalMs > 0 ? totalMs : BEAM_CURVE_MS.flash;
    if (elapsedMs >= total) {
        return {intensity: 0, width: FLASH_MIN_WIDTH, done: true};
    }
    const p = clamp01(elapsedMs / total);
    const intensity = p <= FLASH_ATTACK_FRACTION
        ? FLASH_ATTACK_FRACTION + (1 - FLASH_ATTACK_FRACTION) * (p / FLASH_ATTACK_FRACTION)
        : 1 - (p - FLASH_ATTACK_FRACTION) / (1 - FLASH_ATTACK_FRACTION);
    return {intensity, width: FLASH_MIN_WIDTH + (1 - FLASH_MIN_WIDTH) * intensity, done: false};
}

/** Where an extending pillar starts fading out. */
export const BEAM_EXTEND_FADE_FRACTION = 0.75;

export interface BeamExtendPhase {
    /** 0..1 share of the caster→victim span the ribbon covers */
    extent: number;
    alpha: number;
    done: boolean;
}

/** Flame pillars: extend from the CASTER end to the victim, then return. */
export function beamExtend(elapsedMs: number, totalMs: number): BeamExtendPhase {
    const total = totalMs > 0 ? totalMs : BEAM_CURVE_MS.extend;
    if (elapsedMs >= total) {
        return {extent: 0, alpha: 0, done: true};
    }
    const p = clamp01(elapsedMs / total);
    // Out fast (ease-out), back slow-then-fast (ease-in): the pillar snaps up
    // and is pulled home rather than mirroring itself.
    const extent = p <= 0.5
        ? easeOutCubic(p / 0.5)
        : 1 - Math.pow((p - 0.5) / 0.5, 3);
    const alpha = p <= BEAM_EXTEND_FADE_FRACTION
        ? 1
        : 1 - (p - BEAM_EXTEND_FADE_FRACTION) / (1 - BEAM_EXTEND_FADE_FRACTION);
    return {extent, alpha, done: false};
}

// --- the jagged polyline ----------------------------------------------------

/** Nodes and sideways throw of the placeholder lightning body. */
export const JAG_SEGMENTS = 6;
export const JAG_AMPLITUDE_PX = 10;

/** The golden angle, the prototype's index seed for a non-repeating walk. */
const GOLDEN_ANGLE = 2.399963;
const SEED_STEP = 1.618034;

/**
 * A kinked line from (fromX, fromY) to (toX, toY): `segments + 1` nodes, each
 * interior one thrown off the straight line perpendicular by up to
 * `amplitudePx`. Both endpoints are exact (the throw is tapered by a half
 * sine), so a bolt always starts at its caster and ends on its victim.
 */
export function jaggedPolyline(
    fromX: number, fromY: number, toX: number, toY: number,
    segments: number, amplitudePx: number, seed: number,
): { x: number, y: number }[] {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);
    if (dist === 0 || segments < 2) {
        return [{x: fromX, y: fromY}, {x: toX, y: toY}];
    }
    // Unit perpendicular to the caster→victim axis.
    const px = -dy / dist;
    const py = dx / dist;
    const points: { x: number, y: number }[] = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const off = amplitudePx
            * Math.sin(i * GOLDEN_ANGLE + seed * SEED_STEP)
            * Math.sin(Math.PI * t);
        points.push({x: fromX + dx * t + px * off, y: fromY + dy * t + py * off});
    }
    return points;
}

// --- the chain --------------------------------------------------------------

/** How long each chain hop waits on the one before it. [PLACEHOLDER] */
export const CHAIN_HOP_STAGGER_MS = 60;

export interface ChainPoint {
    x: number;
    y: number;
}

export interface ChainHop<T extends ChainPoint> {
    from: ChainPoint;
    to: T;
}

/**
 * Order one tick's victims into a chain: caster → nearest, then nearest to
 * THAT, and so on (§12b.1). Ties keep input order, so the same tick always
 * draws the same chain.
 *
 * ⚑ VISUAL ONLY. Every victim was already selected by the server's ring; this
 * only decides what the bolt looks like it did.
 */
export function chainOrder<T extends ChainPoint>(
    caster: ChainPoint, victims: readonly T[],
): ChainHop<T>[] {
    const remaining = victims.slice();
    const hops: ChainHop<T>[] = [];
    let from: ChainPoint = caster;
    while (remaining.length > 0) {
        let bestIndex = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < remaining.length; i++) {
            const d = Math.hypot(remaining[i].x - from.x, remaining[i].y - from.y);
            if (d < bestDist) {
                bestDist = d;
                bestIndex = i;
            }
        }
        const next = remaining.splice(bestIndex, 1)[0];
        hops.push({from, to: next});
        from = next;
    }
    return hops;
}

// --- the wind-up glow (D7) --------------------------------------------------
//
// Moved verbatim from AuraTickIndicator, which this system absorbs: the ring
// brightens toward each tick and discharges when it lands. The baseline keeps
// the edge always faintly lit - without it the ring blinked fully off at every
// tick AND right after each aura switch (the switch resets the tick
// accumulator server-side), which read as a broken on/off stutter (C2 PO
// finding 2026-07-17).

export const GLOW_COLOR = 0xffffff;
export const GLOW_WIDTH_PX = 3;
export const GLOW_MAX_ALPHA = 0.45;
export const GLOW_BASE_ALPHA = 0.18;

/** interval + phase in game ticks; interval 0 = no active aura → hidden. */
export function windUpGlowAlpha(interval: number, phase: number): number {
    if (interval <= 0) {
        return 0;
    }
    const fraction = Math.min(phase / interval, 1);
    return GLOW_BASE_ALPHA + fraction * (GLOW_MAX_ALPHA - GLOW_BASE_ALPHA);
}

// --- orbit (C2b) ------------------------------------------------------------
//
// N bodies circling the caster (§4.1). Everything below is in the anchor's own
// frame: the kind adds the anchor's position each frame, so an orbit follows a
// caster who is walking without the math knowing where anyone is.

/** One revolution takes this long, whatever the count. [PLACEHOLDER] */
export const ORBIT_PERIOD_MS = 800;
/** How far outside the anchor's own radius the bodies circle. [PLACEHOLDER] */
export const ORBIT_RADIUS_PAD_PX = 14;
/** Bodies when a layer authors no `count` (§12d.3). */
export const ORBIT_DEFAULT_COUNT = 2;
/** A `fired` orbit's whole duration when it authors no `ms` (§12d.3). */
export const ORBIT_DEFAULT_MS = 1200;
/** The fade in AND out at each end of a fired orbit. [PLACEHOLDER] */
export const ORBIT_FADE_MS = 150;

/** Where body `index` of `count` sits, relative to the anchor's centre. */
export function orbitPoint(
    index: number, count: number, elapsedMs: number, radiusPx: number,
): { x: number, y: number } {
    const n = count > 0 ? count : 1;
    const a = (index / n) * TAU + (elapsedMs / ORBIT_PERIOD_MS) * TAU;
    return {x: Math.cos(a) * radiusPx, y: Math.sin(a) * radiusPx};
}

/**
 * An orbit body's visibility. `ms` 0 is the AMBIENT case (§12d.3: the layer
 * lives while the aura runs, so its duration is not the layer's business): it
 * fades in once and then stays lit until the reconciler disposes it.
 */
export function orbitAlpha(elapsedMs: number, ms: number): number {
    if (elapsedMs <= 0) {
        return 0;
    }
    if (ms <= 0) {
        return clamp01(elapsedMs / ORBIT_FADE_MS);
    }
    if (elapsedMs >= ms) {
        return 0;
    }
    // A layer shorter than two fades still gets both, just narrower ones.
    const fade = Math.min(ORBIT_FADE_MS, ms / 2);
    return Math.min(clamp01(elapsedMs / fade), clamp01((ms - elapsedMs) / fade));
}

// --- cast-pose (C2b) --------------------------------------------------------

/** How long a pose shows after the FIRED moment when it authors no `ms` (§12d.3). */
export const CAST_POSE_DEFAULT_MS = 500;
/** The share of its life a pose is held at full before it fades. [PLACEHOLDER] */
const CAST_POSE_HOLD_FRACTION = 0.6;

/**
 * ⚑ A pose shows at RELEASE, not before it (§12d.4): FIRED is emitted when a
 * cast is consumed, so the bow appears as the arrow leaves. There is no
 * wind-up half here and nothing reads `cast_skill_id`.
 */
export function castPoseAlpha(elapsedMs: number, ms: number): number {
    const total = ms > 0 ? ms : CAST_POSE_DEFAULT_MS;
    if (elapsedMs < 0 || elapsedMs >= total) {
        return 0;
    }
    const p = elapsedMs / total;
    return p <= CAST_POSE_HOLD_FRACTION
        ? 1
        : 1 - (p - CAST_POSE_HOLD_FRACTION) / (1 - CAST_POSE_HOLD_FRACTION);
}

// --- emitter (C2b) ----------------------------------------------------------
//
// Particles from a point or a disc (§4.1), in the anchor's own frame like the
// orbit. The three motions are §12d.3's, and nothing here is random: a
// particle's direction comes from its INDEX through the golden angle, which
// spreads any count evenly without ever repeating a direction.

/** The three authored motions (§12d.3); absent = `rise`. */
export type EmitterMotion = 'swirl' | 'rise' | 'burst';

/** Particles when a layer authors no `count`: alive at once (ambient) or in the burst. */
export const EMITTER_DEFAULT_COUNT = 8;
/** ONE PARTICLE's lifetime when a layer authors no `ms`, all triggers (§12d.3). */
export const EMITTER_DEFAULT_MS = 900;
/** The share of a life spent fading in - a looping stream must never pop. */
export const EMITTER_FADE_IN_FRACTION = 0.15;
/** `swirl`: the share of the anchor radius it circles at, and how far it drifts out. */
export const SWIRL_RADIUS_FRACTION = 1.15;
const SWIRL_DRIFT_FRACTION = 0.5;
/** `swirl`: revolutions over one particle lifetime. [PLACEHOLDER] */
const SWIRL_TURNS = 0.75;
/** `rise`: how far UP (−y) a particle drifts over its life, in px (§12d.3). */
export const RISE_DRIFT_PX = 55;
/** `rise`: the share of the anchor's disc the start points are spread over. */
const RISE_SPREAD_FRACTION = 1.1;
/** `burst`: the reach, as a multiple of the anchor radius (§12d.3). */
export const BURST_REACH_FACTOR = 1.5;
/** Every motion tapers its body toward the end of a life. [PLACEHOLDER] */
const PARTICLE_END_SCALE = 0.6;

export interface EmitterParticle {
    /** offset from the anchor's centre, px */
    x: number;
    y: number;
    alpha: number;
    /** multiplies the body size */
    scale: number;
}

/**
 * Where particle `index` of `count` is, `elapsedMs` into the layer.
 *
 * `loop` is the AMBIENT variant: particle i is phase-offset by `i / count` of a
 * lifetime and wraps forever, so `count` particles are alive at once as a
 * steady stream. Without it (a `fired` / `hit` burst) every particle shares one
 * phase and the whole layer is over after `ms`.
 */
export function emitterParticle(
    motion: EmitterMotion, index: number, count: number,
    elapsedMs: number, ms: number, radiusPx: number, loop = false,
): EmitterParticle {
    const total = ms > 0 ? ms : EMITTER_DEFAULT_MS;
    const n = count > 0 ? count : 1;
    const raw = elapsedMs / total;
    const p = loop ? wrap01(raw + index / n) : clamp01(raw);
    const alpha = particleAlpha(p);
    const scale = 1 - (1 - PARTICLE_END_SCALE) * p;
    // The golden angle: any count of indices lands evenly around the circle.
    const heading = index * GOLDEN_ANGLE;
    switch (motion) {
        case 'swirl': {
            const r = radiusPx * (SWIRL_RADIUS_FRACTION + SWIRL_DRIFT_FRACTION * p);
            const a = heading + p * SWIRL_TURNS * TAU;
            return {x: Math.cos(a) * r, y: Math.sin(a) * r, alpha, scale};
        }
        case 'burst': {
            const r = radiusPx * BURST_REACH_FACTOR * easeOutCubic(p);
            return {x: Math.cos(heading) * r, y: Math.sin(heading) * r, alpha, scale};
        }
        default: {
            // Sunflower sampling: evenly covers the disc, index-derived, and
            // the start point holds still while only the drift moves.
            const r = radiusPx * RISE_SPREAD_FRACTION * Math.sqrt((index % n + 0.5) / n);
            return {
                x: Math.cos(heading) * r,
                y: Math.sin(heading) * r - RISE_DRIFT_PX * p,
                alpha,
                scale,
            };
        }
    }
}

/** Which motion a layer authors; absent or unknown = `rise` (§12d.3). */
export function emitterMotionOf(motion: string | undefined): EmitterMotion {
    return motion === 'swirl' || motion === 'burst' ? motion : 'rise';
}

function wrap01(v: number): number {
    if (!Number.isFinite(v)) {
        return 0;
    }
    const f = v % 1;
    return f < 0 ? f + 1 : f;
}

/** 0 at both ends, so a looped respawn neither pops in nor snaps out. */
function particleAlpha(p: number): number {
    if (p <= EMITTER_FADE_IN_FRACTION) {
        return p / EMITTER_FADE_IN_FRACTION;
    }
    return 1 - (p - EMITTER_FADE_IN_FRACTION) / (1 - EMITTER_FADE_IN_FRACTION);
}

// --- the density slider (D1, §12d.1) ----------------------------------------

/**
 * How many of an emitter's authored particles this density draws: all of them
 * at `full`, 40 % rounded (never below one) at `low`, none at `off`.
 *
 * ⚑ A layer that authored NO particles gets none back: the PO's floor of one
 * is "never thin a visible emitter into nothing", not "invent a particle".
 */
export function densityCount(count: number, density: VfxDensity): number {
    if (count <= 0 || density === 'off') {
        return 0;
    }
    return density === 'low' ? Math.max(1, Math.round(count * 0.4)) : count;
}
