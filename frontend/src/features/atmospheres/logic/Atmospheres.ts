/**
 * The atmosphere primitive (plan-region-atmosphere.md A0).
 *
 * A zone can name closed areas — `zone.atmospheres` — each pointing at the SAME
 * profile table a region, a path and a polygon do, and describing the AIR
 * rather than the ground: how dark this place is, how far you see inside it,
 * and what the murk looks like.
 *
 * ⭐ Its own array rather than properties on a region (D0, PO-ruled
 * 2026-09-12), because the air and the ground are not the same boundary: the
 * lit pocket at a cave mouth has the SAME FLOOR as the dark part of the cave,
 * and a lit clearing in a dark forest is still forest underfoot. Welding the
 * two forces one polygon to answer both questions — and the "lit clearing" case
 * then needs a fake region that silently overrides the footsteps and the music
 * of anyone standing in it. Third application of the ruling `Paths.ts` already
 * records against regions: one array meaning two things makes both harder.
 *
 * ⛔ IT IS NOT A `Polygon`, AND THE WORD "POLYGON" IS THE TRAP (D15). Polygon
 * is the WALL/MASS primitive: it fills as a THING, it may BLOCK, it takes an
 * outline, and the server builds static bodies for it. An atmosphere blocks
 * NOTHING, takes no outline, never reaches `phy.Space`, and is drawn ON TOP OF
 * EVERYTHING — every wall, road and entity — rather than into the ground. The
 * two share a SHAPE and nothing else: a polygon is a wall you walk into, an
 * atmosphere is air you walk through.
 *
 * ⛔ Atmospheres do NOT take part in `Regions.resolve()`'s region walk.
 * `darkness`, `haze` and `sight` resolve over THIS array (A1/A2) via the same
 * `resolveIn`, which
 * already takes the shape list as a parameter — so the lookup engine is reused
 * and only the array differs.
 *
 * ⚑ Deliberately imports nothing heavy, for the reason `Regions.ts` records:
 * the zone data is handed in by the caller, so the conversion stays testable.
 */
import {Region} from '../../regions/logic/Regions';
import {meter2px} from '../../../client-data/BasicConfig';

/**
 * An atmosphere as the renderer uses it: vertices in WORLD PIXELS.
 *
 * ⭐ Extends Region structurally — like `Path` and `Polygon` do — so
 * `regionPaintSpec`, `regionBlend` and `regionScroll` take it unchanged. That
 * is what makes "one profile table, four shapes" true in the type system and
 * not only in the comments, and it is what lets A1 paint fog with the shipped
 * texture/blend/scroll machinery instead of a second drawing system.
 *
 * ⛔ It does NOT extend `Outlined`, and that omission is the D15 ruling in the
 * type system: an outline is a second surface drawn along a boundary, and air
 * has no boundary to draw.
 */
export interface Atmosphere extends Region {}

/** Authored shape, straight out of the zone file: server units.
 *
 *  ⛔ Two fields, and the SHORTNESS IS THE POINT — no `blocksMovement`, no
 *  `width`, no `closed`, no outline. The server refuses every one of those by
 *  name (`DisallowUnknownFields`), so authoring collision onto air is
 *  impossible rather than merely undocumented. */
export interface AtmosphereDefinition {
    profile: string;
    points: { x: number, y: number }[];
}

let atmospheres: Atmosphere[] = [];

/**
 * Authored server units → world pixels. The ONE conversion, for exactly the
 * reason `Regions.toRegions`, `Paths.toPaths` and `Polygons.toPolygons` are.
 *
 * ⚑ The origin is applied HERE and NOT on the server (unlike polygons, which
 * are collision geometry and therefore placed by `world.Place`). An atmosphere
 * is client-visual, so the server leaves it zone-local on purpose — applying it
 * in both places would move every fog bank twice, and that failure is invisible
 * in `world` (origin {0,0}) and 300 units off in the underworld.
 *
 * An absent array = no atmospheres, which is every zone shipped before this.
 */
export function toAtmospheres(
    defs: AtmosphereDefinition[] | undefined,
    origin?: {x: number, y: number},
): Atmosphere[] {
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;
    return (defs || [])
        .map(a => ({
            profile: a.profile,
            points: (a.points || []).map(pt => ({x: meter2px(pt.x + ox), y: meter2px(pt.y + oy)})),
        }))
        // THREE points to enclose an area — the same rule a region and a polygon
        // have. The server refuses fewer, so this is the client's own degrade
        // path for a hand-edited file, and it drops one shape rather than the
        // zone (region-primitive D11's posture).
        .filter(a => a.points.length >= 3);
}

/** Installs the loaded zone's atmospheres.
 *
 *  ⚑ REPLACES, never appends — a zone swap calls this again with the new zone's
 *  atmospheres and the old ones must not survive it.
 *
 *  origin places the zone in the shared coordinate space (plan-underworld.md
 *  U2); absent = {0,0}. */
export function loadAtmospheres(defs: AtmosphereDefinition[] | undefined, origin?: {x: number, y: number}) {
    atmospheres = toAtmospheres(defs, origin);
}

/** The loaded zone's atmospheres, in world pixels and in AUTHORED ORDER — which
 *  is the order both the drawing and the resolution rule read (D0/D3), so what
 *  you see on top is what a lookup at that point will answer. */
export function loadedAtmospheres(): Atmosphere[] {
    return atmospheres;
}
