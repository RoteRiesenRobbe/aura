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
import {Outlined, outlineOf, Region} from '../../regions/logic/Regions';
import {meter2px} from '../../../client-data/BasicConfig';

/**
 * A path as the renderer uses it: polyline in WORLD PIXELS.
 *
 * ⭐ Extends Region structurally so `regionPaintSpec` and `regionBlend` take it
 * unchanged — which is what makes "one profile table, two shapes" true in the
 * type system rather than only in the comments.
 */
export interface Path extends Region, Outlined {
    /** Stroke width in world PIXELS (the zone authors server units). */
    width: number;
    /**
     * Joins the last point back to the first — a moat, a ring road, a circular
     * town wall (plan-zone-polygons.md P1).
     *
     * ⛔ Still a STROKE. A closed path is not a filled shape, however much it
     * looks like one in Tiled's object list; the filled sibling is its own type.
     */
    closed?: boolean;
    /**
     * Radians to turn this path's TILE by, so the texture runs ALONG the path
     * rather than along the world axes. Absent = no rotation, which is every
     * path before `alignTexture` and every one that does not ask for it.
     *
     * ⛔ DERIVED, never authored — see {@link textureAngle}. The zone file
     * carries the flag; the number is this module's answer to it.
     */
    textureAngle?: number;
    /**
     * A point on the same segment `textureAngle` came from, in world pixels.
     * The renderer slides the tile along the path's NORMAL so the tile's
     * middle row lands on this point — which is what registers the texture
     * ACROSS the ribbon and lets a tile draw a rail, a gap or a post standing
     * proud of one. Absent whenever `textureAngle` is.
     */
    textureAnchor?: { x: number, y: number };
}

/** Authored shape, straight out of the zone file: server units. */
export interface PathDefinition {
    profile: string;
    points: { x: number, y: number }[];
    width: number;
    blocksMovement?: boolean;
    closed?: boolean;
    outlineProfile?: string;
    outlineWidth?: number;
    /** Turn the tile to run along the path (world.Path.AlignTexture). */
    alignTexture?: boolean;
}

/**
 * The angle a path's tile is turned by when `alignTexture` is set: the
 * direction of its LONGEST SEGMENT, in radians.
 *
 * ⭐ THE LONGEST SEGMENT, not the chord from first point to last and not an
 * average of all of them, and the choice is the whole content of this
 * function. A straight run — which is what a fence between two corner posts
 * IS — has one segment, so all three agree and the answer is exact. They only
 * differ on a BENT path, and there:
 *
 *   - the CHORD is wrong on an L, where it points diagonally and no leg
 *     follows it;
 *   - an AVERAGE is wrong on EVERY leg at once, which is worse than being
 *     wrong on one;
 *   - the LONGEST leg is exactly right on the leg the eye spends most of its
 *     time on, and wrong on the short ones.
 *
 * ⚑ So a bent fence is authored as one path PER STRAIGHT LEG. That is not a
 * workaround for this function, it is how a fence is actually built: the
 * corner is where the post goes.
 *
 * ⚑ A closed path also measures its wraparound segment, because for a ring
 * that leg is as real as any other.
 *
 * Returns 0 for anything with fewer than two points, which `toPaths` drops
 * anyway.
 */
export function textureAngle(points: { x: number, y: number }[], closed = false): number {
    return textureAlignment(points, closed).angle;
}

/**
 * The angle AND the anchor an aligned path hands the renderer.
 *
 * ⭐ THE ANCHOR IS WHAT MAKES A FENCE POSSIBLE, and it arrived a draft late.
 * Turning the tile is only half the job: the tile still phases from the WORLD
 * ORIGIN, so the window the stroke reveals lands at an arbitrary offset ACROSS
 * the ribbon. A tile therefore could not put anything at a known height —
 * no gap, no rail, no post standing proud of one — and a fence with no gaps
 * is a boardwalk, which is exactly what the first fence tile looked like
 * (PO: "not like a fence at all").
 *
 * With an anchor the renderer can slide the tile along the path's NORMAL so
 * the tile's middle row sits on the centreline. The texture is then registered
 * across the ribbon, structure in Y becomes legal, and the tile can be mostly
 * transparent with the ground showing through — which is what a fence is.
 *
 * ⚑ The anchor is a point on the SAME segment the angle came from, because the
 * two have to describe one line: a bend gets its dominant leg registered and
 * the short one is wrong, the same caveat the angle already carries, answered
 * the same way — one path per straight leg.
 */
export function textureAlignment(points: { x: number, y: number }[], closed = false):
    { angle: number, anchor: { x: number, y: number } } {
    let best = -1;
    let angle = 0;
    let anchor = points[0] ?? {x: 0, y: 0};
    const last = closed ? points.length : points.length - 1;
    for (let i = 0; i < last; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = dx * dx + dy * dy;
        if (len > best) {
            best = len;
            angle = Math.atan2(dy, dx);
            anchor = a;
        }
    }
    return best > 0 ? {angle, anchor} : {angle: 0, anchor};
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
        .map(p => {
            const points = (p.points || [])
                .map(pt => ({x: meter2px(pt.x + ox), y: meter2px(pt.y + oy)}));
            const align = p.alignTexture === true
                ? textureAlignment(points, p.closed === true)
                : null;
            return {
            profile: p.profile,
            points,
            width: typeof p.width === 'number' && isFinite(p.width) && p.width > 0
                ? meter2px(p.width)
                : 0,
            // ⚑ Normalised to a real boolean rather than carried through: it
            // reaches Pixi as `poly(points, closed)`, and an undefined there
            // would close the ring — Pixi's own default is true, which is the
            // opposite of what a path means.
            closed: p.closed === true,
            // ⚑ Computed here and not at paint time so there is exactly one
            // answer per path: the world and the full-screen map both paint
            // from this array, and two derivations is two chances to disagree
            // about which way a fence runs. Absent unless asked for, so an
            // unaligned path carries no key and costs nothing.
            textureAngle: align ? align.angle : undefined,
            textureAnchor: align ? align.anchor : undefined,
            ...outlineOf(p),
        };
        })
        // A path needs two points to be a line and a width to be visible, and a
        // CLOSED one needs three to be a ring. All three are server-validated;
        // this is the client's own degrade path, and it drops one path rather
        // than the zone (D11's posture).
        .filter(p => p.points.length >= (p.closed ? 3 : 2) && p.width > 0);
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
