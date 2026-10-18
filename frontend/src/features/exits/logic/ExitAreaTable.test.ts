import {describe, expect, it} from 'vitest';
import {distanceToPolygon, exitAreaPlacements} from './ExitAreaTable';
import {DEFAULT_EXIT_LOOK} from './ExitLookTable';

const square = [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}];

describe('ExitAreaTable (plan-passages.md P5)', () => {
    it('places an area in pixels, origin applied, keyed like the door header', () => {
        const px = (u: number) => u * 120;
        const out = exitAreaPlacements([
            {id: 'glow-pit', points: square, anchor: 'below', look: 'stairs-down'},
            {points: square, anchor: 'above'},
        ], {x: 10, y: -5}, px);
        expect(out[0]).toEqual({
            key: 'glow-pit', look: 'stairs-down',
            points: square.map(p => ({x: (p.x + 10) * 120, y: (p.y - 5) * 120})),
            centroid: {x: 11 * 120, y: -4 * 120},
        });
        expect(out[1].key).toBe('@above');
        expect(out[1].look).toBe(DEFAULT_EXIT_LOOK);
    });

    // Q4 (PO 2026-10-18): hidden hides the glow, the look and the name.
    it('draws nothing for a hidden area or one with no inside', () => {
        const px = (u: number) => u;
        expect(exitAreaPlacements([
            {points: square, anchor: 'a', hidden: true},
            {points: square.slice(0, 2), anchor: 'b'},
        ], undefined, px)).toEqual([]);
        expect(exitAreaPlacements(undefined, undefined, px)).toEqual([]);
    });

    it('measures to the edge, and 0 inside', () => {
        expect(distanceToPolygon({x: 1, y: 1}, square)).toBe(0);
        expect(distanceToPolygon({x: 5, y: 1}, square)).toBeCloseTo(3);
        expect(distanceToPolygon({x: 5, y: 6}, square)).toBeCloseTo(5);
    });
});
