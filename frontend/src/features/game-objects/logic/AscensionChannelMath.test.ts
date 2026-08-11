import {describe, it, expect} from 'vitest';
import {
    castProgress,
    clamp01,
    FLASH_FROM,
    flashStrength,
    haloAlpha,
    moteAlpha,
    moteAngle,
    MOTE_COUNT,
    motePosition,
    moteRadiusFactor,
    moteSpread,
    START_RADIUS_FACTOR,
} from './AscensionChannelMath';

// The ascension channel effect (plan-ascension.md follow-up ②). The renderer is
// untestable without a GL context; these are the numbers it draws, and they are
// the whole of the effect's behaviour.

describe('castProgress', () => {
    it('is 0 when nothing is casting — the all-zero snapshot', () => {
        expect(castProgress(0, 0)).toBe(0);
    });

    it('runs 0 → 1 as the ticks drain', () => {
        expect(castProgress(300, 300)).toBe(0);
        expect(castProgress(150, 300)).toBeCloseTo(0.5, 6);
        expect(castProgress(0, 300)).toBe(1);
    });

    it('never divides by a zero total, whatever ticksLeft says', () => {
        expect(castProgress(42, 0)).toBe(0);
        expect(Number.isFinite(castProgress(42, 0))).toBe(true);
    });

    it('clamps a snapshot whose counters disagree', () => {
        expect(castProgress(400, 300)).toBe(0);
        expect(castProgress(-5, 300)).toBe(1);
    });
});

describe('moteRadiusFactor', () => {
    it('starts a full three character-widths out', () => {
        expect(moteRadiusFactor(0)).toBe(START_RADIUS_FACTOR);
    });

    it('arrives at the character exactly at completion', () => {
        expect(moteRadiusFactor(1)).toBe(0);
    });

    it('only ever shrinks', () => {
        let previous = Infinity;
        for (let p = 0; p <= 1.0001; p += 0.05) {
            const r = moteRadiusFactor(p);
            expect(r).toBeLessThan(previous);
            previous = r;
        }
    });

    it('collapses late rather than drifting in evenly', () => {
        // Eased: at the halfway point the swarm is still well outside the
        // linear halfway radius, so the arrival reads as a pull, not a drift.
        expect(moteRadiusFactor(0.5)).toBeGreaterThan(START_RADIUS_FACTOR * 0.25);
        expect(moteRadiusFactor(0.5)).toBeLessThan(START_RADIUS_FACTOR * 0.5);
    });

    it('survives a progress outside its range', () => {
        expect(moteRadiusFactor(-1)).toBe(START_RADIUS_FACTOR);
        expect(moteRadiusFactor(2)).toBe(0);
        expect(moteRadiusFactor(NaN)).toBe(START_RADIUS_FACTOR);
    });
});

describe('moteSpread', () => {
    it('keeps every mote inside the orbit and off its own centre', () => {
        for (let i = 0; i < MOTE_COUNT; i++) {
            expect(moteSpread(i)).toBeGreaterThan(0.7);
            expect(moteSpread(i)).toBeLessThanOrEqual(1);
        }
    });

    it('gives neighbours different rings — a swarm, not a wheel', () => {
        for (let i = 0; i < MOTE_COUNT - 1; i++) {
            expect(moteSpread(i)).not.toBeCloseTo(moteSpread(i + 1), 3);
        }
        expect(new Set(Array.from({length: MOTE_COUNT}, (_, i) => moteSpread(i))).size)
            .toBeGreaterThan(4);
    });
});

describe('moteAngle', () => {
    it('spaces the swarm evenly around the circle at rest', () => {
        const angles = Array.from({length: MOTE_COUNT}, (_, i) => moteAngle(i, MOTE_COUNT, 0, 0));
        expect(new Set(angles).size).toBe(MOTE_COUNT);
        for (let i = 1; i < MOTE_COUNT; i++) {
            expect(angles[i] - angles[i - 1]).toBeCloseTo((Math.PI * 2) / MOTE_COUNT, 6);
        }
    });

    it('spins faster as the orbit tightens', () => {
        const sweep = (progress: number) =>
            moteAngle(0, MOTE_COUNT, progress, 1000) - moteAngle(0, MOTE_COUNT, progress, 0);
        expect(sweep(1)).toBeGreaterThan(sweep(0.5));
        expect(sweep(0.5)).toBeGreaterThan(sweep(0));
        expect(sweep(0)).toBeGreaterThan(0);
    });
});

describe('motePosition', () => {
    it('sits on the current orbit, scaled by the character size', () => {
        const size = 20;
        const {x, y} = motePosition(3, MOTE_COUNT, 0.4, 0, size);
        const expected = moteRadiusFactor(0.4) * moteSpread(3) * size;
        expect(Math.hypot(x, y)).toBeCloseTo(expected, 6);
    });

    it('lands every mote on the character at completion', () => {
        for (let i = 0; i < MOTE_COUNT; i++) {
            const {x, y} = motePosition(i, MOTE_COUNT, 1, 5_000, 20);
            expect(Math.hypot(x, y)).toBeCloseTo(0, 6);
        }
    });
});

describe('moteAlpha', () => {
    it('is visible from the first tick and brightest at the end', () => {
        expect(moteAlpha(0)).toBeGreaterThan(0.3);
        expect(moteAlpha(1)).toBeCloseTo(1, 6);
        expect(moteAlpha(0.5)).toBeGreaterThan(moteAlpha(0));
    });

    it('stays a legal alpha at every progress, legal or not', () => {
        for (const p of [-1, 0, 0.5, 1, 2, NaN]) {
            expect(moteAlpha(p)).toBeGreaterThanOrEqual(0);
            expect(moteAlpha(p)).toBeLessThanOrEqual(1);
        }
    });
});

describe('haloAlpha', () => {
    it('is present from the start and deeper at the end', () => {
        const early = haloAlpha(0.05, 500);
        const late = haloAlpha(0.95, 500);
        expect(early).toBeGreaterThan(0);
        expect(late).toBeGreaterThan(early);
    });

    it('breathes — it does not sit still through ten seconds of channel', () => {
        const samples = [0, 250, 500, 750, 1000].map((ms) => haloAlpha(0.5, ms));
        expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.02);
    });

    it('never washes the character out', () => {
        for (const p of [0, 0.5, 1, 2, NaN]) {
            for (const ms of [0, 333, 1_500, 9_900]) {
                expect(haloAlpha(p, ms)).toBeGreaterThanOrEqual(0);
                expect(haloAlpha(p, ms)).toBeLessThan(0.45);
            }
        }
    });
});

describe('flashStrength', () => {
    it('stays dark for the whole channel', () => {
        expect(flashStrength(0)).toBe(0);
        expect(flashStrength(0.5)).toBe(0);
        // ⭐ A player who walks away at 90 % must never have seen the flash: it
        // is the ceremony landing, and it does not lie about landing.
        expect(flashStrength(0.9)).toBe(0);
        expect(flashStrength(FLASH_FROM - 0.001)).toBe(0);
    });

    it('ramps to full over the last stretch', () => {
        expect(flashStrength(FLASH_FROM)).toBe(0);
        expect(flashStrength(1)).toBeCloseTo(1, 6);
        expect(flashStrength((FLASH_FROM + 1) / 2)).toBeCloseTo(0.5, 6);
    });
});

describe('clamp01', () => {
    it('is total — no NaN reaches a Graphics property', () => {
        expect(clamp01(NaN)).toBe(0);
        expect(clamp01(Infinity)).toBe(0);
        expect(clamp01(-0.5)).toBe(0);
        expect(clamp01(1.5)).toBe(1);
        expect(clamp01(0.25)).toBe(0.25);
    });
});
