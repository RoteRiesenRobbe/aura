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

/**
 * Whether a layer on this trigger belongs to the VICTIM's end (an emitter
 * sits on it). `applied` anchors exactly like `hit` (§12h): it differs only in
 * WHEN it fires. `fired` and `ambient` belong to the caster.
 */
export function landsOnVictim(on: string): boolean {
    return on === 'hit' || on === 'applied';
}

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

/**
 * Flight speed when a `projectile` layer authors none, and the clamps.
 * [PLACEHOLDER] 700 → 500 at the C3a-ii look (PO 2026-09-23: "a bit slower").
 */
export const PROJECTILE_SPEED_PX_PER_S = 500;
/**
 * Every projectile body, PNG or placeholder, is drawn this much larger than
 * its own size × the layer's `scale`. [PLACEHOLDER] (PO 2026-09-23: "30 %
 * bigger in general"), a global knob so no file has to re-author `scale`.
 */
export const PROJECTILE_SIZE_FACTOR = 1.3;
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
// lives on as the `maul` `bite`, below). So there is one look and one number
// here, and the curve parameter that used to pick between them is gone.

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
 * The `strike` kind's curve set (PO 2026-09-19, §12c.1): a HELD weapon. The
 * `bite` and the `pincer` it carried from the C3a amendment left for the
 * `maul` (plan-natural-weapons.md C2), which draws them ON the victim.
 */
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

/** The shortest weapon drawn, whatever the reach. */
export const STRIKE_MIN_LENGTH_PX = 40;
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

// --- lunge (plan-natural-weapons.md §3.1) -----------------------------------
//
// ⭐ The one kind that draws nothing: the ATTACKER's own token jabs a fixed
// distance toward its victim and snaps back. Everything below is a SHARE of
// that distance over time; the manager turns it into a body offset.

/** A `lunge` layer's whole duration when it authors no `ms`. [PLACEHOLDER] */
export const LUNGE_DEFAULT_MS = 220;
/** How far the body jabs, as a share of the attacker's own radius (D7). [PLACEHOLDER] */
export const LUNGE_DISTANCE_FACTOR = 0.8;
/** The share of the lunge spent going out; the rest is the way back. [PLACEHOLDER] */
export const LUNGE_OUT_FRACTION = 0.35;

/** A `lunge` layer's whole duration: the authored `ms`, else the default. */
export function lungeTotalMsOf(ms: number | undefined): number {
    return ms && ms > 0 ? ms : LUNGE_DEFAULT_MS;
}

/**
 * The CONTACT moment, the end of the out phase (77 ms at the default). It
 * joins the planner's arrival rule, so the hit mark lands as the body gets
 * there. Lives here for `strikeContactMsOf`'s reason: the planner and the kind
 * must not disagree about it.
 */
export function lungeContactMsOf(ms: number | undefined): number {
    return lungeTotalMsOf(ms) * LUNGE_OUT_FRACTION;
}

/**
 * How far the body jabs, latched when the lunge starts. It does NOT read the
 * gap to the victim (D7): a mob biting at long reach ends its jab short, and
 * that is by ruling (§10 L7). Never negative, never NaN.
 */
export function lungeDistancePx(radiusPx: number, scale: number | undefined): number {
    if (!Number.isFinite(radiusPx) || radiusPx <= 0) {
        return 0;
    }
    return radiusPx * LUNGE_DISTANCE_FACTOR * (scale && scale > 0 ? scale : 1);
}

/**
 * The body's offset as a share of the distance, `elapsedMs` into a lunge of
 * `totalMs`: out with an ease-out (the quick jab), back with an ease-in-out
 * (the snap home).
 *
 * ⚑ EXACT at the three moments that matter (§10 L2): 0 at the start, 1 at
 * contact, 0 at the end. The contact is computed once and both phases divide
 * by their own span, so no float drift of `elapsed / total` against the out
 * share can leave a body a hair off its collider.
 */
export function lungeShare(elapsedMs: number, totalMs: number): number {
    if (!Number.isFinite(elapsedMs) || !Number.isFinite(totalMs) || totalMs <= 0
        || elapsedMs <= 0 || elapsedMs >= totalMs) {
        return 0;
    }
    const contact = totalMs * LUNGE_OUT_FRACTION;
    if (elapsedMs <= contact) {
        return easeOutCubic(elapsedMs / contact);
    }
    return 1 - easeInOutCubic((elapsedMs - contact) / (totalMs - contact));
}

// --- rush (plan-effect-types-round-2.md C3) ----------------------------------
//
// The charge's look. The server moves the caster in one tick and the client
// snaps it there; the rush starts the drawn token back where it jumped from
// and lets it catch up, so the jump reads as a fast run.

/** A `rush` layer's whole duration when it authors no `ms`. [PLACEHOLDER] */
export const RUSH_DEFAULT_MS = 180;

/** A `rush` layer's whole duration: the authored `ms`, else the default. */
export function rushTotalMsOf(ms: number | undefined): number {
    return ms && ms > 0 ? ms : RUSH_DEFAULT_MS;
}

/**
 * How much of the jump the body still has to cover, `elapsedMs` into a rush
 * of `totalMs`: 1 at the start (the body sits at the jump's origin), 0 at the
 * end (on the logical position), with an ease-out so it leaves fast and
 * settles. EXACT at both ends, and never NaN.
 */
export function rushShare(elapsedMs: number, totalMs: number): number {
    if (!Number.isFinite(elapsedMs) || !Number.isFinite(totalMs) || totalMs <= 0
        || elapsedMs >= totalMs) {
        return 0;
    }
    if (elapsedMs <= 0) {
        return 1;
    }
    return 1 - easeOutCubic(elapsedMs / totalMs);
}

// --- maul (plan-natural-weapons.md §3.3) ------------------------------------
//
// ⭐ The natural weapon's mark drawn ON the victim: teeth, fangs, tusk gashes,
// claw rakes, a hoof. SCREEN-ALIGNED, every curve (D10, PO 2026-09-28): no
// function below takes an attacker, so the mark looks the same whichever side
// the hit came from, and the `lunge` alone says who struck.
//
// Everything is in units of the mark's SIZE (`maulSizePx`: the victim's radius
// times the layer's `scale`) and relative to the victim's centre, so one set
// of numbers draws the same mark on a rat and on a bear. A mark is a few PARTS,
// each one drawing of `MAUL_PART_LENGTH` sizes; the kind draws every part and
// moves it by these numbers, a sprite and a placeholder alike.

/** The `maul` kind's curve set, one per natural weapon (§3.3). */
export type MaulCurve = 'bite' | 'pincer' | 'gore' | 'claw' | 'kick';

/** Default lifetime per curve when the layer authors no `ms`. [PLACEHOLDER] */
export const MAUL_CURVE_MS: Record<MaulCurve, number> = {
    bite: 180,
    pincer: 260,
    gore: 200,
    claw: 240,
    kick: 180,
};

/** How many drawings one mark is made of: rows, fangs, gashes, rakes, a print. */
export const MAUL_PARTS: Record<MaulCurve, number> = {
    bite: 2,
    pincer: 2,
    gore: 2,
    claw: 3,
    kick: 1,
};

/**
 * How long ONE part's drawing is, in mark sizes, along its own +X: the row's
 * width, the fang's length (1, so two fangs hinged on the rim meet at the
 * centre), a gash, a rake, the print's width. The kind sizes a body to it.
 * [PLACEHOLDER]
 */
export const MAUL_PART_LENGTH: Record<MaulCurve, number> = {
    bite: 1.6,
    pincer: 1,
    gore: 1.1,
    claw: 1.4,
    kick: 0.9,
};

/** The smallest victim radius a mark is sized to, in px. [PLACEHOLDER] */
export const MAUL_MIN_SIZE_PX = 12;

/** One part of a mark at one moment, in mark sizes from the victim's centre. */
export interface MaulPart {
    /** where the part's anchor sits */
    x: number;
    y: number;
    /** radians; 0 = the drawing as drawn, pointing +X */
    rotation: number;
    /** 0..1 share of its length drawn along its own +X: a gash being driven in */
    stretch: number;
    /** uniform size multiplier: a pop */
    scale: number;
    alpha: number;
    /** drawn flipped in y: the lower row of teeth, the right fang */
    mirrored: boolean;
}

export interface MaulPhase {
    parts: MaulPart[];
    done: boolean;
}

/** Which natural weapon a `maul` layer authors; absent or unknown = `bite`. */
export function maulCurveOf(curve: string | undefined): MaulCurve {
    return curve === 'pincer' || curve === 'gore' || curve === 'claw' || curve === 'kick'
        ? curve
        : 'bite';
}

/** A maul's whole duration: the authored `ms`, else the curve's default. */
export function maulTotalMsOf(curve: string | undefined, ms: number | undefined): number {
    return ms && ms > 0 ? ms : MAUL_CURVE_MS[maulCurveOf(curve)];
}

/** One mark size in px: the victim's radius (floored) times the layer's `scale`. */
export function maulSizePx(victimRadiusPx: number, scale: number | undefined): number {
    const r = Number.isFinite(victimRadiusPx) ? Math.max(MAUL_MIN_SIZE_PX, victimRadiusPx) : MAUL_MIN_SIZE_PX;
    return r * (scale && scale > 0 ? scale : 1);
}

function maulPart(x: number, y: number, rotation: number, alpha: number, mirrored = false): MaulPart {
    return {x, y, rotation, stretch: 1, scale: 1, alpha, mirrored};
}

/** Full until `from`, then a straight fade to nothing at the end. */
function fadeAfter(p: number, from: number): number {
    return p <= from ? 1 : 1 - (p - from) / (1 - from);
}

/** The phase a finished mark answers: its parts at rest and invisible. */
function doneMaul(curve: MaulCurve): MaulPhase {
    return {
        parts: Array.from({length: MAUL_PARTS[curve]}, () => maulPart(0, 0, 0, 0)),
        done: true,
    };
}

/** The bite's rows close in this share of the layer, then hold and fade (the C2a snap). */
const BITE_CLOSE_FRACTION = 0.5;
/** How far each row starts from the centre line, in mark sizes. [PLACEHOLDER] */
export const BITE_OPEN_GAP = 0.6;
/**
 * The rows' size while open; they settle to 1 as they shut. [PLACEHOLDER]
 * ⚑ The first bite (C2a's `snap`) scaled 1.3 to 0.55 because the SCALE was
 * what closed it; the rows close by their gap, so only the pop is kept.
 */
export const BITE_OPEN_SCALE = 1.3;

/**
 * `bite` (D11): the UPPER row of teeth above the centre and the same drawing
 * MIRRORED below it, closing onto the centre line (the first bite; the PO's
 * reference is the Pokemon "Bite": two white rows biting down on the target).
 * Each row's anchor is its bite line, so a gap of 0 is teeth meeting.
 */
export function bitePhase(elapsedMs: number, totalMs: number): MaulPhase {
    const total = totalMs > 0 ? totalMs : MAUL_CURVE_MS.bite;
    if (elapsedMs >= total) {
        return doneMaul('bite');
    }
    const p = clamp01(elapsedMs / total);
    const close = easeOutCubic(clamp01(p / BITE_CLOSE_FRACTION));
    const gap = BITE_OPEN_GAP * (1 - close);
    const scale = BITE_OPEN_SCALE - (BITE_OPEN_SCALE - 1) * close;
    const alpha = fadeAfter(p, BITE_CLOSE_FRACTION);
    return {
        parts: [
            {...maulPart(0, -gap, 0, alpha), scale},
            {...maulPart(0, gap, 0, alpha, true), scale},
        ],
        done: false,
    };
}

/** The pincer's gape above the horizontal, and its timing (the shipped pincer's). [PLACEHOLDER] */
export const PINCER_OPEN_RAD = (35 * Math.PI) / 180;
const PINCER_CLOSE_FRACTION = 0.5;
const PINCER_HOLD_FRACTION = 0.8;

/**
 * `pincer` (the Giant Spider, PO look 2026-09-23, on a fixed frame under D10):
 * one fang hinged on the victim's rim at screen LEFT, one at screen RIGHT (the
 * same drawing mirrored), both gaping toward the TOP and swinging down until
 * the tips meet at the centre. Ease-IN, so they hang open and then slam.
 */
export function pincerPhase(elapsedMs: number, totalMs: number): MaulPhase {
    const total = totalMs > 0 ? totalMs : MAUL_CURVE_MS.pincer;
    if (elapsedMs >= total) {
        return doneMaul('pincer');
    }
    const p = clamp01(elapsedMs / total);
    const open = PINCER_OPEN_RAD * (1 - easeInCubic(clamp01(p / PINCER_CLOSE_FRACTION)));
    const alpha = fadeAfter(p, PINCER_HOLD_FRACTION);
    return {
        parts: [
            // Pointing +X, turned up (−y) by the gape...
            maulPart(-1, 0, -open, alpha),
            // ...and its mirror image: pointing −X, turned up by the same.
            maulPart(1, 0, Math.PI + open, alpha, true),
        ],
        done: false,
    };
}

/** The gashes' fixed diagonal: rising to the upper right, a tusk ripping up. [PLACEHOLDER] */
export const GORE_ANGLE_RAD = -Math.PI / 4;
/** Distance between the two gashes, in mark sizes. [PLACEHOLDER] */
const GORE_SPACING = 0.36;
/** The share of the layer the stab takes to drive in; the fade's start. [PLACEHOLDER] */
const GORE_DRIVE_FRACTION = 0.35;
const GORE_FADE_FRACTION = 0.6;

/**
 * Parts laid side by side on one diagonal, centred on the victim: part i of n
 * starts half a length back from the centre along the diagonal and is offset
 * across it, so the middle of the row sits on the centre.
 */
function parallelStarts(n: number, angle: number, length: number, spacing: number): { x: number, y: number }[] {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    return Array.from({length: n}, (_, i) => {
        const across = (i - (n - 1) / 2) * spacing;
        return {
            x: -dx * length / 2 - dy * across,
            y: -dy * length / 2 + dx * across,
        };
    });
}

/** `gore`: two tusk gashes driven in side by side on a fixed diagonal. */
export function gorePhase(elapsedMs: number, totalMs: number): MaulPhase {
    const total = totalMs > 0 ? totalMs : MAUL_CURVE_MS.gore;
    if (elapsedMs >= total) {
        return doneMaul('gore');
    }
    const p = clamp01(elapsedMs / total);
    const stretch = easeOutCubic(clamp01(p / GORE_DRIVE_FRACTION));
    const alpha = fadeAfter(p, GORE_FADE_FRACTION);
    return {
        parts: parallelStarts(MAUL_PARTS.gore, GORE_ANGLE_RAD, MAUL_PART_LENGTH.gore, GORE_SPACING)
            .map(at => ({...maulPart(at.x, at.y, GORE_ANGLE_RAD, alpha), stretch})),
        done: false,
    };
}

/** The rakes' fixed diagonal: falling to the lower right, a swipe from the upper left. [PLACEHOLDER] */
export const CLAW_ANGLE_RAD = Math.PI / 4;
const CLAW_SPACING = 0.34;
/** Each rake starts this share of the layer after the one before, and takes RAKE to draw. [PLACEHOLDER] */
const CLAW_STAGGER_FRACTION = 0.12;
const CLAW_RAKE_FRACTION = 0.3;
const CLAW_FADE_FRACTION = 0.65;

/** `claw`: three rakes on a fixed diagonal, one after the other, then a fade. */
export function clawPhase(elapsedMs: number, totalMs: number): MaulPhase {
    const total = totalMs > 0 ? totalMs : MAUL_CURVE_MS.claw;
    if (elapsedMs >= total) {
        return doneMaul('claw');
    }
    const p = clamp01(elapsedMs / total);
    const fade = fadeAfter(p, CLAW_FADE_FRACTION);
    return {
        parts: parallelStarts(MAUL_PARTS.claw, CLAW_ANGLE_RAD, MAUL_PART_LENGTH.claw, CLAW_SPACING)
            .map((at, i) => {
                const since = p - i * CLAW_STAGGER_FRACTION;
                return {
                    ...maulPart(at.x, at.y, CLAW_ANGLE_RAD, since < 0 ? 0 : fade),
                    stretch: easeOutCubic(clamp01(since / CLAW_RAKE_FRACTION)),
                };
            }),
        done: false,
    };
}

/** The print lands this much larger and settles to its size over the POP share. [PLACEHOLDER] */
export const KICK_POP_SCALE = 1.5;
const KICK_POP_FRACTION = 0.3;
const KICK_FADE_FRACTION = 0.55;

/** `kick`: one upright hoof print punched in (a scale pop), then a fade. */
export function kickPhase(elapsedMs: number, totalMs: number): MaulPhase {
    const total = totalMs > 0 ? totalMs : MAUL_CURVE_MS.kick;
    if (elapsedMs >= total) {
        return doneMaul('kick');
    }
    const p = clamp01(elapsedMs / total);
    const scale = KICK_POP_SCALE - (KICK_POP_SCALE - 1) * easeOutCubic(clamp01(p / KICK_POP_FRACTION));
    return {
        parts: [{...maulPart(0, 0, 0, fadeAfter(p, KICK_FADE_FRACTION)), scale}],
        done: false,
    };
}

/** One maul over time, whichever its curve. */
export function maulPhase(curve: MaulCurve, elapsedMs: number, totalMs: number): MaulPhase {
    switch (curve) {
        case 'pincer':
            return pincerPhase(elapsedMs, totalMs);
        case 'gore':
            return gorePhase(elapsedMs, totalMs);
        case 'claw':
            return clawPhase(elapsedMs, totalMs);
        case 'kick':
            return kickPhase(elapsedMs, totalMs);
        default:
            return bitePhase(elapsedMs, totalMs);
    }
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
