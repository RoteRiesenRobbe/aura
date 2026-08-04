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

/** One campfire as the bundled zone JSON authors it: world units, plus its id. */
export interface ZoneCampfirePoint {
    id?: string;
    x: number;
    y: number;
}

/** A campfire marker placed on the map, in canvas pixels from the layer origin. */
export interface CampfireMarker {
    id: string;
    x: number;
    y: number;
    /** The fire this character would respawn at — drawn with its own highlight. */
    home: boolean;
}

/**
 * Which campfires to draw, and where (plan-world-map.md C2).
 *
 * ⚑ DISCOVERED FIRES ONLY, and undiscovered ones are ABSENT rather than dimmed
 * or greyed (D6). The map turning exploration into a visible reward is the whole
 * point; a greyed marker would show you where to go.
 *
 * ⚑ AN ID WITH NO PLACED FIRE DRAWS NOTHING, silently. The server publishes the
 * set raw, and the client's bundled zone data can differ from the server's
 * authored content across a deploy — so a fire deleted in the zone editor has to
 * be a marker that simply is not there, never a throw and never a per-frame
 * warning. Same rule the server already applies to home_campfire_id.
 *
 * ⚑ Returns nothing at scale 0. A pixi canvas measures 0 × 0 while it is
 * display:none (the phone keeps the minimap in the layout for exactly this
 * reason), and multiplying through would stack every marker on the origin —
 * which looks like a cluster of fires at the centre of the world, not like a
 * canvas that has not been measured yet.
 *
 * `campfires` is authored in WORLD units and the map is in px space, so the
 * caller passes the px-per-world-unit factor it already has (meter2px) rather
 * than this module reaching for the client's config.
 */
export function campfireMarkers(
    campfires: ZoneCampfirePoint[],
    discovered: ReadonlySet<string>,
    home: string,
    scale: number,
    worldToPx: number,
): CampfireMarker[] {
    if (!isPositive(scale) || !campfires || discovered.size === 0) {
        return [];
    }
    const markers: CampfireMarker[] = [];
    for (const fire of campfires) {
        if (!fire || !fire.id || !discovered.has(fire.id)) {
            continue;
        }
        if (!Number.isFinite(fire.x) || !Number.isFinite(fire.y)) {
            continue;
        }
        markers.push({
            id: fire.id,
            x: fire.x * worldToPx * scale,
            y: fire.y * worldToPx * scale,
            home: fire.id === home,
        });
    }
    return markers;
}

/** One player as the roster message delivers them: px space, plus their id. */
export interface RosterPlayer {
    id: number;
    x: number;
    y: number;
}

/** A player dot placed on the map, in canvas pixels from the layer origin. */
export interface RosterMarker {
    id: number;
    x: number;
    y: number;
}

/**
 * Where to draw the other players (plan-world-map.md C3, D7).
 *
 * ⚑ THE ROSTER IS THE ONLY SOURCE FOR OTHER PLAYERS, which §2 of the plan got
 * wrong: it recorded that other characters already appear on the minimap via
 * their AOI entity icons, but `Character` sets `visibleOnMinimap = false` in its
 * constructor and only the local `Player` flips it true. Nobody but you has ever
 * been drawn. That is why the plan's landmine 6 ("two sources for the same
 * player") does not bite here — there is no second source to arbitrate against.
 *
 * ⚑ YOUR OWN DOT IS EXCLUDED, and by id rather than by trusting the server to
 * leave you out. Your position comes from the 30 Hz AOI stream and glides;
 * roster positions step once a second, so drawing yourself from both would show
 * one dot sliding out from under another every second.
 *
 * ⚑ Positions arrive ALREADY IN PX (RosterEntry.pos is marshalled through the
 * same f32ToPx as Character.pos), so unlike campfireMarkers above there is no
 * world→px factor here. Applying one would place every dot 120× too far out.
 *
 * ⚑ Returns nothing at scale 0, for the same reason campfireMarkers does — a
 * display:none canvas measures 0 × 0, and multiplying through would pile every
 * player onto the centre of the world.
 */
export function rosterMarkers(
    players: RosterPlayer[],
    selfId: number,
    scale: number,
): RosterMarker[] {
    if (!isPositive(scale) || !players) {
        return [];
    }
    const markers: RosterMarker[] = [];
    for (const player of players) {
        if (!player || player.id === selfId) {
            continue;
        }
        if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) {
            continue;
        }
        markers.push({
            id: player.id,
            x: player.x * scale,
            y: player.y * scale,
        });
    }
    return markers;
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
