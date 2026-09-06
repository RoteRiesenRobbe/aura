import {describe, expect, it} from 'vitest';
import {
    LABEL_INSET,
    LABEL_MAX_FONT_SIZE,
    LABEL_MIN_FONT_SIZE,
    LABEL_REFERENCE_FONT_SIZE,
    propFootprint,
    propLabelFontSize,
} from './PropPlaceholderLayout';

// Pins for the prop placeholder's geometry (plan-prop-placeholders.md C2).
// This is the half of the feature that is pure arithmetic, and the half most
// likely to be retuned in the in-game pass — the drawing itself is four PixiJS
// calls over these numbers.

describe('propFootprint', () => {
    it('makes a circle body square at the streamed radius', () => {
        expect(propFootprint({radius: 1.4}, 168)).toEqual({
            isRect: false, halfWidth: 168, halfHeight: 168,
        });
    });

    // The wire carries VisualRadius() = the MAX half-extent, so the long axis
    // is always exactly `size` and the short one is scaled down from it.
    it('recovers a wide rect aspect from the max half-extent', () => {
        // House: 4 x 3 units. Long axis is the width.
        const f = propFootprint({width: 4, height: 3}, 240);
        expect(f.isRect).toBe(true);
        expect(f.halfWidth).toBe(240);
        expect(f.halfHeight).toBe(180);
    });

    it('recovers a TALL rect aspect the same way', () => {
        const f = propFootprint({width: 0.6, height: 2}, 120);
        expect(f.halfHeight).toBe(120);
        expect(f.halfWidth).toBeCloseTo(36, 10);
    });

    it('is square for a 1:1 rect, and still a rect', () => {
        // GateWall: 2.4 x 2.4 — the shape differs from a circle of the same
        // extents, so isRect has to survive the equal dimensions.
        expect(propFootprint({width: 2.4, height: 2.4}, 144)).toEqual({
            isRect: true, halfWidth: 144, halfHeight: 144,
        });
    });

    // ⚑ The absolute size comes from the wire, which already carries the
    // placement's `scale` multiplier — so a scaled placement needs no handling
    // here at all, and this pins that nothing re-applies it.
    it('takes its absolute size purely from the streamed radius', () => {
        const one = propFootprint({width: 4, height: 3}, 240);
        const doubled = propFootprint({width: 4, height: 3}, 480);
        expect(doubled.halfWidth).toBe(one.halfWidth * 2);
        expect(doubled.halfHeight).toBe(one.halfHeight * 2);
    });

    it('degrades to a square rather than NaN on an unusable body', () => {
        // Not reachable through the server (parse enforces one positive form),
        // but a hand-edited def mid-save must not produce a NaN-sized Graphics
        // that draws nothing and says nothing.
        expect(propFootprint({}, 100)).toEqual({isRect: false, halfWidth: 100, halfHeight: 100});
        expect(propFootprint({width: 0, height: 0}, 100)).toEqual({
            isRect: true, halfWidth: 100, halfHeight: 100,
        });
    });
});

describe('propLabelFontSize', () => {
    const rect = (halfWidth: number, halfHeight: number) =>
        ({isRect: true, halfWidth, halfHeight});
    const circle = (r: number) => ({isRect: false, halfWidth: r, halfHeight: r});

    it('scales the reference size by whichever axis binds', () => {
        // Box 240 x 180 → inset 403.2 x 302.4. Text 100 x 20 at reference:
        // width gives 4.03, height gives 15.1 — width binds, and the result is
        // clamped by the max.
        const f = propLabelFontSize(rect(240, 180), 100, 20);
        expect(f).toBe(LABEL_MAX_FONT_SIZE);
    });

    it('returns a size below the cap when the prop is genuinely small', () => {
        // Box 48 x 48 → inset 80.64 x 80.64. Text 160 x 32: width binds at
        // 0.504 → 32 × 0.504 = 16.128.
        expect(propLabelFontSize(rect(48, 48), 160, 32)).toBeCloseTo(16.128, 6);
    });

    it('drops the label rather than let it go illegible', () => {
        // A long name in a tombstone-sized footprint.
        expect(propLabelFontSize(rect(20, 20), 900, 32)).toBeNull();
    });

    it('drops the label rather than let it go illegible on a circle too', () => {
        expect(propLabelFontSize(circle(20), 900, 32)).toBeNull();
    });

    it('never returns something between zero and the legibility floor', () => {
        // Sweep the binding dimension across the cliff: every answer is either
        // null or >= the floor, which is the actual D3 guarantee.
        for (let textWidth = 40; textWidth <= 2000; textWidth += 7) {
            const size = propLabelFontSize(rect(60, 60), textWidth, 32);
            if (size !== null) {
                expect(size).toBeGreaterThanOrEqual(LABEL_MIN_FONT_SIZE);
                expect(size).toBeLessThanOrEqual(LABEL_MAX_FONT_SIZE);
            }
        }
    });

    it('refuses an unmeasurable text instead of dividing by zero', () => {
        expect(propLabelFontSize(rect(100, 100), 0, 20)).toBeNull();
        expect(propLabelFontSize(rect(100, 100), 100, 0)).toBeNull();
    });

    // ⭐ The containment guarantee, stated geometrically rather than by
    // reproducing the formula: the fitted label must fit INSIDE the footprint,
    // which for a circle means its corners stay within the radius. Fitting a
    // wide label against the bounding SQUARE would pass every scale assertion
    // above and still hang the name out over the edge of a round prop.
    it('keeps a fitted label inside a circle, corners included', () => {
        for (const [textWidth, textHeight] of [[100, 20], [300, 32], [60, 40], [40, 40]]) {
            const r = 120;
            const size = propLabelFontSize(circle(r), textWidth, textHeight);
            expect(size).not.toBeNull();

            const k = size / LABEL_REFERENCE_FONT_SIZE;
            const halfDiagonal = Math.sqrt(
                (textWidth * k / 2) ** 2 + (textHeight * k / 2) ** 2);
            expect(halfDiagonal).toBeLessThanOrEqual(r * LABEL_INSET + 1e-9);
        }
    });

    // The same guarantee for the other body form, where the box is the bound.
    it('keeps a fitted label inside a rect', () => {
        for (const [textWidth, textHeight] of [[100, 20], [300, 32], [60, 40]]) {
            const halfWidth = 90;
            const halfHeight = 45;
            const size = propLabelFontSize(rect(halfWidth, halfHeight), textWidth, textHeight);
            expect(size).not.toBeNull();

            const k = size / LABEL_REFERENCE_FONT_SIZE;
            expect(textWidth * k).toBeLessThanOrEqual(halfWidth * 2 * LABEL_INSET + 1e-9);
            expect(textHeight * k).toBeLessThanOrEqual(halfHeight * 2 * LABEL_INSET + 1e-9);
        }
    });

    // ⭐ And the reason the inscribed-RECTANGLE formula is worth its three
    // lines: names are far wider than they are tall, and the inscribed SQUARE
    // (r√2 on a side) would have thrown away most of the usable width.
    it('beats the inscribed square on a wide label', () => {
        const r = 120;
        const textWidth = 300;
        const textHeight = 32;
        const inscribedSquareSide = r * LABEL_INSET * Math.SQRT2;
        const squareFit = LABEL_REFERENCE_FONT_SIZE * Math.min(
            inscribedSquareSide / textWidth, inscribedSquareSide / textHeight);

        expect(propLabelFontSize(circle(r), textWidth, textHeight))
            .toBeGreaterThan(squareFit * 1.3);
    });
});
