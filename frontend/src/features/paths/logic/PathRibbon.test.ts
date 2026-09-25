import {describe, it, expect} from 'vitest';
import {ribbonGeometry} from './PathRibbon';
import {RegionPoint} from '../../regions/logic/Regions';

/**
 * ⚑ The buffers are Float32Array because that is what a GPU vertex buffer is,
 * so every assertion below is limited to about seven significant digits. A
 * tighter `toBeCloseTo` here does not test the geometry, it tests IEEE 754 —
 * and it reddens on arithmetic that is perfectly correct.
 */
const FLOAT32 = 5;

/** One tile spans 720 x 320 world px — the cliff tile at scale 1. */
const TILE_W = 720;
const TILE_H = 320;

const vertex = (r: NonNullable<ReturnType<typeof ribbonGeometry>>, i: number) => ({
    x: r.positions[i * 2],
    y: r.positions[i * 2 + 1],
    u: r.uvs[i * 2],
    v: r.uvs[i * 2 + 1],
});
const count = (r: NonNullable<ReturnType<typeof ribbonGeometry>>) => r.positions.length / 2;

describe('ribbonGeometry', () => {
    it('puts the tile\'s middle row on the centreline', () => {
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 1000, y: 0}], 240, false, TILE_W, TILE_H)!;
        // ⭐ Registration is the DEFINITION here, not a correction applied after
        // the fact: the two rims straddle v = 0.5 by exactly half the stroke,
        // measured in tiles. This is what `Paths.textureAnchor` was built to
        // achieve against a matrix, and what the mesh gets for nothing.
        expect(vertex(r, 0).v + vertex(r, 1).v).toBeCloseTo(1, FLOAT32);
        expect(vertex(r, 1).v - vertex(r, 0).v).toBeCloseTo(240 / TILE_H, FLOAT32);
    });

    it('measures u in tiles along the run', () => {
        const r = ribbonGeometry([{x: 0, y: 0}, {x: TILE_W * 3, y: 0}], 240, false,
            TILE_W, TILE_H)!;
        expect(vertex(r, 0).u).toBe(0);
        expect(vertex(r, 2).u).toBeCloseTo(3, FLOAT32);
    });

    it('reproduces the matrix exactly on a straight run', () => {
        // ⭐ THE CLAIM THE WHOLE CHUNK RESTS ON: for a single segment, arc-length
        // UVs and `tileMatrix` are the same function, so every straight aligned
        // path already in the game — all three fences — is untouched by the
        // switch. If this ever reddens, the mesh has started disagreeing with
        // the shipped content rather than with the bends.
        const width = 240;
        const pts = [{x: 100, y: 50}, {x: 100 + 3 * TILE_W, y: 50}];
        const r = ribbonGeometry(pts, width, false, TILE_W, TILE_H)!;

        // What the matrix does: u = along/tileW from the anchor, v = 0.5 +
        // across/tileH, with the anchor sitting on the centreline.
        const matrixUv = (x: number, y: number) => ({
            u: (x - pts[0].x) / TILE_W,
            v: 0.5 + (y - pts[0].y) / TILE_H,
        });
        for (let i = 0; i < count(r); i++) {
            const got = vertex(r, i);
            const want = matrixUv(got.x, got.y);
            expect(got.u).toBeCloseTo(want.u, FLOAT32);
            expect(got.v).toBeCloseTo(want.v, FLOAT32);
        }
    });

    it('keeps the band a constant width through a bend', () => {
        // ⚑ This is what the mitre buys, and ⛔ the invariant is NOT the distance
        // between the two rim vertices. At a corner those sit on the BISECTOR,
        // so they are further apart than the stroke is wide — by 1/cos(θ/2),
        // which is the whole purpose of the lengthening. What must stay equal to
        // half the width is the PERPENDICULAR distance from each rim vertex to
        // each segment it touches; that is what "the band does not pinch at
        // corners" actually means. Asserting the easy thing instead reads as a
        // 20 px bug in correct code.
        const pts = [{x: 0, y: 0}, {x: 500, y: 0}, {x: 900, y: 400}];
        const r = ribbonGeometry(pts, 240, false, TILE_W, TILE_H)!;
        const distanceToLine = (p: {x: number, y: number}, a: RegionPoint, b: RegionPoint) => {
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            return Math.abs((p.x - a.x) * (-dy / len) + (p.y - a.y) * (dx / len));
        };
        for (let i = 0; i < pts.length; i++) {
            for (const rim of [vertex(r, i * 2), vertex(r, i * 2 + 1)]) {
                if (i > 0) {
                    expect(distanceToLine(rim, pts[i - 1], pts[i])).toBeCloseTo(120, 4);
                }
                if (i < pts.length - 1) {
                    expect(distanceToLine(rim, pts[i], pts[i + 1])).toBeCloseTo(120, 4);
                }
            }
        }
    });

    it('runs u continuously across a bend', () => {
        // ⭐ The bend is where the stroke+matrix gave up: the texture kept its
        // world direction and walked off the ribbon. Here u only ever advances,
        // and by the centreline distance travelled.
        const pts = [{x: 0, y: 0}, {x: 500, y: 0}, {x: 500, y: 500}];
        const r = ribbonGeometry(pts, 240, false, TILE_W, TILE_H)!;
        expect(vertex(r, 0).u).toBe(0);
        expect(vertex(r, 2).u).toBeCloseTo(500 / TILE_W, FLOAT32);
        expect(vertex(r, 4).u).toBeCloseTo(1000 / TILE_W, FLOAT32);
    });

    it('puts the face on the same side of the run every time', () => {
        // ⛔ The winding ruling, pinned. `v > 0.5` is the face; it must fall to
        // the RIGHT of the drawn direction. Flip this and every cliff in the
        // game faces inland and every massif reads as a quarry — a failure with
        // no error, no warning and no test but this one.
        const east = ribbonGeometry([{x: 0, y: 0}, {x: 500, y: 0}], 240, false,
            TILE_W, TILE_H)!;
        const high = vertex(east, 1);
        expect(high.v).toBeGreaterThan(0.5);
        expect(high.y).toBeGreaterThan(0);   // screen y grows downward = south

        const west = ribbonGeometry([{x: 500, y: 0}, {x: 0, y: 0}], 240, false,
            TILE_W, TILE_H)!;
        expect(vertex(west, 1).v).toBeGreaterThan(0.5);
        expect(vertex(west, 1).y).toBeLessThan(0);   // ...and now north. Same side of the RUN.
    });

    it('widens geometry and v together for overdraw', () => {
        // ⚑ Overdraw must reveal MORE TILE, never stretch the same tile over a
        // wider band. Masked alpha is content × mask, so the ribbon has to reach
        // as far as the blur does — but at the tile's own scale, or the feather
        // would also be a zoom.
        const plain = ribbonGeometry([{x: 0, y: 0}, {x: 500, y: 0}], 240, false,
            TILE_W, TILE_H)!;
        const wide = ribbonGeometry([{x: 0, y: 0}, {x: 500, y: 0}], 240, false,
            TILE_W, TILE_H, 80)!;
        const plainSpan = vertex(plain, 1).y - vertex(plain, 0).y;
        const wideSpan = vertex(wide, 1).y - vertex(wide, 0).y;
        expect(wideSpan).toBeCloseTo(plainSpan + 160, 6);
        // px-per-v is unchanged: the tile did not resize.
        expect(wideSpan / (vertex(wide, 1).v - vertex(wide, 0).v))
            .toBeCloseTo(plainSpan / (vertex(plain, 1).v - vertex(plain, 0).v), 6);
    });

    it('wraps a closed ring back onto its first pair', () => {
        const ring = [{x: 0, y: 0}, {x: 600, y: 0}, {x: 600, y: 600}, {x: 0, y: 600}];
        const r = ribbonGeometry(ring, 120, true, TILE_W, TILE_H)!;
        expect(count(r)).toBe((ring.length + 1) * 2);
        // The seam pair sits exactly on the opening pair — the ring closes in
        // geometry, not only in intent.
        expect(vertex(r, 8).x).toBeCloseTo(vertex(r, 0).x, 6);
        expect(vertex(r, 8).y).toBeCloseTo(vertex(r, 0).y, 6);
        // ⭐ ...and its u is a WHOLE NUMBER of tiles, which is what makes the
        // seam invisible. The raw perimeter is 2400 px = 3.33 tiles; left
        // alone, tile 0.33 would butt against tile 0 down one authored vertex.
        expect(vertex(r, 8).u).toBeCloseTo(3, FLOAT32);
        expect(vertex(r, 8).u % 1).toBeCloseTo(0, FLOAT32);
    });

    it('spreads the ring\'s seam correction over the whole perimeter', () => {
        // ⚑ The correction must never be dumped into the last segment — that
        // would trade a mismatched seam for a visibly squashed one. Each corner
        // of a square ring carries exactly a quarter of the fitted length.
        const ring = [{x: 0, y: 0}, {x: 600, y: 0}, {x: 600, y: 600}, {x: 0, y: 600}];
        const r = ribbonGeometry(ring, 120, true, TILE_W, TILE_H)!;
        [0, 1, 2, 3, 4].forEach((corner) => {
            expect(vertex(r, corner * 2).u).toBeCloseTo(corner * 3 / 4, FLOAT32);
        });
    });

    it('leaves an OPEN path\'s u unfitted', () => {
        // ⛔ The ring fit must not leak onto open paths. An open run has no join
        // to hide, so stretching it would move the texture off the world scale
        // its profile asked for, for nothing.
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 2400, y: 0}], 120, false,
            TILE_W, TILE_H)!;
        expect(vertex(r, 2).u).toBeCloseTo(2400 / TILE_W, FLOAT32);
        expect(vertex(r, 2).u % 1).not.toBeCloseTo(0, 3);
    });

    it('wraps a ring shorter than a tile exactly once', () => {
        const tiny = [{x: 0, y: 0}, {x: 60, y: 0}, {x: 30, y: 50}];
        const r = ribbonGeometry(tiny, 20, true, TILE_W, TILE_H)!;
        expect(vertex(r, 6).u).toBeCloseTo(1, FLOAT32);
    });

    it('clamps a hairpin instead of spiking', () => {
        // ⛔ A mitre length runs to infinity as a corner closes. The old stroke
        // chose `join: round` to dodge exactly this; the mesh clamps instead,
        // trading one rock shard flung across the map for a slight pinch nobody
        // will find.
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 1000, y: 0}, {x: 5, y: 12}],
            240, false, TILE_W, TILE_H)!;
        for (let i = 0; i < count(r); i++) {
            const p = vertex(r, i);
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            expect(Math.hypot(p.x, p.y)).toBeLessThan(1000 + 4 * 120 + 1);
        }
    });

    it('survives the geometry a real editor produces', () => {
        // A Tiled double-click leaves a duplicated vertex, which is a
        // zero-length segment and so a NaN normal in the middle of a path that
        // otherwise draws fine.
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 500, y: 0}, {x: 500, y: 0}, {x: 900, y: 0}],
            240, false, TILE_W, TILE_H)!;
        expect(count(r)).toBe(6);
        for (let i = 0; i < count(r); i++) {
            expect(Number.isFinite(vertex(r, i).x)).toBe(true);
            expect(Number.isFinite(vertex(r, i).u)).toBe(true);
        }
    });

    it('refuses what it cannot build rather than emitting NaN', () => {
        expect(ribbonGeometry([], 240, false, TILE_W, TILE_H)).toBeNull();
        expect(ribbonGeometry([{x: 0, y: 0}], 240, false, TILE_W, TILE_H)).toBeNull();
        expect(ribbonGeometry([{x: 5, y: 5}, {x: 5, y: 5}], 240, false, TILE_W, TILE_H))
            .toBeNull();
        expect(ribbonGeometry([{x: 0, y: 0}, {x: 9, y: 0}], 0, false, TILE_W, TILE_H)).toBeNull();
        // A ring needs three distinct corners; two points and a closure is a
        // line drawn twice.
        expect(ribbonGeometry([{x: 0, y: 0}, {x: 9, y: 0}], 240, true, TILE_W, TILE_H)).toBeNull();
    });

    it('indexes every quad once', () => {
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 300, y: 0}, {x: 600, y: 90}],
            240, false, TILE_W, TILE_H)!;
        expect(r.indices.length).toBe(2 * 6);
        expect(Math.max(...r.indices)).toBe(count(r) - 1);
    });
});
