import {describe, it, expect} from 'vitest';
import {advanceRamp, ramp, rampSettled, rampTo} from './Ramp';

// A steady 60 fps frame, so a 400 ms ramp is 24 of them.
const FRAME = 1000 / 60;

/** Runs exactly `frames` 60 fps frames and returns the value at the end.
 *  ⚑ Frame COUNT, not a wall-clock target: a while-loop on accumulated ms runs
 *  one frame more or fewer depending on rounding, which makes a midpoint
 *  assertion flaky for reasons that have nothing to do with the ramp. */
function run(r: ReturnType<typeof ramp>, frames: number, durationMS: number): number {
    for (let i = 0; i < frames; i++) { advanceRamp(r, FRAME, durationMS); }
    return r.value;
}

/** 400 ms at 60 fps. */
const FULL = 24;
const HALF = 12;

describe('ramp', () => {
    it('starts settled at its initial value', () => {
        const r = ramp(40);
        expect(r.value).toBe(40);
        expect(rampSettled(r)).toBe(true);
        // A settled ramp does not move, however many frames pass.
        expect(run(r, 300, 400)).toBe(40);
    });

    it('reports whether the target actually changed', () => {
        const r = ramp(40);
        expect(rampTo(r, 40)).toBe(false);
        expect(rampTo(r, 480)).toBe(true);
        // ⚑ The common case: this is called EVERY FRAME with a lookup that
        // rarely moves, so re-aiming at the same target must stay a no-op —
        // otherwise `from` resets each frame and the ramp crawls forever.
        expect(rampTo(r, 480)).toBe(false);
    });

    it('arrives exactly on the target and stops there', () => {
        const r = ramp(40);
        rampTo(r, 480);
        expect(run(r, FULL, 400)).toBe(480);
        expect(rampSettled(r)).toBe(true);
        // And does not drift past it on later frames.
        expect(run(r, 60, 400)).toBe(480);
    });

    it('travels downward the same way', () => {
        const r = ramp(480);
        rampTo(r, 40);
        const mid = run(r, HALF, 400);
        expect(mid).toBeLessThan(480);
        expect(mid).toBeGreaterThan(40);
        expect(run(r, HALF, 400)).toBe(40);
    });

    // ⭐ CONSTANT DURATION, not constant rate — the design decision the module
    // header argues for. A small step and a huge one take the same wall-clock
    // time, so walking into a dim room and into a bright one feel alike.
    it('takes the same time regardless of how big the jump is', () => {
        const small = ramp(40);
        rampTo(small, 80);
        const big = ramp(40);
        rampTo(big, 4000);

        // Half way through, both are half way there.
        expect(run(small, HALF, 400)).toBeCloseTo(60, 0);
        expect(run(big, HALF, 400)).toBeCloseTo(2020, 0);

        expect(run(small, HALF, 400)).toBe(80);
        expect(run(big, HALF, 400)).toBe(4000);
    });

    // ⚑ Walking out of a fog bank and straight back in must turn around from
    // wherever the eye had got to, never snap back to where it set off.
    it('re-aims mid-flight from where it currently is', () => {
        const r = ramp(40);
        rampTo(r, 440);
        const mid = run(r, HALF, 400);
        expect(mid).toBeCloseTo(240, 0);

        rampTo(r, 40);
        expect(r.from).toBeCloseTo(mid, 5);
        // …and the return trip is a FULL duration from there, not a fraction.
        const back = run(r, HALF, 400);
        expect(back).toBeGreaterThan(40);
        expect(back).toBeLessThan(mid);
        expect(run(r, HALF, 400)).toBe(40);
    });

    // A long frame must land ON the target, not overshoot and oscillate.
    it('clamps rather than overshooting on a huge frame', () => {
        const up = ramp(0);
        rampTo(up, 100);
        expect(advanceRamp(up, 100000, 400)).toBe(100);

        const down = ramp(100);
        rampTo(down, 0);
        expect(advanceRamp(down, 100000, 400)).toBe(0);
    });

    // ⚑ A zero duration is an instant cut, a legal configuration — and it must
    // ARRIVE, or every later frame re-enters the same branch forever.
    it('arrives immediately when the duration is zero', () => {
        const r = ramp(40);
        rampTo(r, 480);
        expect(advanceRamp(r, FRAME, 0)).toBe(480);
        expect(rampSettled(r)).toBe(true);
    });

    // A non-advancing frame must not move the value, and must not settle it
    // either — the next real frame still has the whole trip to make.
    it.each([
        ['zero', 0],
        ['negative', -16],
        ['NaN', Number.NaN],
    ])('ignores a %s delta without settling', (_name, delta) => {
        const r = ramp(40);
        rampTo(r, 480);
        expect(advanceRamp(r, delta, 400)).toBe(40);
        expect(rampSettled(r)).toBe(false);
    });
});
