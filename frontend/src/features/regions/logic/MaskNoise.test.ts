import {describe, expect, it} from 'vitest';
import {
    BAND_PER_REACH, BASE_TEXELS_PER_UNIT, MASK_MAX_TEXELS, maskBand, maskDensity, MAX_TEXELS_PER_UNIT,
    MIN_BAND_TEXELS, MIN_GRAIN_TEXELS, MIN_OCTAVE_TEXELS, NOISE_STRETCH, noiseShape, OCTAVE_SCALES,
    octaveMix, overlayDensity, patchThreshold, snapToTexels,
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

// ⛔ The PO's `blend: 0` Road still read BLENDED (2026-09-27): the density
// followed the band (room for the wander) and the lump, never the FADE, so a
// crisp wandering edge baked at 6 texels/unit and softened over ~0.3 u. And
// roughness was inert on it: the fine octaves were dropped at that density.
describe('maskDensity — a wobbly edge gets the texels its FADE and ROUGHNESS ask for', () => {
    it.each([false, true])('blend 0 with a reach bakes at the ceiling (mobile: %s)', (mobile) => {
        const band = maskBand(0, 0.12, mobile);
        const d = maskDensity(band, 0.12, 30, mobile, 0.8, 0, 0);
        expect(d.texelsPerUnit).toBe(MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
    });

    it('a narrow fade inside a wide band spans MIN_BAND_TEXELS, under the ceiling', () => {
        const band = maskBand(0.2, 0.3, false);
        const d = maskDensity(band, 0.3, 30, false, 0, 0.2, 0);
        expect(0.2 * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_BAND_TEXELS - 1e-9);
    });

    it('roughness raises the density until every octave is drawn', () => {
        const band = maskBand(0.5, 0.12, false);
        const d = maskDensity(band, 0.12, 30, false, 0.8, 0.5, 1);
        const {weights} = noiseShape(0.5, band, 0.12, d.texelsPerUnit, d.grainUnits, 1);
        weights.forEach(w => expect(w).toBeGreaterThan(0));
    });

    it('roughness 0 asks for nothing extra: smooth lumps have no fine octave', () => {
        const band = maskBand(0.5, 0.12, false);
        expect(maskDensity(band, 0.12, 30, false, 0.8, 0.5, 0))
            .toEqual(maskDensity(band, 0.12, 30, false, 0.8));
    });

    it('a straight edge is untouched by either (no reach, no noise pass)', () => {
        expect(maskDensity(1.5, 0, 30, false, 0, 0, 1)).toEqual(maskDensity(1.5, 0, 30, false));
    });

    it("the PO's Road (blend 0, reach 0.12, lump 0.8, roughness 1) is crisp and rough", () => {
        const band = maskBand(0, 0.12, false);
        const d = maskDensity(band, 0.12, 30, false, 0.8, 0, 1);
        expect(d.texelsPerUnit).toBe(MAX_TEXELS_PER_UNIT.desktop);
        noiseShape(0, band, 0.12, d.texelsPerUnit, d.grainUnits, 1).weights
            .forEach(w => expect(w).toBeGreaterThan(0));
    });

    it('still honours the texture cap on a huge footprint', () => {
        const longest = 1000;
        const d = maskDensity(maskBand(0, 0.12, false), 0.12, longest, false, 0.8, 0, 1);
        expect(d.texelsPerUnit * longest).toBeLessThanOrEqual(MASK_MAX_TEXELS + 1e-9);
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

// plan-ground-noise.md W2: the patch mode's two pure halves. The threshold
// turns `coverage` into where the stretched noise is cut; the density is what
// the overlay mask is baked at.
describe('patchThreshold — coverage is where the noise is cut (W2)', () => {
    const soft = 0.06;
    // The shader's own cut, a smoothstep either side of the threshold.
    const alpha = (n: number, t: number) => {
        const x = Math.min(1, Math.max(0, (n - (t - soft)) / (2 * soft)));
        return x * x * (3 - 2 * x);
    };

    it('coverage 1 covers every noise value, 0 covers none', () => {
        [0, 0.01, 0.5, 0.99, 1].forEach((n) => {
            expect(alpha(n, patchThreshold(1, soft))).toBe(1);
            expect(alpha(n, patchThreshold(0, soft))).toBe(0);
        });
    });

    it('coverage ½ cuts at the middle of the noise, where half of it lies', () => {
        expect(patchThreshold(0.5, soft)).toBeCloseTo(0.5, 12);
    });

    it('more coverage always lowers the cut', () => {
        const cuts = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1].map(c => patchThreshold(c, soft));
        cuts.slice(1).forEach((cut, i) => expect(cut).toBeLessThan(cuts[i]));
    });
});

describe('overlayDensity — the overlay mask draws its patches AND its base (W2)', () => {
    it.each([false, true])('a coarse patch on a bare shape bakes at the base density (mobile: %s)', (mobile) => {
        const d = overlayDensity(2, 30, mobile, 0);
        expect(d.texelsPerUnit).toBe(BASE_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
        expect(d.grainUnits).toBe(2);
    });

    it('a fine patch raises the density until its grain is drawable', () => {
        const d = overlayDensity(0.2, 30, false, 0);
        expect(d.texelsPerUnit).toBeGreaterThan(BASE_TEXELS_PER_UNIT.desktop);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });

    // A denser base mask (a narrow wobbly road) must not be resampled coarser,
    // or the patches would not follow the edge the base draws.
    it('never bakes coarser than the base mask it reads', () => {
        expect(overlayDensity(2, 30, false, 12).texelsPerUnit).toBe(12);
    });

    // The same roughness rule as the wobble: a patch's roughness must be drawable.
    it('roughness raises the density until every patch octave is drawn', () => {
        const d = overlayDensity(0.8, 30, false, 0, 1);
        octaveMix(d.grainUnits * d.texelsPerUnit, 1).weights.forEach(w => expect(w).toBeGreaterThan(0));
        expect(overlayDensity(0.8, 30, false, 0, 0)).toEqual(overlayDensity(0.8, 30, false, 0));
    });

    it.each([false, true])('stops at the density ceiling, and the grain follows (mobile: %s)', (mobile) => {
        const d = overlayDensity(0.01, 30, mobile, 0);
        expect(d.texelsPerUnit).toBe(MAX_TEXELS_PER_UNIT[mobile ? 'mobile' : 'desktop']);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });

    it('still honours the texture cap on a huge footprint, and coarsens the grain to match', () => {
        const longest = 1000;
        const d = overlayDensity(0.5, longest, false, 16);
        expect(d.texelsPerUnit * longest).toBeLessThanOrEqual(MASK_MAX_TEXELS + 1e-9);
        expect(d.grainUnits * d.texelsPerUnit).toBeGreaterThanOrEqual(MIN_GRAIN_TEXELS - 1e-9);
    });
});

// ⛔ The W2 look found this, but it is C5's: a mask texture is ROUNDED UP to
// whole texels and was then stretched back over the unrounded box, so every mask
// sat up to a texel short at its bottom and right. A soft fade hides that; a
// hard edge showed it as a strip of bare base where the patches stopped short.
describe('snapToTexels — a mask box is a whole number of texels', () => {
    it.each([
        [100, 0.05], [1234.5, 0.05], [7, 0.3], [1, 1], [0.01, 0.05], [5000, 0.1333],
    ])('%s px at %s texels/px', (length, texelsPerPx) => {
        const snapped = snapToTexels(length, texelsPerPx);
        const texels = snapped * texelsPerPx;
        expect(Math.abs(texels - Math.round(texels))).toBeLessThan(1e-9);
        expect(snapped).toBeGreaterThanOrEqual(length);
        expect(snapped - length).toBeLessThan(1 / texelsPerPx + 1e-9);
    });

    it('is never smaller than one texel', () => {
        expect(snapToTexels(0, 0.05) * 0.05).toBeCloseTo(1, 12);
    });
});

describe('octaveMix — the wobble and the patches share one roughness rule (W1b, W2)', () => {
    it('is exactly the mix noiseShape hands the wobble', () => {
        const shape = noiseShape(0.5, 0.6, 0.2, 16, 2, 0.3);
        expect(octaveMix(2 * 16, 0.3)).toEqual({weights: shape.weights, stretch: shape.stretch});
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
