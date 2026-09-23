import {describe, expect, it} from 'vitest';
import {
    COVER_MS,
    HOLD_AFTER_JUMP_MS,
    HOLD_CEILING_MS,
    REVEAL_MS,
    SpectateFade,
    STOP_DETECT_SNAPSHOTS,
} from './SpectateFade';

const SNAPSHOT_MS = 33;

/** Sweeps right at 4 px per snapshot, pumping update() every snapshot. Returns the clock. */
function sweep(fade: SpectateFade, from: { x: number, y: number }, start: number, snapshots: number): number {
    let now = start;
    for (let i = 1; i <= snapshots; i++) {
        now += SNAPSHOT_MS;
        fade.onPosition(from.x + i * 4, from.y, now);
        fade.update(now);
    }
    return now;
}

/** The server's hold: the same position, snapshot after snapshot, until the stop is detected. */
function hold(fade: SpectateFade, start: number): number {
    let now = start;
    for (let i = 0; i < STOP_DETECT_SNAPSHOTS; i++) {
        now += SNAPSHOT_MS;
        fade.onPosition(fade.displayed.x, fade.displayed.y, now);
    }
    return now;
}

describe('SpectateFade', () => {
    it('follows a sweep with no fade at all', () => {
        const fade = new SpectateFade(0, 0);
        const now = sweep(fade, {x: 0, y: 0}, 0, 100);
        expect(fade.phase).toBe('idle');
        expect(fade.update(now)).toBe(0);
        expect(fade.displayed).toEqual({x: 400, y: 0});
    });

    it('never fades for a view that has not moved yet', () => {
        const fade = new SpectateFade(0, 0);
        for (let now = 0; now < 5000; now += SNAPSHOT_MS) {
            fade.onPosition(0, 0, now);
            expect(fade.update(now)).toBe(0);
        }
    });

    it('covers when the sweep stops, holds the old spot, and reveals the new one after the cut', () => {
        const fade = new SpectateFade(0, 0);
        let now = sweep(fade, {x: 0, y: 0}, 0, 30);
        now = hold(fade, now);
        expect(fade.update(now)).toBe(0);
        expect(fade.phase).toBe('covering');

        now += COVER_MS / 2;
        expect(fade.update(now)).toBeCloseTo(0.5, 5);
        now += COVER_MS / 2;
        expect(fade.update(now)).toBe(1);
        expect(fade.phase).toBe('held');

        // The cut.
        fade.onPosition(9000, 3000, now);
        expect(fade.displayed).toEqual({x: 9000, y: 3000});
        expect(fade.update(now)).toBe(1);

        now += HOLD_AFTER_JUMP_MS;
        fade.update(now);
        expect(fade.phase).toBe('revealing');
        now += REVEAL_MS / 2;
        expect(fade.update(now)).toBeCloseTo(0.5, 5);

        // The new sweep is followed while the black lifts.
        fade.onPosition(9004, 3000, now);
        expect(fade.displayed).toEqual({x: 9004, y: 3000});

        now += REVEAL_MS / 2;
        expect(fade.update(now)).toBe(0);
        expect(fade.phase).toBe('idle');
    });

    it('does not show the new spot before the black is complete', () => {
        const fade = new SpectateFade(0, 0);
        let now = sweep(fade, {x: 0, y: 0}, 0, 30);
        now = hold(fade, now);
        expect(fade.phase).toBe('covering');

        // The cut beats the cover: black at once, never a lit frame of the new place.
        now += COVER_MS / 4;
        fade.onPosition(9000, 3000, now);
        expect(fade.update(now)).toBe(1);
    });

    it('reads no stop out of a stall: snapshots that arrive late are still a sweep', () => {
        const fade = new SpectateFade(0, 0);
        let now = sweep(fade, {x: 0, y: 0}, 0, 30);
        now += 5000; // the main thread was busy
        expect(fade.update(now)).toBe(0);
        fade.onPosition(fade.displayed.x + 4, fade.displayed.y, now);
        expect(fade.update(now)).toBe(0);
        expect(fade.phase).toBe('idle');
    });

    it('goes black at once on a cut nothing announced', () => {
        const fade = new SpectateFade(0, 0);
        const now = sweep(fade, {x: 0, y: 0}, 0, 30);
        fade.onPosition(9000, 3000, now + SNAPSHOT_MS);
        expect(fade.update(now + SNAPSHOT_MS)).toBe(1);
        expect(fade.phase).toBe('held');
    });

    it('reveals anyway when a stop is never followed by a cut', () => {
        const fade = new SpectateFade(0, 0);
        let now = sweep(fade, {x: 0, y: 0}, 0, 30);
        now = hold(fade, now);
        now += COVER_MS;
        fade.update(now);
        now += HOLD_CEILING_MS;
        fade.update(now);
        expect(fade.phase).toBe('revealing');
        now += REVEAL_MS;
        expect(fade.update(now)).toBe(0);
        // …and does not loop: it has not moved since, so nothing re-arms it.
        now = hold(fade, now);
        expect(fade.update(now)).toBe(0);
        expect(fade.phase).toBe('idle');
    });
});
