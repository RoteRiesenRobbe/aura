import {describe, expect, it} from 'vitest';
import {
    BAND_PER_REACH, BASE_TEXELS_PER_UNIT, MASK_MAX_TEXELS, maskBand, maskDensity, MAX_TEXELS_PER_UNIT,
    MIN_BAND_TEXELS, MIN_GRAIN_TEXELS, MIN_OCTAVE_TEXELS, NOISE_STRETCH, noiseShape, OCTAVE_SCALES,
} from './MaskNoise';

// plan-ground-noise.md W1 + W1b. The ONE density variable every blend mask is
// built at — texture size, blur strength and noise grain all read it
// (RegionPaint's one-variable rule) — and the shape of the noise pass drawn at
// it. Pinned against the exported constants, never against their
// [PLACEHOLDER] values, so tuning them cannot redden this.

const W1_WEIGHTS = [4 / 7, 2 / 7, 1 / 7];

function spread(weights: number[]): number {
    return Math.sqrt(weights.reduce((sum, w) => sum + w * w, 0));
}

describe('maskBand — the room the bake blurs to (W1b, D3)', () => {
    it('is exactly the blend when nothing wobbles, so a clean edge is what C5 shipped', () => {
        expect(maskBand(1.5, 0, false)).toBe(1.5);
        expect(maskBand(0, 0, false)).toBe(0);
    });

    it('grows to fit the wander when the reach needs more room than the fade', () => {
        expect(maskBand(0, 0.2, false)).toBeCloseTo(BAND_PER_REACH * 0.2, 12);
        expect(maskBand(0.1, 0.2, false)).toBeCloseTo(BAND_PER_REACH * 0.2, 12);
    });

    it('stays the blend when the fade already has room for the wander', () => {
        expect(maskBand(3, 0.2, false)).toBe(3);
    });
});

// W1c: a blend finer than the mask can draw is widened to the finest it can,
// never dropped to a hard edge.
describe('maskBand — a narrow blend is floored, not dropped (W1c)', () => {
    it.each([false, true])('floors a sub-texel blend at the finest band (mobile: %s)', (mobile) => {
        const finest = MIN_BAND_TEXELS / MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop'];
        expect(maskBand(0.01, 0, mobile)).toBeCloseTo(finest, 12);
        expect(maskBand(finest / 2, 0, mobile)).toBeCloseTo(finest, 12);
    });

    it('leaves a band the mask can draw alone', () => {
        expect(maskBand(0.5, 0, false)).toBe(0.5);
    });

    it('a surface authoring neither key still has no band', () => {
        expect(maskBand(0, 0, false)).toBe(0);
        expect(maskBand(0, 0, true)).toBe(0);
    });
});

describe('maskDensity — a WIDE straight edge is exactly what C5 shipped', () => {
    it.each([false, true])('reach 0 keeps the base density (mobile: %s)', (mobile) => {
        const d = maskDensity(1.5, 0, 20, mobile);
        expect(d.texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
        expect(d.grainUnits).toBe(0);
    });

    it('reach 0 still honours the texture cap on a huge footprint', () => {
        const longest = 1000;
        expect(maskDensity(1.5, 0, longest, false).texelsPerUnit).toBe(MASK_MAX_TEXELS / longest);
    });

    it('an authored grain changes nothing while the reach is 0', () => {
        expect(maskDensity(1.5, 0, 30, false, 0.05)).toEqual(maskDensity(1.5, 0, 30, false));
    });
});

describe('maskDensity — a narrow blend gets enough texels to draw its fade (W1c)', () => {
    it.each([0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 1.5])('every blend spans MIN_BAND_TEXELS texels (%s u)', (blend) => {
        [false, true].forEach((mobile) => {
            const band = maskBand(blend, 0, mobile);
            const d = maskDensity(band, 0, 20, mobile);
            expect(band * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_BAND_TEXELS - 1e-9);
            expect(d.texelsPerUnit)
                .toBeLessThanOrEqual(MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop'] + 1e-9);
        });
    });

    it('raises the density above the base for a blend the base cannot draw', () => {
        const d = maskDensity(0.2, 0, 20, false);
        expect(d.texelsPerUnit).toBeGreaterThan(BASE_TEXELS_PER_UNIT.desktop);
        expect(d.grainUnits).toBe(0);
    });

    it('still honours the texture cap on a huge footprint', () => {
        const longest = 1000;
        const d = maskDensity(maskBand(0.1, 0, false), 0, longest, false);
        expect(d.texelsPerUnit * longest).toBeLessThanOrEqual(MASK_MAX_TEXELS + 1e-9);
    });
});

describe('maskDensity — a wobbly edge gets enough texels to draw its grain', () => {
    it('raises the density for a reach too small to resolve at the base', () => {
        const d = maskDensity(1.5, 0.2, 20, false);
        expect(d.texelsPerUnit).toBeGreaterThan(BASE_TEXELS_PER_UNIT.desktop);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });

    it('never drops BELOW the base for a wide reach', () => {
        expect(maskDensity(15, 5, 20, false).texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT.desktop);
    });

    it.each([false, true])('stops at the density ceiling (mobile: %s)', (mobile) => {
        const d = maskDensity(1.5, 0.02, 20, mobile);
        expect(d.texelsPerUnit).toBe(MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
    });

    it('still honours the texture cap, and coarsens the grain to match', () => {
        const longest = 1000;
        const d = maskDensity(1.5, 0.2, longest, false);
        expect(d.texelsPerUnit * longest).toBeLessThanOrEqual(MASK_MAX_TEXELS + 1e-9);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });

    it.each([0.02, 0.1, 0.3, 0.8, 2])('the grain is at least MIN_GRAIN_TEXELS texels wide (reach %s)', (reach) => {
        [false, true].forEach((mobile) => {
            const d = maskDensity(maskBand(1.5, reach, mobile), reach, 30, mobile);
            expect(d.grainUnits).toBeGreaterThan(0);
            expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
        });
    });

    it('an authored grain replaces the derived one', () => {
        const d = maskDensity(1.5, 0.2, 30, false, 1.2);
        expect(d.grainUnits).toBe(1.2);
        // A coarse grain needs no extra texels: the base density draws it.
        expect(d.texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT.desktop);
    });

    it('an authored grain still gets enough texels to be drawn', () => {
        [false, true].forEach((mobile) => {
            const d = maskDensity(1.5, 0.5, 30, mobile, 0.05);
            expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
        });
    });

    it('a grain of 0 means "derive it", exactly like none', () => {
        expect(maskDensity(1.5, 0.2, 30, false, 0)).toEqual(maskDensity(1.5, 0.2, 30, false));
    });

    // D3: the reach, not the blend, is what the derived grain follows now.
    it('a longer reach gets a coarser grain', () => {
        expect(maskDensity(1.5, 1, 30, false).grainUnits)
            .toBeGreaterThan(maskDensity(1.5, 0.3, 30, false).grainUnits);
    });
});

// The shader's four uniforms, derived once in TS where they can be pinned.
// Every case bakes at a density fine enough that no octave is dropped, unless
// the case is about dropping.
describe('noiseShape — the fade is the blend, and only the blend (W1b, D3)', () => {
    it('is the identity remap (soft ½) when the band IS the blend', () => {
        // blend 1.5 already has room for a 0.2 reach, so the band is the blend.
        const band = maskBand(1.5, 0.2, false);
        expect(noiseShape(1.5, band, 0.2, 16, 0.5, 0.5).soft).toBeCloseTo(0.5, 12);
    });

    it.each([0.1, 0.25, 0.5])('fades over exactly the blend (%s u) inside a wider band', (blend) => {
        const band = maskBand(blend, 0.3, false);
        const {soft} = noiseShape(blend, band, 0.3, 16, 0.5, 0.5);
        // The remap spans v ∈ ½ ± soft, and v crosses the band at one per band.
        expect(2 * soft * band).toBeCloseTo(blend, 12);
    });

    it('a blend of 0 draws as crisp as the texture allows: one texel of fade', () => {
        const texelsPerUnit = 16;
        const band = maskBand(0, 0.3, false);
        const {soft} = noiseShape(0, band, 0.3, texelsPerUnit, 0.5, 0.5);
        expect(2 * soft * band * texelsPerUnit).toBeCloseTo(1, 12);
    });
});

describe('noiseShape — the reach is how far the edge wanders (W1b, D3)', () => {
    // Along the ramp m ≈ ½ − d/band, so the edge sits where
    //   d/band = amp · (n − ½) · 4m(1 − m).
    // At the noise's extreme (n − ½ = ½) that offset must be the reach.
    it.each([
        [0, 0.2], [0.1, 0.2], [0.5, 0.2], [1.5, 0.2], [0, 1],
    ])('the extreme excursion is the reach (blend %s, reach %s)', (blend, reach) => {
        const band = maskBand(blend, reach, false);
        const {amp} = noiseShape(blend, band, reach, 16, 0.5, 0.5);
        const x = reach / band;
        expect(amp * 0.5 * (1 - 4 * x * x)).toBeCloseTo(x, 12);
    });
});

describe('noiseShape — roughness is the octave mix, and never the reach (W1b)', () => {
    it("roughness ½ at a fine grain is exactly W1's mix and W1's stretch", () => {
        const shape = noiseShape(0.5, 0.6, 0.2, 16, 2, 0.5);
        shape.weights.forEach((w, i) => expect(w).toBeCloseTo(W1_WEIGHTS[i], 12));
        expect(shape.stretch).toBeCloseTo(NOISE_STRETCH, 12);
    });

    it('roughness 0 is the coarse octave alone: smooth lumps', () => {
        expect(noiseShape(0.5, 0.6, 0.2, 16, 2, 0).weights).toEqual([1, 0, 0]);
    });

    it('roughness 1 weighs every octave the same', () => {
        noiseShape(0.5, 0.6, 0.2, 16, 2, 1).weights
            .forEach(w => expect(w).toBeCloseTo(1 / 3, 12));
    });

    // ⭐ The central-limit trap: more equal-weight octaves NARROW the sum, so a
    // rougher edge would wander less. The stretch has to hand the spread back.
    it.each([0, 0.25, 0.5, 0.75, 1])('the noise spread is the same at roughness %s', (roughness) => {
        const {weights, stretch} = noiseShape(0.5, 0.6, 0.2, 16, 2, roughness);
        expect(stretch * spread(weights)).toBeCloseTo(NOISE_STRETCH * spread(W1_WEIGHTS), 12);
    });

    it('drops an octave too fine for the mask to draw, and still sums to 1', () => {
        // Grain 3 texels: octave 2 is under MIN_OCTAVE_TEXELS, so it goes.
        const texelsPerUnit = 10;
        const grainUnits = MIN_GRAIN_TEXELS / texelsPerUnit;
        const {weights, stretch} = noiseShape(0.5, 0.6, 0.2, texelsPerUnit, grainUnits, 1);
        weights.forEach((w, i) => {
            const texels = grainUnits * texelsPerUnit / OCTAVE_SCALES[i];
            if (texels < MIN_OCTAVE_TEXELS) { expect(w).toBe(0); }
        });
        expect(weights[0]).toBeGreaterThan(0);
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
        expect(stretch * spread(weights)).toBeCloseTo(NOISE_STRETCH * spread(W1_WEIGHTS), 12);
    });

    it('never drops the coarse octave, however small the grain', () => {
        expect(noiseShape(0.5, 0.6, 0.2, 1, 0.1, 0.5).weights).toEqual([1, 0, 0]);
    });

    // ⛔ The shader's weights are a vec3 and its fbm names three terms: a
    // fourth scale would be weighed and normalised here, and never drawn.
    it('there are exactly as many octaves as the shader draws', () => {
        expect(OCTAVE_SCALES).toHaveLength(3);
    });
});

// Every band maskBand can hand the shader, W1c's floor included: the amplitude
// solve stays finite (x < ½) and the fade never exceeds the band.
describe('noiseShape — every band maskBand produces is solvable (W1b + W1c)', () => {
    it.each([0, 0.01, 0.05, 0.16, 0.5, 1.5])('blend %s', (blend) => {
        [0.005, 0.02, 0.12, 0.5, 2].forEach((reach) => {
            [false, true].forEach((mobile) => {
                const band = maskBand(blend, reach, mobile);
                expect(reach / band).toBeLessThanOrEqual(1 / BAND_PER_REACH + 1e-12);
                const d = maskDensity(band, reach, 30, mobile);
                const {amp, soft} = noiseShape(blend, band, reach, d.texelsPerUnit, d.grainUnits, 0.5);
                expect(Number.isFinite(amp)).toBe(true);
                expect(amp).toBeGreaterThan(0);
                expect(soft).toBeGreaterThan(0);
                expect(soft).toBeLessThanOrEqual(0.5);
            });
        });
    });
});
