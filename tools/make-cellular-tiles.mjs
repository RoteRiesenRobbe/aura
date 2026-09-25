/**
 * Generates the PLACEHOLDER CELLULAR tiles for the terrain profiles
 * (docs/art/assets.csv — `Forest` and `Wall` were the two profiles with
 * `state: missing`, i.e. no texture at all, only a flat colour; `Road` was
 * `state: stock`, borrowing the desert tile, which is a different fault with
 * the same fix).
 *
 *     forest · wall · road
 *
 * ⭐ Checked in as a script, not just images, because a placeholder's whole job
 * is to be re-tuned: change a constant, re-run, look at it again. The committed
 * PNGs are exactly what this produces — deterministic, with no RNG anywhere.
 *
 * ⭐ THE FOURTH GENERATOR FAMILY, and the split between the four is TECHNIQUE,
 * which is the line to think along before adding a tile anywhere:
 *
 *   - `make-water-tile.mjs`          — RIDGED fields (water, bog, lava). A wave
 *     sum through `1 - |sin|`, so sharpness alone spans crest to crack.
 *   - `make-fog-tile.mjs`            — SMOOTH density fields (fog, miasma).
 *   - `make-precipitation-tiles.mjs` — PARTICLES (rain, snow, ash, sandstorm).
 *   - `make-cellular-tiles.mjs`      (here) — CELLULAR fields. A JITTERED
 *     LATTICE cuts the tile into pieces, or places them; either way the piece,
 *     not the pixel, is the unit the material is made of.
 *
 * ⭐ WHY LEAF LITTER, A STONE WALL AND A DIRT ROAD SHARE A SCRIPT. All three
 * are surfaces made of DISCRETE PIECES — a leaf is a piece, a stone is a piece,
 * a pebble pressed into a lane is a piece — which is what none of the other
 * three families can express. Waves have no pieces; particles are marks
 * scattered on empty ground, with no relationship between neighbours. The
 * shared machinery is the lattice, the warp, the wrapped hash and the seam
 * proof; the materials then use the lattice in the two different ways it gets
 * used, which is the interesting part of this file:
 *
 *   - `course()` CUTS. Every pixel belongs to some piece; the pieces tile the
 *     plane; a border between two of them is the mortar.
 *   - `leafCover()` PLACES. Each lattice cell is a SLOT that may or may not
 *     hold a leaf, and most of the tile is the duff between them.
 *
 * ⚑ The road is the second customer of PLACES, and it is worth saying why it is
 * not a fourth script: the pebbles ARE the leaves, at a sixth of the fill and
 * with `elong` near 1, and everything under them is a wave sum because packed
 * earth genuinely has no pieces in it — that is what packing it does. A
 * material is in this family when the thing you would name if you pointed at
 * the surface is a COUNTABLE OBJECT.
 *
 * ⛔ THE FIRST DRAFT CUT BOTH, and that is the lesson worth keeping. A packed
 * Voronoi of leaves renders as CRAZY PAVING — every cell outlined, no gaps, a
 * stained-glass window in green. Litter does not tessellate: leaves lie on a
 * floor, they overlap, and between them you see ground. ⚑ But random scatter
 * is not the fix either (leaves clump and collide); the jittered lattice is,
 * because it guarantees spacing for free. So the lattice stayed and only its
 * ROLE changed, from cutting to placing.
 *
 * ⛔ AND A SECOND ONE, from the wall: a Voronoi of a STAGGERED lattice — the
 * brick half-row offset every masonry pattern starts from — is a HEXAGONAL
 * tiling. The first wall came out as a bathroom floor, every stone a clean
 * hexagon, and jitter only makes the hexagons wobbly. A wall is courses of
 * RECTANGLES and needs a rectangular cut: rows of fixed height split into a
 * per-row number of columns at jittered joints. Nearest-point distance never
 * enters into it.
 *
 * ⚑ SEAMLESS BY CONSTRUCTION, not by eye — the same rule as the other three,
 * enforced per partition. A wave tiles when its wave number is an INTEGER. A
 * lattice tiles when every point's jitter is hashed from its cell index taken
 * MODULO the lattice size, so cell (−1, 4) is literally the same point as cell
 * (n−1, 4). A course tiles when the row count and every row's column count are
 * integers and the joint jitter is hashed that same wrapped way.
 *
 * ⚑ The warp is built from integer-frequency sines (borrowed wholesale from
 * make-water-tile.mjs) so warping the sample point keeps the composition
 * periodic. It is what stops the pieces reading as the geometric shapes they
 * mathematically are.
 *
 * ⚑ 750 x 750 to match the CC0 pack, so `scale` means the same amount of world
 * here as it does for every other tile (the ground README, "The scale knob").
 *
 * ⚑ The PNG writer below is the fourth copy in this folder. Deliberate, and the
 * same trade the first three made: these scripts run once in a blue moon, each
 * stays runnable alone with no repo-internal import, and a build-time npm
 * dependency for a placeholder is not worth it.
 *
 * Usage: node tools/make-cellular-tiles.mjs
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const SIZE = 750;
const GROUND = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/regions/assets/ground');

/* ---- wave sets ----------------------------------------------------------- */
// Each entry is [kx, ky, amplitude, phase]; all wave numbers INTEGER (header).

/**
 * Bends the leaf lattice. ⚑ It needs frequencies ABOVE the lattice as well as
 * below: a warp slower than the cells moves whole neighbourhoods together and
 * leaves every leaf the same tidy ellipse it was drawn as.
 */
const LITTER_WARP = [
    [1, 2, 1.00, 0.4],
    [2, -1, 0.70, 2.9],
    [-1, 3, 0.46, 5.2],
    [3, 2, 0.34, 1.8],
    [5, -4, 0.30, 3.7],
    [7, 3, 0.24, 0.9],
    [-6, 9, 0.18, 4.1],
    [11, 7, 0.12, 2.3],
];

/** The duff under the leaves: damp moss, mottled at a few scales. */
const DUFF = [
    [2, 1, 1.00, 1.5],
    [1, 3, 0.85, 4.2],
    [3, -2, 0.70, 0.3],
    [4, 3, 0.52, 2.7],
    [-3, 5, 0.44, 5.4],
    [6, 2, 0.32, 1.1],
    [5, -7, 0.26, 3.8],
    [9, 4, 0.18, 0.6],
    [-8, 11, 0.13, 2.5],
];

/** Fine grit, in both tiles — the last bit of scale below the pieces. */
const GRIT = [
    [13, 7, 1.00, 1.1],
    [9, -14, 0.82, 4.3],
    [21, 5, 0.58, 2.6],
    [-7, 19, 0.46, 0.8],
    [27, 17, 0.32, 5.5],
    [-23, 31, 0.22, 3.1],
];

/**
 * ⭐ ROOTS ARE A RIDGED FIELD, not a cellular one — the one place this script
 * reaches into make-water-tile.mjs's family, because a root is a LINE and
 * neither partition here has lines in it. `ridged` at high sharpness peaks only
 * where the wave sum crosses zero, which narrows a crest into the thin sinuous
 * streak that reads as a surface root. Lava's veins, a fraction of the strength.
 *
 * ⛔ THE FREQUENCIES ARE HELD UP, AND THAT IS THE INTERESTING CONSTRAINT.
 * A real surface root is metres long, which argues for wave numbers of 1–2 —
 * and at `scale: 0.35` a tile spans ~2.19 world units, so roughly NINE repeats
 * cross a 20-unit screen. A strong feature at frequency 1 is therefore the SAME
 * root drawn nine times in a row: the lava lesson (a busy repeated field
 * advertises its own tiling) in its worst form, because a repeated SHAPE is far
 * more visible than repeated noise. So these run 3–11 and stay faint — fibrous
 * rootlets threading the duff, which repetition forgives, rather than one hero
 * root, which it does not. ⚑ They are drawn UNDER the leaves, which is both
 * physically right and what keeps them from reading as a pattern.
 */
const ROOT_WAVES = [
    [3, 1, 1.00, 0.6],
    [1, 4, 0.82, 3.4],
    [4, -3, 0.70, 1.9],
    [5, 2, 0.52, 5.1],
    [-3, 6, 0.40, 2.2],
    [7, 4, 0.30, 0.3],
    [8, -5, 0.22, 4.7],
    [11, 7, 0.14, 2.8],
];

/** Bends the courses — just enough that a block is hand-cut, not extruded. */
const STONE_WARP = [
    [1, 1, 1.00, 2.1],
    [2, -1, 0.62, 4.9],
    [-1, 2, 0.40, 1.4],
    [4, 3, 0.22, 3.3],
    [6, -5, 0.14, 0.8],
];

/**
 * Pitting across the stone faces. ⚑ Deliberately UNEVEN wave numbers with no
 * common factor: an evenly spaced set at these frequencies interferes into a
 * regular diagonal weave, which reads as woven fabric stretched over the wall
 * — it cost this tile one re-tune to notice.
 */
const STONE_GRIT = [
    [17, 11, 1.00, 3.2],
    [11, -19, 0.85, 0.7],
    [23, 13, 0.62, 5.8],
    [-13, 29, 0.44, 2.4],
    [31, 7, 0.30, 1.6],
    [-37, 19, 0.22, 4.5],
    [43, 29, 0.15, 0.2],
];

/** Bends the road's grit lattice, and mottles the bed with it. */
const EARTH_WARP = [
    [1, 1, 1.00, 5.0],
    [2, -1, 0.66, 1.7],
    [-1, 3, 0.44, 3.9],
    [4, 2, 0.30, 0.5],
    [6, -5, 0.20, 2.6],
    [9, 7, 0.13, 4.8],
];

/**
 * The packed earth itself: damp shade, the dominant brown, and the pale powder
 * traffic grinds out of it.
 *
 * ⛔ THE AMPLITUDES FALL OFF FAST AND THAT IS THE POINT. A dirt road is a
 * SMOOTH surface — that is what being driven over does to it — so the broad
 * tones have to stay soft or the tile reads as churned mud. The first draft
 * borrowed DUFF's profile wholesale and came out as a ploughed field, which is
 * a different profile in the same table (`Ploughed`) and already has a tile.
 *
 * ⛔ AND IT NEEDS MANY DIRECTIONS, not many octaves. The first draft had six
 * waves and only two of them slow, which at true size painted DIAGONAL BANDS
 * across the lane — a corduroy stripe running north-east, repeating once per
 * tile, and by far the loudest thing on the road. Two slow waves cannot make a
 * blotch; they make an interference fringe, and a fringe has a direction. Nine
 * waves spread over eight different bearings make patches.
 */
const BED = [
    [1, 2, 1.00, 0.9],
    [-2, 1, 0.86, 3.6],
    [2, 3, 0.62, 5.2],
    [3, -1, 0.55, 1.3],
    [-1, 4, 0.42, 4.4],
    [4, 2, 0.34, 2.1],
    [-3, 5, 0.26, 0.4],
    [5, -4, 0.20, 3.1],
    [7, 3, 0.14, 5.6],
];

/**
 * Hairline cracks in the dried mud — a RIDGED field, the same borrowing from
 * make-water-tile.mjs the forest's roots make, and for the same reason: a crack
 * is a LINE and neither partition here has lines in it.
 *
 * ⚑ Held to wave numbers 5–17, one band above the roots. Same argument (nine
 * tile repeats cross a screen at `scale: 0.35`, so a frequency-1 hero feature
 * is that feature drawn nine times), but a road is narrower than a forest is
 * wide: at `width: 1.5` only about two thirds of a tile ever shows across the
 * ribbon, so anything slower than the tile is a gradient, not a crack.
 */
const CRACKS = [
    [5, 2, 1.00, 2.4],
    [3, 6, 0.80, 0.1],
    [7, -4, 0.62, 4.6],
    [9, 5, 0.44, 1.8],
    [-6, 11, 0.32, 3.3],
    [13, 8, 0.22, 5.7],
    [17, -9, 0.15, 0.7],
];

/**
 * The road's tooth — finer than GRIT, because this surface is compacted.
 *
 * ⛔ THE RATIOS ARE ALL DIFFERENT, and the first draft's were not. 19/11, 29/17
 * and 37/23 are each about 1.7, and a set of high frequencies sharing a
 * direction interferes into a regular DIAGONAL WEAVE — the same fault the wall
 * hit and warns about two blocks up, which is worth recording twice because the
 * second time it was easier to see and still got written.
 */
const EARTH_GRIT = [
    [23, 7, 1.00, 2.2],
    [9, -29, 0.84, 5.1],
    [31, 19, 0.60, 0.4],
    [-13, 11, 0.46, 3.7],
    [17, 37, 0.31, 1.5],
    [-43, 5, 0.21, 4.9],
];

/* ---- the tiles ----------------------------------------------------------- */

// ⚑ EVERY NUMBER here is [PLACEHOLDER]. ⚑ `profileColor` is the tile's contract
// with terrain-profiles.json: that value is D14's fallback, painted while the
// texture loads and anywhere the file is missing, so the tile's MEAN colour has
// to match it or the ground changes hue on load. `assertMatchesProfile` checks
// it against the rendered image rather than against anyone's intention.

const TILES = [
    {
        // ⭐ THE COLOUR RULING WORTH KNOWING: this is a MOSS-GREEN floor with
        // scattered leaves, not the brown carpet the asset tracker's one-line
        // brief suggests, and D14 forced that rather than taste. `Forest`'s
        // authored colour is #2d6b33, a green. A brown litter tile under a
        // green fallback makes Zone 2's entire floor change hue on load.
        // ⚑ The alternative was to re-colour the profile brown, which is a
        // content edit to a value the PO has not judged yet (every number in
        // that table is [PLACEHOLDER]) — so the tile matches the data, and
        // re-colouring is a one-line change if the look sitting wants it.
        file: 'forest-placeholder.png',
        profileColor: [0x2d, 0x6b, 0x33],
        paint: 'litter',
        warp: {waves: LITTER_WARP, strength: 19, offset: [0.31, 0.67]},

        // The ground the leaves lie on. Two greens and a brown: moss, shadowed
        // moss, and the bare damp earth that shows through where it thins.
        duff: {
            waves: DUFF,
            ramp: [[0x18, 0x45, 0x25], [0x2e, 0x7c, 0x3a], [0x3d, 0x5c, 0x2b]],
            grit: 0.26,
            gamma: 1.0,
        },
        roots: {waves: ROOT_WAVES, sharpness: 15, strength: 0.34,
            color: [0x3e, 0x30, 0x1e]},

        // ⭐ TWO LAYERS, and the pair is what sells depth: a darker, larger,
        // half-rotted layer lying in the duff, and a smaller, brighter, drier
        // layer on top of it. One layer alone reads as confetti.
        // ⚑ `fill` is the fraction of lattice slots that actually hold a leaf —
        // the knob that stops the litter tessellating. Combined coverage lands
        // near 45 %, which the report prints.
        layers: [
            {
                n: 17, jitter: 0.50, elong: 2.2, radius: 0.44, sizeVar: 0.7,
                fill: 0.62, salt: 10,
                ramp: [[0x34, 0x4f, 0x26], [0x57, 0x59, 0x2b]],
                rim: 0.20, shadow: [5, 6], shadowStrength: 0.26,
            },
            {
                n: 23, jitter: 0.50, elong: 2.8, radius: 0.38, sizeVar: 0.75,
                fill: 0.42, salt: 40,
                ramp: [[0x66, 0x62, 0x30], [0x96, 0x7b, 0x3e]],
                rim: 0.24, shadow: [6, 7], shadowStrength: 0.32,
            },
        ],
        shadowColor: [0x18, 0x2e, 0x1a],
    },
    {
        // ⭐ Stones vary in BOTH directions from the wall's average tone, and
        // that two-sided variation is most of what reads as cut stone rather
        // than poured concrete — so the ramp runs dark → #7d7d80 (the profile's
        // colour) → light with the mean held in the middle, rather than
        // starting at the dominant the way make-water-tile.mjs's tiles do.
        file: 'wall-placeholder.png',
        profileColor: [0x7d, 0x7d, 0x80],
        paint: 'masonry',
        warp: {waves: STONE_WARP, strength: 11, offset: [0.13, 0.41]},

        ramp: [[0x56, 0x56, 0x5a], [0x7d, 0x7d, 0x80], [0xa2, 0xa2, 0xa6]],
        // ⚑ `Wall` is the only profile authoring `scale: 1`, so a 750 px tile
        // covers 6.25 world units. 9 courses put a stone ~0.69 u tall — just
        // under the 1.0 u polygon boundary thickness, so a wall stroke reads as
        // roughly one course of masonry. Change one, re-check the other.
        // ⚑ The column count varies PER ROW (and so does the row's phase),
        // which is what stops the joints stacking into columns; one count with
        // a half-cell stagger is brickwork, and this wants to be fieldstone.
        course: {rows: 9, cols: [5, 6, 7, 8], jitter: 0.34, rowVar: 0.55},
        base: 0.11,
        tintWeight: 0.58,
        grit: {waves: STONE_GRIT, weight: 0.13},
        // Each face lifts very slightly toward its middle. ⚑ Small: at 0.10 the
        // stones looked inflated, like sofa cushions.
        dome: 0.07,
        // Hard and near-black: this is MORTAR, the defining feature of the
        // material, and the one border in this file meant to be seen.
        mortar: {width: 0.075, strength: 0.88, color: [0x36, 0x36, 0x3a]},
        // A lit top-left face and a shaded bottom-right one, matching the baked
        // shadows the prop art already uses. ⚑ Subtle on purpose: at 6.25 units
        // per tile a strong bevel turns the wall into bubble wrap.
        bevel: {width: 0.16, strength: 0.22},
    },
    {
        // ⭐ A DIRT ROAD IS A SMOOTH MATRIX WITH PIECES IN IT, which is why it
        // is in this file and not in one of the other three: the stones pressed
        // into the surface are PLACED, exactly as the forest's leaves are, and
        // `leafCover` does not care that a pebble is rounder than a leaf
        // (`elong` near 1) and far rarer (`fill` a third rather than two
        // thirds). Everything under them is a wave sum, because packed earth
        // has no pieces — that is what packing it does.
        //
        // ⛔ NO CART RUTS, and the reason is authoring, not art. A rut is a
        // DIRECTIONAL feature and would have to be baked along one tile axis,
        // which only lands correctly under `alignTexture` (plan-world-paths.md)
        // — and that flag turns the tile along the path's LONGEST segment, so
        // it wants one path per straight leg. All three roads in world.json are
        // 4–7 point meanders on a single path, so a baked rut would run due
        // east while the road went north. Ruts are a second tile for when a
        // road is authored leg by leg; this one has to work on a curve.
        file: 'road-placeholder.png',
        profileColor: [0x85, 0x67, 0x43],
        paint: 'earth',
        warp: {waves: EARTH_WARP, strength: 14, offset: [0.57, 0.23]},

        // Damp shade → the dominant packed brown → the dry powder on top.
        // ⚑ The mean has to land on the middle stop, so the ramp is symmetric
        // about it the way the wall's is; `assertMatchesProfile` is what holds
        // that against the stones and the cracks pulling it down.
        bed: {
            waves: BED,
            ramp: [[0x78, 0x5c, 0x3a], [0x85, 0x67, 0x43], [0x94, 0x78, 0x51]],
            grit: 0.12,
            gamma: 1.0,
        },
        // ⛔ SHARP AND FAINT, and both numbers were bought the hard way. At
        // sharpness 20 / strength 0.30 these were soft wandering lines and the
        // tile read as WORM TRAILS in mud: a ridged field makes closed loops,
        // and a visible closed loop on the ground is a creature's track. Thin
        // them (sharpness is the only knob that does) and drop them to where
        // they are surface irregularity rather than a motif. ⚑ Physically
        // right too — a road that is driven on is PACKED, so a crack is the
        // exception on it, not the pattern.
        cracks: {waves: CRACKS, sharpness: 44, strength: 0.06,
            color: [0x4a, 0x38, 0x26]},

        // ⭐ TWO GRADES, and it is the same two-layer trick the litter uses for
        // the same reason: one grade of stone is a pattern, two is a material.
        //
        // ⛔ BOTH RAMPS STRADDLE THE BED, and that is the correction that made
        // this tile a road. The first pass gave the coarse grade a NEUTRAL grey
        // (#6b6051 → #938671) on the true reasoning that a stone is not made of
        // the same stuff as the road — and against a warm brown a neutral grey
        // reads BLUE. Sixty blue beads on mud is pebbledash render, not a lane.
        // Both grades are warm now and each runs from below the bed's dominant
        // to above it, so a stone can be a dark one; a layer that is only ever
        // lighter than its ground is confetti however well it is shaded.
        // ⛔ AND THE WHOLE TILE WAS THEN TURNED DOWN AGAIN (PO: "reads a little
        // messy"). Combined coverage went 9 % → 2.5 %, the bed ramp narrowed,
        // the tooth halved and the cracks dropped to a sixth. ⭐ The lesson is
        // the ground README's lava one arriving from the other side: a ground
        // tile is looked THROUGH, not at, and every mark on it is repeated nine
        // times across a screen — so the right amount of detail is far less
        // than a single tile viewed alone will ever suggest. Past ~20 %
        // coverage this also stops being a dirt road and becomes gravel.
        layers: [
            {
                n: 17, jitter: 0.46, elong: 1.4, radius: 0.22, sizeVar: 0.85,
                fill: 0.11, salt: 70,
                ramp: [[0x72, 0x5e, 0x46], [0x8e, 0x7b, 0x60]],
                rim: 0.16, shadow: [3, 4], shadowStrength: 0.14,
            },
            {
                n: 37, jitter: 0.46, elong: 1.2, radius: 0.22, sizeVar: 0.7,
                fill: 0.15, salt: 130,
                ramp: [[0x7b, 0x63, 0x44], [0x96, 0x7e, 0x5b]],
                rim: 0.14, shadow: [2, 2], shadowStrength: 0.10,
            },
        ],
        shadowColor: [0x3a, 0x2c, 0x1d],
    },
];

/* ---- shared machinery ---------------------------------------------------- */

function sum(waves, x, y) {
    let v = 0, total = 0;
    for (const [kx, ky, amp, phase] of waves) {
        v += amp * Math.sin(2 * Math.PI * (kx * x / SIZE + ky * y / SIZE) + phase);
        total += amp;
    }
    return v / total;                      // -1 … 1
}

/** See make-water-tile.mjs — a ridged wave peaks at a line, not a hump. */
function ridged(waves, x, y, sharpness) {
    return Math.pow(1 - Math.abs(sum(waves, x, y)), sharpness);
}

/**
 * A deterministic hash of a WRAPPED index. This is the whole seam argument for
 * the family: every caller reduces its index modulo the lattice size before
 * calling, so the piece at −1 IS the piece at n−1.
 */
function hash(i, j, salt) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)
        + Math.imul(salt, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;

const mixRgb = (a, b, t) => [0, 1, 2].map(c => a[c] + (b[c] - a[c]) * t);

const smoothstep = (edge0, edge1, v) => {
    const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
};

/** Piecewise-linear colour ramp over any number of evenly spaced stops. */
function rampAt(stops, t) {
    const clamped = Math.min(1, Math.max(0, t));
    const span = 1 / (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(clamped / span));
    return mixRgb(stops[i], stops[i + 1], (clamped - i * span) / span);
}

/** Warped sample point — shared by every consumer so they cannot drift apart. */
function warpPoint(tile, x, y) {
    return [
        x + tile.warp.strength * sum(tile.warp.waves, x, y),
        y + tile.warp.strength * sum(tile.warp.waves,
            x + SIZE * tile.warp.offset[0], y + SIZE * tile.warp.offset[1]),
    ];
}

/* ---- partition 1: the lattice PLACES (leaf litter) ----------------------- */

/**
 * How much of a leaf covers this point, and which leaf.
 *
 * Each lattice cell is a SLOT holding at most one leaf — `fill` decides which
 * slots are taken, so the litter has gaps and overlaps instead of tessellating
 * (see the header). A leaf is an ELLIPSE: the distance is measured in a frame
 * rotated by the cell's own angle hash and squashed across it, because a round
 * piece is a pebble. Per-cell size variation then lets a big leaf lie over a
 * small one rather than every piece claiming its fair share.
 *
 * Returns `cover` (0 … 1, soft at the rim), the winning leaf's `tint`, and
 * `rim` = how far out on that leaf we are, for its own shading.
 *
 * ⚑ A 3×3 neighbour search is exhaustive only while jitter ≤ 0.5 and the leaf
 * radius stays inside a cell; `assertLatticeSound` holds both.
 */
function leafCover(x, y, cfg) {
    const cw = SIZE / cfg.n;
    const cx0 = Math.floor(x / cw), cy0 = Math.floor(y / cw);
    let best = Infinity, tint = 0;

    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const ci = cx0 + dx, cj = cy0 + dy;
            const wi = mod(ci, cfg.n), wj = mod(cj, cfg.n);
            if (hash(wi, wj, cfg.salt) > cfg.fill) { continue; }   // empty slot

            const px = (ci + 0.5 + cfg.jitter * (hash(wi, wj, cfg.salt + 1) - 0.5)) * cw;
            const py = (cj + 0.5 + cfg.jitter * (hash(wi, wj, cfg.salt + 2) - 0.5)) * cw;
            const ang = hash(wi, wj, cfg.salt + 3) * Math.PI * 2;
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const ox = x - px, oy = y - py;
            const along = ox * ca + oy * sa;
            const across = (-ox * sa + oy * ca) * cfg.elong;

            const r = cw * cfg.radius * (1 + cfg.sizeVar * (hash(wi, wj, cfg.salt + 4) - 0.5));
            const ratio = Math.hypot(along, across) / r;
            if (ratio < best) { best = ratio; tint = hash(wi, wj, cfg.salt + 5); }
        }
    }
    if (best === Infinity) { return {cover: 0, tint: 0, rim: 1}; }
    return {cover: 1 - smoothstep(0.84, 1, best), tint, rim: Math.min(1, best)};
}

/* ---- partition 2: the lattice CUTS (masonry) ----------------------------- */

/**
 * ⭐ COURSE HEIGHTS VARY, and it is the difference between fieldstone and a
 * garden-centre paving slab. Equal rows were the last thing giving the wall
 * away: the stones came out the same height all the way up, which no wall
 * built out of found rock has ever done.
 *
 * The boundaries are a cumulative sum of hashed weights RENORMALISED to land
 * exactly on SIZE, which is what keeps the tile periodic — a table of heights
 * that merely averaged out would leave a fractional row at the wrap. Computed
 * once and cached on the config; there is no RNG in it, so the cache cannot
 * make the output depend on call order.
 */
function rowTable(cfg) {
    if (cfg._rows) { return cfg._rows; }
    const w = [];
    let total = 0;
    for (let j = 0; j < cfg.rows; j++) {
        const h = 1 + cfg.rowVar * (hash(j, 0, 11) - 0.5);
        w.push(h); total += h;
    }
    const table = [0];
    let acc = 0;
    for (let j = 0; j < cfg.rows; j++) { acc += w[j] / total * SIZE; table.push(acc); }
    table[cfg.rows] = SIZE;                // exact, not 749.9999999
    cfg._rows = table;
    return table;
}

/**
 * Masonry: courses of varying height, each split into its own number of columns
 * at jittered vertical joints. See the header for why this is not a Voronoi.
 *
 * Returns `tint` (which stone), `edge` = distance to the nearest joint in row
 * heights (0 in the mortar) and `lit` = +1 on the top and left faces, −1 on the
 * bottom and right ones, which is the bevel.
 */
function course(x, y, cfg) {
    const rows = rowTable(cfg);
    const ys = mod(y, SIZE);
    let wj = 0;
    while (wj < cfg.rows - 1 && ys >= rows[wj + 1]) { wj++; }
    const top = rows[wj], bottom = rows[wj + 1];
    // One reference height for the whole tile, so `mortar.width` and
    // `bevel.width` mean the same thing in a tall course and a short one.
    const rowH = SIZE / cfg.rows;

    // Per-row column count and phase: the joints must not line up between rows.
    const cols = cfg.cols[Math.floor(hash(wj, 0, 7) * cfg.cols.length)];
    const colW = SIZE / cols;
    const xs = x + hash(wj, 0, 8) * colW;

    // A jittered joint position, hashed from the WRAPPED column index.
    const joint = k => (k + (hash(mod(k, cols), wj, 9) - 0.5) * cfg.jitter) * colW;

    let i = Math.floor(xs / colW);
    // Jitter moves a joint by up to half a column, so the first guess can be
    // one out either way; two corrective steps always suffice.
    for (let n = 0; n < 2; n++) {
        if (xs < joint(i)) { i--; }
        else if (xs >= joint(i + 1)) { i++; }
        else { break; }
    }

    const dl = xs - joint(i), dr = joint(i + 1) - xs;
    const dt = ys - top, db = bottom - ys;
    const m = Math.min(dl, dr, dt, db);
    return {
        tint: hash(mod(i, cols), wj, 3),
        edge: m / rowH,
        lit: (m === dl || m === dt) ? 1 : -1,
    };
}

/* ---- the three composites -------------------------------------------------- */

/**
 * Litter, painted in the order the material is built: duff, then the roots
 * threading it, then each leaf layer with its own drop shadow under it.
 * ⚑ The shadow is the same cover function sampled at an offset and masked by
 * the leaf itself, so it falls on the duff and never on the leaf casting it.
 */
function litter(tile, x, y, wx, wy) {
    const d = tile.duff;
    let t = 0.5 + 0.5 * sum(d.waves, x, y);
    t += d.grit * (sum(GRIT, x, y) * 0.5);
    let rgb = rampAt(d.ramp, Math.pow(Math.min(1, Math.max(0, t)), d.gamma));

    const r = Math.min(1, ridged(tile.roots.waves, x, y, tile.roots.sharpness));
    if (r > 0) { rgb = mixRgb(rgb, tile.roots.color, r * tile.roots.strength); }

    for (const layer of tile.layers) {
        const here = leafCover(wx, wy, layer);
        const behind = leafCover(wx - layer.shadow[0], wy - layer.shadow[1], layer);
        const shade = behind.cover * (1 - here.cover) * layer.shadowStrength;
        if (shade > 0) { rgb = mixRgb(rgb, tile.shadowColor, shade); }
        if (here.cover > 0) {
            const leaf = rampAt(layer.ramp, here.tint);
            // Each leaf darkens toward its own rim — a flat chip of colour is
            // what made the first draft read as mosaic.
            const shaded = mixRgb(leaf, tile.shadowColor, layer.rim * here.rim * here.rim);
            rgb = mixRgb(rgb, shaded, here.cover);
        }
    }
    return rgb;
}

/** Masonry: one ramp position per stone, then mortar over the joints. */
function masonry(tile, x, y, wx, wy) {
    const stone = course(wx, wy, tile.course);

    let t = tile.base + tile.tintWeight * stone.tint;
    t += tile.grit.weight * (0.5 + 0.5 * sum(tile.grit.waves, x, y));
    t += tile.dome * smoothstep(0, 0.3, stone.edge);
    t += tile.bevel.strength * stone.lit * (1 - smoothstep(0, tile.bevel.width, stone.edge));

    let rgb = rampAt(tile.ramp, t);
    const seam = 1 - smoothstep(0, tile.mortar.width, stone.edge);
    if (seam > 0) { rgb = mixRgb(rgb, tile.mortar.color, seam * tile.mortar.strength); }
    return rgb;
}

/**
 * Packed earth: the bed, the cracks drying in it, then the stones sitting in
 * the surface. ⚑ The stone loop is the litter's, deliberately unfactored — the
 * two are five lines each and share no configuration, and the moment one wants
 * a wet sheen or the other a stem, a shared helper grows a flag per caller.
 */
function earth(tile, x, y, wx, wy) {
    const b = tile.bed;
    let t = 0.5 + 0.5 * sum(b.waves, x, y);
    t += b.grit * (sum(EARTH_GRIT, x, y) * 0.5);
    let rgb = rampAt(b.ramp, Math.pow(Math.min(1, Math.max(0, t)), b.gamma));

    const c = Math.min(1, ridged(tile.cracks.waves, x, y, tile.cracks.sharpness));
    if (c > 0) { rgb = mixRgb(rgb, tile.cracks.color, c * tile.cracks.strength); }

    for (const layer of tile.layers) {
        const here = leafCover(wx, wy, layer);
        const behind = leafCover(wx - layer.shadow[0], wy - layer.shadow[1], layer);
        const shade = behind.cover * (1 - here.cover) * layer.shadowStrength;
        if (shade > 0) { rgb = mixRgb(rgb, tile.shadowColor, shade); }
        if (here.cover > 0) {
            const stone = rampAt(layer.ramp, here.tint);
            // A pebble is a DOME, so the rim darkening that shades a leaf is
            // doing more work here: it is the only thing giving the stone
            // relief, and without it the tile reads as confetti on mud.
            const shaded = mixRgb(stone, tile.shadowColor, layer.rim * here.rim * here.rim);
            rgb = mixRgb(rgb, shaded, here.cover);
        }
    }
    return rgb;
}

const PAINT = {litter, masonry, earth};

function pixel(tile, x, y) {
    const [wx, wy] = warpPoint(tile, x, y);
    const rgb = PAINT[tile.paint](tile, x, y, wx, wy);
    return rgb.map(c => Math.max(0, Math.min(255, Math.round(c))));
}

/* ---- checks -------------------------------------------------------------- */

/** ⛔ Bounds each partition's construction quietly depends on. */
function assertLatticeSound(tile) {
    for (const layer of tile.layers ?? []) {
        if (layer.jitter > 0.5) {
            throw new Error(`jitter ${layer.jitter} > 0.5: a leaf can leave its own cell far `
                + 'enough that the 3x3 neighbour search misses the nearest one.');
        }
        const reach = layer.radius * (1 + layer.sizeVar / 2) + layer.jitter / 2;
        if (reach > 1) {
            throw new Error(`a leaf reaches ${reach.toFixed(2)} cells from its own centre; `
                + 'past 1 the 3x3 search can miss it entirely and leaves get clipped.');
        }
    }
    if (tile.course) {
        if (tile.course.jitter > 1) {
            throw new Error(`joint jitter ${tile.course.jitter} > 1: a joint can cross its `
                + 'neighbour and the two corrective steps stop converging.');
        }
        for (const c of tile.course.cols) {
            if (!Number.isInteger(c)) { throw new Error(`column count ${c} is not an integer.`); }
        }
    }
}

/**
 * Proves the seam instead of trusting it — the same check the other three
 * generators carry. The tile is periodic iff the pixel one step PAST the right
 * edge equals the pixel at the left edge, and likewise top and bottom.
 */
function assertSeamless(tile) {
    let worst = 0;
    for (let i = 0; i < SIZE; i++) {
        const h = pixel(tile, SIZE, i), h0 = pixel(tile, 0, i);
        const v = pixel(tile, i, SIZE), v0 = pixel(tile, i, 0);
        for (let c = 0; c < 3; c++) {
            worst = Math.max(worst, Math.abs(h[c] - h0[c]), Math.abs(v[c] - v0[c]));
        }
    }
    if (worst > 0) {
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. Some wave `
            + 'number is not an integer, or a partition does not wrap.');
    }
    console.log('  seam: exact — both wrap edges match to the byte');
}

/**
 * ⭐ THE D14 CHECK, and it is the one this family adds over its three siblings:
 * they report where the mean lands on a RAMP, which only tells you the tile is
 * internally consistent. What the rule actually requires is that the rendered
 * IMAGE averages to the profile's `color`, because that colour is what paints
 * while the texture loads and wherever the file is missing. Measuring the image
 * catches a drift no ramp position can — a shadow pass, a mortar colour or a
 * second leaf layer quietly pulling the average off the fallback.
 *
 * 12/255 per channel is tight enough that a hue shift is visible before it
 * passes, and loose enough that a re-tune does not have to chase the last bit.
 */
function assertMatchesProfile(tile) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < SIZE; y += 3) {
        for (let x = 0; x < SIZE; x += 3) {
            const p = pixel(tile, x, y);
            r += p[0]; g += p[1]; b += p[2]; n++;
        }
    }
    const mean = [r / n, g / n, b / n];
    const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const off = mean.map((v, i) => v - tile.profileColor[i]);
    const worst = Math.max(...off.map(Math.abs));
    console.log(`  mean ${hex(mean)} vs profile ${hex(tile.profileColor)}`
        + `  (off by ${off.map(v => (v >= 0 ? '+' : '') + v.toFixed(0)).join('/')})`);
    if (worst > 12) {
        throw new Error(`the tile's mean colour is ${worst.toFixed(0)}/255 off the profile's `
            + `\`color\`. Either re-tune the tile or change the profile — but they have to `
            + 'agree, or the ground changes hue the moment the texture loads (D14).');
    }
}

/** How much of the tile each PLACED layer covers — the anti-tessellation number. */
function reportCoverage(tile) {
    if (!tile.layers) { return; }
    const cover = tile.layers.map(() => 0);
    let n = 0;
    for (let y = 0; y < SIZE; y += 3) {
        for (let x = 0; x < SIZE; x += 3) {
            const [wx, wy] = warpPoint(tile, x, y);
            tile.layers.forEach((layer, i) => {
                if (leafCover(wx, wy, layer).cover > 0.5) { cover[i]++; }
            });
            n++;
        }
    }
    console.log('  pieces: ' + cover.map((c, i) =>
        `layer ${i} ${(100 * c / n).toFixed(1)} %`).join('  '));
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled rather than pulled from npm, and duplicated from its three
// siblings rather than shared — see the header for why.

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) { c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) { c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); }
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

function writePng(tile, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // colour type 2 = truecolour RGB, no alpha — this is GROUND
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    // Scanlines, each prefixed with its filter byte. Filter 1 (Sub) predicts
    // each pixel from its left neighbour.
    const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
    let o = 0;
    for (let y = 0; y < SIZE; y++) {
        raw[o++] = 1;
        let prev = [0, 0, 0];
        for (let x = 0; x < SIZE; x++) {
            const rgb = pixel(tile, x, y);
            for (let c = 0; c < 3; c++) { raw[o++] = (rgb[c] - prev[c]) & 0xff; }
            prev = rgb;
        }
    }

    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, {level: 9})),
        chunk('IEND', Buffer.alloc(0)),
    ]);
    writeFileSync(out, png);
    console.log(`  wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
}

/* ---- go ------------------------------------------------------------------ */

for (const tile of TILES) {
    console.log(tile.file.replace('-placeholder.png', ''));
    assertLatticeSound(tile);
    assertSeamless(tile);
    assertMatchesProfile(tile);
    reportCoverage(tile);
    writePng(tile, join(GROUND, tile.file));
}
