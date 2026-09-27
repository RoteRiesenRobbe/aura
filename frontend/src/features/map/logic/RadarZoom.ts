/**
 * The docked radar's zoom steps (plan-minimap-local-viewport.md M2, D9-D11).
 *
 * DOM-free and pixi-free, like MapScale next door, so vitest covers the rules
 * with a wrong answer worth catching: stepping clamps, a stored value snaps,
 * and a wheel gesture becomes whole steps.
 */

/**
 * The radar's diameters in metres, nearest first. [PLACEHOLDER] values (D9).
 * ⚑ GROUND_RING_REACH_M (MapScale) is derived from the largest one: a step
 * added here widens the ring with it rather than leaving the edge exposed.
 */
export const RADAR_STEPS_M: readonly number[] = [30, 50, 100];

/** The step a new browser, or one with an unreadable preference, starts at. */
export const RADAR_DEFAULT_M = 50;

/**
 * The next diameter one step in (`direction` −1, a smaller patch of world) or
 * out (+1), clamped at both ends. An off-table `current` is snapped first, so a
 * retune never leaves the radar between steps.
 */
export function stepRadar(currentM: number, direction: -1 | 1): number {
    const index = RADAR_STEPS_M.indexOf(snapRadarDiameter(currentM));
    const next = Math.min(RADAR_STEPS_M.length - 1, Math.max(0, index + direction));
    return RADAR_STEPS_M[next];
}

/** Whether a step in `direction` would change anything — the buttons' greying. */
export function canStepRadar(currentM: number, direction: -1 | 1): boolean {
    return stepRadar(currentM, direction) !== snapRadarDiameter(currentM);
}

/**
 * A stored or otherwise untrusted diameter, snapped to the nearest current step
 * (plan landmine 10). The preference is kept in METRES rather than as an index
 * precisely so a retune of the table maps an old value to its nearest new step;
 * anything that is not a finite positive number is the default.
 */
export function snapRadarDiameter(value: unknown): number {
    const metres = typeof value === 'string' ? Number(value) : value;
    if (typeof metres !== 'number' || !Number.isFinite(metres) || metres <= 0) {
        return RADAR_DEFAULT_M;
    }
    let best = RADAR_STEPS_M[0];
    for (const step of RADAR_STEPS_M) {
        if (Math.abs(step - metres) < Math.abs(best - metres)) {
            best = step;
        }
    }
    return best;
}

/**
 * How much wheel travel is one step, in pixels. One notch of a mouse wheel is
 * ~100 px in Chromium and Firefox's pixel mode, so a notch is a step. [PLACEHOLDER]
 */
export const WHEEL_STEP_PX = 100;

/** A pause longer than this starts a new gesture, dropping the leftover travel. */
export const WHEEL_IDLE_MS = 300;

/** Pixels per line / per page when a wheel reports in those units. */
const LINE_PX = 40;
const PAGE_PX = 800;

export interface WheelState {
    /** Travel accumulated towards the next step, in px; its sign is the direction. */
    travel: number;
    /** When the last event of the current gesture arrived (event.timeStamp). */
    lastAt: number;
}

export const WHEEL_IDLE: WheelState = {travel: 0, lastAt: -Infinity};

/**
 * Folds one wheel event into the gesture, returning the step it completes.
 *
 * ⚑ ACCUMULATED, not one step per event (plan landmine 9): a trackpad fires
 * dozens of small events per swipe, and stepping on each would fly through all
 * three diameters before the eye catches up. A swipe the length of several
 * notches still steps several times — that is a long swipe, not a bug.
 *
 * Down (positive deltaY) zooms OUT, the map convention. A completed step drops
 * the remainder, so a 120 px notch is one step and not a step and a fifth.
 * `deltaMode` is the DOM's: 0 pixels, 1 lines, 2 pages.
 */
export function accumulateWheel(
    state: WheelState, deltaY: number, deltaMode: number, now: number,
): {state: WheelState, step: -1 | 0 | 1} {
    if (!Number.isFinite(deltaY) || deltaY === 0) {
        return {state, step: 0};
    }
    const unit = deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1;
    const fresh = now - state.lastAt > WHEEL_IDLE_MS
        // A reversal mid-gesture starts over too, or it would have to undo
        // the travel already banked the other way before it could step.
        || Math.sign(deltaY) !== Math.sign(state.travel);
    const travel = (fresh ? 0 : state.travel) + deltaY * unit;
    if (Math.abs(travel) < WHEEL_STEP_PX) {
        return {state: {travel, lastAt: now}, step: 0};
    }
    return {state: {travel: 0, lastAt: now}, step: travel > 0 ? 1 : -1};
}
