import {describe, it, expect} from 'vitest';
import {createSweepMemory, sweepFraction} from './CooldownSweep';

describe('CooldownSweep', () => {
    it('reports a ready slot as zero', () => {
        const mem = createSweepMemory();
        expect(sweepFraction(mem, 0, 7, 0)).toBe(0);
    });

    it('treats the first tick of a cooldown as full', () => {
        const mem = createSweepMemory();
        expect(sweepFraction(mem, 0, 7, 900)).toBe(1);
    });

    it('measures every later tick against that first one', () => {
        const mem = createSweepMemory();
        sweepFraction(mem, 0, 7, 900);
        expect(sweepFraction(mem, 0, 7, 450)).toBeCloseTo(0.5);
        expect(sweepFraction(mem, 0, 7, 90)).toBeCloseTo(0.1);
    });

    it('forgets the length once the cooldown ends, so the next one starts full', () => {
        const mem = createSweepMemory();
        sweepFraction(mem, 0, 7, 900);
        sweepFraction(mem, 0, 7, 100);
        expect(sweepFraction(mem, 0, 7, 0)).toBe(0);
        // A SHORTER cooldown next time must still start at a full wedge - it
        // would read as 0.33 if the old peak survived.
        expect(sweepFraction(mem, 0, 7, 300)).toBe(1);
    });

    it('re-baselines when the slot changes hands mid-cooldown', () => {
        const mem = createSweepMemory();
        sweepFraction(mem, 1, 7, 900);
        sweepFraction(mem, 1, 7, 450);
        expect(sweepFraction(mem, 1, 12, 300)).toBe(1);
        expect(sweepFraction(mem, 1, 12, 150)).toBeCloseTo(0.5);
    });

    it('re-baselines when the remaining rises above the recorded peak', () => {
        const mem = createSweepMemory();
        sweepFraction(mem, 2, 7, 300);
        expect(sweepFraction(mem, 2, 7, 900)).toBe(1);
        expect(sweepFraction(mem, 2, 7, 450)).toBeCloseTo(0.5);
    });

    it('keeps slots independent', () => {
        const mem = createSweepMemory();
        sweepFraction(mem, 0, 7, 900);
        sweepFraction(mem, 1, 8, 300);
        expect(sweepFraction(mem, 0, 7, 450)).toBeCloseTo(0.5);
        expect(sweepFraction(mem, 1, 8, 150)).toBeCloseTo(0.5);
    });

    it('never returns outside 0..1 for a nonsensical value', () => {
        const mem = createSweepMemory();
        expect(sweepFraction(mem, 0, 7, -5)).toBe(0);
        expect(sweepFraction(mem, 0, 7, Number.NaN)).toBe(0);
    });
});
