/**
 * A remembered value that EASES to a new target instead of snapping to it.
 *
 * ⭐ This is the "remembered value" wrapper `plan-region-primitive.md` §4.3
 * predicted, built here by its first consumer (atmosphere's `sight`,
 * plan-region-atmosphere.md A2). §4.3 says outright that the wrapper *"arrives
 * with its first consumer, which is music, and atmosphere reuses it rather than
 * adding a third thing"* — music turned out to be blocked in both directions
 * (backlog §19's eagerly decoded audio, plus a content ask nobody started), so
 * the order swapped and atmosphere pays for it. `plan-region-audio.md` §3.5's
 * music tracker folds into this rather than growing its own.
 *
 * ⚑ Kept DELIBERATELY ignorant of what it is ramping. It is a number over time:
 * a sight radius today, a music volume next, a fog opacity if that is ever
 * wanted. Nothing here knows about regions, profiles or `resolve()` — the
 * caller does the lookup and hands over a number, which is what makes the whole
 * thing unit-testable with no DOM, no PixiJS and no zone.
 *
 * ## Why constant DURATION and not constant rate
 *
 * `advanceRamp` interpolates from the time ELAPSED since the target was set,
 * so **every crossing takes the same wall-clock time** no matter how big the
 * jump is. The alternative — a fixed units-per-second — makes a small
 * step feel instant and a big one feel like a slow pan, so walking from a dim
 * room into a bright one would read differently from the reverse. Exponential
 * smoothing was the third option and is worse for this: it never actually
 * arrives, so a "finished" test has to pick an epsilon.
 */

/** A value in flight. Create with {@link ramp}; never build one by hand. */
export interface Ramp {
    /** What to use right now. */
    value: number;
    /** Where it is heading. */
    target: number;
    /** Where it set off from — with {@link target}, this fixes the span. */
    from: number;
    /** Milliseconds since the current target was set. */
    elapsedMS: number;
}

/** A ramp already sitting at `initial`, with nothing in flight. */
export function ramp(initial: number): Ramp {
    return {value: initial, target: initial, from: initial, elapsedMS: 0};
}

/**
 * Points the ramp at a new target. A no-op when the target is unchanged, which
 * is the common case — this is called every frame with the result of a lookup
 * that rarely moves.
 *
 * ⚑ Re-aiming mid-flight restarts the clock FROM WHERE IT IS. Walking out of a
 * fog bank and straight back in must not snap; it must turn around from
 * wherever the eye had got to.
 *
 * @returns true when the target actually changed.
 */
export function rampTo(r: Ramp, target: number): boolean {
    if (target === r.target) {
        return false;
    }
    r.from = r.value;
    r.target = target;
    r.elapsedMS = 0;
    return true;
}

/**
 * Advances the ramp by one frame and returns the new current value.
 *
 * ⛔ MUST be called behind the game loop's `paused` guard — the trap
 * `advanceSurfaceScroll` already documents at its own call site. A delta
 * accumulated across a pause would arrive as one enormous frame and the value
 * would jump the whole way, which is exactly the pop the ramp exists to
 * prevent.
 *
 * ⚑ A zero or negative `durationMS` means "no ramp": arrive at once. That is a
 * legal configuration (an instant cut) and not a guard against bad input.
 *
 * @param deltaMS    frame time, from `PrerenderEvent`
 * @param durationMS how long a FULL crossing takes, whatever its size
 */
export function advanceRamp(r: Ramp, deltaMS: number, durationMS: number): number {
    if (r.value === r.target) {
        return r.value;
    }
    if (durationMS <= 0) {
        // The caller asked for an instant cut. ARRIVE rather than returning
        // early, or every later frame re-enters this branch forever.
        r.value = r.target;
        return r.value;
    }
    if (!isFinite(deltaMS) || deltaMS <= 0) {
        return r.value;
    }
    r.elapsedMS += deltaMS;
    // ⭐ INTERPOLATED FROM ELAPSED TIME, never accumulated into `value`. The
    // obvious version — `value += rate * delta` — adds one rounding error per
    // frame, so after a few hundred frames it lands at 479.99999999999983
    // instead of 480 and `rampSettled` NEVER GOES TRUE: the per-frame work the
    // settle check exists to stop would run for the life of the session, with
    // nothing visibly wrong to point at. Here `t` reaches exactly 1 and the
    // multiply reproduces `target` to the bit, so arrival is exact by
    // construction and the clamp is the same expression as the progress.
    const t = Math.min(1, r.elapsedMS / durationMS);
    r.value = t >= 1 ? r.target : r.from + (r.target - r.from) * t;
    return r.value;
}

/** True once the ramp has arrived — for a caller that wants to stop work. */
export function rampSettled(r: Ramp): boolean {
    return r.value === r.target;
}
