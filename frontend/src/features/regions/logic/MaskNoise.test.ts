import {describe, expect, it} from 'vitest';
import {
    BASE_TEXELS_PER_UNIT, MASK_MAX_TEXELS, maskDensity, MIN_GRAIN_TEXELS,
    WOBBLE_MAX_TEXELS_PER_UNIT,
} from './MaskNoise';

// plan-ground-noise.md W1. The ONE density variable every blend mask is built
// at — texture size, blur strength and noise grain all read it (RegionPaint's
// one-variable rule). Pinned against the exported constants, never against
// their [PLACEHOLDER] values, so tuning them cannot redden this.

describe('maskDensity — a clean ramp is exactly what C5 shipped', () => {
    it.each([false, true])('wobble 0 keeps the base density (mobile: %s)', (mobile) => {
        const d = maskDensity(1.5, 0, 20, mobile);
        expect(d.texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
    });

    it('wobble 0 does not raise the density however narrow the band', () => {
        expect(maskDensity(0.1, 0, 20, false).texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT.desktop);
    });

    it('wobble 0 still honours the texture cap on a huge footprint', () => {
        const longest = 1000;
        expect(maskDensity(1.5, 0, longest, false).texelsPerUnit).toBe(MASK_MAX_TEXELS / longest);
    });
});

describe('maskDensity — a wobbly edge gets enough texels to draw its grain', () => {
    it('raises the density for a band too narrow to resolve at the base', () => {
        const d = maskDensity(0.5, 0.6, 20, false);
        expect(d.texelsPerUnit).toBeGreaterThan(BASE_TEXELS_PER_UNIT.desktop);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });

    it('never drops BELOW the base for a wide band', () => {
        expect(maskDensity(5, 0.6, 20, false).texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT.desktop);
    });

    it.each([false, true])('stops at the wobble ceiling (mobile: %s)', (mobile) => {
        const d = maskDensity(0.05, 1, 20, mobile);
        expect(d.texelsPerUnit).toBe(WOBBLE_MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
    });

    it('still honours the texture cap, and coarsens the grain to match', () => {
        const longest = 1000;
        const d = maskDensity(0.5, 0.6, longest, false);
        expect(d.texelsPerUnit * longest).toBeLessThanOrEqual(MASK_MAX_TEXELS + 1e-9);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });

    it.each([
        [0.1, 1], [0.3, 0.5], [0.8, 0.6], [1.5, 0.3], [4, 1],
    ])('the grain is at least MIN_GRAIN_TEXELS texels wide (blend %s, wobble %s)', (blend, wobble) => {
        [false, true].forEach((mobile) => {
            const d = maskDensity(blend, wobble, 30, mobile);
            expect(d.grainUnits).toBeGreaterThan(0);
            expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
        });
    });

    // D2 amended: an authored `wobbleSize` decouples the blotch from the band.
    it('an authored grain replaces the derived one', () => {
        const d = maskDensity(0.5, 0.6, 30, false, 1.2);
        expect(d.grainUnits).toBe(1.2);
        // A coarse grain needs no extra texels: the base density draws it.
        expect(d.texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT.desktop);
    });

    it('an authored grain still gets enough texels to be drawn', () => {
        [false, true].forEach((mobile) => {
            const d = maskDensity(2, 0.6, 30, mobile, 0.05);
            expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
        });
    });

    it('an authored grain changes nothing while wobble is 0', () => {
        expect(maskDensity(0.5, 0, 30, false, 0.05))
            .toEqual(maskDensity(0.5, 0, 30, false));
    });

    it('a grain of 0 means "derive it", exactly like none', () => {
        expect(maskDensity(0.5, 0.6, 30, false, 0)).toEqual(maskDensity(0.5, 0.6, 30, false));
    });

    it('a wider band gets a coarser grain', () => {
        expect(maskDensity(3, 0.6, 30, false).grainUnits)
            .toBeGreaterThan(maskDensity(1, 0.6, 30, false).grainUnits);
    });
});
