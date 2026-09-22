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

// --- the automatic hit mark (§12g.1 call 2) ---------------------------------
//
// ⭐ NO CONTENT AUTHORS THIS. Since the C3a amendment the engine draws one
// round mark on the victim of every landed DAMAGE hit, the `impact` kind is out
// of the authoring vocabulary, and the `snap` curve is gone with it (the bite
// became a `strike` curve, drawn from the BITER). So there is one look and one
// number here, and the curve parameter that used to pick between them is gone.

/** How long the mark lives. [PLACEHOLDER] - today's `burst` default, unmoved. */
export const HIT_MARK_MS = 220;

/**
 * The mark's kind name, which it keeps although no file may author it: the
 * harness counters and every C4 number read `spawnedByKind.impact`. Defined
 * HERE rather than in SkillFxKinds because the planner (pure, no Pixi) is the
 * one that puts the mark into a landing.
 */
export const HIT_MARK_KIND = 'impact';

export interface ImpactPhase {
    /** body size as a share of the victim's own radius */
    scale: number;
    alpha: number;
    done: boolean;
}

/** How far the mark's ring grows, as a share of the victim's radius. */
const BURST_START_SCALE = 0.3;
const BURST_END_SCALE = 0.9;

/**
 * The mark over time: a small ring expanding outward from a third to nine
 * tenths of the victim's own radius while it fades. It is never rotated and
 * never directional - the attacker's half of the beat is the `strike`,
 * `projectile` or `beam` the content authors from the ATTACKER (§12g.1).
 */
export function impactPhase(elapsedMs: number, totalMs: number): ImpactPhase {
    const total = totalMs > 0 ? totalMs : HIT_MARK_MS;
    if (elapsedMs >= total) {
        return {scale: BURST_END_SCALE, alpha: 0, done: true};
    }
    const p = clamp01(elapsedMs / total);
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

/**
 * The `strike` kind's curve set (PO 2026-09-19, §12c.1), joined by `bite` at
 * the C3a amendment (§12g.1 call 3): an attack is drawn from the ATTACKER, so
 * the wolf's jaws became a weapon it holds rather than a mark on its victim.
 */
export type StrikeCurve = 'thrust' | 'swing' | 'overhead' | 'bite';

/** Default lifetime per style when the layer authors no `ms`. */
export const STRIKE_CURVE_MS: Record<StrikeCurve, number> = {
    thrust: 200,
    swing: 280,
    overhead: 460,
    bite: 260,
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

/**
 * The bite: how wide the jaws gape ([PLACEHOLDER] 35 degrees either side of the
 * aim), when they are shut, and how long they hold shut before fading.
 */
export const BITE_OPEN_RAD = (35 * Math.PI) / 180;
const BITE_CLOSE_FRACTION = 0.5;
const BITE_HOLD_FRACTION = 0.8;

const STRIKE_CONTACT_FRACTION: Record<StrikeCurve, number> = {
    thrust: THRUST_CONTACT_FRACTION,
    swing: SWING_CONTACT_FRACTION,
    overhead: OVERHEAD_CONTACT_FRACTION,
    // The jaws meeting IS the contact: the mark lands as they shut.
    bite: BITE_CLOSE_FRACTION,
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
    return curve === 'swing' || curve === 'overhead' || curve === 'bite' ? curve : 'thrust';
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
        case 'bite': {
            // ⚑ `angleOffset` is the OPEN ANGLE here, not a sweep: the caller
            // draws ONE jaw body twice, turning the upper one by −angleOffset
            // and the lower one by +angleOffset about the same hinge, so the
            // pair gapes and closes. It is never multiplied by swingDirection.
            //
            // Ease-IN, so the jaws hang open and then SLAM shut rather than
            // drifting together (§12g.2).
            const close = easeInCubic(clamp01(p / BITE_CLOSE_FRACTION));
            const alpha = p <= BITE_HOLD_FRACTION
                ? 1
                : 1 - (p - BITE_HOLD_FRACTION) / (1 - BITE_HOLD_FRACTION);
            return {
                extend: 1,
                angleOffset: BITE_OPEN_RAD * (1 - close),
                offset: 0,
                scale: 1,
                alpha,
                done: false,
            };
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

// --- wave (§12g.2) ----------------------------------------------------------
//
// ⭐ The kind the PO asked for on 2026-09-21 for the mammoth's stomp: rings
// expanding from the CASTER out to the skill's reach and fading, on `fired`
// only - once per cast, never per victim. Everything below is in SHARES: the
// radius is a share of the reach and the width a multiplier, so one set of
// numbers drives a stomp at 90 px and one at 400.

/** A `wave` layer's whole duration when it authors no `ms`. [PLACEHOLDER] */
export const WAVE_DEFAULT_MS = 500;
/** Rings when a layer authors no `count`, and the ceiling on what it may ask for. */
export const WAVE_DEFAULT_COUNT = 1;
export const WAVE_MAX_COUNT = 3;
/**
 * The share of the layer the ring STARTS are spread over: the last ring is
 * under way by the halfway mark, so a triple stomp still reads as one beat.
 */
const WAVE_STAGGER_SPAN = 0.5;
/** The stroke thins to this share of its width as a ring reaches full size. */
const WAVE_END_WIDTH = 0.3;

export interface WaveRing {
    /** 0..1 share of the skill's reach */
    radius: number;
    alpha: number;
    /** multiplies the layer's stroke width: a ring thins as it grows */
    width: number;
    /** false before this ring's stagger has elapsed, and once it is over */
    visible: boolean;
}

/** How many rings a `wave` layer draws: absent = one, capped at three. */
export function waveCountOf(count: number | undefined): number {
    if (!Number.isFinite(count) || !(count > 0)) {
        return WAVE_DEFAULT_COUNT;
    }
    return Math.min(WAVE_MAX_COUNT, Math.max(1, Math.floor(count)));
}

/** A `wave` layer's whole duration: the authored `ms`, else the default. */
export function waveTotalMsOf(ms: number | undefined): number {
    return ms && ms > 0 ? ms : WAVE_DEFAULT_MS;
}

/**
 * Where ring `index` of `count` is, `elapsedMs` into the layer.
 *
 * ⚑ ONE SPEED for every ring: the starts are staggered across the first
 * WAVE_STAGGER_SPAN of the layer and each ring then runs for the SAME share of
 * it, so the last one finishes exactly at `ms` and the rings chase each other
 * out rather than catching up. With `count` 1 that share is the whole layer,
 * which is why `ms` means what an author expects on the common case.
 */
export function waveRing(
    index: number, count: number, elapsedMs: number, totalMs: number,
): WaveRing {
    const total = totalMs > 0 ? totalMs : WAVE_DEFAULT_MS;
    const n = count > 0 ? count : 1;
    const startFraction = (WAVE_STAGGER_SPAN * index) / n;
    const lifeFraction = 1 - (WAVE_STAGGER_SPAN * (n - 1)) / n;
    const p = (clamp01(elapsedMs / total) - startFraction) / lifeFraction;
    if (p < 0) {
        // Waiting its turn: this ring has not left the caster yet.
        return {radius: 0, alpha: 0, width: 1, visible: false};
    }
    if (p >= 1 || elapsedMs >= total) {
        // Spent, at full size: a ring that has arrived is not drawn, but it
        // must not report itself back at the caster either.
        return {radius: 1, alpha: 0, width: WAVE_END_WIDTH, visible: false};
    }
    // Decelerating: a shock front goes out hard and runs out of push.
    return {
        radius: easeOutCubic(p),
        alpha: 1 - p,
        width: WAVE_END_WIDTH + (1 - WAVE_END_WIDTH) * (1 - p),
        visible: true,
    };
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

// --- sizing an ART body (C3a, §12f.4 D) -------------------------------------
//
// A placeholder is DRAWN at the size it wants, so its display object sits at
// scale 1 and the kinds never had sizing arithmetic. A PNG is drawn at whatever
// size the artist chose, so every sprite branch needs a scale factor, and the
// factor is the only new number C3a adds to the drawing.
//
// ⭐ The rule (§12f.2, lead call): a weapon scales UNIFORMLY, only a beam
// stretches. Pulling a sword to a 3 u reach along X alone would make it a
// plank; pulling a beam is what a beam IS.

/**
 * The uniform factor that makes a texture `extentPx` wide across, keeping its
 * aspect - the strike's reach, the held orbit's haft, the burst's diameter.
 *
 * An unmeasured texture (width 0, or a frame that has not decoded) answers 1:
 * the sprite then draws at its own size, which is wrong but visible, and a
 * visible wrong size is what a body-sizing mistake should look like.
 */
export function spriteScaleToExtent(textureExtentPx: number, extentPx: number): number {
    if (!(textureExtentPx > 0) || !Number.isFinite(extentPx) || extentPx <= 0) {
        return 1;
    }
    return extentPx / textureExtentPx;
}

/**
 * The two scale factors of a `beam` body: stretched along the caster→victim
 * span and held at the authored `width` across it. The ONE kind that is allowed
 * to distort its body, which is why it is its own function rather than a second
 * caller of {@link spriteScaleToExtent}.
 */
export function beamSpriteScale(
    textureWidthPx: number, textureHeightPx: number, spanPx: number, widthPx: number,
): { x: number, y: number } {
    return {
        // ⚑ A span of 0 collapses the body rather than falling back to "own
        // size". The fallback is right for an authored extent that came out
        // nonsense; it is wrong here, because an `extend` beam's FIRST FRAME
        // legitimately has extent 0 and would pop the whole texture onto the
        // caster for one frame before shrinking.
        x: spanPx > 0 ? spriteScaleToExtent(textureWidthPx, spanPx) : 0,
        y: spriteScaleToExtent(textureHeightPx, widthPx),
    };
}

/**
 * A `bite` drawn from ONE jaw PNG: the artist delivers the UPPER jaw with its
 * HINGE on the left edge and its bite line on the BOTTOM edge (§12g.2), and the
 * lower jaw is that same texture MIRRORED through the bite line.
 *
 * With the sprite anchored at (0, 1) - the hinge, on the bite line - a negative
 * y scale flips the picture about that line without moving the hinge, so both
 * jaws pivot on the same point in the attacker's mouth and the closing math in
 * StrikeFx does not fork. `lengthPx` is the strike's own reach rule, so the
 * scale stays UNIFORM (§12f.2: only a beam stretches).
 */
export function biteJawScale(
    textureWidthPx: number, lengthPx: number, lower: boolean,
): { x: number, y: number } {
    const s = spriteScaleToExtent(textureWidthPx, lengthPx);
    return {x: s, y: lower ? -s : s};
}

// --- the C4 instrument (§12e.4) ---------------------------------------------

/**
 * The q-th percentile of an ALREADY SORTED sample, by nearest rank.
 *
 * Nearest rank rather than an interpolated percentile on purpose: the samples
 * are frame times off a ring, and an interpolated p95 invents a duration no
 * frame ever took. An empty sample answers 0 - "nothing was measured" is the
 * honest reading of a window the manager never ran in.
 */
export function percentileOf(sorted: readonly number[], q: number): number {
    if (sorted.length === 0) {
        return 0;
    }
    const clamped = Number.isFinite(q) ? Math.min(1, Math.max(0, q)) : 0;
    const rank = Math.ceil(clamped * sorted.length) - 1;
    return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}
