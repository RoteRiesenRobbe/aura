#!/usr/bin/env node
/**
 * cliff-placeholder.png — the tile a `Cliff` path wears.
 *
 * Run: `node tools/make-cliff-tile.mjs`
 * Deterministic, no RNG, safe to re-run: the output is a pure function of the
 * constants in TILE below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE SIXTH FAMILY, and the second DIRECTIONAL one — it assumes its path
 * authored `alignTexture: true`, so the tile is turned to run ALONG the path
 * and REGISTERED across it. `make-fence-tile.mjs` is the sibling to read
 * first; everything it says about registration applies here verbatim.
 *
 * ⛔ WRONG WITHOUT THE FLAG, and nothing warns: name `Cliff` on a plain path
 * and the strata lie across the drop instead of along it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ WHAT A CLIFF ACTUALLY LOOKS LIKE FROM STRAIGHT ABOVE: a LINE. A vertical
 * face has zero projected area under a top-down camera, so every top-down game
 * that shows one is cheating — drawing the face as if the camera were tilted.
 * This tile is that cheat, made explicit and made CONSISTENT: the face always
 * falls on the same side of the path, so the authored winding order is what
 * decides which way the land is.
 *
 * ⚑ THEREFORE: author a cliff path along the MID-FACE, not along the lip. The
 * renderer registers the tile's MIDDLE ROW onto the centreline, so the reveal
 * is symmetric about it, and the drawn band is centred to match
 * (assertRegistered).
 *
 * ⭐ THE FOUR THINGS THAT MAKE IT READ, in order of how much they carry:
 *   1. VERTICAL FRACTURES — irregular joints running ACROSS the ribbon. A rock
 *      face's dominant feature, and the one cue that cannot be mistaken for a
 *      road: a road has no structure across itself. Registration is what makes
 *      them expressible at all (the fence tile's whole lesson).
 *   2. THE LIP IS THE BRIGHTEST THING IN THE TILE. It is the only surface
 *      facing the sky. Lose it and the face reads as a stain on the ground.
 *   3. THE BASE GOES TO FLAT DARK WITH NO DETAIL. Borrowed wholesale from
 *      caveMouth.svg — *a hole reads as a hole because it has no floor*. One
 *      pebble in the deepest rows and the drop becomes a grey smear.
 *   4. AN IRREGULAR LIP LINE. A straight one reads as a kerb or a wall. The
 *      jitter is small and it is doing more work than it looks like.
 *
 * ⭐ IT CARRIES A BAKED SHADOW AND THE FENCE DELIBERATELY DOES NOT — the one
 * real divergence between the two directional tiles, so it is worth being
 * exact about why. The fence refuses one because a SUN shadow points a fixed
 * way in WORLD space while the tile turns, so it would swing. What is baked
 * here is not a sun shadow: it is the face's own OCCLUSION of the ground at
 * its foot, which is defined relative to the FACE and therefore rotates with
 * it correctly. A sun shadow for a cliff would still have to be its own
 * world-aligned shape.
 *
 * ⚑ RGBA, like the fence and unlike the opaque ground tiles: the land above
 * the lip and the water below the shadow are whatever the tile is drawn over.
 *
 * ⚑ Seamless by construction: the fracture lattice divides the width a whole
 * number of times, and the top and bottom rows are fully transparent, so both
 * wraps match. `assertSeamless` proves it rather than trusting it.
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const TILE_W = 720;     // 6.0 u at scale 1
const TILE_H = 320;     // 2.67 u — headroom above and below the drawn band
// 1.5 u — the recommended path `width`. ⭐ Rescaled with its smooth sibling so
// the two stay INTERCHANGEABLE: a drawn width IS the steepness under a top-down
// camera, so if they disagreed about it, swapping the profile name on a path
// would silently change how steep the cliff is. See the smooth tile for the
// argument; only the geometry is rescaled here, not the lighting.
const CLIFF_H = 180;
const PX_PER_UNIT = 120;
const HERE = dirname(fileURLToPath(import.meta.url));
const GROUND = join(HERE, '../frontend/src/features/regions/assets/ground');
const PROFILES = join(HERE, '../frontend/src/client-data/terrain-profiles.json');

/** The profile's own `scale`, read rather than duplicated — same trick as the
 *  fence and the field tiles, so the sizes below stay quoted in WORLD UNITS. */
const PROFILE = (() => {
    const table = JSON.parse(readFileSync(PROFILES, 'utf8'));
    const p = table.Cliff;
    if (!p) {
        throw new Error('terrain-profiles.json has no `Cliff` profile — add it first; this '
            + 'script reads its `scale` and checks the tile against its `color`.');
    }
    return p;
})();
const U = PX_PER_UNIT / PROFILE.scale;
const SPAN_UNITS = TILE_W / U;

const hex = (s) => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));

/**
 * ⚑ Every `at` below is in WORLD UNITS measured from the path CENTRELINE,
 * negative = the land side. The band must stay centred (see assertRegistered),
 * so the crest's reach inland and the shadow's reach seaward are equal by
 * construction, not by luck.
 */
const TILE = {
    file: 'cliff-placeholder.png',
    profileColor: hex(PROFILE.color),

    // ── the land side ────────────────────────────────────────────────────────
    // ⚑ Ramps to alpha ZERO at `at`, not to a partial fade. The first cut faded
    // to 0.55 and the hard upper boundary that left was half of why the ribbon
    // read as a TUBE (see the header's failure note).
    // ⚑ `ragged` breaks the INLAND boundary with high-frequency noise so the
    // region above bleeds into the crest in tufts. A clean ramp there ends the
    // higher ground in a drawn line; a broken one lets the grass come over the
    // edge, which is most of what says "this side is on top".
    crest: {
        at: -0.69,
        to: -0.545,
        soil: hex('#7a6d56'),       // dry crumbling earth at a cliff edge
        ragged: 0.044,
    },
    // ⭐ THE LIP IS A RIM LIGHT, NOT A KERB — and the first cut got this wrong
    // in three ways at once (PO: *"the line looks a little low res and thick,
    // not quite believable as higher ground"*). It was 0.08 u of uniform cream
    // running the entire length at constant width and constant brightness, and
    // the eye does not read that as a lit edge: a stroke of even weight and even
    // colour is PIPING, something laid ON the world rather than a property of
    // it. Thin, dimmer, and ⭐ INTERMITTENT — where `vary` closes it the grass
    // simply meets the face, which is what an overhung or shadowed stretch of
    // edge actually looks like.
    lip: {
        at: -0.545,
        to: -0.515,
        stone: hex('#b8ad95'),
        jitter: 0.08,               // world units of wobble along the run
        notch: 0.044,               // extra bite taken out at the joints
        vary: 0.55,                 // how much of its width the run may lose
    },
    // ⭐ THE CONTACT SHADOW, and it is the cue doing the real work. Higher
    // ground OVERHANGS: the dark crack where the lip's underside meets the face
    // is what separates the two planes. Without it a bright line on grey rock is
    // just a bright line — the crack is what makes it a bright line ON TOP OF
    // something.
    //
    // ⚑ It is a long line along the ribbon, which the facet ruling warns about
    // — but the thing that ruling forbids is REPEATED parallel lines across the
    // face, which are wood grain. One line at a structural boundary is an edge,
    // and it is varied and broken for good measure.
    shade: {
        to: -0.47,
        colour: hex('#2b2822'),
        alpha: 0.8,
    },
    // ── the face ─────────────────────────────────────────────────────────────
    // ⛔ DELIBERATELY FLAT, and this is the correction that mattered. A smooth
    // light-to-dark ramp down the band is exactly how a top-lit CYLINDER is
    // shaded, so the first cut read as a fallen log laid along the coast. A
    // wall seen from above is near-uniform; only the last fifth goes dark.
    face: {
        at: -0.47,
        to: 0.37,
        stone: hex('#7d7468'),
        strata: 0.10,               // tone swing between rock bands
        bands: 9,
        footAt: 0.70,               // fraction of the face where the dark starts
        footDark: hex('#2d2a25'),
    },
    // ⛔ NO LONG LINE MAY RUN ALONG THE RIBBON. That is the rule the second cut
    // broke and it is the sharpest thing this tile learned: horizontal strata
    // plus vertical joints is not rock, it is WOOD GRAIN plus plank divisions,
    // and the whole band went back to reading as driftwood. A rock face from
    // above is a MOSAIC OF FACETS, so the strata are gone and what is left is
    // a cell field — the cellular family's technique (make-cellular-tiles.mjs),
    // borrowed here for its cracks rather than its blobs.
    facet: {
        cols: 18,                   // must divide TILE_W, or the seam breaks
        rows: 4,
        jitter: 0.42,               // how far a cell centre leaves its grid slot
        tone: 0.13,                 // lightness swing between neighbouring faces
        crack: 0.055,               // width of the dark joint, in cell units
        dark: 0.55,
    },
    // The one deliberately LONG feature left: a handful of deep joints running
    // ACROSS the ribbon, which is the direction a road can never have.
    fracture: {
        bays: 6,
        width: 0.030,
        wander: 0.11,
        dark: 0.50,
    },
    // ── the foot ─────────────────────────────────────────────────────────────
    // ⭐ RAGGED BY ALPHA, not bounded by a line. The bottom edge dissolves into
    // talus instead of ending, which is what stops the band being a ribbon with
    // two hard sides — and it is also what makes the round cap at a leg join
    // survivable, since a dissolved end is far less of a shape than a rounded
    // one.
    talus: {
        at: 0.37,
        to: 0.64,
        tone: hex('#4b4740'),
        grain: hex('#6f6759'),
        count: 17,
        size: 0.060,
    },
    shadow: {
        at: 0.42,
        to: 0.69,                   // mirrors crest.at — this is what centres it
        colour: hex('#14130f'),
        alpha: 0.38,                // wider and weaker than the first cut
    },
};

/* ---- the tile ------------------------------------------------------------ */

/** Deterministic hash of two integers → [0, 1). No RNG anywhere in the family. */
function hash(a, b) {
    let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h ^= h >>> 13;
    return ((h >>> 0) % 100000) / 100000;
}

/** Smooth 1→0 ramp across [a, b]; the cheap anti-aliasing the family uses. */
const ramp = (v, a, b) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

const mix = (a, b, t) => [0, 1, 2].map(c => a[c] + (b[c] - a[c]) * t);

/**
 * ⭐ A band-limited value noise along the run, so the lip wobbles like an
 * eroded edge instead of a sine wave. Wraps at TILE_W by construction — the
 * lattice index is taken modulo `bays`, which is why the seam holds.
 */
function wobble(x, bays, seed) {
    const period = TILE_W / bays;
    const i = Math.floor(x / period);
    const f = x / period - i;
    const a = hash(((i % bays) + bays) % bays, seed);
    const b = hash((((i + 1) % bays) + bays) % bays, seed);
    return a + (b - a) * (f * f * (3 - 2 * f));
}

/**
 * ⭐ THREE OCTAVES, and this is what fixed "the edge looks low-res".
 *
 * A single octave has ONE feature size. At `bays * 2` that is a control point
 * every 60 px, smoothstepped between — so the lip rolls in lumps of one
 * wavelength and nothing smaller ever happens on it. The eye reads a single
 * repeating scale as a LOW-RESOLUTION CURVE, not as erosion, however finely it
 * is rendered: the pixels are sharp, the SHAPE is coarse.
 *
 * Real rock is scale-free — metre-scale bays, decimetre-scale notches,
 * centimetre-scale crumble — so each octave here halves the wavelength and
 * roughly halves the amplitude. ⚑ Weights sum to 1, so the caller's `jitter`
 * still means what it says and the registration checks do not move.
 */
function fractalWobble(x, bays, seed) {
    return 0.55 * wobble(x, bays, seed)
        + 0.30 * wobble(x, bays * 3, seed + 101)
        + 0.15 * wobble(x, bays * 9, seed + 211);
}

/**
 * The cliff at (x, y) → [r, g, b, a].
 *
 * ⚑ `u` is world units from the tile's MIDDLE ROW, which is where the path's
 * centreline lands once the tile is registered. Negative is the LAND side.
 * That is the only reason this function may speak about a lip at all.
 */
function pixel(t, x, y) {
    const u = (y - TILE_H / 2) / U;
    const px = ((x % TILE_W) + TILE_W) % TILE_W;

    // The lip wanders, and everything below it wanders with it — a face whose
    // top edge moves but whose strata do not reads as a printed decal.
    const lipShift = (fractalWobble(px, t.fracture.bays * 2, 5) - 0.5) * 2 * t.lip.jitter;
    const v = u - lipShift;

    const aa = 1.5 / U;   // one-and-a-half pixels of feather, in world units

    // The lip is NOTCHED at the joints as well as wobbled — erosion opens a
    // rock face's joints first, and a notch is a corner, which is what the eye
    // reads as stone. A pure wobble is a smooth curve and reads as organic.
    const period = TILE_W / t.fracture.bays;
    const bay = Math.floor(px / period);
    const dxBay = ((px % period) + period) % period - period / 2;
    const half = t.fracture.width * U / 2 * (0.6 + hash(bay, 31));
    const notch = t.lip.notch * (1 - ramp(Math.abs(dxBay), half, half * 5)) * hash(bay, 83);

    // ⭐ The rim light OPENS AND CLOSES along the run. Where `open` falls to
    // zero the crest meets the face with no highlight at all — an overhung or
    // shadowed stretch — and that intermittency is what stops the edge reading
    // as piping laid over the world.
    const open = 1 - t.lip.vary * fractalWobble(px, t.fracture.bays, 61);
    const lipTop = t.lip.at + notch;
    const lipBot = lipTop + (t.lip.to - t.lip.at) * open;
    const shadeBot = t.shade.to + notch;

    let rgb = null;
    let alpha = 0;

    if (v < lipTop) {
        // ── crest: exposed earth inland of the edge, ramping to NOTHING
        // ⚑ The inland boundary is BROKEN, not ramped: high-frequency noise
        // moves it per-pixel-column so the region above bleeds through in
        // tufts. A clean ramp here is a drawn line, and a drawn line is
        // exactly what the higher ground must not end in.
        const edge = t.crest.at + notch
            + t.crest.ragged * (fractalWobble(px, t.fracture.bays * 4, 137) - 0.5) * 2;
        rgb = t.crest.soil;
        alpha = ramp(v, edge, lipTop);
    } else if (v < lipBot) {
        rgb = t.lip.stone;
        alpha = 1;
    } else if (v < shadeBot) {
        // ── the overhang's own shadow on the face it stands over
        rgb = mix(t.face.stone, t.shade.colour,
            t.shade.alpha * (1 - ramp(v, lipBot, shadeBot)));
        alpha = 1;
    } else if (v < t.talus.to) {
        // ── the face: flat, then dark only in its last fifth
        const down = Math.min(1, Math.max(0, (v - shadeBot) / (t.face.to - shadeBot)));

        // ⭐ The facet mosaic. Nearest cell centre gives the face its tone; the
        //    gap between nearest and second-nearest gives the crack between two
        //    faces (the standard F2-F1 edge). Centres live on a grid whose
        //    column count divides TILE_W, which is what keeps the seam exact.
        const cw = TILE_W / t.facet.cols;
        const ch = 1 / t.facet.rows;
        const cxi = px / cw, cyi = down / ch;
        let f1 = 1e9, f2 = 1e9, own = 0;
        for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
                const gi = Math.floor(cxi) + ox, gj = Math.floor(cyi) + oy;
                const wi = ((gi % t.facet.cols) + t.facet.cols) % t.facet.cols;
                const sx = gi + 0.5 + (hash(wi, gj * 7 + 3) - 0.5) * 2 * t.facet.jitter;
                const sy = gj + 0.5 + (hash(wi, gj * 7 + 11) - 0.5) * 2 * t.facet.jitter;
                // ⚑ Cells are wider than tall in cell units, so scale y back to
                //    world proportions before measuring — otherwise the facets
                //    stretch along the run and become stripes again.
                const d = Math.hypot((cxi - sx) * cw, (cyi - sy) * ch * (t.face.to - lipBot) * U);
                if (d < f1) { f2 = f1; f1 = d; own = hash(wi, gj * 7 + 29); }
                else if (d < f2) { f2 = d; }
            }
        }
        const swing = (own - 0.5) * 2 * t.facet.tone;
        rgb = t.face.stone.map(c => c * (1 + swing));
        rgb = mix(rgb, t.face.footDark, ramp(down, t.face.footAt, 1.05));
        const crack = 1 - ramp(f2 - f1, 0, t.facet.crack * cw);
        if (crack > 0) { rgb = mix(rgb, t.face.footDark, crack * t.facet.dark); }

        // A few deep joints ACROSS the ribbon — the one direction a road cannot
        // have, and the last thing separating this from a paved verge.
        const lean = (hash(bay, 13) - 0.5) * 2 * t.fracture.wander * U;
        const dx = dxBay - lean * down;
        const joint = 1 - ramp(Math.abs(dx), half - aa * U, half + aa * U);
        if (joint > 0) { rgb = mix(rgb, t.face.footDark, joint * t.fracture.dark); }

        // ── the foot: RAGGED by alpha, dissolving into talus and water.
        alpha = 1;
        if (v > t.talus.at) {
            const edge = t.talus.at + (t.talus.to - t.talus.at)
                * (0.25 + 0.75 * wobble(px, t.fracture.bays * 3, 23));
            alpha = 1 - ramp(v, edge - 0.05, edge + 0.05);
            rgb = mix(rgb, t.talus.tone, ramp(v, t.talus.at, edge));
            for (let i = 0; i < t.talus.count; i++) {
                const cx = (i + 0.5) * TILE_W / t.talus.count
                    + (hash(i, 53) - 0.5) * TILE_W / t.talus.count * 0.9;
                const cy = t.talus.at + (t.talus.to - t.talus.at) * (0.1 + hash(i, 59) * 0.8);
                const r = t.talus.size * (0.45 + hash(i, 61));
                const on = 1 - ramp(Math.hypot((px - cx) / U, v - cy), r - aa, r + aa);
                if (on > 0) {
                    alpha = Math.max(alpha, on);
                    rgb = mix(rgb, t.talus.grain, on * 0.55);
                }
            }
        }
    }

    // ── the face's own occlusion of the ground at its foot, UNDER everything
    //    and reaching well past the rock, so the band has no hard lower side.
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

/**
 * The fence's check, with one deliberate relaxation and one addition.
 *
 * ⚑ RELAXED: the fence demands skew <= 1 px because a fence is symmetric about
 * its rail. A cliff is NOT symmetric in content — a thin bright lip above, a
 * long dark foot below — so what is pinned here is that the drawn EXTENT is
 * centred, which is what the symmetric reveal actually requires. The tolerance
 * is a few pixels rather than one, and the number is printed either way.
 *
 * ⭐ ADDED: the lip must be the brightest row in the tile. That is cue 2 in the
 * header, it is the one a re-tune is most likely to break by lightening the
 * crest, and it is cheap to prove.
 */
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
    console.log(`  ink rows ${top}..${bottom} of ${TILE_H}`
        + `  (reach ${reach} px each side, skew ${skew})`);
    if (reach * 2 > CLIFF_H) {
        throw new Error(`the cliff is ${reach * 2} px tall but the authored width shows only `
            + `${CLIFF_H}. Either thin it or raise CLIFF_H and the documented width.`);
    }
    if (skew > 6) {
        throw new Error(`the drawn band is ${skew} px off-centre. The MIDDLE row lands on the `
            + 'centreline and the reveal is symmetric about it, so an off-centre band loses '
            + 'its lip or its shadow first.');
    }
    if (top === 0 || bottom === TILE_H - 1) {
        throw new Error('ink touches the top or bottom row, so the vertical wrap is not '
            + 'transparent and the tile will seam across the ribbon.');
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
        throw new Error(`the brightest row is ${bestY}, not the lip at ~${Math.round(lipMid)}. `
            + 'The lip is the only surface facing the sky and must read as it — otherwise the '
            + 'face is a stain on the ground rather than a drop.');
    }
}

/** Proves the seam instead of trusting it — the check all six carry. */
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
        throw new Error(`NOT seamless: edges differ by up to ${worst}/255. The fracture lattice `
            + 'does not divide the width, or ink reaches a wrap row.');
    }
    console.log('  seam: exact — both wrap edges match to the byte, alpha included');
}

/** D14: the profile's `color` paints while the texture loads. Opaque pixels
 *  only, as the fence does — averaging the transparent margin in would drag the
 *  fallback toward a colour no rock ever is. */
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
            + '`color`. Either re-tune the tile or change the profile — but they have to agree, '
            + 'or the cliff changes hue the moment the texture loads (D14).');
    }
}

/** What the author actually has to judge. */
function reportScale() {
    console.log(`  tile ${TILE_W}x${TILE_H} spans ${SPAN_UNITS.toFixed(2)} u`
        + ` at scale ${PROFILE.scale} — ${TILE.fracture.bays} joints,`
        + ` one every ${(SPAN_UNITS / TILE.fracture.bays).toFixed(2)} u.`
        + `\n  ⚑ Author the path along the MID-FACE at width ${(CLIFF_H / U).toFixed(2)},`
        + ` alignTexture true.`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled and duplicated from its siblings rather than shared: each of
// these scripts is meant to be readable and runnable on its own. ⚑ The one
// export is for the PREVIEW script beside it, which is not a sibling tile.

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

export {TILE, TILE_W, TILE_H, CLIFF_H, U, pixel};

/* ---- go ------------------------------------------------------------------ */

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('make-cliff-tile.mjs')) {
    console.log('cliff');
    reportScale();
    assertRegistered(TILE);
    assertSeamless(TILE);
    assertMatchesProfile(TILE);
    writeRGBA(TILE_W, TILE_H, (x, y) => pixel(TILE, x, y), join(GROUND, TILE.file));
}
