/**
 * Fire flicker (plan-lightmap.md D12): a light's drawn size and strength
 * wobble from smooth 1-D value noise. Presentation only — `isHidden` and the
 * server's map fog read radii, never this.
 *
 * Kept free of PixiJS so the noise is unit-testable.
 */

// Knots per second of the slow and the fast octave: a few soft swells a
// second with a quicker shimmer on top. [PLACEHOLDER]
const SLOW_HZ = 4;
const FAST_HZ = 11;
const FAST_WEIGHT = 0.35;

/** A pseudo-random value in -1..1 for integer knot `i` of stream `seed`. */
function knot(i: number, seed: number): number {
    let h = (i * 374761393 + seed * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

function octave(x: number, seed: number): number {
    const i = Math.floor(x);
    const f = x - i;
    const s = f * f * (3 - 2 * f);
    return knot(i, seed) + (knot(i + 1, seed) - knot(i, seed)) * s;
}

/**
 * Smooth noise in -1..1 at time `ms`. `seed` gives each light its own stream,
 * so neighbouring fires never pulse together.
 */
export function flickerNoise(ms: number, seed: number): number {
    const t = ms / 1000;
    const n = (1 - FAST_WEIGHT) * octave(t * SLOW_HZ, seed) + FAST_WEIGHT * octave(t * FAST_HZ, seed + 7919);
    return Math.max(-1, Math.min(1, n));
}

/**
 * The multipliers for one flickering light at time `ms`: the size swings
 * ±`sizeAmp` around 1, the strength dips by up to `alphaAmp` and never rises
 * past the steady light (screen cannot go past white anyway). Two streams, so
 * size and strength do not move in lockstep.
 */
export function flicker(ms: number, seed: number, sizeAmp: number, alphaAmp: number): { size: number, alpha: number } {
    if (sizeAmp === 0 && alphaAmp === 0) {
        return {size: 1, alpha: 1};
    }
    return {
        size: 1 + sizeAmp * flickerNoise(ms, seed),
        alpha: 1 - alphaAmp * (0.5 + 0.5 * flickerNoise(ms, seed + 104729)),
    };
}
