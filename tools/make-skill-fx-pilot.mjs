/**
 * Generates the four PILOT BODIES for the skill-VFX sprite path
 * (plan-skill-vfx.md §12f.4 B, C3a; the fourth from §12h.5 item 3, C3a-ii).
 *
 *     sword · arrow · wolf-jaw · spider-fang
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
 * ⚑ Each covers one anchor rule of the asset spec's table, which is why these
 * four and not four prettier ones:
 *   sword        `strike`, grip at the LEFT EDGE, scaled uniformly to the reach
 *   arrow        `projectile`, centred, rotated to the travel direction
 *   wolf-jaw     `maul` bite (plan-natural-weapons.md D11, PO 2026-09-28): the
 *                UPPER ROW of teeth seen from the FRONT, teeth pointing down,
 *                anchor BOTTOM-CENTRE on the bite line; the engine mirrors it
 *                for the lower row and closes the two onto the victim's centre
 *   spider-fang  `maul` pincer, the Giant Spider's: ONE fang, HINGE at the
 *                bottom-left corner, the point at the right, the bite line at
 *                the BOTTOM edge; the engine mirrors it for the other side.
 *                WHITE on purpose (the PO asked for "two big white fangs"),
 *                so it is the one pilot a per-skill `tint` could recolour.
 * (wolf-jaw was a hinged snout in profile for the rim bite until C2; it was
 * regenerated to the front-view contract, and spider-fang was left as it was.)
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
 * for shapes this size and costs nothing on four tiny canvases - the edges
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
 * The wolf's teeth (plan-natural-weapons.md D11). The UPPER ROW seen from the
 * FRONT, teeth pointing DOWN, the two canines' tips ON the BOTTOM EDGE - the
 * `maul` `bite` rule: the renderer anchors the sprite at its BOTTOM-CENTRE
 * (0.5, 1), draws it twice with the second copy's y scale negated (the lower
 * row), and moves the pair together until the bite lines meet on the victim's
 * centre. So the bottom edge is what meets, and the drawing must be symmetric
 * about its vertical middle, or the two rows bite off-centre.
 *
 * ⚑ 128 x 44 [PLACEHOLDER]: wide and low, a row rather than a snout. The
 * width is what the renderer sizes to (1.6 x the victim's radius), so the
 * height is the only proportion the drawing decides.
 */
const JAW_W = 128, JAW_H = 44;
const JAW_MID = JAW_W / 2;

/**
 * Where the teeth leave the gum: lowest in the middle (the incisors) and
 * rising toward the corners, as a jaw curving away from the viewer does.
 */
const toothRoot = (x) => 22 - 8 * ((x - JAW_MID) / JAW_MID) ** 2;
/** The gum's top edge, thinning toward the corners. */
const gumTop = (x) => toothRoot(x) - 14 + 6 * ((x - JAW_MID) / JAW_MID) ** 4;
const inGum = (x, y) => x >= 2 && x < JAW_W - 2 && y >= gumTop(x) && y <= toothRoot(x) + 1;

/**
 * The row, by tip depth and mirrored about the middle: six short incisors in
 * the centre, a long canine either side whose tip is ON the bite line, and a
 * small cheek tooth at each end. Only the canines reach the bottom edge, so
 * when the rows close they are what meets and the row reads as a row.
 */
const HALF_ROW = [
    {dx: 6, hw: 5.5, tip: 36.0},
    {dx: 18, hw: 5.5, tip: 35.5},
    {dx: 30, hw: 5.0, tip: 34.5},
    {dx: 44, hw: 7.0, tip: 43.9},   // canine
    {dx: 57, hw: 4.0, tip: 32.0},
];
const TEETH = HALF_ROW.flatMap((t) => [
    {cx: JAW_MID - t.dx, hw: t.hw, tip: t.tip},
    {cx: JAW_MID + t.dx, hw: t.hw, tip: t.tip},
]);

/**
 * The spider fang, the `maul` `pincer` rule: ONE fang HINGED AT THE
 * BOTTOM-LEFT CORNER, the bite line on the BOTTOM edge, the curved point at
 * the right touching that edge. The engine anchors it at (0, 1) on the
 * victim's rim at screen left, mirrors it for the one at screen right, and
 * swings both about their hinges until the points meet on the centre.
 */
const FANG_W = 96, FANG_H = 40;
/** Where the point sits: a hair short of the right edge, so it antialiases. */
const FANG_TIP_X = 94;
/** The outer (top) edge: high and thick at the hinge, sweeping down to the point. */
const fangTop = (x) => 2 + (FANG_H - 2) * (x / FANG_TIP_X) ** 2.2;
/**
 * The inner (bite) edge: ON the bite line at the hinge and at the point,
 * arched up between them, which is what makes it a hooked fang rather than a
 * wedge.
 */
const fangBottom = (x) => FANG_H
    - 10 * Math.sin(Math.PI * x / FANG_TIP_X) * (1 - x / FANG_TIP_X) ** 0.3;
const inFang = (x, y) => x >= 0 && x <= FANG_TIP_X && y >= fangTop(x) && y <= fangBottom(x);
const FANG_WHITE = [0xff, 0xff, 0xff];

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
        anchor: 'row',
        w: JAW_W,
        h: JAW_H,
        layers: [
            {color: GUM, in: inGum},
            // The lit ridge along the gum line, where the teeth come out.
            {
                color: GUM_LIT,
                in: (x, y) => inGum(x, y) && y > toothRoot(x) - 3,
            },
            {
                color: IVORY,
                in: (x, y) => TEETH.some((t) =>
                    tooth(t.cx, t.hw, toothRoot(t.cx) - 2, t.tip)(x, y)),
            },
            // Shade the outer half of each tooth (away from the middle) so a
            // row of them reads as a row rather than as one pale band, and the
            // shading stays mirror-symmetric like the row.
            {
                color: IVORY_SHADE,
                in: (x, y) => TEETH.some((t) =>
                    tooth(t.cx, t.hw, toothRoot(t.cx) - 2, t.tip)(x, y)
                    && Math.abs(x - JAW_MID) > Math.abs(t.cx - JAW_MID) + t.hw * 0.25),
            },
        ],
    },
    {
        file: 'spider-fang.png',
        anchor: 'hinge',
        w: FANG_W,
        h: FANG_H,
        layers: [
            {color: FANG_WHITE, in: inFang},
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
 * a row of teeth or a fang that stops short of the bottom edge never closes on
 * anything, and an arrow drawn off-centre wobbles as the renderer rotates it.
 * All of them are invisible in a coverage percentage and obvious here.
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
    if (body.anchor === 'row') {
        // A row of teeth: the bottom edge is the bite line, so it must carry
        // paint (a row that stops short of it never meets its mirror), and the
        // painted columns must straddle the middle, the point it is held by -
        // a lopsided row bites off-centre.
        let bite = false;
        for (let x = 0; x < body.w; x++) if (hit(x, body.h - 1)) bite = true;
        if (!bite) {
            throw new Error(`${body.file}: nothing is drawn on the BOTTOM edge, which is `
                + 'the bite line the two rows meet on (see the asset spec table)');
        }
        let left = body.w, right = -1;
        for (let x = 0; x < body.w; x++) {
            for (let y = 0; y < body.h; y++) {
                if (!hit(x, y)) continue;
                left = Math.min(left, x); right = Math.max(right, x);
            }
        }
        const off = Math.abs((left + right + 1) / 2 - body.w / 2);
        if (off > 1) {
            throw new Error(`${body.file}: the row sits ${off.toFixed(1)} px off the `
                + 'horizontal centre, and this kind holds it by its bottom-centre');
        }
        console.log(`  anchor: the bite line carries paint, columns ${left}-${right}, off by ${off.toFixed(1)} px`);
        return;
    }
    if (body.anchor === 'hinge') {
        // A fang: the bottom edge is the bite line and the bottom-left corner
        // is the hinge, so BOTH must carry paint - a fang that stops short of
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
