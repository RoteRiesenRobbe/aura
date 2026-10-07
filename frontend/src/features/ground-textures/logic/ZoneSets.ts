/**
 * Which bundled zone set the client reads — `api/zones/` or `api/zones/.debug/`
 * (`aurad -debug-zones`). The server decides; the client only learns its
 * choice from Welcome.zoneName, so the set is the one that carries that
 * primary stem. The main set wins a stem both carry: `world_debug` exists
 * only in the debug set, which is what makes the rule unambiguous, and why
 * the two sets' `underworld` never collide.
 *
 * Takes the two sets' STEMS (any object keyed by stem), not their data: the
 * debug set is a lazy chunk whose contents are not loaded when this decides.
 *
 * Kept apart from GroundTextureManager so it is testable without webpack's
 * require.context.
 */
export function isDebugZoneSet(primaryZoneName: string, mainStems: object, debugStems: object): boolean {
    const inMain = Object.prototype.hasOwnProperty.call(mainStems, primaryZoneName);
    const inDebug = Object.prototype.hasOwnProperty.call(debugStems, primaryZoneName);
    return !inMain && inDebug;
}
