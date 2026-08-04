/**
 * The map's scale math (plan-world-map.md C1, D5).
 *
 * DOM-free and pixi-free on purpose, so vitest can cover it: the map module
 * next door owns a renderer and cannot be unit-tested, but *this* — the one
 * piece with a wrong answer worth catching — can be.
 *
 * Two facts make the whole file this short:
 *
 *   · ⚑ The world is ORIGIN-CENTRED. `api/zones/world.json` is 144 × 72 with
 *     terrain spanning ±71.5 × ±35.6, and the layer containers are positioned
 *     at the canvas centre (MiniMap.updateScaling). So a map coordinate maps
 *     to a canvas one by multiplying by the scale — no translation term, and
 *     letterboxing in the full-screen state falls out for free rather than
 *     needing an offset of its own.
 *   · ⚑ The bounds here are NOT world units. `Welcome.mapWidth` is
 *     `Bounds.Width * Points2px` (core/game.go), so the 144 × 72 zone arrives
 *     as 17280 × 8640 — the client's px space, which is also what `getX()` and
 *     `getY()` return. Bounds and coordinates therefore share one space and
 *     the ratio below is correct; the trap is assuming either is in metres and
 *     "helpfully" converting one of them.
 *   · ⚑ The docked state deliberately ignores height. `scale = width/mapWidth`
 *     is what the minimap has always done; its HUD box is square-ish and the
 *     world is 2:1, so fitting to width is what makes it fill the box. Do not
 *     "fix" this to a min() for symmetry with the full-screen state — that
 *     would shrink today's minimap by half and is a visual change nobody asked
 *     for (§9: the docked state stays as it is).
 */

export enum MapState {
    /** Today's minimap, in its HUD corner box. */
    DOCKED,
    /** The viewport-filling overlay (D5). */
    FULLSCREEN,
}

export interface MapViewport {
    /** Canvas size in pixels. */
    width: number;
    height: number;
}

export interface MapBounds {
    /**
     * Zone size in the client's px space, as `Welcome.mapWidth` delivers it —
     * the zone JSON's `bounds` × 120. See the px-space note above.
     */
    mapWidth: number;
    mapHeight: number;
}

/**
 * Pixels per world unit for a state.
 *
 * Full-screen fits BOTH axes (`min`), which is what letterboxes it: the world
 * is 2:1 and a viewport rarely is, so one axis has slack and the centred
 * origin splits that slack evenly on both sides.
 *
 * Returns 0 for a degenerate viewport or bounds rather than Infinity/NaN — a
 * pixi canvas measures 0 × 0 while it is display:none (the phone layout keeps
 * the minimap in the layout for exactly this reason, HUD.mobile.less), and a
 * NaN scale silently teleports every icon to the top-left corner.
 */
export function mapScale(state: MapState, viewport: MapViewport, bounds: MapBounds): number {
    if (!isPositive(bounds.mapWidth) || !isPositive(bounds.mapHeight)) {
        return 0;
    }

    const horizontal = isPositive(viewport.width) ? viewport.width / bounds.mapWidth : 0;
    if (state === MapState.DOCKED) {
        return horizontal;
    }

    const vertical = isPositive(viewport.height) ? viewport.height / bounds.mapHeight : 0;
    return Math.min(horizontal, vertical);
}

/**
 * A world coordinate in canvas pixels, relative to the layer origin — which is
 * the canvas centre, not its top-left. Callers add nothing; that offset is the
 * container's own position.
 */
export function worldToMap(world: number, scale: number): number {
    return world * scale;
}

/**
 * Re-places an icon that was positioned at `previousScale` onto `scale`.
 *
 * The map keeps icons in canvas pixels rather than world units (that predates
 * this plan and is not worth churning), so a scale change has to walk them.
 * Recovering the world coordinate by dividing needs `previousScale` to be
 * non-zero — on the first sizing, and whenever the canvas was measured at
 * 0 × 0, it is not, and the icon simply has no position to preserve yet.
 */
export function rescaleCoordinate(canvasCoordinate: number, previousScale: number, scale: number): number {
    if (!isPositive(previousScale)) {
        return canvasCoordinate;
    }
    return (canvasCoordinate / previousScale) * scale;
}

/**
 * Is a canvas-space point on the drawn map, as opposed to the letterbox around
 * it?
 *
 * The canvas fills its container, but the map inside it is `mapWidth × scale`
 * centred in that canvas — and because the world is 2:1 and viewports rarely
 * are, there is usually a band of empty overlay on two sides. Clicking that
 * band means "I am done with the map"; clicking the map itself does not, and
 * in part 2 will mean "fly there".
 *
 * Takes the point relative to the canvas's top-left, which is what
 * `clientX - canvas.getBoundingClientRect().left` gives.
 */
export function isInsideDrawnMap(
    point: {x: number, y: number},
    viewport: MapViewport,
    bounds: MapBounds,
    scale: number,
): boolean {
    if (!isPositive(scale)) {
        // Nothing is drawn, so no point is on it — and every click should fall
        // through to the dismissal rather than be swallowed by an empty map.
        return false;
    }
    const halfWidth = (bounds.mapWidth * scale) / 2;
    const halfHeight = (bounds.mapHeight * scale) / 2;
    return Math.abs(point.x - viewport.width / 2) <= halfWidth
        && Math.abs(point.y - viewport.height / 2) <= halfHeight;
}

/** The two fields resizeTerrain touches — see the note on its signature. */
export interface ResizableTerrain {
    width: number;
    height: number;
}

/**
 * Fits the baked terrain sprite to a scale. This is the entire cost of a
 * resize or a state change — two numbers, no rasterisation (MapTerrain's
 * header explains why that matters).
 *
 * ⚑ It lives HERE, in the pure module, rather than beside the baking code, for
 * two reasons. It is the same map math as everything else in this file — the
 * terrain is just one more thing placed by `scale`. And MapTerrain reaches the
 * ground-texture registry, which kicks off SVG preloading at import time, so a
 * test importing it loads assets instead of asserting; keeping this side of
 * the line testable is what lets the alignment invariant be pinned at all.
 *
 * That invariant: terrain is drawn at exactly `mapWidth × scale` and markers
 * at `getX() × scale`, so a marker's offset from the centre is always the same
 * fraction of the map as its world position. Two different scales here and
 * every marker drifts off the ground it stands on.
 */
export function resizeTerrain(
    terrain: ResizableTerrain, mapWidth: number, mapHeight: number, scale: number,
) {
    terrain.width = mapWidth * scale;
    terrain.height = mapHeight * scale;
}

function isPositive(value: number): boolean {
    return Number.isFinite(value) && value > 0;
}
