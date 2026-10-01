/**
 * The ribbon mesh a directional path is drawn with (plan-world-paths.md, the
 * `alignTexture` mesh chunk).
 *
 * ⭐ WHAT THIS REPLACES, and why it is not a tidy-up. Until now an aligned path
 * was ONE `.poly().stroke()` carrying ONE `Matrix`, so the tile was a
 * WORLD-SPACE pattern revealed through the stroke's silhouette: `uv = M⁻¹·P`.
 * That is exact on a straight run and wrong the moment the ribbon turns — the
 * lip, the face and the shadow keep running in the world direction while the
 * ribbon bends away underneath them, and past a bend or two the texture walks
 * off its own band entirely, leaving the stroke painting empty.
 *
 * ⛔ THAT is what forced `alignTexture` content to be authored ONE PATH PER
 * STRAIGHT LEG (`docs/art/assets.md`, the Fence row). It was never a fence
 * quirk; it was the matrix.
 *
 * ⭐ A mesh with ARC-LENGTH UVs has no such limit. `u` is the distance travelled
 * ALONG the centreline and `v` is the distance ACROSS it, so the texture follows
 * the ribbon around any number of bends, with no seam, no kink and no cap.
 *
 * ⭐ AND IT DELETES A MECHANISM RATHER THAN ADDING ONE. `Paths.textureAnchor`
 * exists only because a matrix phases from the world origin, so a stroke
 * revealed an arbitrary window across the ribbon and a tile could put nothing
 * at a known height — the whole reason the first fence came out a boardwalk.
 * Here registration is not a correction applied afterwards, it is the
 * definition: `v` IS the across-coordinate, and the tile's middle row lands on
 * the centreline because {@link ribbonGeometry} writes `v = 0.5` there.
 *
 * ⚑ THE STRETCH IS REAL AND IS THE POINT. `u` is measured on the CENTRELINE, so
 * the outer rim of a bend covers more ground per unit of texture than the inner
 * rim: the pattern stretches outside a corner and compresses inside it. That is
 * what a road, a hedge and a rock stratum actually do, and it is why this is
 * preferable to mitring two independently-textured segments together.
 *
 * ⚑ Deliberately free of PixiJS and of the DOM. It returns plain typed arrays,
 * which is what makes every claim above reachable from vitest — the sibling
 * half that must touch the GPU is `RegionPaint.paintRibbon`.
 */
import {RegionPoint} from '../../regions/logic/Regions';
import {TAPER_LENGTH_PER_WIDTH} from './Paths';

/** A triangle strip over a polyline, in the three buffers a Pixi mesh wants. */
export interface Ribbon {
    /** World px, two floats per vertex, rim pairs in centreline order. */
    positions: Float32Array;
    /** Texture space, two floats per vertex. `v = 0.5` is the centreline. */
    uvs: Float32Array;
    indices: Uint32Array;
}

/**
 * How far a mitred corner may stretch before it is given up on, as a multiple
 * of the half-width.
 *
 * ⛔ A mitre length goes to INFINITY as a corner closes on itself, which is
 * exactly the spike a round join avoids — see the D10
 * note in RegionPaint. Clamping trades that spike for a slightly NARROW band on
 * the outside of a hairpin, which is the right way round: a hairpin in authored
 * content is rare and a little pinch there is invisible, while one spike is a
 * rock shard flung across the map.
 */
export const MITRE_LIMIT = 4;

/** The unit normal of the segment a→b, or null if the two coincide. */
function segmentNormal(a: RegionPoint, b: RegionPoint): { x: number, y: number, len: number } | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) { return null; }
    // ⚑ (−dy, dx) is the side the tile's FACE sits on: `v > 0.5`. Flip this and
    // every cliff in the game faces inland. Pinned by PathRibbon.test.ts.
    return {x: -dy / len, y: dx / len, len};
}

/**
 * Drops consecutive duplicate points, which are what a Tiled double-click
 * leaves behind and what would otherwise put a zero-length segment — and so a
 * NaN normal — into the middle of an otherwise fine path.
 */
function distinct(points: RegionPoint[], closed: boolean): number[] {
    const out: number[] = [];
    points.forEach((p, i) => {
        const last = points[out[out.length - 1]];
        if (!last || last.x !== p.x || last.y !== p.y) { out.push(i); }
    });
    // A closed ring whose last point repeats its first carries the closure in
    // the flag, not in the geometry.
    if (closed && out.length > 1) {
        const first = points[out[0]];
        const last = points[out[out.length - 1]];
        if (first.x === last.x && first.y === last.y) { out.pop(); }
    }
    // ⚑ INDICES, not points, so a per-point array riding beside the points
    // (the taper's width factors) is thinned by exactly the same rule.
    return out;
}

/** A centreline with a pointed end's taper resolved (Paths `ends: point`). */
export interface TaperedCentreline {
    /** The centreline, with a vertex inserted wherever a taper begins. */
    points: RegionPoint[];
    /** The width factor at each point: 1 at full width, 0 at the tip. */
    factors: number[];
    /** The first and last full-width point; equal when the two tapers meet. */
    full: [number, number];
}

/**
 * Resolves the taper a path with `ends: point` narrows by: the last
 * `TAPER_LENGTH_PER_WIDTH × width` of the drawn length at EACH end, measured
 * along the arc, falling linearly to nothing at the endpoint.
 *
 * ⭐ INSIDE the drawn length, not past it (PO-ruled): the endpoint in Tiled is
 * where the tip is, and the server narrows the collision the same way
 * (`paths_collision.go` pathTaper).
 *
 * ⚑ Clamped to half the path, so on a short one the two tapers meet in the
 * middle and nothing is full width, rather than overlapping.
 *
 * ⚑ A vertex is inserted where each taper begins, so the linear ramp starts
 * exactly there and a renderer can split the full-width middle off cleanly.
 * A cut landing on an existing vertex reuses it instead of doubling it.
 *
 * @returns null when there is no length to taper.
 */
export function taperedCentreline(points: RegionPoint[], width: number): TaperedCentreline | null {
    const pts = distinct(points, false).map(i => points[i]);
    if (pts.length < 2 || !(width > 0)) { return null; }
    const arc = [0];
    for (let i = 1; i < pts.length; i++) {
        arc.push(arc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const total = arc[arc.length - 1];
    if (!(total > 0)) { return null; }
    const taper = Math.min(TAPER_LENGTH_PER_WIDTH * width, total / 2);
    const cuts = taper < total / 2 ? [taper, total - taper] : [taper];

    // World px: a cut closer than this to a vertex IS that vertex.
    const EPS = 1e-3;
    const out: RegionPoint[] = [];
    const at: number[] = [];
    for (let i = 0; i < pts.length; i++) {
        if (i > 0) {
            cuts.forEach((c) => {
                if (c > arc[i - 1] + EPS && c < arc[i] - EPS) {
                    const t = (c - arc[i - 1]) / (arc[i] - arc[i - 1]);
                    out.push({
                        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
                        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
                    });
                    at.push(c);
                }
            });
        }
        out.push(pts[i]);
        at.push(arc[i]);
    }

    const first = at.findIndex(s => s >= taper - EPS);
    let last = first;
    at.forEach((s, i) => { if (s <= total - taper + EPS) { last = i; } });
    const factors = at.map((s, i) => (i >= first && i <= last)
        ? 1
        : Math.max(0, Math.min(1, Math.min(s, total - s) / taper)));
    return {points: out, factors, full: [first, last]};
}

/**
 * The outline of a ribbon as ONE polygon — one rim walked out, the other
 * walked back — for a fill to draw what a stroke cannot: a width that changes
 * along the run. The shape a pointed end's taper is drawn as.
 *
 * ⚑ Its bends are always MITRED (it is {@link ribbonGeometry}'s rims), so a
 * `round`-cornered path that bends INSIDE its taper gets a sharp corner there.
 *
 * @returns flat `[x0, y0, x1, y1, …]`, or null when there is no ribbon.
 */
export function ribbonOutline(points: RegionPoint[], width: number, factors: number[]): number[] | null {
    const r = ribbonGeometry(points, width, false, 1, 1, 0, factors);
    if (r === null) { return null; }
    const n = r.positions.length / 4;
    const flat: number[] = [];
    for (let i = 0; i < n; i++) { flat.push(r.positions[i * 4], r.positions[i * 4 + 1]); }
    for (let i = n - 1; i >= 0; i--) { flat.push(r.positions[i * 4 + 2], r.positions[i * 4 + 3]); }
    return flat;
}

/**
 * Builds the ribbon for one path.
 *
 * @param points     centreline, world px
 * @param width      stroke width, world px — the same number the stroke used
 * @param closed     join the last point back to the first
 * @param tileW      world px ONE TILE spans along the run  (texture.width × scale)
 * @param tileH      world px ONE TILE spans across the run (texture.height × scale)
 * @param overdraw   extra half-width on BOTH rims, world px. Zero for a hard
 *                   edge; for a feathered surface it is how far the blurred
 *                   mask can reach, because masked alpha is content × mask and
 *                   content that stops at the rim would end the outward half of
 *                   the ramp in a step. It widens the GEOMETRY and the `v` range
 *                   together, so the texture does not stretch to fill it.
 * @param factors    optional width factor per point (a pointed end's taper,
 *                   {@link taperedCentreline}). It narrows the POSITIONS only:
 *                   the `v` band stays, so the tile COMPRESSES across the
 *                   ribbon and a cliff reads as getting lower rather than
 *                   being cropped to its middle rows. Overdraw is not scaled.
 * @returns the ribbon, or null when there is not enough geometry to build one
 */
export function ribbonGeometry(
    points: RegionPoint[],
    width: number,
    closed: boolean,
    tileW: number,
    tileH: number,
    overdraw = 0,
    factors?: number[],
): Ribbon | null {
    const kept = distinct(points, closed);
    const pts = kept.map(i => points[i]);
    const scaleAt = (i: number) => (factors ? factors[kept[i % kept.length]] : 1);
    const n = pts.length;
    if (n < 2 || !(width > 0) || !(tileW > 0) || !(tileH > 0)) { return null; }
    if (closed && n < 3) { return null; }

    const margin = Math.max(0, overdraw);
    const half = width / 2 + margin;
    // ⚑ `v` is derived from the SAME half-width the positions use, so overdraw
    // shows more of the tile rather than scaling it. See the param note.
    const vLow = 0.5 - half / tileH;
    const vHigh = 0.5 + half / tileH;

    // The rim count: a closed ring repeats its first pair at the end so the
    // seam is a normal quad rather than a special case.
    const rims = closed ? n + 1 : n;
    const positions = new Float32Array(rims * 4);
    const uvs = new Float32Array(rims * 4);
    const indices = new Uint32Array((rims - 1) * 6);

    const normalAt = (i: number) => {
        // The segment LEAVING vertex i, wrapping on a closed ring.
        const a = pts[i % n];
        const b = pts[(i + 1) % n];
        return segmentNormal(a, b);
    };

    // ⭐ A CLOSED RING IS FITTED TO A WHOLE NUMBER OF TILES, and without this it
    // is the one shape with a guaranteed visible defect. An open path may end
    // mid-tile — nothing meets it there — but a ring's end IS its beginning, so
    // a perimeter of 7.4 tiles butts tile 0.4 against tile 0 and leaves a hard
    // mismatch down one authored vertex: strata that do not line up, a fence
    // post cut in half.
    //
    // ⚑ The correction is spread over the WHOLE perimeter, never hidden at the
    // seam: every `u` is scaled by at most half a tile in the ring's entire
    // length, which is imperceptible on anything bigger than a couple of tiles
    // and exact at the join. ⛔ It deliberately does NOT preserve the tile's
    // world scale — the texture stretches by that fraction — and that is the
    // right trade, because a seam is a line the eye finds instantly while a
    // 3 % stretch is not a thing anyone can see.
    //
    // A ring shorter than one and a half tiles rounds to a single wrap, which
    // is the only sensible answer there.
    let uScale = 1 / tileW;
    if (closed) {
        let perimeter = 0;
        for (let i = 0; i < n; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % n];
            perimeter += Math.hypot(b.x - a.x, b.y - a.y);
        }
        const tiles = Math.max(1, Math.round(perimeter / tileW));
        if (perimeter > 0) { uScale = tiles / perimeter; }
    }

    let along = 0;
    for (let i = 0; i < rims; i++) {
        const p = pts[i % n];
        const prev = closed || i > 0 ? normalAt((i - 1 + n) % n) : null;
        const next = closed || i < n - 1 ? normalAt(i % n) : null;

        // ⭐ The mitre: the bisector of the two segment normals, lengthened by
        // 1/cos(θ/2) so the rim stays `half` from the centreline THROUGH the
        // corner. Without the lengthening the band pinches at every bend.
        let mx: number;
        let my: number;
        if (prev && next) {
            const bx = prev.x + next.x;
            const by = prev.y + next.y;
            const blen = Math.hypot(bx, by);
            if (blen < 1e-6) {
                // A perfect reversal: the bisector is undefined. Fall back to
                // the outgoing normal rather than dividing by nothing.
                mx = next.x;
                my = next.y;
            } else {
                const ux = bx / blen;
                const uy = by / blen;
                const cos = ux * next.x + uy * next.y;
                const scale = Math.min(MITRE_LIMIT, 1 / Math.max(1e-3, cos));
                mx = ux * scale;
                my = uy * scale;
            }
        } else {
            const only = (prev || next) as { x: number, y: number };
            mx = only.x;
            my = only.y;
        }

        if (i > 0) {
            const q = pts[(i - 1 + n) % n];
            along += Math.hypot(p.x - q.x, p.y - q.y);
        }
        const u = along * uScale;

        const o = i * 4;
        const reach = factors ? (width / 2) * scaleAt(i) + margin : half;
        positions[o] = p.x - mx * reach;
        positions[o + 1] = p.y - my * reach;
        positions[o + 2] = p.x + mx * reach;
        positions[o + 3] = p.y + my * reach;
        uvs[o] = u;
        uvs[o + 1] = vLow;
        uvs[o + 2] = u;
        uvs[o + 3] = vHigh;

        if (i > 0) {
            const t = (i - 1) * 6;
            const a = (i - 1) * 2;
            indices[t] = a;
            indices[t + 1] = a + 1;
            indices[t + 2] = a + 2;
            indices[t + 3] = a + 1;
            indices[t + 4] = a + 3;
            indices[t + 5] = a + 2;
        }
    }

    return {positions, uvs, indices};
}
