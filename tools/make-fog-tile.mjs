/**
 * Generates the PLACEHOLDER fog tile for the atmosphere profiles
 * (plan-region-atmosphere.md A1-fog — the PO asked for "a placeholder profile
 * and asset, I can put it in the map myself").
 *
 * ⭐ Checked in as a script, not just an image, exactly as
 * `make-water-tile.mjs` is and for the same reason: a placeholder's whole job
 * is to be re-tuned. Change a constant, re-run, look at it again. The committed
 * PNG is exactly what this produces — deterministic, no RNG anywhere.
 *
 * ⭐ THIS IS THE WATER TILE'S REJECTED FIRST DRAFT, ON PURPOSE. That script
 * records what went wrong when it started: *"the first attempt used evenly
 * spread directions and came out as soft isotropic blobs — clouds. Real water
 * has a dominant swell."* Clouds are precisely what fog wants, so this one
 * spreads its wave directions evenly and keeps the broad sine humps that the
 * water tile sharpened away with `ridged()`.
 *
 * ⚑ RGBA, unlike every ground tile, and that is the point. Gloom applies ONE
 * opacity to the whole painted surface, so a fully-opaque tile at `gloom: 0.6`
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
const OUT = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/regions/assets/ground/fog-placeholder.png');

// Fog is very nearly colourless — a faint cool grey so it reads as damp air
// rather than as smoke. The `Fog` profile's own fallback colour is the same
// value, so a bank does not change hue when the texture finishes loading.
const TINT = [0xc4, 0xcb, 0xd2];

/**
 * ⭐ Evenly spread directions, which is what makes this ISOTROPIC — no grain,
 * no dominant swell, no sense of a current. Two or three low frequencies carry
 * the bank shapes and the higher ones only break up their edges.
 *
 * Each entry is [kx, ky, amplitude, phase]; all wave numbers integer (header).
 */
const BANKS = [
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
const DRIFT = [
    [1, 1, 1.00, 2.2],
    [2, -1, 0.60, 0.5],
    [-1, 2, 0.45, 3.7],
];

function sum(waves, x, y) {
    let v = 0, total = 0;
    for (const [kx, ky, amp, phase] of waves) {
        v += amp * Math.sin(2 * Math.PI * (kx * x / SIZE + ky * y / SIZE) + phase);
        total += amp;
    }
    return v / total;                      // -1 … 1
}

// How far the cross-waves bend the banks, in pixels. Without it the banks are
// too regular and the tile reads as a pattern rather than as weather.
const WARP_STRENGTH = 70;

/** Density at a point, 0 … 1. */
function density(x, y) {
    // ⚑ The warp is itself built from integer-frequency sines, so warping the
    // sample point keeps the whole composition exactly periodic over the tile.
    const wx = x + WARP_STRENGTH * sum(DRIFT, x, y);
    const wy = y + WARP_STRENGTH * sum(DRIFT, x + SIZE * 0.41, y + SIZE * 0.23);

    // The banks, plus a finer pass for the wispy detail at their edges.
    const broad = 0.5 + 0.5 * sum(BANKS, wx, wy);
    const fine = 0.5 + 0.5 * sum(BANKS, wx * 2.0 + 113, wy * 2.0 - 71);
    let t = 0.74 * broad + 0.26 * fine;

    // ⭐ The contrast curve is what separates fog from a grey sheet. A plain
    // sum sits around 0.5 everywhere; pushing it away from the middle gives
    // genuinely clear gaps to see through and genuinely thick banks that hide
    // things — which is the whole gameplay point of the property.
    t = t * t * (3 - 2 * t);               // smoothstep, once
    t = t * t * (3 - 2 * t);               // and again — deliberately hard
    return t;
}

// The alpha the densest part of the tile reaches. Under 1 on purpose: the tile
// should never be a solid wall by itself, because `gloom` is the knob that
// decides how solid a given bank is, and a tile that already reaches 1 leaves
// that knob nothing to say at the top of its range.
const MAX_ALPHA = 0.92;
// …and the thinnest. Above 0 so a bank still tints its clear patches slightly,
// which is what stops the gaps from looking like holes cut in the fog.
const MIN_ALPHA = 0.10;

function pixel(x, y) {
    const t = density(x, y);
    const a = MIN_ALPHA + (MAX_ALPHA - MIN_ALPHA) * t;
    // The thicker the fog, the less the ground behind shows through, so the
    // brightest parts are also the most saturated. A flat tint at varying alpha
    // reads as a dirty window instead.
    const lift = 0.85 + 0.15 * t;
    return [
        Math.round(TINT[0] * lift),
        Math.round(TINT[1] * lift),
        Math.round(TINT[2] * lift),
        Math.round(255 * a),
    ];
}

/**
 * Proves the seam instead of trusting it.
 *
 * The tile is periodic iff the pixel one step PAST the right edge equals the
 * pixel at the left edge, and likewise top/bottom — so evaluate at SIZE and
 * compare against 0. Any non-integer wave number, or a warp built from a
 * non-tiling source, shows up here long before it shows up as a visible grid
 * of lines in-game — and fog is drifting, so a seam would sweep across the
 * screen rather than sit still where it might be missed.
 */
function assertSeamless() {
    let worst = 0;
    for (let i = 0; i < SIZE; i++) {
        const h = pixel(SIZE, i), h0 = pixel(0, i);
        const v = pixel(i, SIZE), v0 = pixel(i, 0);
        for (let c = 0; c < 4; c++) {
            worst = Math.max(worst, Math.abs(h[c] - h0[c]), Math.abs(v[c] - v0[c]));
        }
    }
    if (worst > 0) {
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. `
            + 'Some wave number is not an integer, or the warp does not tile.');
    }
    console.log('seam: exact — both wrap edges match to the byte');
}

/** Reports the spread, so a re-tune can be judged by more than eye. */
function reportContrast() {
    let min = 1, max = 0, total = 0, n = 0;
    for (let y = 0; y < SIZE; y += 5) {
        for (let x = 0; x < SIZE; x += 5) {
            const t = density(x, y);
            min = Math.min(min, t); max = Math.max(max, t); total += t; n++;
        }
    }
    console.log(`density: min ${min.toFixed(3)}  mean ${(total / n).toFixed(3)}  max ${max.toFixed(3)}`);
}

assertSeamless();
reportContrast();

// ---- a minimal PNG writer -------------------------------------------------
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
        const rgba = pixel(x, y);
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

writeFileSync(OUT, png);
console.log(`wrote ${OUT} (${(png.length / 1024).toFixed(0)} KB)`);
