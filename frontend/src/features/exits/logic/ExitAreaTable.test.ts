import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {
    distanceToPolygon, exitAreaPlacements, inscribedRadius, polygonArea, randomPointIn, runeStrokes, seedOf,
    sparkleCount,
    SPARKLE_MAX, SPARKLE_MIN, SPARKLE_PER_UNIT2, EXIT_PARTICLES, EXIT_SIGILS,
} from './ExitAreaTable';

const content = createRequire(__filename)('../../../../../tools/tiled/palette/content.json');

const square = [{x: 0, y: 0}, {x: 2, y: 0}, {x: 2, y: 2}, {x: 0, y: 2}];

describe('ExitAreaTable (plan-passages.md P5)', () => {
    it('places an area in pixels, origin applied, keyed like the door header', () => {
        const px = (u: number) => u * 120;
        const out = exitAreaPlacements([
            {id: 'glow-pit', points: square, anchor: 'below'},
            {points: square, anchor: 'above'},
        ], {x: 10, y: -5}, px);
        expect(out[0]).toEqual({
            key: 'glow-pit', sigil: EXIT_SIGILS[0], particles: EXIT_PARTICLES[0],
            points: square.map(p => ({x: (p.x + 10) * 120, y: (p.y - 5) * 120})),
            centroid: {x: 11 * 120, y: -4 * 120},
        });
        expect(out[1].key).toBe('@above');
    });

    // PO 2026-10-19: the sigil and the particles, the default when absent.
    it('carries the sigil and the particles an area picks', () => {
        const out = exitAreaPlacements([{points: square, anchor: 'a', sigil: 'none', particles: 'none'}],
            undefined, (u: number) => u);
        expect(out[0]).toMatchObject({sigil: 'none', particles: 'none'});
    });

    it('offers exactly what Tiled offers, the default first', () => {
        expect(content.ENUM_VALUES.AuraExitSigil).toEqual(EXIT_SIGILS);
        expect(content.ENUM_VALUES.AuraExitParticles).toEqual(EXIT_PARTICLES);
    });

    // Q4 (PO 2026-10-18): hidden hides the glow and the name.
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

    // PO 2026-10-19: the rising streaks, spread over the area and scaled by it.
    it('sizes the streaks by area, clamped both ways', () => {
        expect(polygonArea(square)).toBe(4);
        expect(polygonArea([...square].reverse())).toBe(4);
        expect(sparkleCount(polygonArea(square))).toBe(Math.round(4 * SPARKLE_PER_UNIT2));
        expect(sparkleCount(0)).toBe(SPARKLE_MIN);
        expect(sparkleCount(1e6)).toBe(SPARKLE_MAX);
    });

    // PO 2026-10-19: the rune circle fits inside the area, and keeps its runes.
    it('fits a circle to the nearest edge', () => {
        expect(inscribedRadius({x: 1, y: 1}, square)).toBe(1);
        expect(inscribedRadius({x: 0.5, y: 1}, square)).toBe(0.5);
    });

    it('draws the same runes for the same seed, each a stave plus one or two strokes', () => {
        expect(runeStrokes(seedOf('glow-pit'))).toEqual(runeStrokes(seedOf('glow-pit')));
        for (let i = 0; i < 50; i++) {
            const strokes = runeStrokes(i);
            expect(strokes[0]).toEqual([0.5, 0, 0.5, 1]);
            expect(strokes.length).toBeGreaterThanOrEqual(2);
            expect(strokes.length).toBeLessThanOrEqual(3);
            for (const [x1, y1, x2, y2] of strokes) {
                expect(x1 !== x2 || y1 !== y2, 'no zero-length stroke').toBe(true);
            }
        }
    });

    it('drops a streak inside the area, even a concave one', () => {
        // An L: the bounding box's top-right quarter is outside.
        const l = [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}, {x: 2, y: 1}, {x: 2, y: 2}, {x: 0, y: 2}];
        let seed = 1;
        const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 200; i++) {
            expect(distanceToPolygon(randomPointIn(l, random), l)).toBe(0);
        }
    });
});
