import '../assets/zoneCurtain.less';

import {TravelDirection} from '../../conversation/logic/ConversationModel';
import {COVER_MS, CurtainSequence, REVEAL_MS} from './CurtainSequence';

/**
 * The DOM half of the zone-crossing curtain (plan-underworld.md U4b).
 *
 * ⭐ THE WHOLE TRANSITION RUNS CLIENT-SIDE OFF ONE FACT THE SERVER ALREADY
 * PRODUCES: the player's new position. There is no transition protocol, no
 * server state machine and no "I am mid-crossing" flag on the wire — the press
 * starts the cover, and the client's own active-zone tracker says when the new
 * place is here.
 *
 * ⚑ The element is created lazily and lives for the session. It is `display:
 * none` unless a crossing is running, so it costs the compositor nothing.
 */

const ELEMENT_ID = 'zoneCurtain';

const sequence = new CurtainSequence();
let element: HTMLElement | null = null;
let timer: number | null = null;
/** The class the element carried last, so redundant writes do not restart CSS. */
let applied = '';
/** The zone rebuild, waiting for full black. See {@link runWhenCovered}. */
let pendingSwap: (() => void) | null = null;

function root(): HTMLElement {
    if (element) {
        return element;
    }
    element = document.getElementById(ELEMENT_ID);
    if (!element) {
        element = document.createElement('div');
        element.id = ELEMENT_ID;
        document.body.appendChild(element);
    }
    // ⛑ ONE SOURCE FOR THE TIMING, AND IT IS THE STATE MACHINE. The stylesheet
    // reads these as var(--curtain-*-ms); without them CSS falls back to a
    // transition-duration of 0s, which is not a subtle degradation — the curtain
    // appears and vanishes with no movement at all, and the whole feature reads
    // as broken while every test still passes.
    element.style.setProperty('--curtain-cover-ms', `${COVER_MS}ms`);
    element.style.setProperty('--curtain-reveal-ms', `${REVEAL_MS}ms`);
    return element;
}

/** The direction half of the class list. Lateral has no axis, so it fades. */
function axisClass(dir: TravelDirection): string {
    switch (dir) {
        // ⭐ DELIBERATELY CROSSED, AND IT IS THE WHOLE READING OF THE EFFECT
        // (PO, 2026-09-08). A descent sweeps the curtain UPWARD, because what
        // sells "I am dropping" is the world rising PAST me — the same reason a
        // camera tilts the scenery the opposite way to the move. Sweeping black
        // downward on a descent reads as a stage curtain being lowered in front
        // of you: something happening TO you, not something you are doing.
        //
        // ⛔ This looks like a bug and is not. The CSS class names describe the
        // curtain's own MOTION (`.down` travels downward), so the crossing here
        // is the one place the two vocabularies meet — keep it here rather than
        // "fixing" it by renaming the classes, or the stylesheet starts lying
        // about which way its transforms go.
        case TravelDirection.Descend:
            return 'up';
        case TravelDirection.Ascend:
            return 'down';
        default:
            return 'lateral';
    }
}

function render(): void {
    const phase = sequence.currentPhase;
    if (phase === 'idle') {
        if (applied !== '') {
            root().className = '';
            applied = '';
        }
        return;
    }

    const wanted = `running ${axisClass(sequence.direction)} ${phase}`;
    if (wanted === applied) {
        return;
    }

    const el = root();
    // ⭐ THE REFLOW IS LOAD-BEARING ON THE FIRST FRAME. The element goes from
    // `display: none` to its start transform in the same task, and a browser
    // that has not laid it out yet has no "from" value to animate away from —
    // it would jump straight to full cover with no movement at all. Reading
    // offsetWidth forces the layout in between.
    if (applied === '') {
        el.className = `running ${axisClass(sequence.direction)}`;
        void el.offsetWidth;
    }
    el.className = wanted;
    applied = wanted;
}

/**
 * Drives the sequence on a timer rather than on the game loop.
 *
 * ⚑ Deliberately independent of the render loop: the crossing must still finish
 * if the tab throttles or a frame is dropped mid-warp, and a curtain stuck at
 * full black because nothing ticked it is the exact failure the hold ceiling
 * exists to prevent.
 */
function pump(): void {
    stopPump();
    if (!sequence.running) {
        render();
        return;
    }
    timer = window.setInterval(() => {
        const now = performance.now();
        // ⚑ BEFORE tick(), so the swap lands on the frame cover completes rather
        // than one tick after it — tick() is what moves the sequence out of
        // 'covering', and the rebuild belongs at that boundary, not past it.
        flushSwapIfCovered(now);
        sequence.tick(now);
        render();
        if (!sequence.running) {
            stopPump();
        }
    }, PUMP_MS);
}

/**
 * How often the sequence is advanced. Frame-ish rather than coarse, because the
 * zone REBUILD is scheduled off this clock now: a 50 ms pump put up to 50 ms of
 * slack between full black and the swap, which is visible slack at the exact
 * moment the screen is supposed to be still.
 */
const PUMP_MS = 16;

function flushSwapIfCovered(now: number): void {
    if (!pendingSwap) {
        return;
    }
    // ⚑ NO CURTAIN MEANS RUN IT NOW, and this branch is not an edge case: a
    // cheat WARP across zones covers nothing, and a rebuild that waited for a
    // curtain that will never come would leave the player in the new zone
    // looking at the old zone's terrain.
    if (sequence.running && !sequence.coveredBy(now)) {
        return;
    }
    const swap = pendingSwap;
    pendingSwap = null;
    swap();
}

/**
 * Runs the zone rebuild at full black, or immediately if no curtain is covering
 * it (a cheat WARP, or a crossing that already reached the hold).
 *
 * ⭐ §5.1 STEP 2, AND IT IS THE DIFFERENCE BETWEEN A TRANSITION AND A FLICKER.
 * Game.renderZone tears the rendered world down and builds it again; on a local
 * server the warp round trip is about one tick, so running it on arrival means
 * the player watches the swap happen and only then gets the curtain.
 *
 * ⚑ At most one is ever pending: a second zone change before the first was
 * drawn means the first rebuild is work nobody will ever see, and doing it would
 * be a wasted teardown of a scene that is about to be discarded anyway.
 */
export function runWhenCovered(swap: () => void): void {
    pendingSwap = swap;
    flushSwapIfCovered(performance.now());
}

function stopPump(): void {
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
}

/**
 * A travel row was pressed: start covering, in the direction the server derived
 * (D7). A non-travelling row does nothing at all, which is nearly every row.
 */
export function beginCrossing(direction: TravelDirection): void {
    sequence.begin(direction, performance.now());
    render();
    pump();
}

/**
 * The player's active zone changed. Reveals whatever the curtain was covering —
 * and repairs a `lateral` byte into the real direction when the arrival proves
 * one (L15: campfire recall out of a cave is a genuine ascent reported flat).
 *
 * ⚑ Called on EVERY zone change, including ones no press caused (a cheat WARP).
 * `arrived` is a no-op while nothing is running, so an uncovered crossing stays
 * the instant cut it is today rather than flashing a curtain after the fact.
 */
export function noteZoneChange(fromOriginY: number, toOriginY: number): void {
    let actual = TravelDirection.Lateral;
    if (toOriginY > fromOriginY) {
        actual = TravelDirection.Descend;
    } else if (toOriginY < fromOriginY) {
        actual = TravelDirection.Ascend;
    }
    sequence.arrived(performance.now(), actual);
    render();
}

/**
 * Abandon a running curtain. For the ends that are not arrivals: the player
 * died mid-crossing, or the connection dropped.
 */
export function cancelCrossing(): void {
    sequence.cancel();
    stopPump();
    // ⛑ THE PENDING REBUILD STILL HAS TO RUN. Cancelling only abandons the
    // curtain; the player is still wherever the server put them, so dropping the
    // swap with it would leave them standing in the new zone with the old zone's
    // terrain, colliders and darkness drawn around them.
    flushSwapIfCovered(performance.now());
    render();
}

/** Whether a crossing is on screen right now. */
export function isCrossing(): boolean {
    return sequence.running;
}

/** Total wall time of a crossing that never has to wait — for tests and tuning. */
export const UNIMPEDED_CROSSING_MS = COVER_MS + REVEAL_MS;
