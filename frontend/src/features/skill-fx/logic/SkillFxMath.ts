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

// --- shared -----------------------------------------------------------------

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
/** How far a burst ring grows, as a share of the victim's radius. */
const BURST_START_SCALE = 0.3;
const BURST_END_SCALE = 0.9;

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
        return {scale: 1.3 - 0.75 * close, alpha, done: false};
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
const OVERHEAD_WINDUP_FRACTION = 0.45;
const OVERHEAD_HOLD_FRACTION = 0.82;
const OVERHEAD_RAISE_SCALE = 1.3;
const OVERHEAD_DRAW_BACK = 0.25;
const OVERHEAD_WINDUP_EXTEND = 0.72;

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
            if (p < OVERHEAD_WINDUP_FRACTION) {
                // Drawn back behind the attacker and raised toward the camera.
                const u = easeOutCubic(p / OVERHEAD_WINDUP_FRACTION);
                return {
                    extend: OVERHEAD_WINDUP_EXTEND,
                    angleOffset: 0,
                    offset: -OVERHEAD_DRAW_BACK * u,
                    scale: 1 + (OVERHEAD_RAISE_SCALE - 1) * u,
                    alpha: 1,
                    done: false,
                };
            }
            if (p < OVERHEAD_CONTACT_FRACTION) {
                // The fall: heavy, so it accelerates into the victim.
                const u = easeInCubic(
                    (p - OVERHEAD_WINDUP_FRACTION)
                    / (OVERHEAD_CONTACT_FRACTION - OVERHEAD_WINDUP_FRACTION));
                return {
                    extend: OVERHEAD_WINDUP_EXTEND + (1 - OVERHEAD_WINDUP_EXTEND) * u,
                    angleOffset: 0,
                    offset: -OVERHEAD_DRAW_BACK * (1 - u),
                    scale: OVERHEAD_RAISE_SCALE - (OVERHEAD_RAISE_SCALE - 1) * u,
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
