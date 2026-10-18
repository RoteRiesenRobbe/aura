/**
 * The touch exit's curtain (plan-passages.md P5, D9): turns the own-player
 * `crossing` byte into curtain calls. Pure, so vitest can drive it.
 *
 * A talk exit starts the curtain on the PRESS (its row carries `travel`). A
 * touch has no press, so the server holds `crossing` at the direction while
 * the dwell runs, keeps it on the travel tick, and drops it to 0 after.
 *
 * - 0 → non-zero: begin, in that direction.
 * - non-zero → 0 WITHOUT a move: the player stepped out mid-dwell, cancel.
 * - non-zero → 0 AFTER a move: they travelled. Nothing to do: a zone change
 *   reveals through noteZoneChange, a same-zone hop is a lateral crossfade
 *   that reveals by itself. ⚑ Cancelling there would snap the curtain off.
 *
 * "A move" is a jump bigger than any walking step since the last snapshot,
 * the server's own arrival rule (sys.passageArrivalJump).
 */
export type CrossingAction = {begin: number} | 'cancel' | null;

export class TouchCrossing {
    private direction = 0;
    private travelled = false;
    private last: {x: number, y: number} | null = null;

    constructor(private readonly jump: number) {
    }

    /** One snapshot: the byte and the own player's position (same unit as jump). */
    step(crossing: number, pos: {x: number, y: number} | null): CrossingAction {
        const moved = pos !== null && this.last !== null
            && Math.hypot(pos.x - this.last.x, pos.y - this.last.y) > this.jump;
        this.last = pos;
        if (crossing !== 0 && this.direction === 0) {
            this.direction = crossing;
            this.travelled = false;
            return {begin: crossing};
        }
        if (this.direction === 0) {
            return null;
        }
        if (moved) {
            this.travelled = true;
        }
        if (crossing !== 0) {
            return null;
        }
        this.direction = 0;
        return this.travelled ? null : 'cancel';
    }
}
