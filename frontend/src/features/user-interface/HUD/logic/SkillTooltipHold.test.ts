import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {attachTooltips, hideTooltip} from './SkillTooltip';

// The held-press variant (plan-buff-tray.md D12, C3): the buff tray's phone
// tooltip. jsdom has no PointerEvent constructor, so plain Events carry the
// coordinates the slop check reads.
function pointer(type: string, target: Element, x = 0, y = 0) {
    const e = new Event(type, {bubbles: true, cancelable: true}) as Event & {clientX: number, clientY: number};
    e.clientX = x;
    e.clientY = y;
    target.dispatchEvent(e);
    return e;
}

describe('attachTooltips hold variant', () => {
    let container: HTMLElement;
    let circle: HTMLElement;
    let shown: HTMLElement[];

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="tray"><div class="c"><span class="icon"></span></div></div>';
        container = document.getElementById('tray')!;
        circle = container.querySelector('.c')!;
        shown = [];
        attachTooltips(container, '.c', (entry) => shown.push(entry), 500);
    });

    afterEach(() => {
        hideTooltip();
        vi.useRealTimers();
    });

    it('opens nothing on hover', () => {
        pointer('pointerover', circle);
        vi.advanceTimersByTime(1000);
        expect(shown).toEqual([]);
    });

    it('opens nothing on a short tap', () => {
        pointer('pointerdown', circle.firstElementChild!);
        vi.advanceTimersByTime(200);
        pointer('pointerup', circle);
        vi.advanceTimersByTime(1000);
        expect(shown).toEqual([]);
    });

    it('opens the entry\'s tooltip once the press is held long enough', () => {
        pointer('pointerdown', circle.firstElementChild!);
        vi.advanceTimersByTime(499);
        expect(shown).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(shown).toEqual([circle]);
    });

    it('cancels a press that slides off as a drag', () => {
        pointer('pointerdown', circle, 10, 10);
        pointer('pointermove', circle, 13, 14); // 5 px: still a hold
        pointer('pointermove', circle, 30, 10);
        vi.advanceTimersByTime(1000);
        expect(shown).toEqual([]);
    });

    it('cancels when the browser takes the touch', () => {
        pointer('pointerdown', circle);
        pointer('pointercancel', circle);
        vi.advanceTimersByTime(1000);
        expect(shown).toEqual([]);
    });

    it('ignores a press outside any entry, and blocks the long-press context menu', () => {
        pointer('pointerdown', container);
        vi.advanceTimersByTime(1000);
        expect(shown).toEqual([]);
        expect(pointer('contextmenu', circle).defaultPrevented).toBe(true);
    });
});
