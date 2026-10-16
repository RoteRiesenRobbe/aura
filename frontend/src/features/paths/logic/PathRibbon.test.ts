import {describe, it, expect} from 'vitest';
import {fadedRibbon, Ribbon, ribbonGeometry, ribbonOutline, rimCentreline, roundCapOutline, taperedCentreline} from './PathRibbon';
import {CAP_LENGTH_PER_WIDTH, TAPER_LENGTH_PER_WIDTH} from './Paths';
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

describe('taperedCentreline', () => {
    it('narrows the last 2 × width at each end to a point', () => {
        // 1000 long, width 100: a 200-long taper at each end, full width between.
        const t = taperedCentreline([{x: 0, y: 0}, {x: 1000, y: 0}], 100)!;
        expect(t.points.map(p => p.x)).toEqual([0, 200, 800, 1000]);
        expect(t.factors).toEqual([0, 1, 1, 0]);
        expect(t.full).toEqual([1, 2]);
    });

    it('pins the taper length the server walls', () => {
        // ⚑ paths_collision.go taperLengthPerWidth holds the same number.
        expect(TAPER_LENGTH_PER_WIDTH).toBe(2);
    });

    it('measures the taper along the arc, through a bend', () => {
        // 150 east then 850 north, width 100: the bend sits at arc 150, three
        // quarters of the way up the first taper, and the cut lands 50 north.
        const t = taperedCentreline([{x: 0, y: 0}, {x: 150, y: 0}, {x: 150, y: 850}], 100)!;
        expect(t.points).toEqual([
            {x: 0, y: 0}, {x: 150, y: 0}, {x: 150, y: 50}, {x: 150, y: 650}, {x: 150, y: 850},
        ]);
        expect(t.factors[1]).toBeCloseTo(0.75, FLOAT32);
        expect(t.full).toEqual([2, 3]);
    });

    it('meets in the middle when the path is too short for two tapers', () => {
        const t = taperedCentreline([{x: 0, y: 0}, {x: 200, y: 0}], 100)!;
        expect(t.points.map(p => p.x)).toEqual([0, 100, 200]);
        expect(t.factors).toEqual([0, 1, 0]);
        expect(t.full).toEqual([1, 1]);
    });

    it('reuses a vertex the cut lands on rather than doubling it', () => {
        const t = taperedCentreline([{x: 0, y: 0}, {x: 200, y: 0}, {x: 200, y: 800}], 100)!;
        expect(t.points).toEqual([{x: 0, y: 0}, {x: 200, y: 0}, {x: 200, y: 600}, {x: 200, y: 800}]);
        expect(t.full).toEqual([1, 2]);
    });

    it('refuses what has no length', () => {
        expect(taperedCentreline([{x: 5, y: 5}, {x: 5, y: 5}], 100)).toBeNull();
        expect(taperedCentreline([{x: 0, y: 0}, {x: 10, y: 0}], 0)).toBeNull();
    });
});

describe('ribbonGeometry with width factors', () => {
    it('collapses both rims onto the centreline at a factor of 0', () => {
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 400, y: 0}], 100, false, TILE_W, TILE_H, 0, [0, 1])!;
        expect(vertex(r, 0)).toMatchObject({x: 0, y: 0});
        expect(vertex(r, 1)).toMatchObject({x: 0, y: 0});
        expect(vertex(r, 3).y - vertex(r, 2).y).toBeCloseTo(100, FLOAT32);
    });

    it('keeps the v band, so the texture compresses into the tip', () => {
        // ⭐ A cliff narrowing reads as the cliff getting LOWER: the whole face
        // is still there, squeezed, rather than cropped to its middle rows.
        const r = ribbonGeometry([{x: 0, y: 0}, {x: 400, y: 0}], 100, false, TILE_W, TILE_H, 0, [0.5, 1])!;
        expect(vertex(r, 0).v).toBeCloseTo(vertex(r, 2).v, FLOAT32);
        expect(vertex(r, 1).v).toBeCloseTo(vertex(r, 3).v, FLOAT32);
    });
});

describe('ribbonOutline', () => {
    it('walks one rim out and the other back', () => {
        const flat = ribbonOutline([{x: 0, y: 0}, {x: 400, y: 0}], 100, [0, 1])!;
        // tip (both rims), then the far pair on the far side, round to the near side.
        // (`+ 0` folds the -0 a zero-width rim produces into 0.)
        expect(flat.map(n => n + 0)).toEqual([0, 0, 400, -50, 400, 50, 0, 0]);
    });
});

describe('taperedCentreline with one pointed end (plan-cliffs.md D1)', () => {
    it('tapers only the LAST end', () => {
        const t = taperedCentreline([{x: 0, y: 0}, {x: 1000, y: 0}], 100, [false, true])!;
        expect(t.points.map(p => p.x)).toEqual([0, 800, 1000]);
        expect(t.factors).toEqual([1, 1, 0]);
        expect(t.full).toEqual([0, 1]);
    });

    it('tapers only the FIRST end', () => {
        const t = taperedCentreline([{x: 0, y: 0}, {x: 1000, y: 0}], 100, [true, false])!;
        expect(t.points.map(p => p.x)).toEqual([0, 200, 1000]);
        expect(t.factors).toEqual([0, 1, 1]);
        expect(t.full).toEqual([1, 2]);
    });

    it('clamps a lone taper to half the path, as the server does', () => {
        // ⚑ paths_collision.go pathTaper clamps the same way.
        const t = taperedCentreline([{x: 0, y: 0}, {x: 200, y: 0}], 100, [false, true])!;
        expect(t.points.map(p => p.x)).toEqual([0, 100, 200]);
        expect(t.factors).toEqual([1, 1, 0]);
        expect(t.full).toEqual([0, 1]);
    });

    it('has nothing to taper when neither end is pointed', () => {
        expect(taperedCentreline([{x: 0, y: 0}, {x: 1000, y: 0}], 100, [false, false])).toBeNull();
    });
});

describe('roundCapOutline', () => {
    it('is a half disc OUTSIDE the last point', () => {
        const cap = roundCapOutline([{x: 0, y: 0}, {x: 400, y: 0}], 100, false)!;
        const pts: { x: number, y: number }[] = [];
        for (let i = 0; i < cap.length; i += 2) { pts.push({x: cap[i], y: cap[i + 1]}); }
        pts.forEach((p) => {
            expect(p.x).toBeGreaterThanOrEqual(400 - 1e-6);
            expect(Math.hypot(p.x - 400, p.y)).toBeCloseTo(50, FLOAT32);
        });
        expect(Math.max(...pts.map(p => p.x))).toBeCloseTo(450, FLOAT32);
        expect(Math.min(...pts.map(p => p.y))).toBeCloseTo(-50, FLOAT32);
        expect(Math.max(...pts.map(p => p.y))).toBeCloseTo(50, FLOAT32);
    });

    it('faces backwards at the first point', () => {
        const cap = roundCapOutline([{x: 0, y: 0}, {x: 400, y: 0}], 100, true)!;
        for (let i = 0; i < cap.length; i += 2) { expect(cap[i]).toBeLessThanOrEqual(1e-6); }
    });

    it('refuses what has no direction', () => {
        expect(roundCapOutline([{x: 5, y: 5}, {x: 5, y: 5}], 100, false)).toBeNull();
    });
});

// ---- fade ends (plan-cliffs.md D2) ------------------------------------------

/** Every rim pair of a ribbon: [the v-low vertex, the v-high vertex]. */
const rims = (r: Ribbon) => {
    const out: { lo: { x: number, y: number, u: number, v: number }, hi: { x: number, y: number, u: number, v: number } }[] = [];
    for (let i = 0; i < count(r); i += 2) { out.push({lo: vertex(r, i), hi: vertex(r, i + 1)}); }
    return out;
};

describe('fadedRibbon', () => {
    // Width 150 (a 1.5 u cliff at 100 px/u), so each cap is 300 px.
    const W = 150;
    const CAP = CAP_LENGTH_PER_WIDTH * W;

    it('holds the cap length the server walls by', () => {
        // ⚑ paths_collision.go capLengthPerWidth holds the same number.
        expect(CAP_LENGTH_PER_WIDTH).toBe(2);
    });

    it('splits off a cap at each faded end', () => {
        const f = fadedRibbon([{x: 0, y: 0}, {x: 2000, y: 0}], W, TILE_W, TILE_H, ['fade', 'fade'])!;
        const xs = (r: Ribbon) => rims(r).map(p => p.lo.x);
        expect(xs(f.start!)).toEqual([0, CAP]);
        expect(xs(f.end!)).toEqual([2000 - CAP, 2000]);
        expect(xs(f.middle!)[0]).toBe(CAP);
        expect(xs(f.middle!)[1]).toBe(2000 - CAP);
    });

    it('runs the end cap 0 → 1 outwards and mirrors the start cap', () => {
        const f = fadedRibbon([{x: 0, y: 0}, {x: 2000, y: 0}], W, TILE_W, TILE_H, ['fade', 'fade'])!;
        expect(rims(f.end!).map(p => p.lo.u)).toEqual([0, 1]);
        // ⭐ Mirrored in u ONLY: the tip is u = 1 at both ends, and the start
        // cap's inner edge meets the middle's u = 0.
        expect(rims(f.start!).map(p => p.lo.u)).toEqual([1, 0]);
    });

    it('fits the middle to whole tiles, so each cap meets the tile at u = 0', () => {
        // ⚑ Awkward on purpose: 2000 − 2 × 300 = 1400 px is 1.94 tiles.
        const f = fadedRibbon([{x: 13, y: 7}, {x: 2013, y: 7}], W, TILE_W, TILE_H, ['fade', 'fade'])!;
        const us = rims(f.middle!).map(p => p.lo.u);
        expect(us[0]).toBe(0);
        expect(us[us.length - 1]).toBeCloseTo(2, FLOAT32);
    });

    it('keeps the face on the same side in every piece', () => {
        // A bend inside the end cap, at awkward coordinates.
        const pts = [{x: 3.7, y: 11.2}, {x: 1503.7, y: 11.2}, {x: 1603.7, y: 211.2}];
        const f = fadedRibbon(pts, W, TILE_W, TILE_H, ['fade', 'fade'])!;
        [f.start!, f.middle!, f.end!].forEach((r) => {
            rims(r).forEach(({lo, hi}) => {
                expect(hi.v).toBeGreaterThan(lo.v);
                expect(hi.v + lo.v).toBeCloseTo(1, FLOAT32);
            });
        });
        // ⚑ (−dy, dx) is the face side: on the first leg (+x) that is +y.
        expect(rims(f.start!)[0].hi.y).toBeGreaterThan(rims(f.start!)[0].lo.y);
    });

    it('shares the rim pair where two pieces meet', () => {
        const pts = [{x: 3.7, y: 11.2}, {x: 1503.7, y: 11.2}, {x: 1603.7, y: 211.2}];
        const f = fadedRibbon(pts, W, TILE_W, TILE_H, ['fade', 'fade'])!;
        const a = rims(f.middle!);
        const b = rims(f.end!);
        expect(b[0].lo.x).toBe(a[a.length - 1].lo.x);
        expect(b[0].lo.y).toBe(a[a.length - 1].lo.y);
        expect(b[0].hi.x).toBe(a[a.length - 1].hi.x);
        expect(b[0].hi.y).toBe(a[a.length - 1].hi.y);
    });

    it('clamps each cap to half a path shorter than two', () => {
        const f = fadedRibbon([{x: 0, y: 0}, {x: 400, y: 0}], W, TILE_W, TILE_H, ['fade', 'fade'])!;
        expect(rims(f.start!).map(p => p.lo.x)).toEqual([0, 200]);
        expect(rims(f.end!).map(p => p.lo.x)).toEqual([200, 400]);
        expect(f.middle).toBeNull();
    });

    it('leaves a non-faded end in the middle piece', () => {
        const f = fadedRibbon([{x: 0, y: 0}, {x: 2000, y: 0}], W, TILE_W, TILE_H, ['flat', 'fade'])!;
        expect(f.start).toBeNull();
        expect(rims(f.middle!)[0].lo.x).toBe(0);
        expect(rims(f.end!).map(p => p.lo.x)).toEqual([2000 - CAP, 2000]);
    });

    it('still narrows a pointed other end', () => {
        const f = fadedRibbon([{x: 0, y: 0}, {x: 2000, y: 0}], W, TILE_W, TILE_H, ['point', 'fade'])!;
        const first = rims(f.middle!)[0];
        expect(first.hi.y - first.lo.y).toBeCloseTo(0, FLOAT32);
        const cap = rims(f.end!)[0];
        expect(cap.hi.y - cap.lo.y).toBeCloseTo(W, FLOAT32);
    });

    it('measures the cap from capWidth, so a rim matches its body', () => {
        const f = fadedRibbon([{x: 0, y: 0}, {x: 2000, y: 0}], 50, TILE_W, TILE_H, ['flat', 'fade'], W)!;
        expect(rims(f.end!)[0].lo.x).toBe(2000 - CAP);
    });

    it('is null when no end fades', () => {
        expect(fadedRibbon([{x: 0, y: 0}, {x: 2000, y: 0}], W, TILE_W, TILE_H, ['point', 'flat'])).toBeNull();
    });
});

// ---- the cliff rim of a polygon (plan-cliffs.md D6) -------------------------

describe('rimCentreline', () => {
    // A 1000 x 800 px rectangle at awkward coordinates, wound both ways.
    const cw = [{x: 13.7, y: 21.3}, {x: 1013.7, y: 21.3}, {x: 1013.7, y: 821.3}, {x: 13.7, y: 821.3}];
    const ccw = [...cw].reverse();
    const W = 150;
    const inside = (p: { x: number, y: number }) => p.x > 13.7 + 1e-3 && p.x < 1013.7 - 1e-3
        && p.y > 21.3 + 1e-3 && p.y < 821.3 - 1e-3;
    const onBoundary = (p: { x: number, y: number }) =>
        (Math.abs(p.x - 13.7) < 1e-2 || Math.abs(p.x - 1013.7) < 1e-2)
        && (Math.abs(p.y - 21.3) < 1e-2 || Math.abs(p.y - 821.3) < 1e-2);

    for (const [name, pts] of [['clockwise', cw], ['counter-clockwise', ccw]] as const) {
        it(`out (a mountain): the foot on the boundary, the lip inside, wound ${name}`, () => {
            const r = ribbonGeometry(rimCentreline(pts, 'out', W), W, true, TILE_W, TILE_H)!;
            rims(r).forEach(({lo, hi}) => {
                // ⚑ v > 0.5 (hi) is the tile's foot side: the low ground.
                expect(onBoundary(hi)).toBe(true);
                expect(inside(lo)).toBe(true);
            });
        });

        it(`in (a pit): the lip on the boundary, the foot inside, wound ${name}`, () => {
            const r = ribbonGeometry(rimCentreline(pts, 'in', W), W, true, TILE_W, TILE_H)!;
            rims(r).forEach(({lo, hi}) => {
                expect(onBoundary(lo)).toBe(true);
                expect(inside(hi)).toBe(true);
            });
        });
    }

    it('insets by exactly the width at a corner', () => {
        const r = ribbonGeometry(rimCentreline(cw, 'out', W), W, true, TILE_W, TILE_H)!;
        const corner = rims(r).find(({hi}) => Math.abs(hi.x - 13.7) < 1e-2 && Math.abs(hi.y - 21.3) < 1e-2)!;
        expect(corner.lo.x).toBeCloseTo(13.7 + W, 3);
        expect(corner.lo.y).toBeCloseTo(21.3 + W, 3);
    });

    it('fits the ring to whole tiles', () => {
        const r = ribbonGeometry(rimCentreline(cw, 'in', W), W, true, TILE_W, TILE_H)!;
        const us = rims(r).map(p => p.lo.u);
        expect(us[0]).toBe(0);
        expect(us[us.length - 1]).toBeCloseTo(Math.round(us[us.length - 1]), FLOAT32);
    });
});
