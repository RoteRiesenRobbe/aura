/**
 * The filled-polygon primitive (plan-zone-polygons.md P2).
 *
 * A zone can name closed polygons — `zone.polygons` — each pointing at the SAME
 * profile a region and a path do, and FILLED into the world: a rock mass, a
 * building footprint, a lake you cannot swim.
 *
 * ⭐ The third surface, and the sibling of both the others rather than a variant
 * of either: a region is a polygon filled as a MATERIAL, a path is a polyline
 * STROKED, a polygon is a polygon filled as a THING. They share the profile
 * table, the paint spec (D14's texture-or-colour fallback), the blend mask and
 * the drift — everything except what they MEAN.
 *
 * ⛔ Polygons do NOT take part in `Regions.resolve()`. That lookup answers "what
 * material is underfoot" for footsteps, music and atmosphere, and is heading for
 * quest-trigger identity; a cave wall is none of those things. The distinction
 * is the whole reason this is a separate array (D1) and not a `regions` entry
 * with a flag.
 *
 * ⚑ Deliberately imports nothing heavy, for the reason `Regions.ts` records: the
 * zone data is handed in by the caller, so the conversion stays testable.
 */
import {Outlined, outlineOf, Region} from '../../regions/logic/Regions';
import {meter2px} from '../../../client-data/BasicConfig';

/**
 * A polygon as the renderer uses it: vertices in WORLD PIXELS.
 *
 * ⭐ Extends Region structurally — like `Path` does — so `regionPaintSpec`,
 * `regionBlend` and `regionScroll` take it unchanged. That is what makes "one
 * profile table, three shapes" true in the type system and not only in the
 * comments.
 */
export interface Polygon extends Region, Outlined {}

/** Authored shape, straight out of the zone file: server units. */
export interface PolygonDefinition {
    profile: string;
    points: { x: number, y: number }[];
    blocksMovement?: boolean;
    outlineProfile?: string;
    outlineWidth?: number;
}

let polygons: Polygon[] = [];

/**
 * Authored server units → world pixels. The ONE conversion, for exactly the
 * reason `Regions.toRegions` and `Paths.toPaths` are: the world and the
 * full-screen map must not be able to disagree about where a rock is.
 *
 * An absent array = no polygons, which is every zone shipped before this.
 */
export function toPolygons(
    defs: PolygonDefinition[] | undefined,
    origin?: {x: number, y: number},
): Polygon[] {
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;
    return (defs || [])
        .map(p => ({
            profile: p.profile,
            points: (p.points || []).map(pt => ({x: meter2px(pt.x + ox), y: meter2px(pt.y + oy)})),
            ...outlineOf(p),
        }))
        // THREE points to enclose an area — the same rule a region has, and the
        // reason this is not two. The server refuses fewer, so this is the
        // client's own degrade path for a hand-edited file, and it drops one
        // polygon rather than the zone (D11's posture).
        .filter(p => p.points.length >= 3);
}

/** Installs the loaded zone's polygons.
 *
 *  ⚑ REPLACES, never appends — a zone swap calls this again with the new zone's
 *  polygons and the old ones must not survive it.
 *
 *  origin places the zone in the shared coordinate space (plan-underworld.md
 *  U2); absent = {0,0}. */
export function loadPolygons(defs: PolygonDefinition[] | undefined, origin?: {x: number, y: number}) {
    polygons = toPolygons(defs, origin);
}

/** The loaded zone's polygons, in world pixels and in authored order. */
export function loadedPolygons(): Polygon[] {
    return polygons;
}
