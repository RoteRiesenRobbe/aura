import {describe, it, expect} from 'vitest';
import {
    laneFor,
    laneAnchorX,
    laneX,
    freeSlotY,
    lanesSeenBy,
    LANE_HALF_GAP_PX,
    STACK_GAP_PX,
} from './FloatingNumberLayout';

// Floating numbers used to share one spawn point and one rise, separated only
// by a random jitter narrower than a three-digit number, so a heal and a damage
// number landing on the same tick drew on top of each other (docs/feedback.md
// 2026-09-13). Two rules fix it: a lane per kind (damage left, gains right) and
// a free-slot search within a lane so a number never spawns over a live one.
const BASE_Y = 100;
const HALF_H = 10;

describe('laneFor', () => {
    it('puts losses left and gains right', () => {
        expect(laneFor('damage')).toBe('left');
        expect(laneFor('crit')).toBe('left');
        expect(laneFor('heal')).toBe('right');
        expect(laneFor('cost')).toBe('right');
        expect(laneFor('xp')).toBe('right');
    });
});

describe('lane geometry', () => {
    it('right-aligns the left lane and left-aligns the right lane at a fixed gap', () => {
        // Anchored at the inner edge, two texts of any width never cross the
        // entity's centre line, so no measurement is needed horizontally.
        expect(laneAnchorX('left')).toBe(1);
        expect(laneAnchorX('right')).toBe(0);
        expect(laneAnchorX('center')).toBe(0.5);
        expect(laneX('left', 50)).toBe(50 - LANE_HALF_GAP_PX);
        expect(laneX('right', 50)).toBe(50 + LANE_HALF_GAP_PX);
        expect(laneX('center', 50)).toBe(50);
    });
});

describe('lanesSeenBy', () => {
    it('makes the centre lane and the side lanes dodge each other', () => {
        // "Level up!" (centre) and "+N XP" (right) fire in one frame; a side
        // lane that only searched itself would land the XP under the label.
        expect(lanesSeenBy('center')).toEqual(['left', 'center', 'right']);
        expect(lanesSeenBy('left')).toEqual(['left', 'center']);
        expect(lanesSeenBy('right')).toEqual(['right', 'center']);
    });
});

describe('freeSlotY', () => {
    const occ = (y: number, halfHeight = HALF_H) => ({y, halfHeight});

    it('spawns at the base slot in an empty lane', () => {
        expect(freeSlotY([], BASE_Y, HALF_H)).toBe(BASE_Y);
    });

    it('stacks a same-frame number one text height above the live one (the reported case)', () => {
        expect(freeSlotY([occ(BASE_Y)], BASE_Y, HALF_H)).toBe(BASE_Y - (HALF_H + HALF_H + STACK_GAP_PX));
    });

    it('uses the measured heights of both texts so a crit gets its own room', () => {
        expect(freeSlotY([occ(BASE_Y, 18)], BASE_Y, HALF_H)).toBe(BASE_Y - (18 + HALF_H + STACK_GAP_PX));
    });

    it('returns to the base slot once the live number has risen clear of it', () => {
        // 30 px up is clear of a 2 * 10 + gap slot.
        expect(freeSlotY([occ(BASE_Y - 30)], BASE_Y, HALF_H)).toBe(BASE_Y);
    });

    it('spawns above a number that has risen only part of the way', () => {
        // 10 px up is still inside the base slot, so the new one goes one
        // spacing above ITS CURRENT position, not above the base.
        expect(freeSlotY([occ(BASE_Y - 10)], BASE_Y, HALF_H)).toBe(BASE_Y - 10 - (HALF_H + HALF_H + STACK_GAP_PX));
    });

    it('does not drop a third number onto the first just because the second is high', () => {
        // A at base, B stacked above A; C arrives while A still blocks the
        // base slot. Checking only the latest spawn (B) would send C to the
        // base, onto A.
        const a = occ(BASE_Y - 3);
        const b = occ(BASE_Y - 3 - 22);
        const y = freeSlotY([b, a], BASE_Y, HALF_H);
        expect(y).toBe(b.y - 22);
    });

    it('never mutates the list it was given', () => {
        const live = [occ(BASE_Y - 30), occ(BASE_Y)];
        const copy = live.map((o) => ({...o}));
        freeSlotY(live, BASE_Y, HALF_H);
        expect(live).toEqual(copy);
    });
});
