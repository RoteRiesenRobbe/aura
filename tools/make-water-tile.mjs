/**
 * Generates the PLACEHOLDER RIDGED-FIELD tiles for the terrain profiles
 * (plan-world-paths.md — the C3 blocker was "there is no water tile").
 *
 *     water · bog · lava
 *
 * ⭐ Checked in as a script, not just images, because a placeholder's whole job
 * is to be re-tuned: change a constant, re-run, look at it again. The committed
 * PNGs are exactly what this produces — deterministic, with no RNG anywhere.
 *
 * ⭐ THE THIRD GENERATOR FAMILY, and the split between the three is TECHNIQUE,
 * which is the line to think along before adding a tile anywhere:
 *
 *   - `make-water-tile.mjs`         (here) — RIDGED fields. `1 - |sin|` raised to
 *     a power, so a smooth wave sum becomes SHARP FEATURES: a wave crest at low
 *     sharpness, a crack at high. Opaque RGB, because all three are GROUND.
 *   - `make-fog-tile.mjs`                  — SMOOTH density fields (fog, miasma).
 *     RGBA, because they are AIR and the world has to show through.
 *   - `make-precipitation-tiles.mjs`       — PARTICLES (rain, snow, ash,
 *     sandstorm, fairy dust). Discrete marks on a mostly-empty RGBA tile.
 *
 * ⭐ SHARPNESS IS THE WHOLE TABLE. The same `ridged()` gives water its swell at
 * 4.2, a bog its broad scum at 1.4, and lava its thin bright veins at 7 — one
 * knob spanning three materials that look nothing alike.
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
const GROUND = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/regions/assets/ground');

/* ---- wave sets ----------------------------------------------------------- */

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

/**
 * ⭐ ISOTROPIC, and that is the point — the exact thing the water tile REJECTED.
 * Water has a swell because it flows; a bog does not flow at all, so a dominant
 * direction would be a lie about the material. Evenly spread directions and low
 * frequencies give broad, aimless blotches of scum sitting on still water.
 */
const BOG_BLOTCH = [
    [1, 0, 1.00, 0.7],
    [0, 1, 0.92, 3.9],
    [1, 1, 0.78, 1.4],
    [1, -1, 0.70, 5.1],
    [2, 1, 0.48, 2.8],
    [-1, 2, 0.44, 0.2],
    [2, -2, 0.34, 4.6],
    [3, 1, 0.24, 1.9],
    [1, 3, 0.20, 3.3],
    [3, -2, 0.15, 5.7],
    [4, 3, 0.10, 0.5],
    [5, 2, 0.07, 2.1],
];

const BOG_WARP = [
    [1, 1, 1.00, 1.6],
    [2, -1, 0.65, 4.1],
    [-1, 2, 0.42, 2.7],
];

/**
 * ⭐ Also isotropic, for a different reason: cooling crust cracks in a NETWORK,
 * not along a current. Carries more mid-frequency weight than the bog so the
 * cells come out varied in size — ⚑ and it gets away with that where miasma
 * could not (see make-fog-tile.mjs), because `ridged` at high sharpness throws
 * away everything except the zero crossings. What would be a visible lattice in
 * a smooth field is just where the veins run here.
 */
const LAVA_CRACK = [
    [1, 0, 1.00, 2.3],
    [0, 1, 0.95, 5.0],
    [1, 1, 0.85, 0.9],
    [1, -1, 0.80, 3.6],
    [2, 1, 0.62, 1.5],
    [-1, 2, 0.58, 4.2],
    [2, -2, 0.46, 2.0],
    [3, 1, 0.34, 5.6],
    [1, 3, 0.30, 0.4],
    [3, -2, 0.24, 3.0],
    [4, 3, 0.17, 1.2],
    [-3, 4, 0.14, 4.8],
    [5, 2, 0.10, 2.6],
    [2, 6, 0.08, 0.1],
];

const LAVA_WARP = [
    [1, 1, 1.00, 3.8],
    [2, -1, 0.70, 1.3],
    [-1, 2, 0.50, 5.4],
];

/* ---- the tiles ----------------------------------------------------------- */

// ⚑ EVERY NUMBER here is [PLACEHOLDER]. ⚑ `ramp[0]` is the tile's DOMINANT
// colour and must match its profile's `color`, which is D14's fallback: a river
// must not change hue the moment the texture finishes loading. ⛔ Lava is the
// documented exception — see its block.

const TILES = [
    {
        file: 'water-placeholder.png',
        ramp: [[0x2a, 0x63, 0xa8], [0x8f, 0xc6, 0xe6]],
        waves: SWELL,
        warp: WARP,
        // How far the cross-waves bend the swell, in pixels. Without this the
        // crests are dead-straight parallel stripes — corduroy, not water.
        warpStrength: 46,
        warpOffset: [0.37, 0.11],
        // The swell, and a much finer pass over it for the small chop that keeps
        // a big wave from looking like a plastic sheet.
        sharpness: [4.2, 5.5],
        fineOffset: [61, -37],
        mix: [0.72, 0.28],
        // Water is mostly dark; the bright part is the little that catches light.
        gamma: 1.9,
    },
    {
        // ⭐ A BOG IS WATER WITH EVERY WATER CUE REMOVED. Low sharpness so
        // nothing reads as a crest, and a ramp between two muddy greens that
        // are close together — a bog is uniform murk, and contrast is exactly
        // what it must not have.
        //
        // ⛔ THE GAMMA IS THE WHOLE TILE and the first draft had it at 1.05,
        // reasoning that a bog should sit in the midtones rather than go
        // dark-with-highlights the way water does. It came out a uniform MOSSY
        // LAWN — mean ramp position 0.71, so most of the tile was the SCUM
        // colour and the dark stop was barely present. ⚑ A bog reads as WATER
        // because it is dark and wet; the scum is the exception on top of it,
        // not the surface. 2.6 puts the mean near 0.46, which is murk with
        // blotches rather than blotches with murk.
        file: 'bog-placeholder.png',
        ramp: [[0x22, 0x29, 0x1a], [0x5e, 0x6a, 0x36]],
        waves: BOG_BLOTCH,
        warp: BOG_WARP,
        warpStrength: 64,
        warpOffset: [0.23, 0.44],
        sharpness: [1.4, 1.9],
        fineOffset: [97, -53],
        mix: [0.70, 0.30],
        gamma: 2.6,
    },
    {
        // ⭐ THE SAME FUNCTION AS THE WAVES, AT NEARLY TWICE THE SHARPNESS.
        // `ridged` peaks only where the wave sum crosses zero, so pushing the
        // exponent up narrows that peak from a crest into a thin bright line —
        // which is a crack. Nothing else about the machinery changes.
        //
        // ⭐ THE ONLY THREE-STOP RAMP, and it needs to be. Two stops from near
        // black to hot yellow interpolate through a muddy olive, so the glow
        // around each vein would read as dirt. The middle stop puts an EMBER
        // ORANGE in the path, which is where the heat actually lives.
        file: 'lava-placeholder.png',
        ramp: [[0x24, 0x16, 0x12], [0xc4, 0x3c, 0x08], [0xff, 0xe0, 0x8a]],
        waves: LAVA_CRACK,
        warp: LAVA_WARP,
        warpStrength: 60,
        warpOffset: [0.19, 0.61],
        sharpness: [7.0, 9.0],
        fineOffset: [131, -89],
        mix: [0.65, 0.35],
        // ⛔ THE FIRST DRAFT PUT THIS AT 0.85 — below 1, the only tile that
        // would have gone that way — on the reasoning that lifting the midtones
        // WIDENS the glow around each vein while `ridged` at sharpness 7 keeps
        // the crust dark. ⚑ The prediction that a gamma above 1 would "thin the
        // veins to invisibility" was simply WRONG: at 0.85 the mean ramp
        // position was 0.41, which is not crust-with-veins at all but a molten
        // LAKE with a few dark islands — the inverse of the material. At 1.5
        // the mean is 0.24 and the veins are still emphatically there.
        //
        // ⭐ The reason the number matters more here than anywhere else in this
        // file: at `scale: 0.35` a tile spans ~2.19 world units, so roughly NINE
        // repeats cross a 20-unit screen. A busy, bright, high-contrast field
        // repeated nine times reads as noise and advertises the tiling; a dark
        // field with bright veins repeated nine times reads as ground.
        gamma: 1.5,
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

/**
 * A RIDGED wave: `1 - |sin|` peaks at a sharp line instead of a broad hump, so
 * a crest reads as a thin bright edge. A plain sine spends most of its range in
 * the mid-tones, which is exactly the satin look this replaced.
 *
 * ⭐ `sharpness` is the family's one big knob: 1.4 is a broad soft blotch, 4.2 a
 * wave crest, 7+ a crack.
 */
function ridged(waves, x, y, sharpness) {
    return Math.pow(1 - Math.abs(sum(waves, x, y)), sharpness);
}

/** Piecewise-linear colour ramp. Two stops is a straight interpolation; three
 *  puts the middle stop at t = 0.5, which is what keeps lava's glow out of the
 *  olive a direct black→yellow blend would pass through. */
function rampAt(stops, t) {
    if (stops.length === 2) {
        return [0, 1, 2].map(c => Math.round(stops[0][c] + (stops[1][c] - stops[0][c]) * t));
    }
    const half = t < 0.5 ? 0 : 1;
    const local = t < 0.5 ? t * 2 : (t - 0.5) * 2;
    const a = stops[half], b = stops[half + 1];
    return [0, 1, 2].map(c => Math.round(a[c] + (b[c] - a[c]) * local));
}

function pixel(tile, x, y) {
    // ⚑ The warp is itself built from integer-frequency sines, so warping the
    // sample point keeps the whole composition exactly periodic over the tile.
    // A warp from any non-tiling source would break the seam invisibly here and
    // visibly in-game.
    const wx = x + tile.warpStrength * sum(tile.warp, x, y);
    const wy = y + tile.warpStrength * sum(tile.warp,
        x + SIZE * tile.warpOffset[0], y + SIZE * tile.warpOffset[1]);

    let t = tile.mix[0] * ridged(tile.waves, wx, wy, tile.sharpness[0])
        + tile.mix[1] * ridged(tile.waves,
            wx * 2.0 + tile.fineOffset[0], wy * 2.0 + tile.fineOffset[1],
            tile.sharpness[1]);

    t = Math.pow(t, tile.gamma);

    return rampAt(tile.ramp, t);
}

/* ---- checks -------------------------------------------------------------- */

/**
 * Proves the seam instead of trusting it.
 *
 * The tile is periodic iff the pixel one step PAST the right edge equals the
 * pixel at the left edge, and likewise top/bottom — so evaluate at SIZE and
 * compare against 0. Any non-integer wave number, or a warp built from a
 * non-tiling source, shows up here as a non-zero delta long before it shows up
 * as a grid of visible lines in-game.
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
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. `
            + 'Some wave number is not an integer, or the warp does not tile.');
    }
    console.log('  seam: exact — both wrap edges match to the byte');
}

/**
 * Reports the spread of the ramp position, so a re-tune can be judged by more
 * than eye. ⚑ For lava, `mean` is the one to watch: crust should dominate, so a
 * mean much above ~0.2 means the veins have swollen into a lake of molten rock
 * with a few dark islands — the inverse of the material.
 */
function reportSpread(tile) {
    let min = 1, max = 0, total = 0, n = 0;
    for (let y = 0; y < SIZE; y += 5) {
        for (let x = 0; x < SIZE; x += 5) {
            const wx = x + tile.warpStrength * sum(tile.warp, x, y);
            const wy = y + tile.warpStrength * sum(tile.warp,
                x + SIZE * tile.warpOffset[0], y + SIZE * tile.warpOffset[1]);
            let t = tile.mix[0] * ridged(tile.waves, wx, wy, tile.sharpness[0])
                + tile.mix[1] * ridged(tile.waves,
                    wx * 2.0 + tile.fineOffset[0], wy * 2.0 + tile.fineOffset[1],
                    tile.sharpness[1]);
            t = Math.pow(t, tile.gamma);
            min = Math.min(min, t); max = Math.max(max, t); total += t; n++;
        }
    }
    console.log(`  ramp: min ${min.toFixed(3)}  mean ${(total / n).toFixed(3)}`
        + `  max ${max.toFixed(3)}`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */
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

function writePng(tile, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // colour type 2 = truecolour RGB, no alpha (the air tiles are 6)
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    // Scanlines, each prefixed with its filter byte. Filter 1 (Sub) predicts
    // each pixel from its left neighbour — near-zero residuals on a smooth
    // gradient.
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
    assertSeamless(tile);
    reportSpread(tile);
    writePng(tile, join(GROUND, tile.file));
}
