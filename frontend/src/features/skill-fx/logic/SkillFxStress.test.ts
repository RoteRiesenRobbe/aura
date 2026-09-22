import {describe, expect, it} from 'vitest';
import {estimateLiveFx, eventLifetimeMs, restrictToIds, stressSchedule} from './SkillFxStress';
import {BEAM_CURVE_MS, flightMs, HIT_MARK_MS, WAVE_DEFAULT_MS} from './SkillFxMath';

/**
 * The stress driver's only arithmetic (plan-skill-vfx.md §12e.4): how many
 * synthetic events a frame owes for a requested rate, and what fraction of an
 * event it carries into the next one.
 *
 * It is pinned because the whole of C4's table hangs on the driver actually
 * DELIVERING the rate it was asked for: a scheduler that dropped its remainder
 * would quietly under-run 10x into something nearer 7x and every number in the
 * table would be a measurement of the wrong load.
 */
describe('stressSchedule', () => {
    it('delivers exactly the requested rate over a second of fixed frames', () => {
        let carry = 0;
        let total = 0;
        for (let frame = 0; frame < 20; frame++) {
            const step = stressSchedule(10, 50, carry);
            total += step.count;
            carry = step.carry;
        }
        expect(total).toBe(10);
    });

    it('carries the remainder rather than dropping it', () => {
        const first = stressSchedule(3, 100, 0);
        expect(first.count).toBe(0);
        expect(first.carry).toBeCloseTo(0.3, 6);

        const second = stressSchedule(3, 100, first.carry);
        expect(second.count).toBe(0);
        expect(second.carry).toBeCloseTo(0.6, 6);

        // The fourth tenth is the one that owes an event.
        const third = stressSchedule(3, 100, second.carry);
        const fourth = stressSchedule(3, 100, third.carry);
        expect(fourth.count).toBe(1);
        expect(fourth.carry).toBeCloseTo(0.2, 6);
    });

    it('hands a long frame everything that frame owes, unclamped', () => {
        // A headless page runs ~3 frames a second; clamping here would hide
        // the batch size the manager really sees and flatter every number.
        expect(stressSchedule(40, 300, 0).count).toBe(12);
    });

    it('schedules nothing for a rate of zero or less', () => {
        expect(stressSchedule(0, 100, 0)).toEqual({count: 0, carry: 0});
        expect(stressSchedule(-5, 100, 0)).toEqual({count: 0, carry: 0});
    });

    it('schedules nothing on a bad delta, and the carry survives it', () => {
        expect(stressSchedule(10, NaN, 0.5)).toEqual({count: 0, carry: 0.5});
        expect(stressSchedule(10, -16, 0.5)).toEqual({count: 0, carry: 0.5});
        expect(stressSchedule(10, 0, 0.5)).toEqual({count: 0, carry: 0.5});
    });

    it('starts from zero when handed a bad carry', () => {
        expect(stressSchedule(10, 100, NaN).count).toBe(1);
    });
});

/**
 * The transferable half of C4's ceiling leg (§12e.5 leg 7): how many Fx a
 * steady event rate holds alive. The measured `liveMax` of a headless page is
 * shaped by its ~3 fps - a second of events arrives as one batch - so the
 * table prints this estimate beside it.
 */
describe('eventLifetimeMs', () => {
    it('counts an authored duration over the kind default', () => {
        expect(eventLifetimeMs([{kind: 'beam', on: 'hit', ms: 250}], 100)).toBe(250);
    });

    it('falls back to the kind default, per curve', () => {
        expect(eventLifetimeMs([{kind: 'beam', on: 'hit'}], 100)).toBe(BEAM_CURVE_MS.flash);
        expect(eventLifetimeMs([{kind: 'beam', on: 'hit', curve: 'extend'}], 100))
            .toBe(BEAM_CURVE_MS.extend);
        expect(eventLifetimeMs([{kind: 'wave', on: 'fired'}], 100)).toBe(WAVE_DEFAULT_MS);
    });

    it('gives a bolt its FLIGHT, which is what a projectile lives for', () => {
        // ⚑ `ms` is not a projectile's life: the kind ignores it outright.
        expect(eventLifetimeMs([{kind: 'projectile', on: 'hit', speed: 700, ms: 5_000}], 350))
            .toBe(flightMs(350, 700));
    });

    // §12g: the mark is the engine's, so it is not in `layers` - the caller
    // says whether the event is a landed damage hit, and the estimate adds it.
    it('charges a damage hit the mark, even on a skill that authors nothing', () => {
        expect(eventLifetimeMs([], 100, true)).toBe(HIT_MARK_MS);
        expect(eventLifetimeMs([{kind: 'beam', on: 'hit'}], 100, true))
            .toBe(BEAM_CURVE_MS.flash + HIT_MARK_MS);
    });

    it('charges no mark unless told the hit landed damage', () => {
        expect(eventLifetimeMs([{kind: 'beam', on: 'hit'}], 100)).toBe(BEAM_CURVE_MS.flash);
        expect(eventLifetimeMs([], 100, false)).toBe(0);
    });

    it('charges the mark its WAIT as well as its life', () => {
        // An Fx enters the budget at spawn, not at its first visible frame, so
        // a mark waiting for the bolt occupies a slot for the whole flight.
        const flight = flightMs(350, 700);
        const layers = [{kind: 'projectile', on: 'hit', speed: 700}];
        expect(eventLifetimeMs(layers, 350, true)).toBe(flight + flight + HIT_MARK_MS);
    });

    it('counts no ambient layer: an event never spawns one', () => {
        expect(eventLifetimeMs([{kind: 'emitter', on: 'ambient', ms: 900}], 100)).toBe(0);
        expect(eventLifetimeMs([], 100)).toBe(0);
    });
});

describe('estimateLiveFx', () => {
    it('is the rate times the mean lifetime', () => {
        expect(estimateLiveFx(40, 300)).toBe(12);
        expect(estimateLiveFx(200, 480)).toBe(96);
    });

    it('answers zero for a dead rate or an instant layer', () => {
        expect(estimateLiveFx(0, 300)).toBe(0);
        expect(estimateLiveFx(40, 0)).toBe(0);
        expect(estimateLiveFx(NaN, 300)).toBe(0);
    });
});

/**
 * The `skillIds` filter (C3a): every number in C4's table was measured on
 * Graphics placeholders, so a rerun has to be pointable at the skills that
 * carry a body. The default must stay exactly what C4 ran.
 */
describe('restrictToIds', () => {
    const defs = [{id: 3}, {id: 7}, {id: 11}, {id: 19}];

    it('keeps the list untouched when no ids are asked for', () => {
        expect(restrictToIds(defs, undefined)).toEqual(defs);
        expect(restrictToIds(defs, [])).toEqual(defs);
    });

    it('hands back a COPY, so a filtered run cannot mutate the catalog list', () => {
        expect(restrictToIds(defs, undefined)).not.toBe(defs);
    });

    it('keeps only the wanted ids, in the order the list already had', () => {
        expect(restrictToIds(defs, [19, 3])).toEqual([{id: 3}, {id: 19}]);
    });

    it('ignores an id no skill carries, rather than inventing an entry', () => {
        expect(restrictToIds(defs, [7, 9999])).toEqual([{id: 7}]);
        expect(restrictToIds(defs, [9999])).toEqual([]);
    });
});
