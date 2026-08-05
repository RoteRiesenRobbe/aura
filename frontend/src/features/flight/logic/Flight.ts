/**
 * The client half of campfire-to-campfire flight (plan-flight-paths.md C3).
 *
 * ⚑ ONE SOURCE OF TRUTH FOR "AM I AIRBORNE". Four unrelated surfaces need the
 * answer — the camera (hard-follow), Controls (the input gate), the HUD (the
 * ability lock and the indicator) and the utility bar — so this module is a
 * dependency LEAF that all four import, rather than a hub that pushes to them.
 * That is what lets the utility bar refuse a press without HUD ↔ Utilities
 * becoming a cycle, and it means there is no second mirrored flag anywhere to
 * drift (contrast `combatLocked` in HUD.ts, which exists only because
 * `in_combat` has nowhere else to live).
 *
 * ⚑ `Character.flying` is AUTHORITATIVE EVERY TICK, not a one-shot. There is
 * no client-side "I pressed fly" state to reconcile: the wire says airborne or
 * it does not. A silently refused StartFlight (§4.4, the established pattern)
 * therefore costs nothing — no edge ever fires, nothing to unwind.
 *
 * ⚑ Non-interaction is NOT enforced here and must never be. The server removes
 * the flyer from the physics space (D13) and discards their input whole; the
 * locks the client hangs off `isFlying()` exist so the HUD tells the truth
 * about that, not to produce it.
 */

import * as Zoom from '../../camera/logic/Zoom';

let flying = false;
let remainingTicks = 0;

/**
 * Applies the snapshot's flight state. Called once per GameState from the
 * owning player's update, with the tick from the SAME message — so the ETA can
 * never be a frame out of step with the state it describes.
 *
 * The zoom override rides the flight flag directly: client zoom and the
 * server's AOI have to move together or entities pop in at the screen edges
 * (landmine 3), and binding them to one boolean is what makes them unable to
 * disagree.
 */
export function update(isFlying: boolean, flightArrivalTick: number, tick: number): void {
    flying = isFlying;
    // Floored at 0: the server clamps its lerp at both endpoints, so an ETA
    // that runs out while the arrival snapshot is still in flight reads as
    // "0.0s" rather than as a negative countdown.
    remainingTicks = isFlying ? Math.max(0, flightArrivalTick - tick) : 0;
    Zoom.setFlightZoom(isFlying);
}

/** Whether the owning player is airborne. */
export function isFlying(): boolean {
    return flying;
}

/** Server ticks until touchdown; 0 on the ground. */
export function ticksLeft(): number {
    return remainingTicks;
}

/**
 * Leaving the world clears the state, so a re-join never starts locked. The
 * first snapshot would correct it anyway — but a client that spends its first
 * tick back in the world zoomed out with a greyed ability bar is a bug report,
 * and this is one line.
 */
export function reset(): void {
    update(false, 0, 0);
}
