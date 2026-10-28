import {describe, expect, it} from 'vitest';
import {
    AppliedEffectBit,
    CAMOUFLAGE_ALPHA,
    INDICATOR_GAP,
    STATE_ROWS,
    STEALTH_ALPHA,
    indicatorBand,
    indicatorDiameter,
    indicatorOffset,
    indicatorRadius,
    tokenState,
} from './TokenState';

// The state table (plan-entity-presentation.md D1, D2): every state an actor
// is in is one row, and a row with an angle owns that position on the
// medallion's rim for good (R5).
const bits = Object.values(AppliedEffectBit).filter((v): v is AppliedEffectBit => typeof v === 'number');
const indicatorRows = STATE_ROWS.filter(row => row.angle !== undefined);
const rowOf = (source: AppliedEffectBit | 'dead') => STATE_ROWS.find(row => row.source === source);

describe('STATE_ROWS', () => {
    it('gives every AppliedEffectBit exactly one row, plus dead', () => {
        for (const bit of bits) {
            expect(STATE_ROWS.filter(row => row.source === bit), AppliedEffectBit[bit]).toHaveLength(1);
        }
        expect(STATE_ROWS.filter(row => row.source === 'dead')).toHaveLength(1);
        expect(STATE_ROWS).toHaveLength(bits.length + 1);
    });

    it('puts every indicator on the 22.5° grid, each at its own angle', () => {
        for (const row of indicatorRows) {
            expect(row.angle % 22.5, row.id).toBe(0);
            expect(row.angle, row.id).toBeGreaterThanOrEqual(0);
            expect(row.angle, row.id).toBeLessThan(360);
        }
        const angles = indicatorRows.map(row => row.angle);
        expect(new Set(angles).size).toBe(angles.length);
    });

    // R6 / D2: harmful to the wearer on the right, helpful on the left; calm
    // and charm are done to a mob against its will (the tray's D13 rule).
    it('sorts harmful states to the right half and helpful ones to the left', () => {
        const harmful = [AppliedEffectBit.Dot, AppliedEffectBit.Slow, AppliedEffectBit.StatDown,
            AppliedEffectBit.Fear, AppliedEffectBit.Calm, AppliedEffectBit.Charm];
        const helpful = [AppliedEffectBit.Hot, AppliedEffectBit.Speed, AppliedEffectBit.StatUp,
            AppliedEffectBit.Resist, AppliedEffectBit.Reflect, AppliedEffectBit.TickRate];
        for (const bit of harmful) {
            const angle = rowOf(bit).angle;
            expect(angle > 0 && angle < 180, AppliedEffectBit[bit]).toBe(true);
        }
        for (const bit of helpful) {
            const angle = rowOf(bit).angle;
            expect(angle > 180 && angle < 360, AppliedEffectBit[bit]).toBe(true);
        }
        // Every indicator bit is named above: a new one must pick its side here.
        expect(harmful.length + helpful.length).toBe(indicatorRows.filter(row => row.source !== 'dead').length);
    });

    it('pins the D2 angles', () => {
        expect(rowOf(AppliedEffectBit.Dot).angle).toBe(22.5);
        expect(rowOf(AppliedEffectBit.Slow).angle).toBe(45);
        expect(rowOf(AppliedEffectBit.StatDown).angle).toBe(67.5);
        expect(rowOf(AppliedEffectBit.Fear).angle).toBe(90);
        expect(rowOf(AppliedEffectBit.Calm).angle).toBe(112.5);
        expect(rowOf(AppliedEffectBit.Charm).angle).toBe(135);
        expect(rowOf(AppliedEffectBit.Hot).angle).toBe(337.5);
        expect(rowOf(AppliedEffectBit.Speed).angle).toBe(315);
        expect(rowOf(AppliedEffectBit.StatUp).angle).toBe(292.5);
        expect(rowOf(AppliedEffectBit.Resist).angle).toBe(270);
        expect(rowOf(AppliedEffectBit.Reflect).angle).toBe(247.5);
        expect(rowOf(AppliedEffectBit.TickRate).angle).toBe(225);
    });

    it('keeps 12 o\'clock free for stun (EP2)', () => {
        expect(indicatorRows.some(row => row.angle === 0)).toBe(false);
    });

    it('makes dead an indicator at 180° that also greys, with the skull glyph', () => {
        const dead = rowOf('dead');
        expect(dead.angle).toBe(180);
        expect(dead.treatment?.grey).toBe(true);
        expect(dead.glyph?.packIcon).toBeTruthy();
        expect(dead.colour).toBeDefined();
    });

    it('makes stealth a treatment only, at the stealth alpha', () => {
        const stealth = rowOf(AppliedEffectBit.Stealth);
        expect(stealth.angle).toBeUndefined();
        expect(stealth.treatment?.alpha).toBe(STEALTH_ALPHA);
        expect(STEALTH_ALPHA).toBeLessThan(1);
    });

    it('gives every indicator a fallback colour (R12)', () => {
        for (const row of indicatorRows) {
            expect(row.colour, row.id).toBeTypeOf('number');
        }
    });
});

describe('tokenState', () => {
    it('is plain for nothing applied', () => {
        const state = tokenState(0, false);
        expect(state.alpha).toBe(1);
        expect(state.grey).toBe(false);
        expect(state.indicators).toEqual([]);
    });

    it('fades a stealthed token and shows no indicator for it', () => {
        const state = tokenState(AppliedEffectBit.Stealth, false);
        expect(state.alpha).toBe(STEALTH_ALPHA);
        expect(state.grey).toBe(false);
        expect(state.indicators).toEqual([]);
        expect(tokenState(AppliedEffectBit.Stealth | AppliedEffectBit.Dot, false).alpha).toBe(STEALTH_ALPHA);
        expect(tokenState(AppliedEffectBit.Slow | AppliedEffectBit.Fear, false).alpha).toBe(1);
    });

    // content-zone-7-swamp.md E2: the bog frog at its spawn point.
    it('fades a camouflaged mob fainter than stealth, never to nothing, with no indicator', () => {
        const state = tokenState(AppliedEffectBit.Camouflage, false);
        expect(state.alpha).toBe(CAMOUFLAGE_ALPHA);
        expect(state.indicators).toEqual([]);
        expect(CAMOUFLAGE_ALPHA).toBeGreaterThan(0);
        expect(CAMOUFLAGE_ALPHA).toBeLessThan(STEALTH_ALPHA);
    });

    it('greys a dead token and shows the skull', () => {
        const state = tokenState(0, true);
        expect(state.grey).toBe(true);
        expect(state.alpha).toBe(1);
        expect(state.indicators).toEqual([rowOf('dead')]);
    });

    it('shows every indicator of a full mask, once each', () => {
        const full = bits.reduce((mask, bit) => mask | bit, 0);
        const state = tokenState(full, false);
        expect(state.alpha).toBe(Math.min(STEALTH_ALPHA, CAMOUFLAGE_ALPHA));
        expect(state.indicators).toHaveLength(indicatorRows.length - 1);
        expect(state.indicators.map(row => row.source)).not.toContain('dead');
    });

    it('carries its inputs, so a consumer can tell two states apart', () => {
        const state = tokenState(AppliedEffectBit.Dot, true);
        expect(state.mask).toBe(AppliedEffectBit.Dot);
        expect(state.dead).toBe(true);
    });
});

// D4: the indicators sit on a circle just outside the ring, which spans
// ±size (createInjectedSVG doubles its size argument).
describe('indicator geometry', () => {
    it('measures angles clockwise from 12 o\'clock, y down', () => {
        const at = (angle: number) => {
            const {x, y} = indicatorOffset(angle, 10);
            // `+ 0` folds -0 into 0 (toEqual tells them apart).
            return {x: Math.round(x * 1000) / 1000 + 0, y: Math.round(y * 1000) / 1000 + 0};
        };
        expect(at(0)).toEqual({x: 0, y: -10});
        expect(at(90)).toEqual({x: 10, y: 0});
        expect(at(180)).toEqual({x: 0, y: 10});
        expect(at(270)).toEqual({x: -10, y: 0});
    });

    it('keeps the whole band outside the ring', () => {
        for (const size of [10, 26, 30, 46, 96]) {
            const diameter = indicatorDiameter(size);
            const radius = indicatorRadius(size);
            expect(radius - diameter / 2, `size ${size}`).toBeCloseTo(size + INDICATOR_GAP, 10);
            expect(indicatorBand(size), `size ${size}`).toBeCloseTo(radius + diameter / 2 - size, 10);
        }
    });

    it('caps the diameter, shrinks it to the arc on small tokens, and floors it', () => {
        expect(indicatorDiameter(96)).toBe(12);
        // The smallest medallion (maxSize 26): 0.85 × (26 + 3) × π/8.
        expect(indicatorDiameter(26)).toBeCloseTo(0.85 * 29 * Math.PI / 8, 10);
        expect(indicatorDiameter(26)).toBeLessThan(12);
        expect(indicatorDiameter(2)).toBe(6);
    });

    // Two neighbours on the 22.5° grid never touch while the arc rule holds.
    it('keeps neighbouring indicators apart on the grid', () => {
        for (const size of [26, 30, 46, 96]) {
            const a = indicatorOffset(0, indicatorRadius(size));
            const b = indicatorOffset(22.5, indicatorRadius(size));
            expect(Math.hypot(a.x - b.x, a.y - b.y), `size ${size}`).toBeGreaterThan(indicatorDiameter(size));
        }
    });
});
