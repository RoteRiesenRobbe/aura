/**
 * Generates the PLACEHOLDER CULTIVATED-GROUND tiles for the terrain profiles
 * (docs/content-zone-design-guide.md §2.2 — field plots are polygons naming a
 * profile, and until now there was no profile that looked like a field).
 *
 *     ploughed · ploughed-cross · wheat · wheat-cross
 *
 * ⭐ Checked in as a script, not just images, because a placeholder's whole job
 * is to be re-tuned: change a constant, re-run, look at it again. The committed
 * PNGs are exactly what this produces — deterministic, with no RNG anywhere.
 *
 * ⚑ THIS IS NOT A FIFTH TECHNIQUE. A furrow is a RIDGED field — the same
 * `1 - |sin|` trick `make-water-tile.mjs` uses for a wave crest, pointed along
 * one axis instead of clustered around a swell — and everything else here is
 * ordinary wave sums. It is its own file for two reasons and neither is
 * technical purity: a script named `make-water-tile` has no business owning a
 * wheat field, and the four scripts beside it ALREADY each stand alone with
 * their own copy of the PNG writer, deliberately (see any of their headers),
 * so a fifth self-contained one is the house pattern rather than a departure.
 *
 * ⭐ TWO DIRECTIONS PER MATERIAL, AND THAT IS THE WHOLE REASON THERE ARE FOUR
 * TILES. A profile carries `texture`, `scale`, `blend`, `color` and `scroll` —
 * there is NO rotation knob — so every plot wearing one profile has its rows
 * running the same way in world space. One direction everywhere reads as a
 * printing error, and patchwork farmland is exactly the case where alternating
 * direction IS the look. Rotating by 90° costs nothing here because a wave's
 * direction is its (kx, ky): swapping them turns E-W rows into N-S rows and
 * stays exactly periodic. ⚑ Any INTEGER pair is a legal direction, so a
 * diagonal plot (kx = ky) is one constant block away if the fields want one.
 *
 * ⚑ SEAMLESS BY CONSTRUCTION: every wave number is an integer, so the image is
 * exactly periodic in both axes, and `assertSeamless` proves it rather than
 * trusting it.
 *
 * ⚑ FURROW SPACING IS THE NUMBER TO JUDGE, not the colour. It is authored in
 * WORLD UNITS (`FURROW_SPACING_U`) and the wave number is derived, so at the
 * shipped `scale: 1` a 6.25 u tile carries 11 rows 0.55 u apart — just over
 * the player's own 0.5 u width. The run prints the spacing and the repeat
 * count every time; judge both in front of the game.
 *
 * ⚑ 750 x 750 to match the CC0 pack, so `scale` means the same amount of world
 * here as it does for every other tile (the ground README, "The scale knob").
 *
 * Usage: node tools/make-field-tiles.mjs
 */
import {deflateSync} from 'node:zlib';
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const SIZE = 750;
const HERE = dirname(fileURLToPath(import.meta.url));
const GROUND = join(HERE, '../frontend/src/features/regions/assets/ground');
const PX_PER_UNIT = 120;                   // the WARP cheat's convention

/**
 * ⭐⭐ THE TILE'S WORLD SIZE IS READ FROM THE PROFILE TABLE, NOT RESTATED HERE,
 * and that coupling is the whole point of this block.
 *
 * ⛔ THE FIRST CUT OF THESE TILES SHIPPED AT `scale: 0.35` AND THE PO'S VERDICT
 * WAS "repeating way too often". They were right, and the instinct that the
 * tile was "too high res" was exactly inverted: 0.35 makes a 750 px tile cover
 * **2.19 world units**, so five whole copies cross a 1280 px screen. Resolution
 * was never the problem — COVERAGE was. And rows are the worst possible
 * pattern to repeat at that pitch, because a directional structure is the one
 * thing the eye locks onto instantly: every plot became a piece of corduroy
 * with a visible seam every 2 metres.
 *
 * ⭐ So the fix is NOT to soften the tile, it is to make one tile cover more
 * ground and put MORE ROWS IN IT — same furrow spacing on screen, a third of
 * the repeats. At `scale: 1` a tile spans 6.25 u and the same 0.45 u furrow
 * needs 14 rows instead of 5.
 *
 * ⚑ Which is why every frequency below is authored in CYCLES PER WORLD UNIT
 * and converted here. Change `scale` in terrain-profiles.json, re-run this,
 * and every feature keeps its real-world size while the repeat moves. Authored
 * as tile wave numbers (what the four sibling generators do) they would all
 * silently change size instead, which is how the first cut got its corduroy.
 */
const PROFILE_SCALE = (() => {
    const table = JSON.parse(readFileSync(
        join(HERE, '../frontend/src/client-data/terrain-profiles.json'), 'utf8'));
    const scales = ['Ploughed', 'Ploughed Cross', 'Wheat', 'Wheat Cross']
        .map(name => table[name]?.scale);
    if (scales.some(s => typeof s !== 'number')) {
        throw new Error('terrain-profiles.json is missing one of the four field profiles, '
            + 'or one of them has no `scale` — this script cuts its tiles for that value.');
    }
    if (new Set(scales).size !== 1) {
        throw new Error(`the four field profiles disagree about scale (${scales.join(', ')}). `
            + 'They share these tiles\' feature sizes, so they have to share a scale.');
    }
    return scales[0];
})();

/** How much world one tile covers, which is also how often it repeats. */
const SPAN_UNITS = SIZE * PROFILE_SCALE / PX_PER_UNIT;

/** Cycles per world unit → this tile's integer wave number (≥ 1, or it would
 *  not be periodic over the tile at all). */
const k = (perUnit) => Math.max(1, Math.round(perUnit * SPAN_UNITS));

/** A feature every `spacing` world units → its integer wave number. */
const every = (spacingUnits) => k(1 / spacingUnits);

/** Converts a whole set authored in cycles-per-unit into tile wave numbers. */
const world = (waves) => waves.map(([kx, ky, amp, phase]) =>
    [Math.round(kx * SPAN_UNITS), Math.round(ky * SPAN_UNITS), amp, phase]);

/* ---- wave sets ----------------------------------------------------------- */
// Each entry is [kx, ky, amplitude, phase]; all wave numbers INTEGER (header).

/**
 * The furrows themselves: one dominant frequency across the field, plus its
 * harmonics so the ridge profile is not a pure sine (a ploughed ridge has a
 * round top and a sharp trough, which the harmonics supply).
 * ⚑ A pure [0, n] set is ruler-straight. The two tilted entries at the bottom
 * are what make the rows drift the way a real furrow does behind a plough.
 */
const FURROW_SPACING_U = 0.55;
const FURROW_N = every(FURROW_SPACING_U);
const FURROWS = [
    [0, FURROW_N, 1.00, 0.0],
    [0, 2 * FURROW_N, 0.26, 1.7],
    [0, 3 * FURROW_N, 0.12, 3.4],
    // ⚑ These stay PER TILE rather than per unit: one or two slow bends across
    // the whole plot is what a plough leaves, and it should stretch with the
    // tile rather than repeat inside it.
    [1, FURROW_N, 0.30, 2.2],
    [-1, FURROW_N, 0.24, 4.9],
    [2, FURROW_N, 0.16, 0.7],
];

/** Broad damp/dry patches across the plot — the slow variation that stops a
 *  repeated tile reading as wallpaper. Kept gentle: strong low frequencies in
 *  a tile repeated nine times across a screen advertise the repeat. */
const SOIL_PATCHES = world([
    [0.46, 0.46, 1.00, 0.8],
    [0.91, -0.46, 0.70, 3.2],
    [-0.46, 0.91, 0.52, 5.5],
    [0.91, 0.91, 0.34, 1.9],
    [1.37, -0.91, 0.22, 4.1],
]);

/**
 * ⭐⭐ THE CLODS ARE A CELLULAR FIELD, NOT A WAVE SUM, AND THAT IS THE LESSON
 * THIS TILE COST FOUR DRAFTS TO LEARN.
 *
 * Turned soil is made of LUMPS — discrete, irregular, packed edge to edge with
 * a dark crevice between them — and that is exactly what a jittered lattice
 * makes (the same primitive `make-cellular-tiles.mjs` cuts masonry with; this
 * is a trimmed copy of its Voronoi, deliberately, since every generator here
 * stands alone). A sum of sines cannot get there from either end, and both
 * ends were tried: at HIGH frequency it interferes into a woven texture and
 * the field reads as CLOTH, at LOW frequency `ridged` turns it into long
 * meandering closed loops that read as DOODLES over corduroy. The problem is
 * not the tuning, it is that eight sine waves have no irregularity in them.
 *
 * ⚑ Two numbers come out of the lattice and the plough uses both: which cell
 * (a per-clod tone) and how near its border (the crevice).
 */
const CLOD_SIZE_U = 0.34;

/** Deterministic hash of a WRAPPED cell index — the seam argument for the
 *  lattice: the cell at −1 IS the cell at n−1, so the field is periodic. */
function hash(i, j, salt) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)
        + Math.imul(salt, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const mod = (a, n) => ((a % n) + n) % n;

/**
 * Nearest and second-nearest jittered lattice point. Returns `tint` (which
 * clod) and `edge` = (F2 − F1) / cellWidth, which is 0 exactly on a crevice
 * between two clods. ⚑ The 3×3 search is exhaustive only while jitter ≤ 0.5.
 */
function clodField(x, y, cells, jitter, sizeVar) {
    const cw = SIZE / cells;
    const cx0 = Math.floor(x / cw), cy0 = Math.floor(y / cw);
    let f1 = Infinity, f2 = Infinity, tint = 0;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const ci = cx0 + dx, cj = cy0 + dy;
            const wi = mod(ci, cells), wj = mod(cj, cells);
            const px = (ci + 0.5 + jitter * (hash(wi, wj, 1) - 0.5)) * cw;
            const py = (cj + 0.5 + jitter * (hash(wi, wj, 2) - 0.5)) * cw;
            // ⚑ A per-clod size bias, and it is what stops the field being
            // CRAZY PAVING: with every cell the same size they tessellate into
            // an outlined mosaic (the defect make-cellular-tiles.mjs records
            // for leaf litter). A big clod should swallow its small neighbour.
            const d = Math.hypot(x - px, y - py) - sizeVar * (hash(wi, wj, 4) - 0.5) * cw;
            if (d < f1) { f2 = f1; f1 = d; tint = hash(wi, wj, 3); }
            else if (d < f2) { f2 = d; }
        }
    }
    return {tint, edge: (f2 - f1) / cw};
}

/** Clods and stones turned up by the blade. */
const CLODS = world([
    [1.09, 0.78, 1.00, 2.3],
    [0.78, -1.40, 0.92, 5.1],
    [1.71, 1.09, 0.80, 0.9],
    [-1.40, 2.02, 0.68, 3.7],
    [2.33, 1.71, 0.54, 1.4],
    [2.95, -2.02, 0.40, 4.8],
    [2.02, 3.26, 0.28, 2.0],
    [-2.64, 1.40, 0.20, 5.9],
]);

/**
 * Wheat drills. Much finer than a furrow — seed is drilled at a fraction of
 * the spacing soil is ploughed at — and much shallower, because a standing
 * crop closes over its own rows. At n = 14 the rows sit ~0.16 u apart.
 */
const DRILL_SPACING_U = 0.5;
const DRILL_N = every(DRILL_SPACING_U);
const DRILLS = [
    [0, DRILL_N, 1.00, 0.5],
    [0, 2 * DRILL_N, 0.20, 2.8],
    [1, DRILL_N, 0.16, 4.4],
    [-1, DRILL_N, 0.13, 1.1],
];

/** Wind moving over standing wheat: broad, soft, and the reason a wheat field
 *  is never one flat gold. */
const WIND = world([
    [0.46, 0.91, 1.00, 2.6],
    [0.91, 0.46, 0.76, 0.4],
    [-0.46, 1.37, 0.54, 4.7],
    [1.37, 0.91, 0.36, 1.8],
    [0.91, -1.37, 0.24, 3.9],
]);

/**
 * ⭐⭐ THE STRAW FIBRES, and the PO's verdict on the draft these replace was
 * "random squiggles" (2026-09-20, with a tabletop-terrain reference: a field
 * of dense static-grass flock).
 *
 * ⛔ The draft used the same ridged trick at 9–19 cycles per unit, which puts
 * a mark every 10–20 px — and a mark THAT SIZE, made of a wave sum, is a worm.
 * Dense fine marks read as fibre; sparse medium marks read as scribble, and
 * there is no amplitude that rescues the second into the first.
 *
 * ⚑ So these run 15–30 cycles per unit (a fibre every 4–8 px at scale 1) with
 * a high sharpness, which is the difference between a mat of straw and a
 * doodle. It is the densest set in any of the five generators, and the reason
 * it can be: at scale 1 a texel is a screen pixel, so nothing is thrown away
 * by the bake the way it would be at 0.35.
 */
const FIBRES = world([
    [15.2, 9.4, 1.00, 0.9],
    [9.8, -17.1, 0.94, 3.6],
    [19.6, 12.7, 0.88, 1.4],
    [-11.3, 22.4, 0.80, 5.2],
    [24.8, 15.9, 0.72, 2.7],
    [-20.1, 11.6, 0.64, 0.2],
    [28.3, 19.7, 0.54, 4.3],
    [-16.4, 26.9, 0.46, 1.8],
    [30.2, 8.8, 0.38, 3.1],
]);

/** Broad, soft tonal drift under the heads. */
const HEADS = world([
    [13.24, 8.68, 1.00, 1.2],
    [8.68, -14.16, 0.86, 4.0],
    [16.89, 10.50, 0.64, 2.5],
    [-10.50, 18.72, 0.46, 5.7],
    [19.63, 14.16, 0.32, 0.7],
    [-21.46, 16.89, 0.22, 3.3],
]);

/** Turns a wave set 90°: (kx, ky) → (ky, kx). Exactly periodic either way,
 *  which is the whole reason the rotation is free. The phases are nudged so
 *  the two directions are not the same image with the axes relabelled. */
const turn = (waves, phaseShift) =>
    waves.map(([kx, ky, amp, phase]) => [ky, kx, amp, (phase + phaseShift) % (Math.PI * 2)]);

/* ---- the tiles ----------------------------------------------------------- */

// ⚑ EVERY NUMBER here is [PLACEHOLDER]. ⚑ `profileColor` is the tile's contract
// with terrain-profiles.json: that value is D14's fallback, painted while the
// texture loads and anywhere the file is missing, so the tile's MEAN colour has
// to match it or the ground changes hue on load. `assertMatchesProfile` checks
// it against the rendered image rather than against anyone's intention.

const PLOUGHED = {
    // Damp turned earth, dry crests, and the near-black of a deep trough.
    // ⭐ RETUNED AGAINST A REFERENCE THE PO SUPPLIED (2026-09-20), and the
    // reference overturned two of this file's own conclusions — worth keeping,
    // because both were reasoned from first principles and both were wrong
    // about what the GAME wants:
    //   · soft BROAD streaks, not crisp ridges. The crevice-and-crest reading
    //     of a furrow is what a ploughed field looks like standing in it; from
    //     the game's camera it is bands of light and shade.
    //   · almost no clod network. The lattice stays (it is what keeps the
    //     bands from being ruled lines) but its crevice is barely there —
    //     what carries the look instead is BLOTCHING, big and irregular.
    // ⚑ Lower contrast overall: the ramp no longer runs to near-black or to
    // pale sand, which is what made earlier drafts read as embossed.
    ramp: [[0x46, 0x33, 0x22], [0x6b, 0x4f, 0x32], [0x8e, 0x73, 0x53]],
    profileColor: [0x6b, 0x4f, 0x32],
    rows: {waves: FURROWS, weight: 0.46, sharpness: 1.15},
    patches: {waves: SOIL_PATCHES, weight: 0.26},
    speck: {waves: CLODS, weight: 0.12},
    clods: {size: CLOD_SIZE_U, jitter: 0.48, sizeVar: 0.85, warp: 11,
        tint: 0.16, crevice: 0.05},
    // The blotches ARE the texture now: bigger, more of them, and they darken
    // rather than merely interrupting.
    breaks: {size: 2.2, jitter: 0.5, fill: 0.42, salt: 60,
        rowCut: 0.55, tone: -0.16, offset: 0},
    base: 0.205,
    gamma: 1.0,
};

const WHEAT = {
    // Standing wheat: straw gold, with the green of a crop not yet fully
    // turned in the shadows between the drills.
    // ⭐ THE RAMP STARTS IN THE SOIL, and that is the PO's other instruction:
    // "in between the rows, a little brown earth should be visible". The dark
    // stop is deliberately the PLOUGH's own colour, so a wheat plot beside a
    // ploughed one is visibly the same field with a crop on it.
    ramp: [[0x6a, 0x4e, 0x33], [0xbf, 0x9c, 0x4e], [0xe2, 0xc7, 0x80]],
    profileColor: [0xb0, 0x8f, 0x4c],
    // ⚑ DEEPER than the draft's 0.34 and broader (sharpness 1.6, drills every
    // 0.35 u rather than 0.22): the rows now have to carry the tone all the
    // way DOWN to bare earth between them, not just shade the crop. A shallow
    // row over a straw-coloured base was what made the old tile one flat mat.
    // ⚑ In crop mode `rows.weight` is not a tone, it is how much of the
    // stand the drills account for — see the crop branch in rampPos.
    rows: {waves: DRILLS, weight: 1.0, sharpness: 1.1},
    // ⚑ `floor` is the crop standing BETWEEN the drills. Higher than it was
    // (0.44): with the tufts carrying the texture the rows only need to be a
    // gentle modulation, and a deep gap made the field look half-sown rather
    // than drilled. Earth still shows in the troughs, which is what was asked.
    crop: {earth: 0.04, straw: 0.50, floor: 0.34, rows: 0.62},
    // One tuft per ~0.05 u — about 5 px at scale 1, so a screen shows
    // thousands of them, which is the flock in the reference.
    tufts: {size: 0.05, jitter: 0.5, sizeVar: 0.9, warp: 4, tint: 0.46, shade: 0.16},
    patches: {waves: WIND, weight: 0.11},
    speck: {waves: HEADS, weight: 0.05},
    // The fibres themselves, dense and fine (see FIBRES). Heavier than it
    // looks: in crop mode this only lands where the crop stands.
    detail: {waves: FIBRES, sharpness: 3.2, weight: 0.14},
    // Lodged crop — wind has flattened a patch, so the drills disappear and
    // the straw lies over lighter.
    breaks: {size: 2.0, jitter: 0.5, fill: 0.26, salt: 120,
        rowCut: 0.55, tone: 0.05, offset: 137},
    base: 0.12,
    gamma: 1.0,
};

/** Same material, rows turned 90°. See the header: this exists because a
 *  profile has no rotation knob, so direction has to be baked per tile. */
const crossed = (tile, file, phaseShift) => ({
    ...tile,
    file,
    rows: {...tile.rows, waves: turn(tile.rows.waves, phaseShift)},
    patches: {...tile.patches, waves: turn(tile.patches.waves, phaseShift)},
});

const TILES = [
    {...PLOUGHED, file: 'ploughed-placeholder.png'},
    crossed(PLOUGHED, 'ploughed-cross-placeholder.png', 1.3),
    {...WHEAT, file: 'wheat-placeholder.png'},
    crossed(WHEAT, 'wheat-cross-placeholder.png', 2.1),
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
 * A RIDGED wave: `1 - |sin|` peaks at a line rather than a broad hump, which
 * is what turns a sine into a furrow crest with a sharp trough between. Same
 * function as make-water-tile.mjs's, and `sharpness` means the same thing —
 * 1.3 is a soft swell of standing crop, 1.9 a turned ridge.
 */
function ridged(waves, x, y, sharpness) {
    return Math.pow(1 - Math.abs(sum(waves, x, y)), sharpness);
}

/** Piecewise-linear colour ramp over any number of evenly spaced stops. */
function rampAt(stops, t) {
    const clamped = Math.min(1, Math.max(0, t));
    const span = 1 / (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(clamped / span));
    const local = (clamped - i * span) / span;
    const a = stops[i], b = stops[i + 1];
    return [0, 1, 2].map(c => Math.round(a[c] + (b[c] - a[c]) * local));
}

/**
 * ⭐⭐ THE INTERRUPTIONS, and this is the pass that separates "a pattern" from
 * "a field" (PO 2026-09-20: *"shouldn't the pattern be randomly interrupted to
 * look more natural?"* — yes, and it was the missing half).
 *
 * Every other term here is CONTINUOUS: rows everywhere, clods everywhere,
 * grit everywhere. Real ground is not uniform — the plough lifts and skips,
 * a wet corner never took seed, a patch of wheat lodges flat in the wind — and
 * a surface with no exceptions in it reads as printed cloth no matter how fine
 * its texture is.
 *
 * ⚑ "Random" here means HASHED, never RNG: same lattice discipline as the
 * clods, so the tile stays deterministic and periodic. Each cell holds a blob
 * only if its hash clears `fill`, which is what makes these sparse rather
 * than another all-over layer.
 *
 * ⛔ THE HONEST LIMIT, worth knowing before turning this up: an interruption
 * is the most VISIBLE thing in a tile, so it is also the thing that most
 * advertises the tile's repeat. A bare patch every 6.25 u is recognisable as
 * the same bare patch. They stay sparse and low-contrast for that reason, and
 * the repeat itself is a COVERAGE problem the `scale` note above owns, not
 * something more randomness inside one tile can fix.
 */
function blobCover(x, y, cells, jitter, fill, salt) {
    const cw = SIZE / cells;
    const cx0 = Math.floor(x / cw), cy0 = Math.floor(y / cw);
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const ci = cx0 + dx, cj = cy0 + dy;
            const wi = mod(ci, cells), wj = mod(cj, cells);
            if (hash(wi, wj, salt) > fill) { continue; }          // empty cell
            const px = (ci + 0.5 + jitter * (hash(wi, wj, salt + 1) - 0.5)) * cw;
            const py = (cj + 0.5 + jitter * (hash(wi, wj, salt + 2) - 0.5)) * cw;
            const r = cw * (0.30 + 0.34 * hash(wi, wj, salt + 3));
            best = Math.min(best, Math.hypot(x - px, y - py) / r);
        }
    }
    if (best === Infinity) { return 0; }
    // Soft-edged: a skipped patch has no outline.
    const t = Math.min(1, Math.max(0, (1 - best) / 0.55));
    return t * t * (3 - 2 * t);
}

/** The ramp position at a point — rows, then the slow patches, then grit. */
function rampPos(tile, x, y) {
    let t = tile.base;

    // Where a break sits, the rows fade out and the tone shifts — the plough
    // lifted here, or the crop never stood.
    const broken = tile.breaks
        ? blobCover(x + tile.breaks.offset, y, every(tile.breaks.size),
            tile.breaks.jitter, tile.breaks.fill, tile.breaks.salt)
        : 0;

    const rowFade = tile.breaks ? 1 - tile.breaks.rowCut * broken : 1;

    if (tile.crop) {
        // ⭐⭐ CROP MODE, and the restructure is the PO's instruction made
        // literal: *"in between the rows, a little brown earth should be
        // visible"*. Adding a row term to a straw-coloured base can never do
        // that — every point still starts as straw and the rows only shade it,
        // which is why the draft was one flat mat with stripes on it.
        //
        // Here the rows decide how much crop STANDS at a point, and everything
        // else — fibres, wind, heads — dresses only the crop. Where nothing
        // stands, the ramp is left at its earth stop, which is the plough's own
        // colour, so a wheat plot reads as the same field with a crop on it.
        const stand = Math.min(1, Math.max(0, tile.crop.floor
            + tile.crop.rows * rowFade * ridged(tile.rows.waves, x, y, tile.rows.sharpness)));
        // ⭐⭐ THE TUFTS ARE THE TEXTURE, and this is the third thing the PO's
        // reference (a tabletop field flocked with static grass) settled: what
        // reads as a crop from above is THOUSANDS OF DISTINCT LITTLE TUFTS,
        // each its own shade, not a smooth field with marks drawn on it.
        //
        // ⛔ Two wave-based drafts died proving that: medium marks came out as
        // "random squiggles" (the PO's words) and fine ones dissolved into a
        // grain that left the tile looking like ribbed card. A sum of sines
        // has no DISCRETE anything in it. The same jittered lattice the clods
        // use, at a tenth of their cell size, has nothing but discrete things
        // in it — one tuft per cell, each with its own tone.
        const tw = tile.tufts.warp;
        const tuft = clodField(x + tw * sum(FIBRES, x, y),
            y + tw * sum(FIBRES, x + SIZE * 0.29, y + SIZE * 0.53),
            every(tile.tufts.size), tile.tufts.jitter, tile.tufts.sizeVar);
        const dress = tile.crop.straw
            + tile.tufts.tint * (tuft.tint - 0.5)
            - tile.tufts.shade * (1 - Math.min(1, tuft.edge / 0.3))
            + tile.detail.weight * ridged(tile.detail.waves, x, y, tile.detail.sharpness)
            + tile.patches.weight * sum(tile.patches.waves, x, y)
            + tile.speck.weight * sum(tile.speck.waves, x, y);
        const lit = tile.crop.earth + stand * dress + (tile.breaks ? tile.breaks.tone : 0) * broken;
        return Math.pow(Math.min(1, Math.max(0, lit)), tile.gamma);
    }

    t += tile.rows.weight * rowFade * ridged(tile.rows.waves, x, y, tile.rows.sharpness);
    t += (tile.breaks ? tile.breaks.tone : 0) * broken;
    t += tile.patches.weight * (0.5 + 0.5 * sum(tile.patches.waves, x, y));
    t += tile.speck.weight * (0.5 + 0.5 * sum(tile.speck.waves, x, y));
    if (tile.clods) {
        // ⚑ WARPED, for the same reason the sibling script warps its lattice:
        // an unwarped cell border is a straight polygon edge, and a field of
        // them reads as tiling rather than as soil. The warp is itself a sum
        // of integer-frequency sines, so the composition stays periodic.
        const wx = x + tile.clods.warp * sum(CLODS, x, y);
        const wy = y + tile.clods.warp * sum(CLODS, x + SIZE * 0.37, y + SIZE * 0.11);
        const c = clodField(wx, wy, every(tile.clods.size), tile.clods.jitter,
            tile.clods.sizeVar);
        t += tile.clods.tint * (c.tint - 0.5);
        // The crevice: dark, narrow, and only right at the border.
        t -= tile.clods.crevice * (1 - Math.min(1, c.edge / 0.14));
    }
    if (tile.detail) {
        // ⭐ THE SIGNED PASS, and it is the same mechanism read two ways: a
        // ridged field at high sharpness is a net of THIN LINES, and whether
        // that net is the dark crevices between clods or the lit heads of a
        // standing crop is only the sign of its weight. Nothing else in this
        // file can make a hard edge, which is why both materials needed it.
        t += tile.detail.weight * ridged(tile.detail.waves, x, y, tile.detail.sharpness);
    }
    return Math.pow(Math.min(1, Math.max(0, t)), tile.gamma);
}

function pixel(tile, x, y) {
    return rampAt(tile.ramp, rampPos(tile, x, y));
}

/* ---- checks -------------------------------------------------------------- */

/**
 * Proves the seam instead of trusting it — the same check all four sibling
 * generators carry. The tile is periodic iff the pixel one step PAST the right
 * edge equals the pixel at the left edge, and likewise top and bottom.
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
            + 'Some wave number is not an integer.');
    }
    console.log('  seam: exact — both wrap edges match to the byte');
}

/**
 * ⭐ THE D14 CHECK (the same one make-cellular-tiles.mjs carries, and it earned
 * its keep there on the first run): the rendered IMAGE has to average to the
 * profile's `color`, because that colour is what paints while the texture
 * loads and wherever the file is missing. Reporting where the mean sits on a
 * RAMP only proves a tile is internally consistent.
 */
function assertMatchesProfile(tile) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < SIZE; y += 3) {
        for (let x = 0; x < SIZE; x += 3) {
            const p = pixel(tile, x, y);
            r += p[0]; g += p[1]; b += p[2]; n++;
        }
    }
    const mean = [r / n, g / n, b / n];
    const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const off = mean.map((v, i) => v - tile.profileColor[i]);
    const worst = Math.max(...off.map(Math.abs));
    console.log(`  mean ${hex(mean)} vs profile ${hex(tile.profileColor)}`
        + `  (off by ${off.map(v => (v >= 0 ? '+' : '') + v.toFixed(0)).join('/')})`);
    if (worst > 12) {
        throw new Error(`the tile's mean colour is ${worst.toFixed(0)}/255 off the profile's `
            + '`color`. Either re-tune the tile or change the profile — but they have to '
            + 'agree, or the ground changes hue the moment the texture loads (D14).');
    }
}

/**
 * The row spacing, in world units, at the shipped `scale`. ⚑ Printed rather
 * than asserted: it is a LOOK decision, and the only way to judge it is in
 * front of the game next to a 0.5 u player.
 */
function reportSpacing(tile) {
    const dominant = tile.rows.waves[0];
    const n = Math.max(Math.abs(dominant[0]), Math.abs(dominant[1]));
    const axis = Math.abs(dominant[1]) >= Math.abs(dominant[0]) ? 'E-W' : 'N-S';
    // A 1280 px screen at 120 px/unit is 10.7 world units across.
    const repeats = 1280 / PX_PER_UNIT / SPAN_UNITS;
    console.log(`  rows: ${axis}, ${n} per tile → ${(SPAN_UNITS / n).toFixed(2)} u apart `
        + `(player is 0.5 u wide)`);
    console.log(`  tile: scale ${PROFILE_SCALE} → ${SPAN_UNITS.toFixed(2)} u across, `
        + `~${repeats.toFixed(1)} repeats on a 1280 px screen`);
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled rather than pulled from npm, and duplicated from its four
// siblings rather than shared — see the header for why.

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
    ihdr[9] = 2;    // colour type 2 = truecolour RGB, no alpha — this is GROUND
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
    let o = 0;
    for (let y = 0; y < SIZE; y++) {
        raw[o++] = 1;                       // filter 1 = Sub
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
    assertMatchesProfile(tile);
    reportSpacing(tile);
    writePng(tile, join(GROUND, tile.file));
}
