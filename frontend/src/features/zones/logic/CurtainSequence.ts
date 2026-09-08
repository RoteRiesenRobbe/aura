import {TravelDirection} from '../../conversation/logic/ConversationModel';

/**
 * The zone-crossing curtain's state machine, with no DOM in it
 * (plan-underworld.md U4b / §5.1).
 *
 * ⭐ THE CURTAIN MOVES ONE DIRECTION THROUGHOUT, and that is the ruling rather
 * than a detail. A curtain that comes in from the top and then retreats back out
 * of the top is two fades; one that comes in the top and leaves out the bottom
 * is a single continuous movement PAST you, which is what makes a crossing read
 * as a descent without the player having to reason about anything.
 *
 * ⚑ DOM-free on purpose, the SkillTooltip / ActiveZone precedent: the drawing is
 * four CSS classes, and the part worth testing is when to flip them.
 */

/** [PLACEHOLDER] How long the curtain takes to reach full cover. */
export const COVER_MS = 180;

/**
 * [PLACEHOLDER] How long it takes to travel back off the far edge.
 *
 * ⭐ DELIBERATELY EQUAL TO COVER_MS, and it is the §5.1 step 4 ruling that makes
 * it so. Both halves travel the SAME distance — the element's own height — so
 * unequal durations mean unequal SPEED, and the curtain visibly decelerates as
 * it leaves. That reads as two movements rather than one movement past you,
 * which is the exact thing the one-direction rule exists to prevent.
 *
 * ⚑ The plan drafted this as the slower half ("you are arriving, not leaving").
 * That intent is real but it was written before the speed clash was visible in
 * front of the game; PO call 2026-09-08, equal speed wins. Kept as its own
 * constant so the other reading is one number away.
 */
export const REVEAL_MS = 180;

/**
 * [PLACEHOLDER] The shortest the curtain holds at full black once the new place
 * is there. Measured from the SWAP — whichever came later, full cover or the
 * arrival — not from the press.
 *
 * ⭐ IT DOES TWO JOBS AND EITHER ONE WOULD JUSTIFY IT.
 *
 *  ① The rendered zone is torn down and rebuilt at full cover, and revealing on
 *    the very first frame after that shows terrain, blend masks and darkness
 *    still settling. This is the beat that lets them finish.
 *
 *  ② It gives every crossing the SAME RHYTHM. Without it, an arrival that beats
 *    the cover runs the two halves back to back while a slow one gets a pause,
 *    so the same doorway feels different depending on the server's latency that
 *    second. A beat that is always there is a beat the player can learn.
 *
 * ⚑ It is the floor, not the hold: a crossing still waits as long as the arrival
 * takes, up to HOLD_CEILING_MS.
 */
export const HOLD_MIN_MS = 80;

/**
 * [PLACEHOLDER] The longest the curtain will hold at full black waiting for the
 * new place to arrive.
 *
 * ⛔ IT MUST EXIST. Holding is correct while the server is merely slow — but a
 * refused or dropped travel that leaves the screen black forever is
 * indistinguishable from a hang, and the player cannot even see the panel to
 * try again.
 */
export const HOLD_CEILING_MS = 3000;

export type CurtainPhase =
    /** Nothing on screen. */
    | 'idle'
    /** Travelling in; the world is still the old one. */
    | 'covering'
    /** Full black, waiting for the new place. */
    | 'held'
    /** Travelling out the far side; the world is the new one. */
    | 'revealing';

export class CurtainSequence {
    private phase: CurtainPhase = 'idle';
    private dir: TravelDirection = TravelDirection.None;
    private startedAt = 0;
    private revealAt = 0;
    private hasArrived = false;
    /** When the arrival landed, so the settle beat is measured from the SWAP. */
    private arrivedAt = 0;

    get currentPhase(): CurtainPhase {
        return this.phase;
    }

    /** Which way the curtain is travelling; None while idle. */
    get direction(): TravelDirection {
        return this.dir;
    }

    get running(): boolean {
        return this.phase !== 'idle';
    }

    /**
     * A travel row was pressed. Starts the cover half immediately — before
     * anything has arrived, which is the whole reason the direction rides the
     * wire (D7).
     *
     * ⚑ A None row starts nothing. Nearly every row in the game is None, so this
     * is the common case, not an error path.
     *
     * ⚑ Re-pressing while a curtain is already running is IGNORED rather than
     * restarted: a second press mid-crossing would snap the black back to the
     * near edge, which reads as a stutter rather than as a second journey.
     */
    begin(direction: TravelDirection, now: number): void {
        if (direction === TravelDirection.None || this.running) {
            return;
        }
        this.phase = 'covering';
        this.dir = direction;
        this.startedAt = now;
        this.hasArrived = false;
        this.arrivedAt = 0;
    }

    /**
     * When the world may be swapped: the later of full cover and the arrival.
     *
     * ⭐ §5.1 STEP 2 — THE ZONE IS REBUILT UNDER COVER, NEVER IN PLAIN SIGHT.
     * Game.renderZone is a heavy synchronous teardown (the ground layer
     * destroyed, every ground texture cleared and reloaded, darkness reloaded,
     * regions/paths/surfaces repainted), and on a local server the warp round
     * trip is about one tick — so doing it on arrival means watching the old
     * world come apart and the new one build BEFORE the black ever gets there.
     */
    get swapAt(): number {
        return Math.max(this.startedAt + COVER_MS, this.arrivedAt);
    }

    /** Whether the world may be swapped right now. */
    coveredBy(now: number): boolean {
        return this.running && this.hasArrived && now >= this.swapAt;
    }

    /**
     * The new place is here — the client's active zone changed, or a lateral hop
     * has had long enough that waiting buys nothing.
     *
     * ⭐ THE L15 REPAIR LIVES HERE. Campfire recall and the portal pair report
     * `lateral` because their destination is only resolved at step-through time,
     * so a direction derived when the tree was built could be stale. But by the
     * time the player has ACTUALLY ARRIVED the client knows the answer from
     * position alone — so a lateral crossing that turns out to have changed zone
     * upgrades to a real direction here, and only the reveal half shows it. That
     * is exactly the "cheapest answer" L15 names: recall out of a cave covers
     * flat and reveals upward.
     *
     * ⚑ Never DOWNGRADES a direction, and never changes one mid-reveal: the
     * curtain is already travelling, and reversing it is the two-fades failure
     * this whole module exists to avoid.
     */
    arrived(now: number, actual: TravelDirection = TravelDirection.None): void {
        if (!this.running) {
            return;
        }
        if (!this.hasArrived) {
            this.hasArrived = true;
            this.arrivedAt = now;
        }
        if (this.dir === TravelDirection.Lateral
            && actual !== TravelDirection.None
            && actual !== TravelDirection.Lateral
            && this.phase !== 'revealing') {
            this.dir = actual;
        }
        this.tick(now);
    }

    /** Advances the machine. Safe to call every frame; a no-op while idle. */
    tick(now: number): void {
        switch (this.phase) {
            case 'covering':
                if (now - this.startedAt < COVER_MS) {
                    return;
                }
                // ⚑ FULL COVER ALWAYS BECOMES A HOLD, even when the new place is
                // already there. An arrival that beat the cover used to reveal
                // straight away, which ran the two halves back to back at
                // different speeds — the deceleration §5.1 step 4 forbids.
                this.phase = 'held';
                this.tick(now);
                return;

            case 'held': {
                // The ceiling is measured from the PRESS, not from the hold, so
                // a slow cover cannot push the total past it.
                if (now - this.startedAt >= HOLD_CEILING_MS) {
                    this.startReveal(now);
                    return;
                }
                // ⚑ A LATERAL HOP HAS NO ARRIVAL TO WAIT FOR. It is a crossfade
                // over a place that may not have changed zone at all, so waiting
                // would hold a black screen in front of the shipped portal pair
                // forever. It still takes the settle beat, so both kinds of
                // crossing have the same rhythm.
                const ready = this.hasArrived || this.dir === TravelDirection.Lateral;
                if (ready && now >= this.swapAt + HOLD_MIN_MS) {
                    this.startReveal(now);
                }
                return;
            }

            case 'revealing':
                if (now - this.revealAt >= REVEAL_MS) {
                    this.phase = 'idle';
                    this.dir = TravelDirection.None;
                }
                return;

            default:
                return;
        }
    }

    /**
     * Abandons the curtain wherever it stands. For the cases where there is no
     * arrival coming and no point waiting for the ceiling — the panel closed
     * because the player died, or the connection dropped.
     */
    cancel(): void {
        this.phase = 'idle';
        this.dir = TravelDirection.None;
        this.hasArrived = false;
        this.arrivedAt = 0;
    }

    private startReveal(now: number): void {
        this.phase = 'revealing';
        this.revealAt = now;
    }
}
