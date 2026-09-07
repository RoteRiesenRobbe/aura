/**
 * Generates the PLACEHOLDER water tile for the `Water` region profile
 * (plan-world-paths.md — the C3 blocker was "there is no water tile").
 *
 * ⭐ Checked in as a script, not just an image, because a placeholder's whole
 * job is to be re-tuned: change a constant, re-run, look at it again. The
 * committed PNG is exactly what this produces — it is deterministic, with no
 * RNG anywhere.
 *
 * ⚑ SEAMLESS BY CONSTRUCTION, not by eye. Every wave is
 * `sin(2π(kx·x/W + ky·y/H) + φ)` with INTEGER kx, ky, which is exactly periodic
 * over the tile in both axes. That is the whole trick: any non-integer
 * frequency, or any noise function that is not itself tiled, shows a grid at
 * every tile boundary — the README's second rule with teeth.
 *
 * ⚑ 750 x 750 to match the CC0 pack, so `scale: 0.35` means the same amount of
 * world here as it does for every other tile (README, "The scale knob").
 *
 * Usage: node tools/make-water-tile.mjs
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const SIZE = 750;
const OUT = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/regions/assets/ground/water-placeholder.png');

// The two ends of the ramp. `deep` is the Water profile's own colour from
// profiles.json, so the tile and its D14 fallback colour agree — a river does
// not change hue the moment the texture finishes loading.
const DEEP = [0x2a, 0x63, 0xa8];
const CREST = [0x8f, 0xc6, 0xe6];

/**
 * ⭐ The thing that makes this read as WATER and not as sky: the wave vectors
 * are CLUSTERED around one direction, so the crests all run roughly
 * perpendicular to it. The first attempt used evenly spread directions and came
 * out as soft isotropic blobs — clouds. Real water has a dominant swell.
 *
 * Each entry is [kx, ky, amplitude, phase]; all wave numbers integer (header).
 */
const SWELL = [
    [3, 1, 1.00, 0.0],
    [4, 2, 0.70, 1.7],
    [6, 1, 0.50, 3.1],
    [7, 3, 0.38, 0.6],
    [9, 2, 0.28, 2.2],
    [11, 4, 0.20, 4.4],
    [14, 3, 0.14, 1.1],
    [17, 6, 0.10, 5.3],
    [23, 5, 0.07, 2.8],
];

/** Low, slow, CROSS-running waves — they only bend the swell (see warp). */
const WARP = [
    [1, 2, 1.00, 0.9],
    [2, -1, 0.65, 2.4],
    [-1, 3, 0.45, 4.8],
    [3, 2, 0.30, 1.3],
];

function sum(waves, x, y) {
    let v = 0, total = 0;
    for (const [kx, ky, amp, phase] of waves) {
        v += amp * Math.sin(2 * Math.PI * (kx * x / SIZE + ky * y / SIZE) + phase);
        total += amp;
    }
    return v / total;                      // -1 … 1
}

/**
 * A RIDGED wave: `1 - |sin|` peaks at a sharp line instead of a broad hump, so
 * a crest reads as a thin bright edge. A plain sine spends most of its range in
 * the mid-tones, which is exactly the satin look this replaced.
 */
function ridged(waves, x, y, sharpness) {
    return Math.pow(1 - Math.abs(sum(waves, x, y)), sharpness);
}

// How far the cross-waves bend the swell, in pixels. Without this the crests
// are dead-straight parallel stripes — corduroy, not water.
const WARP_STRENGTH = 46;

function pixel(x, y) {
    // ⚑ The warp is itself built from integer-frequency sines, so warping the
    // sample point keeps the whole composition exactly periodic over the tile.
    // A warp from any non-tiling source would break the seam invisibly here and
    // visibly in-game.
    const wx = x + WARP_STRENGTH * sum(WARP, x, y);
    const wy = y + WARP_STRENGTH * sum(WARP, x + SIZE * 0.37, y + SIZE * 0.11);

    // The swell, and a much finer pass over it for the small chop that keeps a
    // big wave from looking like a plastic sheet.
    let t = 0.72 * ridged(SWELL, wx, wy, 4.2)
        + 0.28 * ridged(SWELL, wx * 2.0 + 61, wy * 2.0 - 37, 5.5);

    // Water is mostly dark; the bright part is the little that catches light.
    t = Math.pow(t, 1.9);

    return [
        Math.round(DEEP[0] + (CREST[0] - DEEP[0]) * t),
        Math.round(DEEP[1] + (CREST[1] - DEEP[1]) * t),
        Math.round(DEEP[2] + (CREST[2] - DEEP[2]) * t),
    ];
}

/**
 * Proves the seam instead of trusting it.
 *
 * The tile is periodic iff the pixel one step PAST the right edge equals the
 * pixel at the left edge, and likewise top/bottom — so evaluate at SIZE and
 * compare against 0. Any non-integer wave number, or a warp built from a
 * non-tiling source, shows up here as a non-zero delta long before it shows up
 * as a grid of visible lines in-game.
 */
function assertSeamless() {
    let worst = 0;
    for (let i = 0; i < SIZE; i++) {
        const h = pixel(SIZE, i), h0 = pixel(0, i);
        const v = pixel(i, SIZE), v0 = pixel(i, 0);
        for (let c = 0; c < 3; c++) {
            worst = Math.max(worst, Math.abs(h[c] - h0[c]), Math.abs(v[c] - v0[c]));
        }
    }
    if (worst > 0) {
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. `
            + 'Some wave number is not an integer, or the warp does not tile.');
    }
    console.log('seam: exact — both wrap edges match to the byte');
}

assertSeamless();

// ---- a minimal PNG writer -------------------------------------------------
// Hand-rolled rather than pulled from npm: this script runs once in a blue
// moon, and a build-time dependency for a placeholder is not a trade worth
// making.

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
ihdr[9] = 2;    // colour type 2 = truecolour RGB
ihdr[10] = 0;   // deflate
ihdr[11] = 0;   // adaptive filtering
ihdr[12] = 0;   // no interlace

// Scanlines, each prefixed with its filter byte. Filter 1 (Sub) predicts each
// pixel from its left neighbour, which on a smooth gradient leaves near-zero
// residuals and roughly halves the file against filter 0.
const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
let o = 0;
for (let y = 0; y < SIZE; y++) {
    raw[o++] = 1;
    let prev = [0, 0, 0];
    for (let x = 0; x < SIZE; x++) {
        const rgb = pixel(x, y);
        raw[o++] = (rgb[0] - prev[0]) & 0xff;
        raw[o++] = (rgb[1] - prev[1]) & 0xff;
        raw[o++] = (rgb[2] - prev[2]) & 0xff;
        prev = rgb;
    }
}

const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, {level: 9})),
    chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync(OUT, png);
console.log(`wrote ${OUT}`);
console.log(`${SIZE} x ${SIZE}, ${(png.length / 1024).toFixed(1)} KiB`);
