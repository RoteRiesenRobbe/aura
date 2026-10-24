#!/usr/bin/env node
/**
 * retaining-wall-placeholder.png — the tile a `Retaining Wall` path wears.
 *
 * Run: `node tools/make-retaining-wall-tile.mjs`
 * Deterministic, no RNG, safe to re-run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE CLIFF, BUILT. A city that sits on a hill holds its terraces up with
 * masonry, not bare rock (Cathedral Hill, first). `make-cliff-tile.mjs` is the
 * sibling to read first: registration, the top-down cheat and which side the
 * face falls on are all its contract, unchanged. Swap `Cliff` for
 * `Retaining Wall` on a path and nothing else moves.
 *
 * ⭐ WHAT READS AS BUILT, in order of how much it carries:
 *   1. COURSES — horizontal mortar lines running ALONG the path. Rock has
 *      fractures across the run; a wall has joints along it. That one swap is
 *      most of the difference.
 *   2. STAGGERED HEAD JOINTS, half a block per course: the bond.
 *   3. A PALE COPING on top, the brightest thing in the tile (the cliff's
 *      lip rule), with a dark overhang line under it.
 *   4. A HARD FOOT. Rock crumbles into talus; a wall meets the ground on a
 *      line, and only the baked occlusion shadow softens it.
 *
 * ⛔ HARD EDGES WARP AROUND A BEND (`make-cliff-smooth-tile.mjs` says why). A
 * wall is built in straight runs anyway: author one path per straight leg, or
 * accept a little stretch on a gentle bend.
 *
 * ⚑ GEOMETRY CONTRACT of `Cliff Smooth`: 720×320, the band inside the middle
 * 180 rows, `width` 1.5, `alignTexture` required. Block lengths divide the tile
 * width a whole number of times, so the wrap is exact (assertSeamless).
 *
 * ⚑ The PNG writer and the checks are duplicated from the sibling rather than
 * shared — the house rule for this family.
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const TILE_W = 720;     // 6.0 u at scale 1
const TILE_H = 320;
const CLIFF_H = 180;    // 1.5 u, the recommended path width
const PX_PER_UNIT = 120;
const HERE = dirname(fileURLToPath(import.meta.url));
const GROUND = join(HERE, '../frontend/src/features/regions/assets/ground');
const PROFILES = join(HERE, '../frontend/src/client-data/terrain-profiles.json');

const PROFILE = (() => {
    const table = JSON.parse(readFileSync(PROFILES, 'utf8'));
    const p = table['Retaining Wall'];
    if (!p) {
        throw new Error('terrain-profiles.json has no `Retaining Wall` profile — add it first; '
            + 'this script reads its `scale` and checks the tile against its `color`.');
    }
    return p;
})();
const U = PX_PER_UNIT / PROFILE.scale;

const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

const TILE = {
    file: 'retaining-wall-placeholder.png',
    profileColor: hex(PROFILE.color),
    mortar: hex('#57514a'),
    coping: {
        at: -0.62,
        to: -0.44,
        stone: hex('#d2c9b6'),
        blocks: 8,                  // per tile: 0.75 u slabs
        bevel: 0.25,                // lighter toward the outer edge
    },
    overhang: {to: -0.38, colour: hex('#2b2721'), alpha: 0.6},
    face: {
        at: -0.44,
        to: 0.44,
        stone: hex('#8d8475'),
        courses: 4,
        blocks: 12,                 // per tile: 0.5 u ashlar
        joint: 3,                   // px
        tone: 0.09,                 // per-block lightness swing, both ways
        footDark: hex('#3a352e'),
        fall: 0.38,                 // how far toward footDark the last course goes
    },
    shadow: {at: 0.44, to: 0.64, colour: hex('#15140f'), alpha: 0.45},
};

/* ---- the tile ------------------------------------------------------------ */

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

function pixel(t, x, y) {
    const v = (y - TILE_H / 2) / U;
    const px = ((x % TILE_W) + TILE_W) % TILE_W;
    let rgb = null;
    let alpha = 0;

    if (v >= t.coping.at && v < t.coping.to) {
        const len = TILE_W / t.coping.blocks;
        const i = Math.floor(px / len);
        if (px - i * len < t.face.joint) {
            rgb = t.mortar;
        } else {
            const k = (v - t.coping.at) / (t.coping.to - t.coping.at);
            const tone = (hash(i, 7) - 0.5) * 0.06;
            rgb = t.coping.stone.map(c => c * (1 + tone + t.coping.bevel * (0.5 - k) * 0.4));
        }
        alpha = 1;
    } else if (v >= t.face.at && v < t.face.to) {
        const courseH = (t.face.to - t.face.at) / t.face.courses;
        const c = Math.floor((v - t.face.at) / courseH);
        const inCourse = (v - t.face.at - c * courseH) * U;
        const len = TILE_W / t.face.blocks;
        const shifted = px + (c % 2) * len / 2;
        const i = Math.floor(shifted / len);
        const inBlock = shifted - i * len;
        const down = (v - t.face.at) / (t.face.to - t.face.at);
        if (inCourse < t.face.joint || inBlock < t.face.joint) {
            rgb = t.mortar;
        } else {
            const tone = (hash(((i % t.face.blocks) + t.face.blocks) % t.face.blocks, 31 + c) - 0.5)
                * 2 * t.face.tone;
            // each block lit a touch on its upper arris, shaded on its lower one
            const arris = inCourse < t.face.joint + 2 ? 0.08
                : inCourse > courseH * U - 2 ? -0.08 : 0;
            rgb = t.face.stone.map(ch => ch * (1 + tone + arris));
        }
        rgb = mix(rgb, t.face.footDark, t.face.fall * down);
        if (v < t.overhang.to) {
            rgb = mix(rgb, t.overhang.colour, t.overhang.alpha * (1 - ramp(v, t.face.at, t.overhang.to)));
        }
        alpha = 1;
    } else if (v >= t.shadow.at && v < t.shadow.to) {
        rgb = t.shadow.colour;
        alpha = t.shadow.alpha * (1 - ramp(v, t.shadow.at, t.shadow.to));
    }

    if (rgb === null || alpha <= 0) { return [0, 0, 0, 0]; }
    return [...rgb.map(c => Math.max(0, Math.min(255, Math.round(c)))),
        Math.round(255 * Math.min(1, alpha))];
}

/* ---- the checks ---------------------------------------------------------- */

function assertRegistered(t) {
    let top = TILE_H, bottom = -1;
    for (let y = 0; y < TILE_H; y++) {
        for (let x = 0; x < TILE_W; x++) {
            if (pixel(t, x, y)[3] > 0) { top = Math.min(top, y); bottom = Math.max(bottom, y); break; }
        }
    }
    const mid = TILE_H / 2;
    const reach = Math.max(mid - top, bottom + 1 - mid);
    const skew = Math.abs((mid - top) - (bottom + 1 - mid));
    console.log(`  ink rows ${top}..${bottom} of ${TILE_H}  (reach ${reach} px each side, skew ${skew})`);
    if (reach * 2 > CLIFF_H) {
        throw new Error(`the wall is ${reach * 2} px tall but the authored width shows only ${CLIFF_H}.`);
    }
    if (skew > 6) { throw new Error(`the drawn band is ${skew} px off-centre.`); }

    const lum = y => {
        let s = 0;
        for (let x = 0; x < TILE_W; x++) {
            const p = pixel(t, x, y);
            s += (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) * (p[3] / 255);
        }
        return s / TILE_W;
    };
    let best = -1, bestY = -1;
    for (let y = top; y <= bottom; y++) { const l = lum(y); if (l > best) { best = l; bestY = y; } }
    const copingMid = TILE_H / 2 + (t.coping.at + t.coping.to) / 2 * U;
    console.log(`  brightest row ${bestY} (coping sits at ~${Math.round(copingMid)})`);
    if (Math.abs(bestY - copingMid) > 0.12 * U) {
        throw new Error(`the brightest row is ${bestY}, not the coping at ~${Math.round(copingMid)}.`);
    }
}

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
    if (worst > 0) { throw new Error(`NOT seamless: edges differ by up to ${worst}/255.`); }
    console.log('  seam: exact — both wrap edges match to the byte, alpha included');
}

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
    console.log(`  opaque ${(100 * n / all).toFixed(1)} % of the tile`
        + `  |  mean ${show(mean)} vs profile ${show(t.profileColor)}`
        + ` (off by ${off.map(v => (v >= 0 ? '+' : '') + v.toFixed(0)).join('/')})`);
    if (worst > 12) {
        throw new Error(`the tile's mean colour is ${worst.toFixed(0)}/255 off the profile's `
            + '`color` (D14).');
    }
}

/* ---- the cap (plan-cliffs.md D5) ----------------------------------------- */

/**
 * ⭐ A `fade` end: the wall STEPS DOWN to the ground, one course per step, the
 * way a garden wall follows a slope. The cliff caps squash the whole face toward
 * the foot, which on masonry closes the courses up into a point (PO: *the pointy
 * end doesn't look convincing for walls*). Here nothing is squashed: every course
 * stays where the running wall has it, and each step simply drops the top course
 * and lays the coping again one course lower.
 *
 * ⚑ `courses + 1` equal steps across the cap: the first keeps the full height
 * (so its left column IS the tile's column 0, assertCapMeetsTile), the last is
 * empty (assertCapTipIsClear). The baked shadow below the foot shrinks with the
 * height. A mortar joint closes each step's coping.
 */
const CAP_W = 360;
const CAP_FILE = 'retaining-wall-cap-placeholder.png';

function capPixel(t, x, y) {
    const n = t.face.courses;
    const stepW = CAP_W / (n + 1);
    const step = Math.min(n, Math.floor(x / stepW));
    if (step === 0) { return pixel(t, x, y); }
    if (step === n) { return [0, 0, 0, 0]; }
    const v = (y - TILE_H / 2) / U;
    const courseH = (t.face.to - t.face.at) / t.face.courses;
    const drop = step * courseH;
    const top = t.face.at + drop;
    if (v >= t.face.to) {
        const p = pixel(t, x, y);
        return [p[0], p[1], p[2], Math.round(p[3] * (n - step) / n)];
    }
    if (v < top) {
        // the coping (and the clear sky above it), laid again one step lower
        const atCoping = v >= t.coping.at + drop && v < t.coping.to + drop;
        if (!atCoping) { return pixel(t, x, y - drop * U); }
        if (x - step * stepW < t.face.joint) { return [...t.mortar, 255]; }
        // one whole coping slab per step: the running coping's joints would
        // leave slivers where a step cuts a slab
        const slab = TILE_W / t.coping.blocks;
        return pixel(t, (step + 0.5) * slab, y - drop * U);
    }
    // the courses stay put; only the overhang shade moves down with the coping
    const p = pixel(t, x, y);
    if (v < t.overhang.to + drop) {
        const k = t.overhang.alpha * (1 - ramp(v - drop, t.face.at, t.overhang.to));
        return [...mix(p, t.overhang.colour, k).map(Math.round), p[3]];
    }
    return p;
}

function assertCapMeetsTile(t) {
    for (let y = 0; y < TILE_H; y++) {
        const a = capPixel(t, 0, y);
        const b = pixel(t, 0, y);
        for (let c = 0; c < 4; c++) {
            if (a[c] !== b[c]) {
                throw new Error(`the cap's left column differs from the tile's at row ${y}; `
                    + 'the renderer meets them there, so the join would show.');
            }
        }
    }
    console.log('  cap: its left column is the tile\'s column 0, to the byte');
}

function assertCapTipIsClear(t) {
    let worst = 0;
    for (let y = 0; y < TILE_H; y++) { worst = Math.max(worst, capPixel(t, CAP_W - 1, y)[3]); }
    if (worst > 2) {
        throw new Error(`the cap's last column still has alpha ${worst}/255; the tip must be clear.`);
    }
    console.log(`  cap: ${CAP_W}x${TILE_H}, tip alpha <= ${worst}/255`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */

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

export function writeRGBA(w, h, at, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc(h * (1 + w * 4));
    let o = 0;
    for (let y = 0; y < h; y++) {
        raw[o++] = 1;
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

export {TILE, TILE_W, TILE_H, CLIFF_H, U, pixel};

/* ---- go ------------------------------------------------------------------ */

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('make-retaining-wall-tile.mjs')) {
    console.log('retaining wall');
    assertRegistered(TILE);
    assertSeamless(TILE);
    assertMatchesProfile(TILE);
    writeRGBA(TILE_W, TILE_H, (x, y) => pixel(TILE, x, y), join(GROUND, TILE.file));
    assertCapMeetsTile(TILE);
    assertCapTipIsClear(TILE);
    writeRGBA(CAP_W, TILE_H, (x, y) => capPixel(TILE, x, y), join(GROUND, CAP_FILE));
}
