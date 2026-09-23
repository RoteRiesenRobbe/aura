/**
 * The start-screen tour's fade to black, DOM-free (the CurtainSequence split:
 * this half is vitest-reachable, `SpectateFadeOverlay.ts` paints it).
 *
 * The server sweeps the pre-join spectator across the map, HOLDS STILL for a
 * moment, then cuts to a sweep somewhere else
 * (`backend/pkg/aura/model/spectator/tour.go`). The wire carries nothing but
 * the position, so the two cues are read off the position stream:
 *
 *  - "was moving, now stopped" = a cut is coming: cover NOW, while the old
 *    spot's entities are still streaming. After the cut they are gone in one
 *    snapshot, and a fade that started then would show them popping out.
 *  - "jumped" = the cut: reveal once covered.
 *
 * ⚑ The stop is counted in SNAPSHOTS, never in wall-clock time: a main-thread
 * stall (asset loading, a slow frame) delays the queued snapshots and the clock
 * alike, and a timer read "no movement for 150 ms" out of one on the first
 * browser run. `STOP_DETECT_SNAPSHOTS` x 33 ms + `COVER_MS` must stay under the
 * server's `TourHoldSeconds` (0.8 s). Missing it is cosmetic: a jump that arrives
 * before the cover finished goes black at once, a hard cut to black instead of
 * a fade, and that same path covers a cut that was never announced at all (a
 * dropped stretch of snapshots, a background tab).
 *
 * Every number is a [PLACEHOLDER].
 */
export const STOP_DETECT_SNAPSHOTS = 4;
export const COVER_MS = 400;
export const REVEAL_MS = 400;
/** Black is held this long after the cut, so the new spot's mobs have woken and streamed. */
export const HOLD_AFTER_JUMP_MS = 150;
/** A stop with no cut after it (the tour ended some other way): reveal anyway. */
export const HOLD_CEILING_MS = 2000;
/** World px. A sweep step is ~4 px per snapshot; a cut is a different place. */
export const JUMP_DISTANCE = 240;
const MOVE_EPSILON = 0.01;

export type FadePhase = 'idle' | 'covering' | 'held' | 'revealing';

export class SpectateFade {
    phase: FadePhase = 'idle';

    /** The position the CAMERA should show: frozen from the cue until the black is complete. */
    displayed: { x: number, y: number };

    private wire: { x: number, y: number };
    private phaseStart = 0;
    private moving = false;
    private stillSnapshots = 0;
    private jumpedAt: number | undefined;

    constructor(x: number, y: number) {
        this.displayed = {x, y};
        this.wire = {x, y};
    }

    /** Feed every spectator snapshot's position. */
    onPosition(x: number, y: number, now: number): void {
        const dx = x - this.wire.x;
        const dy = y - this.wire.y;
        this.wire = {x, y};

        if (dx * dx + dy * dy > JUMP_DISTANCE * JUMP_DISTANCE) {
            this.jumpedAt = now;
            this.moving = false;
            if (this.phase === 'idle' || this.phase === 'covering') {
                // Unannounced, or the cover lost the race: black at once.
                this.enter('held', now);
            }
            this.displayed = {x, y};
            return;
        }
        if (Math.abs(dx) > MOVE_EPSILON || Math.abs(dy) > MOVE_EPSILON) {
            this.moving = true;
            this.stillSnapshots = 0;
        } else if (this.moving && ++this.stillSnapshots >= STOP_DETECT_SNAPSHOTS) {
            this.moving = false;
            if (this.phase === 'idle') {
                this.enter('covering', now);
            }
        }
        if (this.phase === 'idle' || this.phase === 'revealing') {
            this.displayed = {x, y};
        }
    }

    /** Pump from a timer; returns the overlay's opacity, 0 to 1. */
    update(now: number): number {
        const elapsed = now - this.phaseStart;
        switch (this.phase) {
            case 'idle':
                return 0;
            case 'covering':
                if (elapsed >= COVER_MS) {
                    this.enter('held', now);
                    return 1;
                }
                return elapsed / COVER_MS;
            case 'held':
                if (this.jumpedAt !== undefined
                    ? now - this.jumpedAt >= HOLD_AFTER_JUMP_MS
                    : elapsed >= HOLD_CEILING_MS) {
                    this.jumpedAt = undefined;
                    this.displayed = {...this.wire};
                    this.enter('revealing', now);
                }
                return 1;
            case 'revealing':
                if (elapsed >= REVEAL_MS) {
                    this.enter('idle', now);
                    return 0;
                }
                return 1 - elapsed / REVEAL_MS;
        }
    }

    private enter(phase: FadePhase, now: number): void {
        this.phase = phase;
        this.phaseStart = now;
    }
}
