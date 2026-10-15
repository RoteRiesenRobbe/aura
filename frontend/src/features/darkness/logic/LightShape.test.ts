import {describe, expect, it} from 'vitest';
import {fadeStops, normalizeShape} from './LightShape';

describe('fadeStops (plan-lightmap.md D10: the curve lives in the texture)', () => {
    it('is exactly today\'s two-stop linear ramp at curve 0', () => {
        expect(fadeStops(0)).toEqual([{offset: 0, alpha: 1}, {offset: 1, alpha: 0}]);
    });

    it('samples smoothstep at curve 1, from fully lit to nothing', () => {
        const stops = fadeStops(1);
        expect(stops.length).toBeGreaterThan(2);
        expect(stops[0]).toEqual({offset: 0, alpha: 1});
        expect(stops[stops.length - 1]).toEqual({offset: 1, alpha: 0});
        const quarter = stops.find(s => s.offset === 0.25);
        // smoothstep(0.25) = 0.15625, so the light is still 84 % there.
        expect(quarter.alpha).toBeCloseTo(1 - 0.15625, 6);
    });

    it('only ever fades: alpha never rises toward the rim', () => {
        for (const curve of [0.25, 0.5, 1]) {
            const stops = fadeStops(curve);
            for (let i = 1; i < stops.length; i++) {
                expect(stops[i].alpha).toBeLessThanOrEqual(stops[i - 1].alpha);
                expect(stops[i].offset).toBeGreaterThan(stops[i - 1].offset);
            }
        }
    });

    it('blends linear and smoothstep in between', () => {
        const quarter = fadeStops(0.5).find(s => s.offset === 0.25);
        expect(quarter.alpha).toBeCloseTo(1 - (0.5 * 0.25 + 0.5 * 0.15625), 6);
    });
});

describe('normalizeShape', () => {
    it('keeps every knob within 0..1', () => {
        expect(normalizeShape({heart: -1, core: 2, curve: 7})).toEqual({heart: 0, core: 1, curve: 1});
    });

    it('fills what the caller did not name from the current shape', () => {
        const current = {heart: 0.2, core: 0.55, curve: 0};
        expect(normalizeShape({curve: 1}, current)).toEqual({heart: 0.2, core: 0.55, curve: 1});
    });

    it('ignores a value that is not a number', () => {
        const current = {heart: 0.2, core: 0.55, curve: 0};
        expect(normalizeShape({heart: 'big' as unknown as number}, current)).toEqual(current);
    });
});
