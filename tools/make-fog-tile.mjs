/**
 * Generates the PLACEHOLDER DENSITY-FIELD tiles for the atmosphere profiles
 * (plan-region-atmosphere.md A1-fog — the PO asked for "a placeholder profile
 * and asset, I can put it in the map myself").
 *
 *     fog · miasma
 *
 * ⭐ Checked in as a script, not just images, exactly as `make-water-tile.mjs`
 * is and for the same reason: a placeholder's whole job is to be re-tuned.
 * Change a constant, re-run, look at it again. The committed PNGs are exactly
 * what this produces — deterministic, no RNG anywhere.
 *
 * ⭐ THIS IS THE WATER TILE'S REJECTED FIRST DRAFT, ON PURPOSE. That script
 * records what went wrong when it started: *"the first attempt used evenly
 * spread directions and came out as soft isotropic blobs — clouds. Real water
 * has a dominant swell."* Clouds are precisely what fog wants, so this one
 * spreads its wave directions evenly and keeps the broad sine humps that the
 * water tile sharpened away with `ridged()`.
 *
 * ⭐ A DENSITY FIELD IS THE OTHER HALF OF THE AIR. Every tile here covers EVERY
 * pixel — a sum of waves, with a contrast curve deciding where the banks are.
 * The sibling generator `make-precipitation-tiles.mjs` owns the other family,
 * PARTICLES (rain, snow, ash, sandstorm, fairy dust): discrete marks on a
 * mostly-empty tile, where coverage is the number that matters and a full tile
 * is the failure. ⚑ The split is what the air IS, and it is the line to think
 * along before adding to either — fog with drops in it is two profiles stacked,
 * not one tile trying to be both.
 *
 * ⚑ RGBA, unlike every ground tile, and that is the point. `haze` applies ONE
 * opacity to the whole painted surface, so a fully-opaque tile at `haze: 0.6`
 * is a flat grey wash with a pattern in it — not fog. Varying the tile's OWN
 * alpha gives thick banks and thin wisps inside a single shape, and the density
 * knob stays in the profile where the PO can turn it.
 *
 * ⚑ SEAMLESS BY CONSTRUCTION, not by eye: every wave is
 * `sin(2π(kx·x/W + ky·y/H) + φ)` with INTEGER kx, ky, exactly periodic over the
 * tile in both axes. `assertSeamless()` proves it rather than trusting it.
 *
 * ⚑ 750 × 750 to match the CC0 pack, so `scale: 0.35` means the same amount of
 * world here as for every other tile.
 *
 * Usage: node tools/make-fog-tile.mjs
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const SIZE = 750;
const GROUND = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/regions/assets/ground');

/**
 * ⭐ Evenly spread directions, which is what makes this ISOTROPIC — no grain,
 * no dominant swell, no sense of a current. Two or three low frequencies carry
 * the bank shapes and the higher ones only break up their edges.
 *
 * Each entry is [kx, ky, amplitude, phase]; all wave numbers integer (header).
 */
const FOG_BANKS = [
    [1, 0, 1.00, 0.0],
    [0, 1, 0.95, 1.9],
    [1, 1, 0.80, 3.4],
    [1, -1, 0.75, 0.7],
    [2, 1, 0.55, 2.6],
    [-1, 2, 0.52, 4.9],
    [2, -2, 0.40, 1.4],
    [3, 1, 0.30, 5.6],
    [1, 3, 0.28, 2.1],
    [3, -2, 0.22, 3.9],
    [4, 3, 0.15, 0.4],
    [-3, 4, 0.13, 4.2],
    [5, 2, 0.09, 1.6],
    [2, 6, 0.07, 5.1],
];

/** Low, slow cross-waves that bend the banks so they are not symmetric blobs. */
const FOG_DRIFT = [
    [1, 1, 1.00, 2.2],
    [2, -1, 0.60, 0.5],
    [-1, 2, 0.45, 3.7],
];

/**
 * ⭐ MIASMA IS CLOTTED WHERE FOG IS BROAD — but NOT because of this table, and
 * that is the whole lesson of the two drafts it took to get here.
 *
 * ⛔ CLOTTING MUST NOT COME FROM THE SPECTRUM. The obvious move is to put the
 * amplitude in the MIDDLE frequencies, so the density breaks into separate
 * pockets rather than one rolling sheet. It does — and it also builds a visible
 * LATTICE, because a tile whose dominant wave is frequency 2 has exactly two
 * humps across itself in each axis, so every pocket comes out the same size on
 * a regular diagonal grid and the whole thing reads as wallpaper the moment two
 * copies sit side by side. ⚑ Softening it halfway (low frequencies back, at
 * two-thirds amplitude) does NOT fix it: the mid waves are still the loudest,
 * so the grid is still the structure and is merely dimmer. ⛔ And the three
 * contrast passes make it WORSE rather than better — they harden whatever
 * structure is already there, so they sharpen the lattice right along with the
 * pockets.
 *
 * ⭐ So the amplitudes below decay from the unit waves exactly as fog's do, and
 * the CLOTTING is bought entirely with the three knobs that have nothing to do
 * with the spectrum: a third `contrastPasses` (drives midtones to the ends), a
 * lower `broadMix` (more fine pass, a curdled surface inside each pocket), and
 * a much lower `minAlpha` (the gaps go genuinely clear). ⚑ What this table
 * changes is only the PHASES, plus a little more weight at 2-3 than fog carries
 * — enough to be a different image, not enough to be a grid.
 */
const MIASMA_BANKS = [
    [1, 0, 1.00, 2.9],
    [0, 1, 0.95, 0.4],
    [1, 1, 0.88, 5.9],
    [1, -1, 0.82, 3.2],
    [2, 1, 0.60, 1.1],
    [1, 2, 0.56, 4.4],
    [2, -2, 0.48, 2.7],
    [3, 1, 0.36, 0.3],
    [-1, 3, 0.33, 5.2],
    [3, -3, 0.26, 3.1],
    [4, 2, 0.20, 1.8],
    [2, 4, 0.17, 4.7],
    [4, -3, 0.13, 0.9],
    [5, 1, 0.10, 2.4],
    [6, 3, 0.07, 1.2],
];

const MIASMA_DRIFT = [
    [1, -1, 1.00, 0.8],
    [2, 1, 0.65, 3.3],
    [-2, 1, 0.50, 5.5],
];

/* ---- the tiles ----------------------------------------------------------- */

// ⚑ EVERY NUMBER here is [PLACEHOLDER] and is exactly what the look sitting is
// for. ⚑ `tint` must match its profile's `color`, which is D14's fallback: with
// the tile missing the profile paints a flat wash of that colour, and a
// mismatch means the air changes hue the moment the texture lands.

const TILES = [
    {
        file: 'fog-placeholder.png',
        // Fog is very nearly colourless — a faint cool grey so it reads as damp
        // air rather than as smoke.
        tint: [0xc4, 0xcb, 0xd2],
        banks: FOG_BANKS,
        drift: FOG_DRIFT,
        // How far the cross-waves bend the banks, in pixels. Without it the
        // banks are too regular and the tile reads as a pattern rather than as
        // weather.
        warp: 70,
        // How much of the density comes from the broad pass rather than the
        // fine one. Fog is mostly its big shapes.
        broadMix: 0.74,
        // ⭐ The contrast curve is what separates fog from a grey sheet. A plain
        // sum sits around 0.5 everywhere; pushing it away from the middle gives
        // genuinely clear gaps to see through and genuinely thick banks that
        // hide things — which is the whole gameplay point of the property.
        // Each pass is one smoothstep, and two is deliberately hard.
        contrastPasses: 2,
        // The alpha the densest part reaches. Under 1 on purpose: the tile
        // should never be a solid wall by itself, because `haze` is the knob
        // that decides how solid a given bank is, and a tile that already
        // reaches 1 leaves that knob nothing to say at the top of its range.
        maxAlpha: 0.92,
        // …and the thinnest. Above 0 so a bank still tints its clear patches
        // slightly, which is what stops the gaps looking like holes cut in it.
        minAlpha: 0.10,
        // The thicker the fog, the less the ground behind shows through, so the
        // brightest parts are also the most saturated. A flat tint at varying
        // alpha reads as a dirty window instead.
        lift: 0.15,
    },
    {
        file: 'miasma-placeholder.png',
        tint: [0x7c, 0x8a, 0x4e],       // sickly yellow-green
        banks: MIASMA_BANKS,
        drift: MIASMA_DRIFT,
        // Warped harder than fog: swamp gas has no reason to be tidy, and the
        // extra bend is what keeps the mid-frequency pockets from reading as a
        // regular lattice.
        warp: 110,
        // ⭐ Fine detail weighted far higher than fog's. Fog wants smooth banks;
        // miasma wants a curdled surface inside each pocket, and the fine pass
        // is where that texture comes from.
        broadMix: 0.62,
        // ⭐ A THIRD contrast pass, which is the single biggest difference on
        // screen. It drives the midtones to the ends, so the pockets go nearly
        // opaque and the air between them goes nearly clear — vapour hanging in
        // distinct clots, rather than fog's continuous gradient.
        contrastPasses: 3,
        maxAlpha: 0.95,
        // ⭐ Much lower than fog's, and the reason the clots read as clots: the
        // gaps have to be genuinely see-through, or three contrast passes just
        // produce a darker sheet.
        minAlpha: 0.04,
        lift: 0.15,
    },
];

/* ---- the field ----------------------------------------------------------- */

function sum(waves, x, y) {
    let v = 0, total = 0;
    for (const [kx, ky, amp, phase] of waves) {
        v += amp * Math.sin(2 * Math.PI * (kx * x / SIZE + ky * y / SIZE) + phase);
        total += amp;
    }
    return v / total;                      // -1 … 1
}

/** Density at a point, 0 … 1. */
function density(t, x, y) {
    // ⚑ The warp is itself built from integer-frequency sines, so warping the
    // sample point keeps the whole composition exactly periodic over the tile.
    const wx = x + t.warp * sum(t.drift, x, y);
    const wy = y + t.warp * sum(t.drift, x + SIZE * 0.41, y + SIZE * 0.23);

    // The banks, plus a finer pass for the wispy detail at their edges.
    const broad = 0.5 + 0.5 * sum(t.banks, wx, wy);
    const fine = 0.5 + 0.5 * sum(t.banks, wx * 2.0 + 113, wy * 2.0 - 71);
    let v = t.broadMix * broad + (1 - t.broadMix) * fine;

    for (let i = 0; i < t.contrastPasses; i++) {
        v = v * v * (3 - 2 * v);           // smoothstep
    }
    return v;
}

function pixel(t, x, y) {
    const d = density(t, x, y);
    const a = t.minAlpha + (t.maxAlpha - t.minAlpha) * d;
    const lift = (1 - t.lift) + t.lift * d;
    return [
        Math.round(t.tint[0] * lift),
        Math.round(t.tint[1] * lift),
        Math.round(t.tint[2] * lift),
        Math.round(255 * a),
    ];
}

/* ---- checks -------------------------------------------------------------- */

/**
 * Proves the seam instead of trusting it.
 *
 * The tile is periodic iff the pixel one step PAST the right edge equals the
 * pixel at the left edge, and likewise top/bottom — so evaluate at SIZE and
 * compare against 0. Any non-integer wave number, or a warp built from a
 * non-tiling source, shows up here long before it shows up as a visible grid
 * of lines in-game — and this air is drifting, so a seam would sweep across the
 * screen rather than sit still where it might be missed.
 */
function assertSeamless(t) {
    let worst = 0;
    for (let i = 0; i < SIZE; i++) {
        const h = pixel(t, SIZE, i), h0 = pixel(t, 0, i);
        const v = pixel(t, i, SIZE), v0 = pixel(t, i, 0);
        for (let c = 0; c < 4; c++) {
            worst = Math.max(worst, Math.abs(h[c] - h0[c]), Math.abs(v[c] - v0[c]));
        }
    }
    if (worst > 0) {
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. `
            + 'Some wave number is not an integer, or the warp does not tile.');
    }
    console.log('  seam: exact — both wrap edges match to the byte');
}

/** Reports the spread, so a re-tune can be judged by more than eye. */
function reportContrast(t) {
    let min = 1, max = 0, total = 0, n = 0;
    for (let y = 0; y < SIZE; y += 5) {
        for (let x = 0; x < SIZE; x += 5) {
            const d = density(t, x, y);
            min = Math.min(min, d); max = Math.max(max, d); total += d; n++;
        }
    }
    console.log(`  density: min ${min.toFixed(3)}  mean ${(total / n).toFixed(3)}`
        + `  max ${max.toFixed(3)}`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled rather than pulled from npm, verbatim the argument
// make-water-tile.mjs makes: this script runs once in a blue moon, and a
// build-time dependency for a placeholder is not a trade worth making.

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

function writePng(t, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type 6 = truecolour RGB + ALPHA (the water tile is 2)
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    // Scanlines, each prefixed with its filter byte. Filter 1 (Sub) predicts each
    // pixel from its left neighbour — near-zero residuals on a smooth gradient.
    const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
    let o = 0;
    for (let y = 0; y < SIZE; y++) {
        raw[o++] = 1;
        let prev = [0, 0, 0, 0];
        for (let x = 0; x < SIZE; x++) {
            const rgba = pixel(t, x, y);
            for (let c = 0; c < 4; c++) { raw[o++] = (rgba[c] - prev[c]) & 0xff; }
            prev = rgba;
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
    assertSeamless(tile);
    reportContrast(tile);
    writePng(tile, join(GROUND, tile.file));
}
