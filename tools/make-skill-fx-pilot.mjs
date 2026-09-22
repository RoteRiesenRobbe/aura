/**
 * Generates the three PILOT BODIES for the skill-VFX sprite path
 * (plan-skill-vfx.md §12f.4 B, C3a).
 *
 *     sword · arrow · wolf-jaw
 *
 * ⭐ Checked in as a script, not just images, exactly as `make-fog-tile.mjs`
 * and `make-water-tile.mjs` are and for the same reason: a placeholder's whole
 * job is to be re-tuned. Change a constant, re-run, look at it again. The
 * committed PNGs are exactly what this produces - deterministic, no RNG
 * anywhere.
 *
 * ⭐ THESE ARE ENGINEERING PLACEHOLDERS, and the artist overwrites them under
 * the same file names with no code change (PO 2026-09-21). They exist so the
 * whole path - folder, manifest, validator, webpack, Pixi - is seen working
 * in-game before any real art exists.
 *
 * ⭐ PLAIN BUT IN COLOUR, which is the point. A body is drawn in full colour
 * and shown AS DRAWN (§12f.2): a layer with a resolved body takes NO palette
 * tint. Wood and steel rather than the damage-type red is what tells the
 * sprite path from the Graphics placeholder at a glance in a screenshot.
 *
 * ⚑ The three cover the three anchor rules of the asset spec's table, which is
 * why these three and not three prettier ones:
 *   sword     `strike`, grip at the LEFT EDGE, scaled uniformly to the reach
 *   arrow     `projectile`, centred, rotated to the travel direction
 *   wolf-jaw  `strike` bite, the UPPER jaw, HINGE at the bottom-left corner,
 *             snout pointing right, the bite line at the BOTTOM edge (§12g.2)
 *
 * ⚑ Every canvas size below is [PLACEHOLDER] and is exactly what the PO look
 * is for - the asset spec's size column copies whatever survives it. They are
 * picked so the longest side is the one that carries the reach (a sword and an
 * arrow are scaled by LENGTH) and so a jaw at its drawn size already reads on
 * a mob-sized victim.
 *
 * ⚑ RGBA with a transparent background, unlike the ground tiles: a body is a
 * cut-out drawn over the world, so everything outside the shape must be alpha
 * 0 rather than a background colour.
 *
 * Usage: node tools/make-skill-fx-pilot.mjs
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const BODIES = join(dirname(fileURLToPath(import.meta.url)),
    '../frontend/src/features/skill-fx/assets/bodies');

/**
 * Supersampling factor per axis. 4 means 16 samples a pixel, which is plenty
 * for shapes this size and costs nothing on three tiny canvases - the edges
 * are straight lines and shallow tapers, not hair.
 */
const SS = 4;

/* ---- the palette --------------------------------------------------------- */
// ⚑ All [PLACEHOLDER]. Deliberately muted: a placeholder that shouts reads as
// a finished asset, and these are meant to be replaced.

const STEEL = [0xae, 0xb7, 0xc0];
const STEEL_LIT = [0xe2, 0xe8, 0xee];       // the light catching the edge
const STEEL_DARK = [0x7c, 0x87, 0x92];      // the fuller, and the shadow side
const WOOD = [0x8b, 0x5a, 0x2b];
const WOOD_DARK = [0x5f, 0x3c, 0x1c];
const LEATHER = [0x4a, 0x33, 0x22];
const LEATHER_LIT = [0x6b, 0x4c, 0x33];
const BRASS = [0xb0, 0x8d, 0x34];
const BRASS_LIT = [0xd8, 0xb8, 0x5c];
const FEATHER = [0xb0, 0x47, 0x3f];
const FEATHER_DARK = [0x86, 0x33, 0x2d];
const IVORY = [0xef, 0xe7, 0xd2];
const IVORY_SHADE = [0xd2, 0xc5, 0xa6];
const GUM = [0x6e, 0x2f, 0x36];
const GUM_LIT = [0x8f, 0x3f, 0x48];

/* ---- the bodies ---------------------------------------------------------- */
//
// Each body is a WIDTH, a HEIGHT and a list of LAYERS painted back to front.
// A layer is a colour plus an `in(x, y)` predicate over continuous coordinates
// (pixel centres are at x + 0.5), so the sampler can antialias every edge
// - including the internal ones between layers - without any shape knowing it.

/** Distance-to-a-rectangle test, the workhorse: half-open on all four sides. */
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;

/** A triangle pointing along +X: base halfwidth hw at x0, a point at x1. */
const spike = (x0, x1, cy, hw) => (x, y) =>
    x >= x0 && x <= x1 && Math.abs(y - cy) <= hw * (1 - (x - x0) / (x1 - x0));

/** A triangle pointing along +Y, which is how a tooth hangs. */
const tooth = (cx, hw, y0, y1) => (x, y) =>
    y >= y0 && y <= y1 && Math.abs(x - cx) <= hw * (1 - (y - y0) / (y1 - y0));

const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

/**
 * The sword. Points right, GRIP AT THE LEFT EDGE, vertically centred - the
 * `strike` rule, because the renderer holds the body by its left edge in the
 * caster's hand and scales its LENGTH to the skill's reach.
 */
const SWORD_W = 128, SWORD_H = 32, SWORD_CY = 16;

/** Blade halfwidth: parallel most of the way, then a point. Fixes the taper. */
function bladeHalf(x) {
    if (x < 34 || x > 126) return -1;
    return x <= 100 ? 6 : 6 * (1 - (x - 100) / 26);
}
const inBlade = (x, y) => Math.abs(y - SWORD_CY) <= bladeHalf(x);

/**
 * The arrow. Points right, centred - the `projectile` rule: the renderer
 * rotates the whole sprite to the travel direction about its middle, so
 * anything off-centre wobbles.
 */
const ARROW_W = 96, ARROW_H = 24, ARROW_CY = 12;

/** One feather, as a long shallow lens: fast rise at the nock, slow fall. */
function fletchHeight(x) {
    const t = (x - 8) / 22;
    if (t < 0 || t > 1) return 0;
    return 7 * (t < 0.3 ? t / 0.3 : (1 - t) / 0.7);
}

/**
 * The wolf jaw. ONE upper jaw, HINGED AT THE BOTTOM-LEFT CORNER, the snout
 * pointing right and tapering, teeth pointing DOWN with every tip on the
 * BOTTOM EDGE - the `strike` `bite` rule (§12g.2): the renderer anchors the
 * sprite at (0, 1), draws it twice with the second copy's y scale negated, and
 * rotates the pair about that corner from open to shut over the victim, so the
 * bottom edge is what meets and the left edge is what never moves.
 */
const JAW_W = 128, JAW_H = 48;

/** The muzzle line: the jaw's top edge, high at the hinge, low at the snout. */
const muzzleTop = (x) => 6 + 26 * (x / JAW_W) ** 1.6;

/**
 * Where the gum ends and the teeth start, measured up from the bite line:
 * deep at the hinge, shallow at the snout.
 */
const gumBottom = (x) => JAW_H - 14 + 8 * (x / JAW_W);

/** The snout's rounded end: the jaw stops short of the right edge. */
const SNOUT_X = 124;
/** The jaw's root: the first few px reach the bite line, so the hinge corner is flesh. */
const ROOT_X = 8;
const inMuzzle = (x, y) => x >= 0 && x < SNOUT_X && y >= muzzleTop(x)
    && (y <= gumBottom(x) || (x < ROOT_X && y <= JAW_H))
    && !(x > SNOUT_X - 8 && y < muzzleTop(x) + 4 * (1 - (SNOUT_X - x) / 8));

/**
 * Seven teeth along the jaw, by tip depth. The two long fangs sit second from
 * each end - the canines - and are the only teeth that reach the bite line
 * with their full width; the rest stop a hair short, so the row reads as a
 * row. Sized to the gum they hang from, which is deeper at the hinge.
 */
const TEETH = [
    {cx: 12, hw: 4.0, tip: 46.0},
    {cx: 30, hw: 5.5, tip: 47.9},   // canine
    {cx: 48, hw: 4.0, tip: 45.0},
    {cx: 66, hw: 3.8, tip: 44.5},
    {cx: 84, hw: 3.6, tip: 44.0},
    {cx: 102, hw: 4.6, tip: 47.9},  // canine
    {cx: 116, hw: 3.0, tip: 45.0},
];

const BODIES_SPEC = [
    {
        file: 'sword.png',
        anchor: 'left',
        w: SWORD_W,
        h: SWORD_H,
        layers: [
            {color: BRASS, in: disc(4.5, SWORD_CY, 4.5)},
            {color: BRASS_LIT, in: disc(3.5, SWORD_CY - 1.2, 2.0)},
            {color: LEATHER, in: rect(4, SWORD_CY - 3.4, 29, SWORD_CY + 3.4)},
            // The wrap. One layer, four bands, so the grip is not a flat bar.
            {
                color: LEATHER_LIT,
                in: (x, y) => x >= 7 && x < 27 && Math.abs(y - SWORD_CY) <= 3.4
                    && ((x - 7) % 5) < 1.7,
            },
            {color: BRASS, in: rect(28, SWORD_CY - 12, 34, SWORD_CY + 12)},
            {color: BRASS_LIT, in: rect(28, SWORD_CY - 12, 30, SWORD_CY + 12)},
            {color: STEEL, in: inBlade},
            // The fuller: the groove down the middle of a real blade, and the
            // one mark that keeps the sword from reading as a grey stick.
            {
                color: STEEL_DARK,
                in: (x, y) => inBlade(x, y) && Math.abs(y - SWORD_CY) <= 1.5 && x < 118,
            },
            // The light along the top edge. Painted last, so it sits over both.
            {
                color: STEEL_LIT,
                in: (x, y) => inBlade(x, y) && y - (SWORD_CY - bladeHalf(x)) < 1.6,
            },
        ],
    },
    {
        file: 'arrow.png',
        anchor: 'centred',
        w: ARROW_W,
        h: ARROW_H,
        layers: [
            {color: WOOD_DARK, in: rect(2, ARROW_CY - 2.4, 8, ARROW_CY + 2.4)},
            // The nock itself: a slit cut back into the dark end.
            {color: WOOD, in: rect(8, ARROW_CY - 1.7, 82, ARROW_CY + 1.7)},
            {
                color: FEATHER,
                in: (x, y) => {
                    const h = fletchHeight(x);
                    return h > 0 && Math.abs(y - ARROW_CY) >= 1.6
                        && Math.abs(y - ARROW_CY) <= 1.6 + h;
                },
            },
            // The outer edge of each vane, darker, so the fletching reads as
            // two feathers rather than as one red blob.
            {
                color: FEATHER_DARK,
                in: (x, y) => {
                    const h = fletchHeight(x);
                    const d = Math.abs(y - ARROW_CY);
                    return h > 1.2 && d >= 0.6 + h && d <= 1.6 + h;
                },
            },
            {color: STEEL, in: spike(76, 93, ARROW_CY, 5.2)},
            {
                color: STEEL_LIT,
                in: (x, y) => spike(76, 93, ARROW_CY, 5.2)(x, y) && y < ARROW_CY - 1.4,
            },
        ],
    },
    {
        file: 'wolf-jaw.png',
        anchor: 'hinge',
        w: JAW_W,
        h: JAW_H,
        layers: [
            {color: GUM, in: inMuzzle},
            // The light along the muzzle's top edge, so the taper reads.
            {
                color: GUM_LIT,
                in: (x, y) => inMuzzle(x, y) && y - muzzleTop(x) < 3,
            },
            // The lit ridge along the gum line, where the teeth come out.
            {
                color: GUM_LIT,
                in: (x, y) => inMuzzle(x, y) && y > gumBottom(x) - 3,
            },
            {
                color: IVORY,
                in: (x, y) => TEETH.some((t) =>
                    tooth(t.cx, t.hw, gumBottom(t.cx) - 2, t.tip)(x, y)),
            },
            // Shade the near half of each tooth so a row of them reads as a
            // row rather than as one pale band.
            {
                color: IVORY_SHADE,
                in: (x, y) => TEETH.some((t) =>
                    tooth(t.cx, t.hw, gumBottom(t.cx) - 2, t.tip)(x, y)
                    && x > t.cx + t.hw * 0.25),
            },
        ],
    },
];

/* ---- the sampler --------------------------------------------------------- */

/**
 * One pixel, antialiased: SS x SS subsamples, each resolved to the TOPMOST
 * layer covering it. Alpha is the coverage, colour is the mean of the covered
 * samples only - so an edge fades out without dragging the background towards
 * black, which is what a straight-alpha PNG needs.
 */
function pixel(body, px, py) {
    let r = 0, g = 0, b = 0, hits = 0;
    for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
            const x = px + (sx + 0.5) / SS;
            const y = py + (sy + 0.5) / SS;
            let color = null;
            for (const layer of body.layers) {
                if (layer.in(x, y)) color = layer.color;
            }
            if (color === null) continue;
            r += color[0]; g += color[1]; b += color[2]; hits++;
        }
    }
    if (hits === 0) return [0, 0, 0, 0];
    const n = SS * SS;
    return [
        Math.round(r / hits),
        Math.round(g / hits),
        Math.round(b / hits),
        Math.round((255 * hits) / n),
    ];
}

/** Reports coverage, so a re-tune can be judged by more than eye. */
function reportCoverage(body) {
    let painted = 0, opaque = 0;
    for (let y = 0; y < body.h; y++) {
        for (let x = 0; x < body.w; x++) {
            const a = pixel(body, x, y)[3];
            if (a > 0) painted++;
            if (a === 255) opaque++;
        }
    }
    const total = body.w * body.h;
    console.log(`  ${body.w}x${body.h}  painted ${(100 * painted / total).toFixed(1)}%`
        + `  fully opaque ${(100 * opaque / total).toFixed(1)}%`);
}

/**
 * Proves the anchor rule the kind depends on, rather than trusting the numbers
 * above: a sword whose grip has drifted off the left edge is held in mid-air,
 * a jaw whose teeth stop short of the bottom edge never closes on anything,
 * and an arrow drawn off-centre wobbles as the renderer rotates it. All three
 * are invisible in a coverage percentage and obvious here.
 */
function assertAnchor(body) {
    const hit = (x, y) => pixel(body, x, y)[3] > 0;
    if (body.anchor === 'left') {
        for (let y = 0; y < body.h; y++) {
            if (hit(0, y)) { console.log('  anchor: the left edge carries paint'); return; }
        }
        throw new Error(`${body.file}: nothing is drawn on the LEFT edge, which is `
            + 'where this kind holds the body (see the asset spec table)');
    }
    if (body.anchor === 'hinge') {
        // A bite: the bottom edge is the bite line and the bottom-left corner
        // is the hinge, so BOTH must carry paint - a jaw that stops short of
        // the bite line never closes, and one that starts right of the hinge
        // swings about empty air.
        let bite = false;
        for (let x = 0; x < body.w; x++) if (hit(x, body.h - 1)) bite = true;
        if (!bite) {
            throw new Error(`${body.file}: nothing is drawn on the BOTTOM edge, which is `
                + 'the bite line this kind closes on (see the asset spec table)');
        }
        if (!hit(0, body.h - 1) && !hit(0, body.h - 2)) {
            throw new Error(`${body.file}: the bottom-left corner is empty, and that corner `
                + 'is the hinge this kind rotates about (see the asset spec table)');
        }
        console.log('  anchor: the bite line and the hinge corner both carry paint');
        return;
    }
    // centred: the painted rows must straddle the middle of the canvas, which
    // is the point the renderer rotates about.
    let top = body.h, bottom = -1;
    for (let y = 0; y < body.h; y++) {
        for (let x = 0; x < body.w; x++) {
            if (!hit(x, y)) continue;
            top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
    }
    const off = Math.abs((top + bottom + 1) / 2 - body.h / 2);
    if (bottom < 0 || off > 1) {
        throw new Error(`${body.file}: the drawing sits ${off.toFixed(1)} px off the `
            + 'vertical centre, and this kind is rotated about the canvas middle');
    }
    console.log(`  anchor: centred, rows ${top}-${bottom}, off by ${off.toFixed(1)} px`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled rather than pulled from npm, verbatim the argument
// make-fog-tile.mjs makes: this script runs once in a blue moon, and a
// build-time dependency for a placeholder is not a trade worth making. Every
// generator in tools/ carries its own copy for the same reason - they are
// standalone by design, and a shared module would be one more thing to have
// checked out before a placeholder can be re-tuned.

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

function writePng(body, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(body.w, 0);
    ihdr.writeUInt32BE(body.h, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type 6 = truecolour RGB + ALPHA
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    // Scanlines, each prefixed with its filter byte. Filter 1 (Sub) predicts
    // each pixel from its left neighbour - near-zero residuals across the flat
    // interior of a shape.
    const raw = Buffer.alloc(body.h * (1 + body.w * 4));
    let o = 0;
    for (let y = 0; y < body.h; y++) {
        raw[o++] = 1;
        let prev = [0, 0, 0, 0];
        for (let x = 0; x < body.w; x++) {
            const rgba = pixel(body, x, y);
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
    console.log(`  wrote ${out} (${png.length} bytes)`);
}

/* ---- go ------------------------------------------------------------------ */

mkdirSync(BODIES, {recursive: true});
for (const body of BODIES_SPEC) {
    console.log(body.file.replace('.png', ''));
    reportCoverage(body);
    assertAnchor(body);
    writePng(body, join(BODIES, body.file));
}
console.log('\nnow run: node tools/make-skill-fx-manifest.mjs');
