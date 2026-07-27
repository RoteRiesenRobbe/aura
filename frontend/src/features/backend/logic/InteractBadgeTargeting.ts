/**
 * Which entity wears the interact badge (plan-entity-model.md chunk 3b-i).
 *
 * Kept as a pure function, apart from Backend and from PixiJS, because the
 * interesting part is not the drawing — it is the bookkeeping around a value
 * that is live STATE rather than an event: the server re-sends it every tick,
 * the target can leave and re-enter the viewport as a brand-new game object,
 * and a badge left lit on a stale entity is exactly the failure D10 designed
 * the field to prevent.
 */

/** The slice of a game object the badge needs. */
export interface Badgeable {
    setInteractable?(interactable: boolean): void;
}

/**
 * Apply the server's `interactable_entity_id` to the world.
 *
 * @param previousId the entity currently wearing the badge; 0 = none
 * @param nextId     the entity the server names now; 0 = nobody in range
 * @param lookup     resolves an entity id to a game object, or null/undefined
 *                   when the client is not tracking it
 * @returns the id now wearing the badge, to carry into the next call
 */
export function retargetInteractBadge(
    previousId: number,
    nextId: number,
    lookup: (id: number) => Badgeable | null | undefined,
): number {
    if (previousId !== 0 && previousId !== nextId) {
        lookup(previousId)?.setInteractable?.(false);
    }
    if (nextId === 0) {
        return 0;
    }
    // Re-applied even when the id did not change: an actor that left the
    // viewport and came back is a fresh object with no badge on it, and the
    // call is a cheap no-op in every other case.
    lookup(nextId)?.setInteractable?.(true);
    return nextId;
}
