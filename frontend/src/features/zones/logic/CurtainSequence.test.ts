import {describe, expect, it} from 'vitest';

import {TravelDirection} from '../../conversation/logic/ConversationModel';
import {
    COVER_MS,
    CurtainSequence,
    HOLD_CEILING_MS,
    HOLD_MIN_MS,
    REVEAL_MS,
} from './CurtainSequence';

/**
 * The zone-crossing curtain's state machine (plan-underworld.md U4b / §5.1).
 *
 * ⭐ The property worth pinning is not "black appears". It is that the curtain
 * NEVER REVERSES and never changes speed: it comes in one edge and leaves the
 * other, at the same rate, because a curtain that retreats the way it came — or
 * decelerates as it goes — is two fades rather than one movement past the
 * player, and that is the ruling.
 *
 * ⛔ A GREEN FILE HERE SAYS NOTHING ABOUT WHETHER ANYTHING ANIMATES. The whole
 * suite stayed green while the shipped stylesheet had no `transition-duration`
 * at all and the curtain hard-cut in and out. The machine is the only half a
 * test can reach; the drawing needs a browser.
 */

/** The moment full cover is reached, one ms past the boundary. */
const COVERED = COVER_MS + 1;

/** The earliest the reveal may start when the arrival beat the cover. */
const SETTLED = COVER_MS + HOLD_MIN_MS + 1;

describe('CurtainSequence', () => {
    it('does nothing at all for a row that does not travel', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.None, 0);
        expect(c.running).toBe(false);
        expect(c.currentPhase).toBe('idle');
    });

    // ⭐ THE HEADLINE: covering starts on the PRESS, with nothing arrived yet.
    // That is the entire reason the direction rides the wire (D7) — the client
    // cannot see the destination, so it could not have started this by itself.
    it('starts covering immediately, before anything has arrived', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Descend, 0);
        expect(c.currentPhase).toBe('covering');
        expect(c.direction).toBe(TravelDirection.Descend);
    });

    it('holds at full black until the new place arrives, then reveals', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Descend, 0);

        c.tick(COVERED);
        expect(c.currentPhase).toBe('held');

        // Still nothing, a long time later — but well inside the ceiling.
        c.tick(COVERED + 500);
        expect(c.currentPhase).toBe('held');

        // ⚑ The arrival does NOT reveal on the spot: the settle beat is measured
        // from the SWAP, and for a late arrival the swap is this moment.
        c.arrived(1000, TravelDirection.Descend);
        expect(c.currentPhase).toBe('held');

        c.tick(1000 + HOLD_MIN_MS);
        expect(c.currentPhase).toBe('revealing');
        expect(c.direction).toBe(TravelDirection.Descend);

        c.tick(1000 + HOLD_MIN_MS + REVEAL_MS + 1);
        expect(c.currentPhase).toBe('idle');
    });

    // ⭐ §5.1 STEP 2 — THE ZONE IS REBUILT AT FULL BLACK. The swap moment is the
    // LATER of full cover and the arrival, so a fast server does not get its
    // teardown shown in plain sight and a slow one does not get it early.
    //
    // ⚑ This is the defect the PO saw first: Game.renderZone ran on arrival, and
    // on a local server the warp round trip is about one tick — so the world
    // visibly came apart and rebuilt BEFORE the black ever got there.
    it('puts the swap at full cover, or at the arrival if that is later', () => {
        const early = new CurtainSequence();
        early.begin(TravelDirection.Descend, 0);
        early.arrived(10, TravelDirection.Descend);
        expect(early.coveredBy(10)).toBe(false);
        expect(early.coveredBy(COVER_MS - 1)).toBe(false);
        expect(early.coveredBy(COVER_MS)).toBe(true);

        const late = new CurtainSequence();
        late.begin(TravelDirection.Descend, 0);
        expect(late.coveredBy(COVER_MS)).toBe(false);
        late.arrived(900, TravelDirection.Descend);
        expect(late.coveredBy(900)).toBe(true);
    });

    // Nothing may be swapped before a press, or after the crossing is abandoned.
    it('never reports covered when no crossing is running', () => {
        const c = new CurtainSequence();
        expect(c.coveredBy(0)).toBe(false);

        c.begin(TravelDirection.Descend, 0);
        c.arrived(10, TravelDirection.Descend);
        c.cancel();
        expect(c.coveredBy(COVER_MS)).toBe(false);
    });

    // ⛔ THE CEILING IS NOT OPTIONAL. A refused or dropped travel that leaves
    // the screen black forever is indistinguishable from a hang, and the player
    // cannot even see the panel to try again.
    it('reveals anyway when nothing ever arrives', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Ascend, 0);
        c.tick(COVERED);
        expect(c.currentPhase).toBe('held');

        c.tick(HOLD_CEILING_MS - 1);
        expect(c.currentPhase).toBe('held');

        c.tick(HOLD_CEILING_MS);
        expect(c.currentPhase).toBe('revealing');
    });

    // ⚑ The ceiling is measured from the PRESS, not from the start of the hold,
    // so a slow cover cannot push the total past it.
    it('measures the ceiling from the press, not from the hold', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Descend, 0);
        c.tick(HOLD_CEILING_MS - 1);
        expect(c.currentPhase).toBe('held');
        c.tick(HOLD_CEILING_MS);
        expect(c.currentPhase).toBe('revealing');
    });

    // A hop that changes place without changing depth has no arrival to wait
    // for — it may not even change zone — so it must never wait on one. It still
    // takes the settle beat, so both kinds of crossing have the same rhythm.
    it('never waits for an arrival on a lateral crossfade', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Lateral, 0);
        c.tick(COVERED);
        expect(c.currentPhase).toBe('held');
        c.tick(SETTLED);
        expect(c.currentPhase).toBe('revealing');
    });

    // ⭐ THE BEAT IS ALWAYS THERE. An arrival that beat the cover used to reveal
    // the instant cover finished, so the same doorway felt different depending on
    // the server's latency that second — and the rebuilt scene got no frame to
    // settle before it was uncovered.
    it('still takes the settle beat when the arrival beats the cover', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Descend, 0);
        c.arrived(10, TravelDirection.Descend);
        expect(c.currentPhase).toBe('covering');

        c.tick(COVERED);
        expect(c.currentPhase).toBe('held');

        c.tick(SETTLED - 2);
        expect(c.currentPhase).toBe('held');

        c.tick(SETTLED);
        expect(c.currentPhase).toBe('revealing');
    });

    // ⭐ Both halves travel the SAME distance — the element's own height — so
    // equal durations are the only way the sweep does not change speed
    // mid-movement (§5.1 step 4). A tuning pass that lengthens one alone brings
    // back the deceleration the PO saw on 2026-09-08.
    it('takes the same time in each direction, so the sweep never changes speed', () => {
        expect(REVEAL_MS).toBe(COVER_MS);
    });

    // ⭐ THE L15 REPAIR. Campfire recall reports `lateral` because its
    // destination only resolves at step-through time — but a recall OUT OF a
    // cave is a genuine ascent, and by the time the player has arrived the
    // client knows it from position alone. So the cover half is flat and the
    // reveal half travels upward.
    it('upgrades a lateral crossing to a real direction on arrival', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Lateral, 0);
        expect(c.direction).toBe(TravelDirection.Lateral);

        c.arrived(10, TravelDirection.Ascend);
        expect(c.direction).toBe(TravelDirection.Ascend);
    });

    // ⛔ …and never the other way. A curtain already travelling down must not be
    // told it is a flat fade, and it must never be turned around mid-reveal.
    it('never downgrades a direction, and never reverses one mid-reveal', () => {
        const down = new CurtainSequence();
        down.begin(TravelDirection.Descend, 0);
        down.arrived(10, TravelDirection.Lateral);
        expect(down.direction).toBe(TravelDirection.Descend);

        const late = new CurtainSequence();
        late.begin(TravelDirection.Lateral, 0);
        late.tick(SETTLED);
        expect(late.currentPhase).toBe('revealing');
        late.arrived(SETTLED + 10, TravelDirection.Ascend);
        expect(late.direction).toBe(TravelDirection.Lateral);
    });

    // A second press mid-crossing would snap the black back to the near edge,
    // which reads as a stutter rather than as a second journey.
    it('ignores a second press while a crossing is already running', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Descend, 0);
        c.tick(COVERED);
        c.begin(TravelDirection.Ascend, COVERED);
        expect(c.direction).toBe(TravelDirection.Descend);
        expect(c.currentPhase).toBe('held');
    });

    // An arrival with no crossing running is an ordinary zone change — a cheat
    // WARP, say. It must not flash a curtain after the fact.
    it('ignores an arrival when nothing is crossing', () => {
        const c = new CurtainSequence();
        c.arrived(0, TravelDirection.Descend);
        expect(c.running).toBe(false);
    });

    // Death is the one end of a crossing that never produces an arrival.
    it('cancels back to idle', () => {
        const c = new CurtainSequence();
        c.begin(TravelDirection.Descend, 0);
        c.cancel();
        expect(c.running).toBe(false);
        expect(c.direction).toBe(TravelDirection.None);
    });
});
