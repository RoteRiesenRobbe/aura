#!/usr/bin/env node
/**
 * shoreline-placeholder.png — the tile a `Shoreline` path wears.
 *
 * Run: `node tools/make-shoreline-tile.mjs`
 * Deterministic, no RNG, safe to re-run: the output is a pure function of the
 * constants in TILE below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE THIRD DIRECTIONAL TILE, after the fence and the cliff, and it copies
 * the CLIFF'S CONVENTION ON PURPOSE: the path authors `alignTexture: true`,
 * the tile's MIDDLE ROW lands on the centreline, and the top rows (negative
 * `u` below) are the LAND. So a coast drawn once with a `Cliff` and once with
 * a `Shoreline` puts the land on the same side for the same winding, and an
 * author who has learned one has learned both. `make-cliff-tile.mjs` is the
 * sibling to read first.
 *
 * ⛔ WRONG WITHOUT THE FLAG, and nothing warns: name `Shoreline` on a plain
 * path and the foam lines lie across the beach instead of along it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT A SHORE IS FROM ABOVE, land to sea:
 *   1. WET SAND — darker than the dry sand the region paints, because water
 *      darkens it. It FADES IN by alpha from nothing, with a ragged edge, so
 *      the band never starts with a line (the cliff's crest lesson).
 *   2. THE SWASH LINE — the bright, wandering edge of the last wave, and the
 *      one cue that says "sea" rather than "mud". Wobbled at three octaves and
 *      varying in thickness, so it is a wave's edge and not a kerb.
 * The tile ENDS at the swash line: the sea half is empty, and the Water drawn
 * beneath shows through untouched.
 *
 * ⛔ CUT 2026-10-03 (PO: "looks pretty bad"): a pale film, a foam lace (F2 − F1
 * of a jittered lattice) and a fainter second line used to fill the sea half.
 * Static foam over moving water read as a frozen ripple, so all three went.
 *
 * ⛔ STATIC. A profile carries ONE world `scroll` vector, so anything drifting
 * along one shore would drift INTO the shore across the bay. Motion, if it
 * ever comes, belongs to a renderer feature, not to this tile.
 *
 * ⚑ RGBA: the land beyond the fade and everything seaward of the swash line
 * are whatever the tile is drawn over. ⚑ Seamless by construction: every lattice and wobble
 * divides TILE_W a whole number of times and the top and bottom rows are fully
 * transparent; `assertSeamless` proves it.
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const TILE_W = 720;     // 6.0 u at scale 1
const TILE_H = 320;     // 2.67 u — headroom above and below the drawn band
// 1.5 u — the recommended path `width`; the drawn band must fit inside it.
const SHORE_H = 180;
const PX_PER_UNIT = 120;
const HERE = dirname(fileURLToPath(import.meta.url));
const GROUND = join(HERE, '../frontend/src/features/regions/assets/ground');
const PROFILES = join(HERE, '../frontend/src/client-data/terrain-profiles.json');

const PROFILE = (() => {
    const table = JSON.parse(readFileSync(PROFILES, 'utf8'));
    const p = table.Shoreline;
    if (!p) {
        throw new Error('terrain-profiles.json has no `Shoreline` profile — add it first; this '
            + 'script reads its `scale` and checks the tile against its `color`.');
    }
    return p;
})();
const U = PX_PER_UNIT / PROFILE.scale;

const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

/** Every `at` is in WORLD UNITS from the centreline, negative = the land side. */
const TILE = {
    file: 'shoreline-placeholder.png',
    profileColor: hex(PROFILE.color),

    // ── the land half ────────────────────────────────────────────────────────
    wet: {
        at: -0.72,                  // alpha 0 here, ragged
        full: -0.46,                // fully in by here
        ragged: 0.07,
        alpha: 0.9,
        dry: hex('#a8915f'),        // the inland edge, nearly the Coast sand
        soaked: hex('#857048'),     // right at the waterline
        sheen: {at: -0.2, width: 0.09, colour: hex('#bdb4a0'), strength: 0.25},
    },
    // ── the waterline ────────────────────────────────────────────────────────
    swash: {
        at: 0,
        jitter: 0.09,               // world units of wander along the run
        thick: 0.07,                // world units at its widest
        vary: 0.6,                  // how much of that it may lose
        colour: hex('#f3f0e6'),
    },
};

/* ---- the tile ------------------------------------------------------------ */

/** Deterministic hash of two integers → [0, 1). No RNG anywhere. */
function hash(a, b) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return ((h >>> 0) % 100000) / 100000;
}

const ramp = (v, a, b) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

const mix = (a, b, t) => [0, 1, 2].map(c => a[c] + (b[c] - a[c]) * t);

/** Value noise along the run that wraps at TILE_W (see make-cliff-tile.mjs). */
function wobble(x, bays, seed) {
    const period = TILE_W / bays;
    const i = Math.floor(x / period);
    const f = x / period - i;
    const a = hash(((i % bays) + bays) % bays, seed);
    const b = hash((((i + 1) % bays) + bays) % bays, seed);
    return a + (b - a) * (f * f * (3 - 2 * f));
}

/** Three octaves, so a wave's edge has no single feature size (the cliff's fix). */
function fractalWobble(x, bays, seed) {
    return 0.55 * wobble(x, bays, seed)
        + 0.30 * wobble(x, bays * 3, seed + 101)
        + 0.15 * wobble(x, bays * 9, seed + 211);
}

/** A wandering bright line of varying thickness → its coverage at (px, u). */
function foamLine(px, u, line, seed) {
    const centre = line.at + (fractalWobble(px, 4, seed) - 0.5) * 2 * line.jitter;
    const half = line.thick / 2 * (1 - (line.vary ?? 0.5) * fractalWobble(px, 6, seed + 7));
    const aa = 1.2 / U;
    return 1 - ramp(Math.abs(u - centre), half - aa, half + aa);
}

/** Composites `src` at `a` OVER (rgb, alpha) — straight alpha. */
function over(rgb, alpha, src, a) {
    if (a <= 0) { return [rgb, alpha]; }
    const out = a + alpha * (1 - a);
    if (rgb === null) { return [src, a]; }
    return [[0, 1, 2].map(c => (src[c] * a + rgb[c] * alpha * (1 - a)) / out), out];
}

/** The shore at (x, y) → [r, g, b, a]. */
function pixel(t, x, y) {
    const u = (y - TILE_H / 2) / U;
    const px = ((x % TILE_W) + TILE_W) % TILE_W;
    let rgb = null, alpha = 0;

    // 1: wet sand, fading in from a ragged inland edge, soaked at the line
    const swashAt = t.swash.at + (fractalWobble(px, 4, 5) - 0.5) * 2 * t.swash.jitter;
    const inland = t.wet.at + t.wet.ragged * (fractalWobble(px, 18, 37) - 0.5) * 2;
    if (u > inland && u < swashAt) {
        let c = mix(t.wet.dry, t.wet.soaked, ramp(u, t.wet.full, swashAt));
        const glint = 1 - ramp(Math.abs(u - t.wet.sheen.at), 0, t.wet.sheen.width);
        c = mix(c, t.wet.sheen.colour, glint * t.wet.sheen.strength
            * (0.4 + 0.6 * wobble(px, 9, 71)));
        [rgb, alpha] = [c, t.wet.alpha * ramp(u, inland, t.wet.full)];
    }

    // 2: the swash line over the wet sand; nothing seaward of it
    const sw = foamLine(px, u, {...t.swash, at: t.swash.at}, 5);
    [rgb, alpha] = over(rgb, alpha, t.swash.colour, sw);

    if (rgb === null || alpha <= 0) { return [0, 0, 0, 0]; }
    return [...rgb.map(c => Math.max(0, Math.min(255, Math.round(c)))),
        Math.round(255 * Math.min(1, alpha))];
}

/* ---- the checks ---------------------------------------------------------- */

/** The drawn band must fit the width. The reveal is symmetric about the middle
 *  row, so the LAND half has to fit inside half of it; the sea half is empty on
 *  purpose (the 2026-10-03 cut), so there is no centring check any more. */
function assertRegistered(t) {
    let top = TILE_H, bottom = -1;
    for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
            if (pixel(t, x, y)[3] > 0) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
        }
    }
    const mid = TILE_H / 2;
    const reach = Math.max(mid - top, bottom + 1 - mid);
    console.log(`  ink rows ${top}..${bottom} of ${TILE_H}  (reach ${reach} px, the land side)`);
    if (reach * 2 > SHORE_H) {
        throw new Error(`the shore is ${reach * 2} px wide but the authored width shows only `
            + `${SHORE_H}. Either thin it or raise SHORE_H and the documented width.`);
    }
    if (top === 0 || bottom === TILE_H - 1) {
        throw new Error('ink touches the top or bottom row, so the vertical wrap is not transparent.');
    }
}

/** Proves the seam instead of trusting it — the check all the tile scripts carry. */
function assertSeamless(t) {
    let worst = 0;
    for (let i = 0; i < Math.max(TILE_W, TILE_H); i++) {
        if (i < TILE_H) {
            const h = pixel(t, TILE_W, i), h0 = pixel(t, 0, i);
            for (let c = 0; c < 4; c++) { worst = Math.max(worst, Math.abs(h[c] - h0[c])); }
        }
        if (i < TILE_W) {
            const v = pixel(t, i, TILE_H), v0 = pixel(t, i, 0);
            for (let c = 0; c < 4; c++) { worst = Math.max(worst, Math.abs(v[c] - v0[c])); }
        }
    }
    if (worst > 0) {
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. A lattice or wobble `
            + 'does not divide the width, or ink reaches a wrap row.');
    }
    console.log('  seam: exact — both wrap edges match to the byte, alpha included');
}

/** D14: the profile's `color` paints while the texture loads. Opaque-ish pixels
 *  only, as the cliff does — the fade would drag it toward nothing. */
function assertMatchesProfile(t) {
    let r = 0, g = 0, b = 0, n = 0, all = 0;
    for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
            const p = pixel(t, x, y);
            all++;
            if (p[3] > 200) { r += p[0]; g += p[1]; b += p[2]; n++; }
        }
    }
    const mean = [r / n, g / n, b / n];
    const show = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const off = mean.map((v, i) => v - t.profileColor[i]);
    const worst = Math.max(...off.map(Math.abs));
    console.log(`  opaque ${(100 * n / all).toFixed(1)} % of the tile  |  mean ${show(mean)}`
        + ` vs profile ${show(t.profileColor)} (off by ${off.map(v => (v >= 0 ? '+' : '')
            + v.toFixed(0)).join('/')})`);
    if (worst > 12) {
        throw new Error(`the tile's mean colour is ${worst.toFixed(0)}/255 off the profile's `
            + '`color`. Re-tune the tile or change the profile — they have to agree (D14).');
    }
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Duplicated from its siblings rather than shared: each tile script stays
// readable and runnable on its own (make-cellular-tiles.mjs's header).

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

function writeRGBA(w, h, at, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;    // truecolour WITH ALPHA
    const raw = Buffer.alloc(h * (1 + w * 4));
    let o = 0;
    for (let y = 0; y < h; y++) {
        raw[o++] = 1;               // filter 1 = Sub
        let prev = [0, 0, 0, 0];
        for (let x = 0; x < w; x++) {
            const rgba = at(x, y);
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
    console.log(`  wrote ${out} (${(png.length / 1024).toFixed(1)} KB)`);
}

/* ---- go ------------------------------------------------------------------ */

console.log('shoreline');
console.log(`  tile ${TILE_W}x${TILE_H} spans ${(TILE_W / U).toFixed(2)} u at scale ${PROFILE.scale}.`
    + `\n  ⚑ Author the path ALONG THE WATER'S EDGE at width ${(SHORE_H / U).toFixed(2)},`
    + ' alignTexture true, land on the Cliff\'s lip side.');
assertRegistered(TILE);
assertSeamless(TILE);
assertMatchesProfile(TILE);
writeRGBA(TILE_W, TILE_H, (x, y) => pixel(TILE, x, y), join(GROUND, TILE.file));
