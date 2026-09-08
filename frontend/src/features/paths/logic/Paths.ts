/**
 * The path primitive (plan-world-paths.md C1).
 *
 * A zone can name polylines — `zone.paths` — each pointing at the SAME profile
 * a region uses, and stroked into the world `width` units across. Roads and
 * rivers.
 *
 * ⭐ The sibling of {@link ../../regions/logic/Regions}, not a second system: a
 * region is a closed polygon FILLED, a path is an open polyline STROKED. They
 * share the profile table, the paint spec (D14's texture-or-colour fallback)
 * and the blend mask, because in Pixi 8 `StrokeStyle extends FillStyle` — the
 * one fact that made this cheap.
 *
 * ⚑ Deliberately a separate array from `regions` rather than a region with a
 * width: a region is closed, needs >= 3 points and resolves by point-in-polygon;
 * a path is open and needs 2. One array meaning two things would make both
 * harder to read and neither easier to author.
 *
 * ⚑ Paths do NOT take part in `Regions.resolve()` (§4.6). Footsteps and music
 * ask a point which MATERIAL is underfoot, and a path is a thin ribbon whose
 * containment test is a distance-to-polyline this module deliberately does not
 * build. When an audio consumer wants "am I on a road", that is its own chunk.
 */
import {Region} from '../../regions/logic/Regions';
import {meter2px} from '../../../client-data/BasicConfig';

/**
 * A path as the renderer uses it: polyline in WORLD PIXELS.
 *
 * ⭐ Extends Region structurally so `regionPaintSpec` and `regionBlend` take it
 * unchanged — which is what makes "one profile table, two shapes" true in the
 * type system rather than only in the comments.
 */
export interface Path extends Region {
    /** Stroke width in world PIXELS (the zone authors server units). */
    width: number;
}

/** Authored shape, straight out of the zone file: server units. */
export interface PathDefinition {
    profile: string;
    points: { x: number, y: number }[];
    width: number;
    blocksMovement?: boolean;
}

let paths: Path[] = [];

/**
 * Authored server units → world pixels. The ONE conversion, for exactly the
 * reason `Regions.toRegions` is: the world and the full-screen map must not be
 * able to disagree about where a river is.
 *
 * An absent array = no paths, which is every zone shipped before this.
 *
 * ⚑ A non-finite or non-positive width is dropped to 0 here rather than passed
 * on. The server refuses it at boot, so it can only arrive from a hand-edited
 * file, and a NaN width poisons the whole Graphics batch rather than one path.
 */
export function toPaths(defs: PathDefinition[] | undefined, origin?: {x: number, y: number}): Path[] {
    const ox = origin ? origin.x : 0;
    const oy = origin ? origin.y : 0;
    return (defs || [])
        .map(p => ({
            profile: p.profile,
            points: (p.points || []).map(pt => ({x: meter2px(pt.x + ox), y: meter2px(pt.y + oy)})),
            width: typeof p.width === 'number' && isFinite(p.width) && p.width > 0
                ? meter2px(p.width)
                : 0,
        }))
        // A path needs two points to be a line and a width to be visible. Both
        // are server-validated; this is the client's own degrade path, and it
        // drops one path rather than the zone (D11's posture).
        .filter(p => p.points.length >= 2 && p.width > 0);
}

/** Installs the loaded zone's paths.
 *
 *  ⚑ REPLACES, never appends — a zone swap calls this again with the new
 *  zone's paths and the old ones must not survive it.
 *
 *  origin places the zone in the shared coordinate space (plan-underworld.md
 *  U2); absent = {0,0}. */
export function loadPaths(defs: PathDefinition[] | undefined, origin?: {x: number, y: number}) {
    paths = toPaths(defs, origin);
}

/** The loaded zone's paths, in world pixels and in authored order. */
export function loadedPaths(): Path[] {
    return paths;
}
