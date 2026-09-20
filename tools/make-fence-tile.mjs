#!/usr/bin/env node
/**
 * fence-placeholder.png — the tile a `Fence` path wears.
 *
 * Run: `node tools/make-fence-tile.mjs`
 * Deterministic, no RNG, safe to re-run: the output is a pure function of the
 * constants in TILE below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE FIFTH FAMILY: a **DIRECTIONAL** tile — one that assumes the path it
 * paints authored `alignTexture: true`, so the tile is turned to run ALONG the
 * path and REGISTERED across it. Its four siblings
 * (water/fog/precipitation/cellular) are all world-aligned and therefore had to
 * look the same in every direction. A fence has a direction.
 *
 * ⛔ IT IS WRONG WITHOUT THE FLAG, and nothing warns: name `Fence` on a plain
 * path and the rails lie ACROSS the fence. That is not a bug to guard against
 * here, it is the whole reason the flag exists.
 *
 * ⭐ THE FIRST VERSION OF THIS TILE WAS A BOARDWALK, and why is the lesson
 * worth keeping. `alignTexture` originally only TURNED the tile; it did not
 * register it, so the window a stroke reveals landed at an arbitrary offset
 * across the ribbon and the tile could put nothing at a known height. Under
 * that limit the only legal picture was a pattern along the path — a solid
 * ribbon, punctuated. It was seamless, it was honest about the projection, and
 * the PO's verdict was "not like a fence at all". ⭐ **A fence is mostly
 * GAPS**, and a gap is structure ACROSS the ribbon. No amount of tuning gets
 * there; the constraint had to go, which it did: `Paths.textureAlignment` now
 * hands the renderer an ANCHOR and `RegionPaint.tileMatrix` slides the tile
 * along the path's normal so this tile's MIDDLE ROW sits on the centreline.
 *
 * ⚑ WHICH MAKES THE TILE'S HEIGHT LOAD-BEARING, in a way no other tile's is.
 * The middle row lands on the path, so a stroke of width W reveals
 * `TILE_H/2 ± W·120/(2·scale)` rows and nothing else. Everything is drawn
 * inside the middle {@link FENCE_H} rows, and the transparent margin above and
 * below is headroom: at `scale: 1` the fence is exact at `width: 0.4` and
 * still correct anywhere up to 0.8, past which the next copy creeps in.
 *
 * ⛔ NO BAKED SHADOW. The tile turns with its path, so a shadow along one edge
 * would point south-east on an east-west fence and north-east on a
 * north-south one. Posts and a dark outline carry the depth instead.
 *
 * ⚑ RGBA, unlike every other ground tile — because the gaps ARE the fence.
 * (The ground tiles are opaque because they are the ground; this is an object
 * standing on it.)
 *
 * ⚑ Seamless by construction: the post lattice divides the width a whole
 * number of times, and the top and bottom rows are fully transparent, so both
 * wraps match. `assertSeamless` proves it rather than trusting it.
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const TILE_W = 750;
const TILE_H = 96;      // 0.8 u at scale 1 — twice the fence, for headroom
const FENCE_H = 48;     // 0.4 u — the recommended path `width`
const PX_PER_UNIT = 120;
const HERE = dirname(fileURLToPath(import.meta.url));
const GROUND = join(HERE, '../frontend/src/features/regions/assets/ground');
const PROFILES = join(HERE, '../frontend/src/client-data/terrain-profiles.json');

/**
 * The profile's own `scale`, read rather than duplicated — the same trick
 * `make-field-tiles.mjs` uses and for the same reason: the sizes below are
 * quoted in WORLD UNITS, so re-tuning the scale in the profile table and
 * re-running keeps the posts the same distance apart on screen.
 */
const PROFILE = (() => {
    const table = JSON.parse(readFileSync(PROFILES, 'utf8'));
    const p = table.Fence;
    if (!p) {
        throw new Error('terrain-profiles.json has no `Fence` profile — add it first; this '
            + 'script reads its `scale` and checks the tile against its `color`.');
    }
    return p;
})();
const U = PX_PER_UNIT / PROFILE.scale;          // tile px per world unit
const SPAN_UNITS = TILE_W / U;

const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

const TILE = {
    file: 'fence-placeholder.png',
    profileColor: hex(PROFILE.color),

    rail: {
        thickness: 0.062,           // world units ACROSS the fence (~7 px)
        wood: hex('#8a7150'),
        core: hex('#a68a63'),       // the lit crown of the rail
    },
    post: {
        bays: 3,                    // → one post every 2.08 u at scale 1
        along: 0.17,                // world units ALONG the fence
        across: 0.30,               // ...and across it: MORE than the rail,
                                    // which is the whole silhouette
        wood: hex('#6f5735'),
        cap: hex('#8d7149'),        // end grain, lighter in the middle
    },
    // ⚑ One dark outline for everything, so posts and rail read as ONE object
    // against grass. Direction-neutral by necessity (see the header).
    edge: {colour: hex('#3a2d1c'), width: 2.2},
    // Per-post variation, so three posts are not one post stamped three times.
    vary: {size: 0.18, tone: 0.16},
};

/* ---- the tile ------------------------------------------------------------ */

/** Deterministic hash of two integers → [0, 1). No RNG anywhere in the family. */
function hash(a, b) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return ((h >>> 0) % 100000) / 100000;
}

/** 1 inside, 0 outside, with a one-pixel ramp — cheap anti-aliasing, and the
 *  reason the posts do not come out as stair-stepped blocks at this size. */
const band = (v, half) => Math.min(1, Math.max(0, half - Math.abs(v) + 0.5));

const mix = (a, b, t) => [0, 1, 2].map(c => a[c] + (b[c] - a[c]) * t);

/**
 * Signed distance-ish coverage for the fence at (x, y), returning the wood
 * colour and its alpha.
 *
 * ⚑ y is measured from the tile's MIDDLE ROW, which is where the path's
 * centreline lands once the tile is registered. That is the only reason this
 * function may speak about heights at all.
 */
function pixel(tile, x, y) {
    const dy = y - TILE_H / 2;
    const period = TILE_W / tile.post.bays;
    // Post centres at period/2, so the tile's own left edge falls mid-bay and
    // the horizontal wrap never cuts a post in half.
    const bay = Math.floor(((x % TILE_W) + TILE_W) % TILE_W / period);
    const dx = (((x + period / 2) % period) + period) % period - period / 2;

    const jitter = hash(bay, 17);
    const grow = 1 + (jitter - 0.5) * 2 * tile.vary.size;

    // ── the rail: a thin line the whole length of the tile
    const railHalf = tile.rail.thickness * U / 2;
    const railBody = band(dy, railHalf);
    const railEdge = band(dy, railHalf + tile.edge.width) - railBody;

    // ── the post: standing proud of the rail on both sides
    const pAlong = tile.post.along * U / 2 * grow;
    const pAcross = tile.post.across * U / 2 * grow;
    const postBody = Math.min(band(dx, pAlong), band(dy, pAcross));
    const postEdge = Math.min(band(dx, pAlong + tile.edge.width),
        band(dy, pAcross + tile.edge.width)) - postBody;

    // ── composite: outline under, wood over, post over rail
    let alpha = Math.max(railBody, railEdge, postBody, postEdge);
    if (alpha <= 0) { return [0, 0, 0, 0]; }

    let rgb;
    if (postBody > 0.5) {
        // End grain: lighter towards the middle of the post's face.
        const toward = 1 - Math.min(1, Math.abs(dy) / Math.max(1, pAcross));
        const tone = (hash(bay, 29) - 0.5) * 2 * tile.vary.tone;
        rgb = mix(tile.post.wood, tile.post.cap, 0.35 * toward + tone);
    } else if (railBody > 0.5) {
        const crown = 1 - Math.min(1, Math.abs(dy) / Math.max(1, railHalf));
        rgb = mix(tile.rail.wood, tile.rail.core, 0.6 * crown);
    } else {
        rgb = tile.edge.colour;
    }

    return [...rgb.map(v => Math.max(0, Math.min(255, Math.round(v)))),
        Math.round(255 * Math.min(1, alpha))];
}

/* ---- the checks ---------------------------------------------------------- */

/**
 * ⭐ THE CHECK THIS FAMILY ADDS, and it replaces the one the boardwalk draft
 * carried. That version forbade structure across the ribbon; registration made
 * structure legal, so what has to be proved instead is that the structure is
 * where registration will put it:
 *
 *   1. everything drawn sits inside the middle FENCE_H rows, so the authored
 *      `width` reveals all of it and nothing of the next copy;
 *   2. it is CENTRED there, because the middle row is what lands on the
 *      centreline — an off-centre fence would hang out of its own collider;
 *   3. the outermost rows are fully transparent, which is also what makes the
 *      vertical wrap seamless for free.
 */
function assertRegistered(tile) {
    let top = TILE_H, bottom = -1;
    for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
            if (pixel(tile, x, y)[3] > 0) {
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
                break;
            }
        }
    }
    const mid = TILE_H / 2;
    const reach = Math.max(mid - top, bottom + 1 - mid);
    const skew = Math.abs((mid - top) - (bottom + 1 - mid));
    console.log(`  ink rows ${top}..${bottom} of ${TILE_H}`
        + `  (reach ${reach} px each side of the middle, skew ${skew})`);
    if (reach * 2 > FENCE_H) {
        throw new Error(`the fence is ${reach * 2} px tall but the authored width shows only `
            + `${FENCE_H}. Either thin it or raise FENCE_H and the profile's documented width.`);
    }
    if (skew > 1) {
        throw new Error(`the fence is ${skew} px off-centre. The tile's MIDDLE row is what `
            + 'lands on the path centreline, so an off-centre fence hangs out of its own '
            + 'collider on one side.');
    }
    if (top === 0 || bottom === TILE_H - 1) {
        throw new Error('ink touches the top or bottom row, so the vertical wrap is not '
            + 'transparent and the tile will seam across the ribbon.');
    }
}

/** Proves the seam instead of trusting it — the same check all five carry.
 *  RGBA here, because this is the first family member with an alpha channel
 *  and comparing only RGB would pass a tile whose alpha does not wrap. */
function assertSeamless(tile) {
    let worst = 0;
    for (let i = 0; i < Math.max(TILE_W, TILE_H); i++) {
        if (i < TILE_H) {
            const h = pixel(tile, TILE_W, i), h0 = pixel(tile, 0, i);
            for (let c = 0; c < 4; c++) { worst = Math.max(worst, Math.abs(h[c] - h0[c])); }
        }
        if (i < TILE_W) {
            const v = pixel(tile, i, TILE_H), v0 = pixel(tile, i, 0);
            for (let c = 0; c < 4; c++) { worst = Math.max(worst, Math.abs(v[c] - v0[c])); }
        }
    }
    if (worst > 0) {
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. The post lattice `
            + 'does not divide the width, or ink reaches a wrap row.');
    }
    console.log('  seam: exact — both wrap edges match to the byte, alpha included');
}

/**
 * D14: the profile's `color` is what paints while the texture loads. ⚑ Measured
 * over the OPAQUE pixels only, which is the difference from the opaque
 * families: averaging in the transparent gaps would drag the mean towards
 * nothing and the fallback would have to be a colour no plank ever is.
 */
function assertMatchesProfile(tile) {
    let r = 0, g = 0, b = 0, n = 0, ink = 0, all = 0;
    for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
            const p = pixel(tile, x, y);
            all++;
            if (p[3] > 200) { r += p[0]; g += p[1]; b += p[2]; n++; ink++; }
        }
    }
    const mean = [r / n, g / n, b / n];
    const show = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const off = mean.map((v, i) => v - tile.profileColor[i]);
    const worst = Math.max(...off.map(Math.abs));
    console.log(`  opaque ${(100 * ink / all).toFixed(1)} % of the tile`
        + `  |  mean ${show(mean)} vs profile ${show(tile.profileColor)}`
        + ` (off by ${off.map(v => (v >= 0 ? '+' : '') + v.toFixed(0)).join('/')})`);
    if (worst > 12) {
        throw new Error(`the tile's mean colour is ${worst.toFixed(0)}/255 off the profile's `
            + '`color`. Either re-tune the tile or change the profile — but they have to '
            + 'agree, or the fence changes hue the moment the texture loads (D14).');
    }
}

/** What the author actually has to judge. */
function reportScale() {
    console.log(`  tile ${TILE_W}x${TILE_H} spans ${SPAN_UNITS.toFixed(2)} u`
        + ` at scale ${PROFILE.scale} — ${TILE.post.bays} posts,`
        + ` one every ${(SPAN_UNITS / TILE.post.bays).toFixed(2)} u.`
        + `  Author the path at width ${(FENCE_H / U).toFixed(2)}.`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled and duplicated from its siblings rather than shared: each of
// these scripts is meant to be readable and runnable on its own.

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
    ihdr.writeUInt32BE(TILE_W, 0);
    ihdr.writeUInt32BE(TILE_H, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type 6 = truecolour WITH ALPHA — the gaps are the
                    // fence, so unlike its siblings this one is not opaque
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    const raw = Buffer.alloc(TILE_H * (1 + TILE_W * 4));
    let o = 0;
    for (let y = 0; y < TILE_H; y++) {
        raw[o++] = 1;               // filter 1 = Sub
        let prev = [0, 0, 0, 0];
        for (let x = 0; x < TILE_W; x++) {
            const rgba = pixel(tile, x, y);
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

console.log('fence');
reportScale();
assertRegistered(TILE);
assertSeamless(TILE);
assertMatchesProfile(TILE);
writePng(TILE, join(GROUND, TILE.file));
