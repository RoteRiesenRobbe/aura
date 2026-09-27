import {describe, expect, it} from 'vitest';
import {
    RADAR_DEFAULT_M, RADAR_STEPS_M, WHEEL_IDLE, WHEEL_IDLE_MS, WHEEL_STEP_PX,
    accumulateWheel, canStepRadar, snapRadarDiameter, stepRadar,
} from './RadarZoom';
import {GROUND_RING_REACH_M} from './MapScale';
import {DevicePrefs} from '../../common/logic/DevicePrefs';

const NEAREST = RADAR_STEPS_M[0];
const WIDEST = RADAR_STEPS_M[RADAR_STEPS_M.length - 1];

describe('the step table', () => {
    it('is ordered nearest first and holds the default', () => {
        expect([...RADAR_STEPS_M].sort((a, b) => a - b)).toEqual([...RADAR_STEPS_M]);
        expect(RADAR_STEPS_M).toContain(RADAR_DEFAULT_M);
    });

    it('never outgrows the ground ring past the zone edge (D7)', () => {
        expect(GROUND_RING_REACH_M).toBeGreaterThanOrEqual(WIDEST / 2);
    });
});

describe('stepRadar', () => {
    it('walks the table both ways', () => {
        const i = RADAR_STEPS_M.indexOf(RADAR_DEFAULT_M);
        expect(stepRadar(RADAR_DEFAULT_M, -1)).toBe(RADAR_STEPS_M[i - 1]);
        expect(stepRadar(RADAR_DEFAULT_M, 1)).toBe(RADAR_STEPS_M[i + 1]);
    });

    it('clamps at both ends', () => {
        expect(stepRadar(NEAREST, -1)).toBe(NEAREST);
        expect(stepRadar(WIDEST, 1)).toBe(WIDEST);
        expect(canStepRadar(NEAREST, -1)).toBe(false);
        expect(canStepRadar(WIDEST, 1)).toBe(false);
        expect(canStepRadar(RADAR_DEFAULT_M, -1)).toBe(true);
    });

    it('snaps an off-table value before stepping', () => {
        expect(stepRadar(WIDEST * 10, -1)).toBe(RADAR_STEPS_M[RADAR_STEPS_M.length - 2]);
    });
});

describe('snapRadarDiameter', () => {
    it('keeps a step as it is', () => {
        RADAR_STEPS_M.forEach(step => expect(snapRadarDiameter(step)).toBe(step));
    });

    it('reads the stored string form', () => {
        expect(snapRadarDiameter(String(WIDEST))).toBe(WIDEST);
    });

    it('maps a retuned-away value to its nearest step', () => {
        expect(snapRadarDiameter(NEAREST - 1)).toBe(NEAREST);
        expect(snapRadarDiameter(WIDEST * 3)).toBe(WIDEST);
    });

    it('falls back to the default on anything unreadable', () => {
        [null, undefined, '', 'banana', NaN, Infinity, -50, 0, {}].forEach(value =>
            expect(snapRadarDiameter(value)).toBe(RADAR_DEFAULT_M));
    });
});

describe('accumulateWheel', () => {
    it('makes one mouse notch one step, down = out', () => {
        expect(accumulateWheel(WHEEL_IDLE, 100, 0, 1000).step).toBe(1);
        expect(accumulateWheel(WHEEL_IDLE, -100, 0, 1000).step).toBe(-1);
    });

    it('drops the remainder, so a 120 px notch is still one step', () => {
        const {state, step} = accumulateWheel(WHEEL_IDLE, 120, 0, 1000);
        expect(step).toBe(1);
        expect(accumulateWheel(state, 20, 0, 1010).step).toBe(0);
    });

    it('banks small trackpad deltas until they add up to a step', () => {
        let state = WHEEL_IDLE;
        const steps: number[] = [];
        for (let i = 0; i < 10; i++) {
            const r = accumulateWheel(state, WHEEL_STEP_PX / 10 + 0.5, 0, 1000 + i * 16);
            state = r.state;
            steps.push(r.step);
        }
        expect(steps.filter(s => s !== 0)).toEqual([1]);
    });

    it('forgets banked travel after a pause', () => {
        const half = accumulateWheel(WHEEL_IDLE, 60, 0, 1000).state;
        expect(accumulateWheel(half, 60, 0, 1000 + WHEEL_IDLE_MS + 1).step).toBe(0);
        expect(accumulateWheel(half, 60, 0, 1000 + 50).step).toBe(1);
    });

    it('starts over on a reversal instead of undoing the banked travel', () => {
        const half = accumulateWheel(WHEEL_IDLE, 60, 0, 1000).state;
        expect(accumulateWheel(half, -100, 0, 1010).step).toBe(-1);
    });

    it('reads line and page units', () => {
        expect(accumulateWheel(WHEEL_IDLE, 3, 1, 1000).step).toBe(1);   // 3 lines
        expect(accumulateWheel(WHEEL_IDLE, -1, 2, 1000).step).toBe(-1); // a page
    });

    it('ignores a zero or non-finite delta', () => {
        expect(accumulateWheel(WHEEL_IDLE, 0, 0, 1000)).toEqual({state: WHEEL_IDLE, step: 0});
        expect(accumulateWheel(WHEEL_IDLE, NaN, 0, 1000).step).toBe(0);
    });
});

describe('the remembered step (D11)', () => {
    it('round-trips through DevicePrefs', () => {
        DevicePrefs.radarDiameterM = String(WIDEST);
        expect(snapRadarDiameter(DevicePrefs.radarDiameterM)).toBe(WIDEST);
        localStorage.removeItem('radarDiameterM');
        expect(snapRadarDiameter(DevicePrefs.radarDiameterM)).toBe(RADAR_DEFAULT_M);
    });

    it('survives a storage that throws', () => {
        const original = Storage.prototype.getItem;
        Storage.prototype.getItem = () => { throw new Error('denied'); };
        try {
            expect(snapRadarDiameter(DevicePrefs.radarDiameterM)).toBe(RADAR_DEFAULT_M);
        } finally {
            Storage.prototype.getItem = original;
        }
    });
});
