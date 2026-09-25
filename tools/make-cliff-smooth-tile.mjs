#!/usr/bin/env node
/**
 * cliff-smooth-placeholder.png — the tile a `Cliff Smooth` path wears.
 *
 * Run: `node tools/make-cliff-smooth-tile.mjs`
 * Deterministic, no RNG, safe to re-run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SEVENTH FAMILY, and the first one whose brief comes from the RENDERER
 * rather than from the subject.
 *
 * `make-cliff-tile.mjs` draws the same cliff as a facet mosaic and is the
 * sibling to read first — everything it says about registration, about the
 * top-down cheat and about which side the face falls on applies here verbatim.
 * What differs is how much detail the face carries, and the reason is this:
 *
 * ⛔ A RIBBON MESH STRETCHES ITS TEXTURE AT EVERY BEND. `u` is measured on the
 * centreline, so the outer rim of a corner covers more ground per unit of
 * texture than the inner rim. That is correct — it is what a real stratum does,
 * and it is the whole reason one path can now cross any number of corners
 * instead of being authored one leg at a time. ⭐ But the distortion is only
 * VISIBLE IF THERE IS DETAIL FINE ENOUGH TO SEE WARP. A mosaic of hard-edged
 * facets warps legibly: the cells smear on the outside of a bend and crowd on
 * the inside, and the eye reads it as the rock being made of rubber.
 *
 * ⚑ PO, first look at the facet cut: *"the cliffside is perhaps too textured to
 * work well with the ribbon path, because it gets warped."*
 *
 * ⭐ THE ANSWER IS NOT TO FIGHT THE STRETCH BUT TO GIVE IT NOTHING TO ACT ON.
 * A face that is near-uniform cannot warp, because there is no feature in it
 * whose shape could be wrong. Everything here is therefore LOW FREQUENCY: the
 * value drifts across the run in waves several units long, which survives any
 * amount of stretching because a stretched wave is still a wave.
 *
 * ⚑ It is NOT flat. A dead-flat band reads as plastic, and the road tile
 * already recorded why: *a ground tile is looked THROUGH, not at*. What it has
 * is mottle you cannot resolve as detail but would miss if it went.
 *
 * ⭐ SECOND BRIEF, from the same look: *"a little too jagged, probably a
 * smoother outline on both ends"*. Both rims are gentler here — one octave
 * fewer on the lip, a third of the amplitude, a longer wavelength, and a foot
 * that DISSOLVES rather than crumbling into talus blobs.
 *
 * ⚑ IDENTICAL GEOMETRY CONTRACT to its sibling: 720×320, the drop in the middle
 * 180 rows, `width` 1.5, `alignTexture` required. The two are interchangeable
 * by swapping one profile name on one path, which is what makes them a real
 * comparison rather than two separate opinions.
 *
 * ⚑ The PNG writer and the checks are duplicated from the sibling rather than
 * shared — the house rule for this family, so each script is readable and
 * runnable on its own.
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const TILE_W = 720;     // 6.0 u at scale 1
const TILE_H = 320;
/**
 * 1.5 u — the recommended path `width` (PO: *"make it more steep so it maps to
 * 1.5 width"*).
 *
 * ⭐ THE TWO HALVES OF THAT ASK ARE ONE CHANGE, which is worth stating because
 * it is not obvious: under a top-down camera a face's drawn width IS its
 * steepness. A vertical wall projects to nothing and a gentle slope projects
 * wide, so narrowing the band from 2.0 to 1.5 does not merely make the cliff
 * smaller — it makes it STEEPER, and there is no separate knob for the angle
 * because the angle is not represented anywhere else.
 *
 * ⚑ What the narrowing alone does NOT buy is the LIGHT. A steeper face catches
 * less sky, so the band is also darkened against an unchanged lip; that
 * contrast is the second half of reading as a drop rather than a ramp.
 */
const CLIFF_H = 180;
const PX_PER_UNIT = 120;
const HERE = dirname(fileURLToPath(import.meta.url));
const GROUND = join(HERE, '../frontend/src/features/regions/assets/ground');
const PROFILES = join(HERE, '../frontend/src/client-data/terrain-profiles.json');

const PROFILE = (() => {
    const table = JSON.parse(readFileSync(PROFILES, 'utf8'));
    const p = table['Cliff Smooth'];
    if (!p) {
        throw new Error('terrain-profiles.json has no `Cliff Smooth` profile — add it first; '
            + 'this script reads its `scale` and checks the tile against its `color`.');
    }
    return p;
})();
const U = PX_PER_UNIT / PROFILE.scale;
const SPAN_UNITS = TILE_W / U;

const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

const TILE = {
    file: 'cliff-smooth-placeholder.png',
    profileColor: hex(PROFILE.color),

    crest: {
        at: -0.69,
        to: -0.56,
        soil: hex('#7d7059'),
        // A twelfth of the facet tile's raggedness: the grass still comes over
        // the edge, but it is a soft margin rather than a torn one.
        ragged: 0.010,
    },
    // ⚑ Gentler than the sibling in all four of its knobs at once — that is what
    // "smoother outline" asks for, and each alone is not enough.
    lip: {
        at: -0.56,
        to: -0.525,
        stone: hex('#c4b9a2'),
        jitter: 0.028,              // a third of the facet tile's, rescaled
        bays: 2,                    // LONG wavelength: undulation, not jag
        vary: 0.22,                 // mostly continuous
    },
    shade: {
        to: -0.48,
        colour: hex('#2b2721'),
        alpha: 0.82,
    },
    // ⭐ The face, and the whole experiment: ONE colour, a slow vertical fall
    // toward the foot, and mottle too coarse to resolve. No cells, no joints,
    // no strata — nothing with an edge that a bend could bend.
    face: {
        at: -0.48,
        to: 0.40,
        stone: hex('#736a5e'),
        footAt: 0.54,               // where the fall to the foot begins
        footDark: hex('#2a2721'),
        // Amplitude of the drift, as a fraction of the stone's own value. Small
        // enough that no single blotch is findable, large enough that the band
        // is not a painted rectangle.
        mottle: 0.19,
        // In TILES along the run. Below ~1 the mottle starts to read as detail
        // and the warping comes back with it — this is the knob that decides
        // whether the experiment works.
        mottleBays: 1.5,
    },
    /**
     * ⭐ THE MIDDLE GROUND (PO ask, after seeing facet-vs-smooth side by side).
     * The first smooth cut was clean but bland — an embankment rather than a
     * rock face. This puts relief back WITHOUT putting warping back, and the
     * distinction it turns on is the useful one:
     *
     * ⛔ IT IS NOT DETAIL THAT WARPS VISIBLY, IT IS HARD EDGES. A stretched
     * facet betrays itself because its boundary is a line you can see move. A
     * broad soft column has no boundary to move — stretching it just makes it a
     * slightly broader soft column, which is indistinguishable from a different
     * soft column. So relief here is always WIDE and always COSINE-falloff to
     * nothing: no line anywhere in it, at any amplitude.
     *
     * ⚑ Some columns are lighter and some darker, so the face reads as rock
     * standing in and out of shade rather than as a lit surface with stains on
     * it. `assertUniform` still governs: it measures local contrast, which a
     * soft column barely moves and a hard one blows straight through.
     */
    relief: {
        count: 9,
        width: 0.55,                // world units, before the per-column spread
        tone: 0.13,                 // lightness swing, both directions
    },
    // ⭐ A DISSOLVE, not a crumble. The sibling scatters talus blobs, which are
    // exactly the kind of small hard shape that warps around a corner. Here the
    // foot simply stops being opaque, over a long soft margin.
    foot: {
        at: 0.40,
        to: 0.59,
        wobble: 0.044,
        bays: 2,
    },
    shadow: {
        at: 0.45,
        to: 0.69,                   // mirrors crest.at — this is what centres it
        colour: hex('#15140f'),
        alpha: 0.42,
    },
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

/** Wrapping value noise. Integer `bays` is what keeps the horizontal seam. */
function wobble(x, bays, seed) {
    const n = Math.max(1, Math.round(bays));
    const period = TILE_W / n;
    const i = Math.floor(x / period);
    const f = x / period - i;
    const a = hash(((i % n) + n) % n, seed);
    const b = hash((((i + 1) % n) + n) % n, seed);
    return a + (b - a) * (f * f * (3 - 2 * f));
}

/**
 * ⚑ TWO octaves, where the facet tile uses three. The third exists there to put
 * centimetre-scale crumble on the edge; here that is precisely the detail the
 * brief asks to remove, and dropping it is most of what "smoother" means.
 */
function softWobble(x, bays, seed) {
    return 0.72 * wobble(x, bays, seed) + 0.28 * wobble(x, bays * 2, seed + 101);
}

function pixel(t, x, y) {
    const u = (y - TILE_H / 2) / U;
    const px = ((x % TILE_W) + TILE_W) % TILE_W;

    const lipShift = (softWobble(px, t.lip.bays, 5) - 0.5) * 2 * t.lip.jitter;
    const v = u - lipShift;

    const open = 1 - t.lip.vary * softWobble(px, t.lip.bays, 61);
    const lipTop = t.lip.at;
    const lipBot = lipTop + (t.lip.to - t.lip.at) * open;
    const shadeBot = t.shade.to;

    let rgb = null;
    let alpha = 0;

    if (v < lipTop) {
        const edge = t.crest.at
            + t.crest.ragged * (softWobble(px, t.lip.bays * 3, 137) - 0.5) * 2;
        rgb = t.crest.soil;
        alpha = ramp(v, edge, lipTop);
    } else if (v < lipBot) {
        rgb = t.lip.stone;
        alpha = 1;
    } else if (v < shadeBot) {
        rgb = mix(t.face.stone, t.shade.colour,
            t.shade.alpha * (1 - ramp(v, lipBot, shadeBot)));
        alpha = 1;
    } else if (v < t.foot.to) {
        const down = Math.min(1, Math.max(0, (v - shadeBot) / (t.face.to - shadeBot)));

        // ⭐ The mottle: one slow wave along the run crossed with one slow wave
        // down the face. Both wavelengths are longer than a bend's worth of
        // stretch, so a corner moves the pattern without deforming anything the
        // eye can name.
        const along = softWobble(px, t.face.mottleBays, 71) - 0.5;
        const across = Math.sin((down + 0.35) * Math.PI * 1.3) - 0.5;
        const swing = (along * 0.7 + across * 0.3) * 2 * t.face.mottle;
        rgb = t.face.stone.map(c => c * (1 + swing));

        // ⭐ Soft relief columns. Every one falls to nothing on a cosine, so
        // there is no edge in the face at any amplitude — see the `relief` note
        // for why that, and not the amount of detail, is what decides whether a
        // bend shows. They fade out toward the foot, where the dark takes over.
        const lit = 1 - ramp(down, t.face.footAt, 1.0);
        for (let i = 0; i < t.relief.count; i++) {
            const cx = (i + 0.5) * TILE_W / t.relief.count
                + (hash(i, 17) - 0.5) * TILE_W / t.relief.count * 0.7;
            const wide = t.relief.width * U * (0.55 + hash(i, 23));
            // ⚑ Wrapped distance, or the columns nearest x = 0 would be cut in
            // half and the vertical seam would stop being exact.
            let dx = px - cx;
            dx = ((dx % TILE_W) + TILE_W) % TILE_W;
            if (dx > TILE_W / 2) { dx -= TILE_W; }
            const reach = Math.min(1, Math.abs(dx) / wide);
            const on = 0.5 + 0.5 * Math.cos(Math.PI * reach);
            if (on > 0) {
                const tone = (hash(i, 29) - 0.5) * 2 * t.relief.tone;
                rgb = rgb.map(c => c * (1 + tone * on * lit));
            }
        }

        rgb = mix(rgb, t.face.footDark, ramp(down, t.face.footAt, 1.08));

        // ⭐ The dissolve. A long soft alpha margin with one gentle wave in it —
        // no blobs, because a blob is a small hard shape and small hard shapes
        // are what this whole tile exists to avoid.
        alpha = 1;
        if (v > t.foot.at) {
            const edge = t.foot.at + (t.foot.to - t.foot.at)
                * (0.45 + 0.55 * softWobble(px, t.foot.bays, 23));
            alpha = 1 - ramp(v, edge - t.foot.wobble, edge + t.foot.wobble);
        }
    }

    if (v > t.shadow.at && v < t.shadow.to) {
        const sh = t.shadow.alpha * (1 - ramp(v, t.shadow.at, t.shadow.to));
        if (rgb === null || alpha < 1) {
            const under = sh * (1 - alpha);
            if (rgb === null) { rgb = t.shadow.colour; alpha = under; }
            else {
                rgb = [0, 1, 2].map(c => (rgb[c] * alpha + t.shadow.colour[c] * under)
                    / Math.max(1e-6, alpha + under));
                alpha += under;
            }
        }
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
        throw new Error(`the cliff is ${reach * 2} px tall but the authored width shows only `
            + `${CLIFF_H}.`);
    }
    if (skew > 6) { throw new Error(`the drawn band is ${skew} px off-centre.`); }
    if (top === 0 || bottom === TILE_H - 1) {
        throw new Error('ink touches a wrap row, so the tile will seam across the ribbon.');
    }

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
    const lipMid = TILE_H / 2 + (t.lip.at + t.lip.to) / 2 * U;
    console.log(`  brightest row ${bestY} (lip sits at ~${Math.round(lipMid)})`);
    if (Math.abs(bestY - lipMid) > 0.12 * U) {
        throw new Error(`the brightest row is ${bestY}, not the lip at ~${Math.round(lipMid)}.`);
    }
}

/**
 * ⭐ THE CHECK THIS FAMILY MEMBER ADDS, and it is the experiment stated as a
 * number. "Uniform enough not to warp" is otherwise a matter of opinion, and an
 * opinion cannot fail a build.
 *
 * It measures the face's local CONTRAST — the mean absolute difference between
 * neighbouring pixels a few apart, which is what a stretch distorts. The facet
 * sibling scores several times this. If a re-tune pushes this tile back over
 * the ceiling, it has stopped being the smooth one and the comparison it exists
 * for is gone.
 */
function assertUniform(t) {
    const y0 = Math.round(TILE_H / 2 + t.face.at * U) + 6;
    const y1 = Math.round(TILE_H / 2 + t.face.to * U) - 6;
    let sum = 0, n = 0;
    for (let y = y0; y < y1; y++) {
        for (let x = 0; x < TILE_W; x += 3) {
            const a = pixel(t, x, y);
            const b = pixel(t, (x + 3) % TILE_W, y);
            if (a[3] > 200 && b[3] > 200) {
                sum += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
                n += 3;
            }
        }
    }
    const contrast = sum / Math.max(1, n);
    console.log(`  face local contrast ${contrast.toFixed(2)}/255 per 3 px`);
    if (contrast > 1.2) {
        throw new Error(`the face carries ${contrast.toFixed(2)}/255 of local contrast, which is `
            + 'detail fine enough to visibly WARP around a bend — the one thing this tile exists '
            + 'not to do. Lower `face.mottle`, or raise `face.mottleBays` to lengthen its wave.');
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

function reportScale() {
    console.log(`  tile ${TILE_W}x${TILE_H} spans ${SPAN_UNITS.toFixed(2)} u at scale `
        + `${PROFILE.scale}.\n  ⚑ Author the path along the MID-FACE at width `
        + `${(CLIFF_H / U).toFixed(2)}, alignTexture true — same contract as \`Cliff\`.`);
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

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('make-cliff-smooth-tile.mjs')) {
    console.log('cliff (smooth)');
    reportScale();
    assertRegistered(TILE);
    assertUniform(TILE);
    assertSeamless(TILE);
    assertMatchesProfile(TILE);
    writeRGBA(TILE_W, TILE_H, (x, y) => pixel(TILE, x, y), join(GROUND, TILE.file));
}
