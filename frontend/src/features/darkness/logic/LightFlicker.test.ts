import {describe, expect, it} from 'vitest';
import {flicker, flickerNoise} from './LightFlicker';

describe('flickerNoise (plan-lightmap.md D12)', () => {
    it('stays within -1..1', () => {
        for (let t = 0; t < 20_000; t += 7.3) {
            const n = flickerNoise(t, 11);
            expect(n).toBeGreaterThanOrEqual(-1);
            expect(n).toBeLessThanOrEqual(1);
        }
    });

    it('is continuous: one 60 fps frame moves it only a little', () => {
        let worst = 0;
        for (let t = 0; t < 20_000; t += 16.7) {
            worst = Math.max(worst, Math.abs(flickerNoise(t + 16.7, 5) - flickerNoise(t, 5)));
        }
        expect(worst).toBeLessThan(0.5);
    });

    it('actually moves: a fire is not steady', () => {
        const values = Array.from({length: 200}, (_, i) => flickerNoise(i * 50, 3));
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
    });

    it('is deterministic per seed, and two seeds pulse apart', () => {
        expect(flickerNoise(1234, 9)).toBe(flickerNoise(1234, 9));
        const apart = Array.from({length: 50}, (_, i) => Math.abs(flickerNoise(i * 97, 1) - flickerNoise(i * 97, 2)));
        expect(Math.max(...apart)).toBeGreaterThan(0.2);
    });
});

describe('flicker', () => {
    it('wobbles the size around 1 and only ever dims the light', () => {
        for (let t = 0; t < 10_000; t += 13) {
            const f = flicker(t, 4, 0.03, 0.06);
            expect(f.size).toBeGreaterThanOrEqual(0.97);
            expect(f.size).toBeLessThanOrEqual(1.03);
            expect(f.alpha).toBeGreaterThanOrEqual(0.94);
            expect(f.alpha).toBeLessThanOrEqual(1);
        }
    });

    it('zero amplitude is a steady light', () => {
        expect(flicker(777, 4, 0, 0)).toEqual({size: 1, alpha: 1});
    });
});
