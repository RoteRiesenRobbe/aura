/**
 * Which bundled zone set the client reads — `api/zones/` or `api/zones/.debug/`
 * (`aurad -debug-zones`). The server decides; the client only learns its
 * choice from Welcome.zoneName, so the set is the one that carries that
 * primary stem. The main set wins a stem both carry: `world_debug` exists
 * only in the debug set, which is what makes the rule unambiguous, and why
 * the two sets' `underworld` never collide.
 *
 * Kept apart from GroundTextureManager so it is testable without webpack's
 * require.context.
 */
export function pickZoneSet<T>(primaryZoneName: string, main: { [stem: string]: T },
                               debug: { [stem: string]: T }): { [stem: string]: T } {
    const inMain = Object.prototype.hasOwnProperty.call(main, primaryZoneName);
    const inDebug = Object.prototype.hasOwnProperty.call(debug, primaryZoneName);
    return !inMain && inDebug ? debug : main;
}
