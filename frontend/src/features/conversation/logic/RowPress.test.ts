import {beforeEach, describe, expect, it} from 'vitest';
import {onRowPress} from './RowPress';

// jsdom has no PointerEvent constructor, so plain Events carry the fields the
// handler reads (the SkillTooltipHold.test.ts pattern).
function pointer(type: string, target: Element, pointerType: string, x = 0, y = 0, pointerId = 1) {
    const e = new Event(type, {bubbles: true, cancelable: true}) as any;
    e.pointerType = pointerType;
    e.pointerId = pointerId;
    e.clientX = x;
    e.clientY = y;
    target.dispatchEvent(e);
}

describe('onRowPress', () => {
    let row: HTMLElement;
    let taken: number;

    beforeEach(() => {
        document.body.innerHTML = '<ul><li id="row">Do you have a task for me?</li></ul>';
        row = document.getElementById('row')!;
        taken = 0;
        onRowPress(row, () => taken++);
    });

    it('takes a mouse press at once', () => {
        pointer('pointerdown', row, 'mouse');
        expect(taken).toBe(1);
    });

    it('takes a touch only on the release', () => {
        pointer('pointerdown', row, 'touch', 10, 10);
        expect(taken).toBe(0);
        pointer('pointerup', row, 'touch', 14, 13);
        expect(taken).toBe(1);
    });

    it('takes nothing when the finger drags to scroll', () => {
        pointer('pointerdown', row, 'touch', 10, 10);
        pointer('pointermove', row, 'touch', 10, 40);
        pointer('pointerup', row, 'touch', 10, 12);
        expect(taken).toBe(0);
    });

    it('takes nothing when the browser takes the touch as a pan', () => {
        pointer('pointerdown', row, 'touch', 10, 10);
        pointer('pointercancel', row, 'touch', 10, 10);
        pointer('pointerup', row, 'touch', 10, 10);
        expect(taken).toBe(0);
    });

    it('ignores a release from a different finger', () => {
        pointer('pointerdown', row, 'touch', 10, 10, 1);
        pointer('pointerup', row, 'touch', 10, 10, 2);
        expect(taken).toBe(0);
    });
});
