import {describe, expect, it} from 'vitest';
import {meter2px} from '../../../client-data/BasicConfig';
import naveJson from '../../../../../api/props/cathedral-nave-roof.json';
import transeptJson from '../../../../../api/props/cathedral-transept-roof.json';
import apseJson from '../../../../../api/props/cathedral-apse-roof.json';
import {PropBodyJSON, propFootprint} from './PropPlaceholderLayout';
import {contains, FADE_MS, RoofShape, roofsToReveal, stepAlpha, touching} from './RoofReveal';

// Pins for the roof reveal (plan-roof-props.md): which roofs open when the
// local player stands at a point, and how the opacity eases there.

function rect(id: number, x: number, y: number, halfWidth: number, halfHeight: number, rotation = 0): RoofShape {
    return {id, x, y, rotation, footprint: {isRect: true, halfWidth, halfHeight}};
}

function circle(id: number, x: number, y: number, radius: number): RoofShape {
    return {id, x, y, rotation: 0, footprint: {isRect: false, halfWidth: radius, halfHeight: radius}};
}

describe('contains', () => {
    it('tests a rect against its half-extents', () => {
        const roof = rect(1, 100, 100, 240, 180);
        expect(contains(roof, {x: 100, y: 100})).toBe(true);
        expect(contains(roof, {x: 339, y: 279})).toBe(true);
        expect(contains(roof, {x: 341, y: 100})).toBe(false);
        expect(contains(roof, {x: 100, y: 281})).toBe(false);
    });

    it('turns the point into the roof frame, so a rotated rect covers its turned footprint', () => {
        // 200 × 20 half-extents, turned a quarter: now tall, not wide.
        const roof = rect(1, 0, 0, 200, 20, Math.PI / 2);
        expect(contains(roof, {x: 0, y: 150})).toBe(true);
        expect(contains(roof, {x: 150, y: 0})).toBe(false);
    });

    it('tests a circle by radius, not by its bounding square', () => {
        const roof = circle(1, 0, 0, 100);
        expect(contains(roof, {x: 70, y: 70})).toBe(true);
        expect(contains(roof, {x: 80, y: 80})).toBe(false);
    });
});

describe('touching', () => {
    it('counts overlapping and edge-to-edge pieces as touching', () => {
        expect(touching(rect(1, 0, 0, 100, 100), rect(2, 150, 0, 100, 100))).toBe(true);
        expect(touching(rect(1, 0, 0, 100, 100), rect(2, 200, 0, 100, 100))).toBe(true);
    });

    it('forgives a hairline gap but not a real one', () => {
        expect(touching(rect(1, 0, 0, 100, 100), rect(2, 204, 0, 100, 100))).toBe(true);
        expect(touching(rect(1, 0, 0, 100, 100), rect(2, 260, 0, 100, 100))).toBe(false);
    });

    it('uses the turned bounds of a rotated piece', () => {
        // 200 × 20 turned a quarter reaches 200 down, 20 across.
        const turned = rect(1, 0, 0, 200, 20, Math.PI / 2);
        expect(touching(turned, rect(2, 0, 290, 100, 100))).toBe(true);
        expect(touching(turned, rect(2, 150, 0, 100, 100))).toBe(false);
    });
});

describe('roofsToReveal', () => {
    it('reveals nothing without a player', () => {
        expect(roofsToReveal([rect(1, 0, 0, 100, 100)], null).size).toBe(0);
    });

    it('reveals nothing when the player stands under no roof', () => {
        expect(roofsToReveal([rect(1, 0, 0, 100, 100)], {x: 500, y: 500}).size).toBe(0);
    });

    it('reveals the roof above the player and every piece touching it, transitively', () => {
        // An L of three pieces, plus a separate house down the road.
        const roofs = [
            rect(1, 0, 0, 100, 100),
            rect(2, 200, 0, 100, 100),
            rect(3, 200, 200, 100, 100),
            rect(4, 1000, 0, 100, 100),
        ];
        expect([...roofsToReveal(roofs, {x: 0, y: 0})].sort()).toEqual([1, 2, 3]);
        expect([...roofsToReveal(roofs, {x: 1000, y: 0})]).toEqual([4]);
    });

    // plan-city-assets.md K2: the cathedral's three roof pieces, laid flush
    // north to south (nave, transept across its south end, apse beyond),
    // open as one building from any of them. Sizes come from the defs.
    it('opens the cathedral whole when its three pieces sit flush', () => {
        // The streamed size is PropBody.VisualRadius() in px: the max
        // half-extent of a rect, the radius of a circle.
        const piece = (id: number, body: PropBodyJSON, x: number, y: number): RoofShape => {
            const size = meter2px(body.radius ?? Math.max(body.width, body.height) / 2);
            return {id, x, y, rotation: 0, footprint: propFootprint(body, size)};
        };
        const naveHalf = meter2px(naveJson.body.height / 2);
        const transeptHalf = meter2px(transeptJson.body.height / 2);
        const transeptY = naveHalf + transeptHalf;
        const apseHalf = meter2px(apseJson.body.height / 2);
        const apseY = transeptY + transeptHalf + apseHalf;
        const nave = piece(1, naveJson.body, 0, 0);
        const transept = piece(2, transeptJson.body, 0, transeptY);
        const apse = piece(3, apseJson.body, 0, apseY);
        // A chapel a street (3 m) east of the transept stays shut.
        const transeptEnd = meter2px(transeptJson.body.width / 2);
        const chapel = piece(4, apseJson.body, transeptEnd + meter2px(3) + apseHalf, transeptY);
        const roofs = [nave, transept, apse, chapel];
        // The apse art's square-cornered chancel meets the transept; a circle
        // body left its two corners outside every piece, so standing there
        // opened nothing (the apse is a square body since).
        const chancelCorner = {x: apseHalf * 0.9, y: apseY - apseHalf * 0.9};

        for (const standAt of [nave, transept, apse, chancelCorner]) {
            expect([...roofsToReveal(roofs, standAt)].sort()).toEqual([1, 2, 3]);
        }
    });
});

describe('stepAlpha', () => {
    it('crosses the full range in FADE_MS', () => {
        expect(stepAlpha(1, 0, FADE_MS / 2)).toBeCloseTo(0.5);
        expect(stepAlpha(1, 0, FADE_MS)).toBe(0);
        expect(stepAlpha(0, 1, FADE_MS / 4)).toBeCloseTo(0.25);
    });

    it('stops at the target instead of overshooting', () => {
        expect(stepAlpha(0.3, 0.25, FADE_MS)).toBe(0.25);
        expect(stepAlpha(0.9, 1, FADE_MS)).toBe(1);
        expect(stepAlpha(0.25, 0.25, 16)).toBe(0.25);
    });
});
