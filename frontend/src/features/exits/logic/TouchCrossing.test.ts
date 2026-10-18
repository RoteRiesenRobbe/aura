import {describe, expect, it} from 'vitest';
import {TouchCrossing} from './TouchCrossing';

const DESCEND = 1;
const at = (x: number) => ({x, y: 0});

describe('TouchCrossing (plan-passages.md D9)', () => {
    it('begins on the first non-zero byte, once', () => {
        const c = new TouchCrossing(3);
        expect(c.step(0, at(0))).toBeNull();
        expect(c.step(DESCEND, at(0.1))).toEqual({begin: DESCEND});
        expect(c.step(DESCEND, at(0.1))).toBeNull();
    });

    it('cancels when the byte drops without a move (stepped out mid-dwell)', () => {
        const c = new TouchCrossing(3);
        c.step(DESCEND, at(0));
        c.step(DESCEND, at(0.2));
        expect(c.step(0, at(0.4))).toBe('cancel');
    });

    // The server holds the byte on the travel tick, so the jump shows while it
    // is still set; the drop after it is the arrival, never a cancel.
    it('lets a travel finish: the jump while set, then the drop', () => {
        const c = new TouchCrossing(3);
        c.step(DESCEND, at(0));
        expect(c.step(DESCEND, at(300))).toBeNull();
        expect(c.step(0, at(300.1))).toBeNull();
        expect(c.step(0, at(300.2))).toBeNull();
    });

    it('treats a jump on the dropping snapshot as a travel too', () => {
        const c = new TouchCrossing(3);
        c.step(DESCEND, at(0));
        expect(c.step(0, at(50))).toBeNull();
    });

    it('starts fresh for the next crossing', () => {
        const c = new TouchCrossing(3);
        c.step(DESCEND, at(0));
        c.step(DESCEND, at(300));
        c.step(0, at(300));
        expect(c.step(DESCEND, at(300))).toEqual({begin: DESCEND});
        expect(c.step(0, at(300))).toBe('cancel');
    });
});
