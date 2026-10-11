/**
 * How a conversation row is taken: on the press with a mouse, on the release
 * with a finger (feedback 2026-10-11, PO).
 *
 * The rows live inside the panel's scroll region, so on a phone the finger that
 * starts a scroll nearly always starts it on a row. Taking the row on
 * `pointerdown` picked an option every time someone tried to read further. A
 * touch therefore counts only as a TAP: released on the row, never moved past
 * the slop, and never handed to the browser as a pan (the browser then sends
 * `pointercancel`). That is the platform's own rule for a tap in a scrolling
 * list.
 *
 * ⚑ The mouse keeps `pointerdown`: a wheel scroll never presses a row, so the
 * desktop has nothing to fix and keeps answering on the frame of the click.
 */

/** How far a finger may wander and still be a tap rather than a scroll. */
const TAP_SLOP_PX = 10;

export function onRowPress(element: HTMLElement, action: () => void): void {
    let touchId: number | null = null;
    let startX = 0;
    let startY = 0;

    element.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.pointerType === 'mouse') {
            action();
            return;
        }
        touchId = e.pointerId;
        startX = e.clientX;
        startY = e.clientY;
    });
    element.addEventListener('pointermove', (e: PointerEvent) => {
        if (e.pointerId === touchId && Math.hypot(e.clientX - startX, e.clientY - startY) > TAP_SLOP_PX) {
            touchId = null;
        }
    });
    element.addEventListener('pointerup', (e: PointerEvent) => {
        if (e.pointerId !== touchId) {
            return;
        }
        touchId = null;
        if (Math.hypot(e.clientX - startX, e.clientY - startY) <= TAP_SLOP_PX) {
            action();
        }
    });
    element.addEventListener('pointercancel', () => {
        touchId = null;
    });
}
