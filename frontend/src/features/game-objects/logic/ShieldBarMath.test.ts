import {describe, it, expect} from 'vitest';
import {shieldBarSegments} from './ShieldBarMath';

// N1 (plan-feel-pass-2.md §5): the bar's denominator is total effective HP —
// max(maxHealth, health + shield) — so a shield larger than the pool no longer
// paints the whole bar, and a bar without shield overflow renders exactly as
// before.
describe('shieldBarSegments', () => {
    it('renders a shield smaller than the pool at pool scale', () => {
        // Damaged player, small shield: nothing overflows, so the pool stays
        // the denominator and the missing-Focus gap stays visible.
        const s = shieldBarSegments(50, 20, 100);
        expect(s.healthFraction).toBeCloseTo(0.5);
        expect(s.shieldFraction).toBeCloseTo(0.2);
    });

    it('fills the bar exactly when health + shield equal the pool', () => {
        const s = shieldBarSegments(50, 50, 100);
        expect(s.healthFraction).toBeCloseTo(0.5);
        expect(s.shieldFraction).toBeCloseTo(0.5);
    });

    it('rescales both segments when the shield exceeds the pool (the reported case)', () => {
        // Level-30 Warbanner on a level-1 target: 100 Focus under a 200
        // shield reads 1/3 Focus, 2/3 shield — not a solid shield bar.
        const s = shieldBarSegments(100, 200, 100);
        expect(s.healthFraction).toBeCloseTo(1 / 3);
        expect(s.shieldFraction).toBeCloseTo(2 / 3);
    });

    it('leaves the plain health bar untouched without a shield', () => {
        const s = shieldBarSegments(70, 0, 100);
        expect(s.healthFraction).toBeCloseTo(0.7);
        expect(s.shieldFraction).toBe(0);
    });

    it('keeps a small shield on a full bar visible without overlap', () => {
        // The case the old slide-left existed for: full pool + shield. Under
        // the sum denominator the shield has room by construction.
        const s = shieldBarSegments(100, 20, 100);
        expect(s.healthFraction).toBeCloseTo(100 / 120);
        expect(s.shieldFraction).toBeCloseTo(20 / 120);
        expect(s.healthFraction + s.shieldFraction).toBeCloseTo(1);
    });

    it('never lets the segments exceed the bar', () => {
        for (const [h, sh, max] of [[100, 200, 100], [1, 1000, 100], [100, 0, 100], [50, 50, 100], [0, 30, 100]]) {
            const s = shieldBarSegments(h, sh, max);
            expect(s.healthFraction + s.shieldFraction).toBeLessThanOrEqual(1 + 1e-9);
            expect(s.healthFraction).toBeGreaterThanOrEqual(0);
            expect(s.shieldFraction).toBeGreaterThanOrEqual(0);
        }
    });

    it('returns empty segments for a non-positive pool', () => {
        expect(shieldBarSegments(50, 20, 0)).toEqual({healthFraction: 0, shieldFraction: 0});
        expect(shieldBarSegments(50, 20, -1)).toEqual({healthFraction: 0, shieldFraction: 0});
    });

    it('clamps negative inputs to zero', () => {
        const s = shieldBarSegments(-5, -5, 100);
        expect(s).toEqual({healthFraction: 0, shieldFraction: 0});
    });
});
