/**
 * Which campfire the player is standing at — the gate on entering flight
 * (plan-flight-paths.md C3, PO pass 2026-08-05: *"I want the flight to start
 * via interaction with the campfire"*).
 *
 * ⚑ THE RADIUS IS THE SERVER'S, NOT A CLIENT COPY. `Mob.dwell_radius` is
 * already on the wire (`server.fbs`, drawn as the bind ring since world-map
 * C2), so "am I close enough" is answered with the same number the server's
 * `CampfireAt` validates against. Re-deriving it here would be a second
 * geometry implementation that could light a prompt the server then refuses —
 * the failure `handleInteracts` calls out by name ("a server that re-derived
 * the reach could disagree with the badge it drew").
 *
 * ⚑ It answers about ENTITIES IN VIEW, which is the right scope by accident
 * and worth stating: a campfire outside the viewport is not streamed, and a
 * fire you cannot see is one you are certainly not standing at.
 *
 * Pure, and apart from PixiJS, so the geometry is unit-testable — the interact
 * badge's own bookkeeping is factored out the same way.
 */

/** The slice of a campfire game object this needs. */
export interface CampfireLike {
    readonly id: number;
    getX(): number;
    getY(): number;
    /** The wire bind radius in px; 0 before the server has published one. */
    dwellRadius(): number;
}

/**
 * The campfire whose bind radius contains (x, y), or null. All arguments in
 * wire px, the space `getX()`/`getY()` already speak.
 *
 * NEAREST WINS, like the map's marker hit-test: bind radii are authored per
 * fire and nothing stops two from overlapping, and picking the first match
 * would make the answer depend on entity iteration order — which changes as
 * entities enter and leave the viewport, so the badge could hop between two
 * fires while the player stands still.
 */
export function fireUnderPlayer<T extends CampfireLike>(
    fires: readonly T[],
    x: number,
    y: number,
): T | null {
    let best: T | null = null;
    let bestDistanceSq = 0;
    for (const fire of fires) {
        const radius = fire.dwellRadius();
        // A fire that has not published a radius yet is not a fire you can be
        // standing at — never a 0-radius "exactly on it" match.
        if (!(radius > 0)) {
            continue;
        }
        const dx = fire.getX() - x;
        const dy = fire.getY() - y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > radius * radius) {
            continue;
        }
        if (best === null || distanceSq < bestDistanceSq) {
            best = fire;
            bestDistanceSq = distanceSq;
        }
    }
    return best;
}

/**
 * The campfire entity the player may enter flight from right now; 0 = none.
 *
 * Live state re-published every tick, exactly like the server's
 * `interactable_entity_id` it rides beside — never an event, so there is no
 * edge to miss and nothing to unwind when the player steps away.
 */
let originEntityId = 0;

export function setOrigin(entityId: number): void {
    originEntityId = entityId;
}

/** The campfire E would open the flight map on; 0 when there is none. */
export function origin(): number {
    return originEntityId;
}

/** Whether `entityId` is that campfire — the interact press's discriminator. */
export function isOrigin(entityId: number): boolean {
    return entityId !== 0 && entityId === originEntityId;
}
