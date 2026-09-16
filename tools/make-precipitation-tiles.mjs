/**
 * Generates the PLACEHOLDER PARTICLE tiles for the atmosphere profiles
 * (plan-region-atmosphere.md A1 — the same "a placeholder profile and asset, I
 * can put it in the map myself" posture as the fog tile).
 *
 *     rain · snow · ash · sandstorm · fairy dust
 *
 * ⭐ Checked in as a script, not just images, exactly as `make-fog-tile.mjs` and
 * `make-water-tile.mjs` are and for the same reason: a placeholder's whole job
 * is to be re-tuned. Change a constant, re-run, look at it again. The committed
 * PNGs are exactly what this produces.
 *
 * ⭐ ONE script for the whole family, because every tile here is the SAME
 * primitive — discrete marks scattered once and rasterised with wrapping — and
 * they differ only in the constant block at {@link TILES}. Adding weather is
 * adding a block. ⚑ The sibling generator `make-fog-tile.mjs` owns the OTHER
 * family, DENSITY FIELDS (fog, miasma): a wave sum covering every pixel, with a
 * contrast curve deciding where the banks are. The split is what the air IS,
 * and it is the line to think along before adding to either.
 *
 * ⭐ PARTICLES ARE MOSTLY EMPTY TILES, which is the whole difference from a
 * density field and the reason {@link reportCoverage} hard-fails: a
 * precipitation tile that covers most of its pixels has stopped being weather
 * and become a wash — which is what the fog family already is, drawn better.
 *
 * ⚑ RGBA, like the fog tile and unlike every ground tile. `haze` applies ONE
 * opacity to the whole painted surface, so the tile's own alpha is what carries
 * the empty air between the marks.
 *
 * ⭐ SEAMLESS BY CONSTRUCTION: every particle is rasterised through modular
 * indexing, so a mark hanging off the right edge draws its remainder at the
 * left. That makes the image exactly periodic no matter where the particles
 * landed — there is no placement rule to get wrong, unlike the fog tile's
 * integer wave numbers. {@link assertSeamless} is what pins that the rasteriser
 * still WRAPS rather than clamps or clips.
 *
 * ⚑ DETERMINISTIC, but not RNG-free the way the fog tile is: particles need
 * scattered positions, and a fixed-seed LCG is the honest way to get them.
 * `Math.random` appears nowhere — re-running this produces the same bytes.
 * ⛔ Which means the DRAW ORDER inside {@link drawStreaks} and {@link drawDots}
 * is load-bearing: adding a `span()` call, or reordering two, re-rolls every
 * particle in every tile and changes five committed PNGs. Derive from a value
 * already drawn (as `alpha` does from size) rather than drawing again.
 *
 * ⚑ 750 × 750 to match the CC0 pack, so `scale: 0.35` means the same amount of
 * world here as for every other tile. At that scale 1 tile px = 0.35 world px
 * and the world is 120 px to the unit, so a 100 px streak is ~0.29 world units
 * against a 20 × 12 unit screen.
 *
 * Usage: node tools/make-precipitation-tiles.mjs
 */
import {deflateSync} from 'node:zlib';
import {writeFileSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const SIZE = 750;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GROUND = join(ROOT, 'frontend/src/features/regions/assets/ground');
const PROFILES = join(ROOT, 'frontend/src/client-data/atmosphere-profiles.json');

/* ---- the tiles ----------------------------------------------------------- */

// ⚑ EVERY NUMBER in this table is [PLACEHOLDER], like every number a profile
// carries. They are the look sitting's starting point, not a decision.
//
// ⚑ `tint` must match its profile's `color`, which is D14's fallback: with the
// tile missing the profile paints a flat wash of that colour, and a mismatch
// means the air changes hue the moment the texture lands.
//
// ⭐ `leanFrom` names the profile whose `scroll` sets the streak angle. Read
// rather than restated, because a streak drawn along any axis but the drift
// reads as weather SLIDING across the screen instead of falling — and a
// hand-copied angle stops matching the first time the drift is re-tuned.

const TILES = [
    {
        // Round dots, alpha riding size. ⚑ No arms: a six-armed crystal at ~9
        // world px across is 3 px on a 1× screen, where every arm is sub-pixel
        // and the flake just reads as a dimmer, muddier dot.
        file: 'snow-placeholder.png',
        tint: [0xf2, 0xf7, 0xfd],       // near-white, faintly cool
        seed: 0x5e11,
        dots: {count: 320, minR: 4, maxR: 13, minA: 0.35, maxA: 1.00},
    },
    {
        file: 'rain-placeholder.png',
        tint: [0x9f, 0xb4, 0xc8],       // pale cool blue-grey
        seed: 0x4a17,
        leanFrom: 'Rain',
        streaks: {count: 130, minL: 70, maxL: 140, minW: 2.0, maxW: 3.6,
            minA: 0.30, maxA: 0.90},
    },
    {
        // ⭐ Ash is SNOW'S OPPOSITE at the same size: finer, denser, dimmer, and
        // warm-grey rather than cool-white. Mid-grey on purpose rather than the
        // near-black of real ash — it has to read against BOTH the Volcano
        // profile's near-black and the Ashen Fields red it will sit over.
        file: 'ash-placeholder.png',
        tint: [0x7d, 0x75, 0x70],       // warm mid-grey
        seed: 0x4a58,
        dots: {count: 500, minR: 2.5, maxR: 11, minA: 0.22, maxA: 0.95},
    },
    {
        // ⭐ The ONLY tile drawing BOTH primitives, and it needs both: long
        // near-horizontal streaks are the DRIVEN air, the fine dots are the
        // GRIT being carried in it. Streaks alone read as motion blur on the
        // lens; dots alone read as a dirty screen.
        //
        // ⛔ THE FIRST DRAFT WAS INVISIBLE, and the fix taught the sharper
        // lesson of the two. A sandstorm sits over `Desert` (#dd9a4e) and
        // `Wasteland` (#9a682f), and the draft's tan tile on tan ground read as
        // a faint grain on sand — nothing. The instinct was to fix it on BOTH
        // axes at once: go pale AND roughly triple the counts. That tripped
        // {@link MAX_COVERAGE} at 56.8 % — correctly, because it had stopped
        // being particles and become a wash.
        //
        // ⭐ The ceiling was the right thing to obey rather than raise: backing
        // the counts down to ~1.5× the draft and keeping ONLY the tint change
        // reads fine. ⚑ THE TINT WAS ALWAYS THE WHOLE PROBLEM — density was
        // never the reason it could not be seen, and adding density to fix a
        // CONTRAST fault just walks a tile toward the other family.
        file: 'sand-storm-placeholder.png',
        tint: [0xec, 0xdc, 0xb4],       // pale dust — LIGHTER than the sand
        seed: 0x5a2d,
        leanFrom: 'Sandstorm',
        streaks: {count: 260, minL: 90, maxL: 210, minW: 2.0, maxW: 4.0,
            minA: 0.35, maxA: 0.90},
        dots: {count: 900, minR: 1.5, maxR: 4.0, minA: 0.25, maxA: 0.70},
    },
    {
        // ⭐ Sparse, bright cores in wide dim halos — the closest this system
        // gets to "glowing", and it is NOT glowing: see `halo` below and the
        // ⛔ in the profile table. Sparse on purpose, because a mote is a thing
        // you can pick out individually and 300 of them is a snowfall.
        // ⛔ GOLD, NOT VIOLET, and that is the second lesson this family taught.
        // The obvious tint for fairy light is a pale violet-white — and it was
        // very nearly invisible, because `Magic Forest` is #6a52d4 and pale
        // violet on violet has almost no contrast at any `haze` worth using.
        // Warm gold is the COMPLEMENT of that purple, so the motes read at a
        // glance, and it lands on fireflies and will-o'-the-wisps rather than
        // on generic sparkle — a better place to be anyway.
        //
        // ⚑ THE GENERAL RULE, which cost two of the five tiles a re-tune: pick
        // the tint against THE GROUND THE AIR WILL SIT OVER, never in the
        // abstract. Snow-white over green works; sand over sand does not.
        file: 'fairy-placeholder.png',
        tint: [0xff, 0xe7, 0xa3],       // warm gold
        seed: 0x7a1e,
        // ⛔ FEWER AND BIGGER, after a second look. The draft used 170 motes of
        // radius 2-5, which at `scale: 0.35` is under 2 world px of core — too
        // small to resolve as anything, so all that reached the eye was the
        // halo and the tile read as grubby speckle. A mote has to be a thing
        // you can SEE, and there is no point lighting a core nobody can find.
        // ⚑ Count came down with size, and had to: a halo is ~3× its core, so
        // area grows fast enough that holding the count would have walked
        // straight past {@link MAX_COVERAGE}, the same trap the sandstorm hit.
        dots: {count: 90, minR: 5, maxR: 12, minA: 0.65, maxA: 1.00,
            // ⭐ THE HALO IS THE WHOLE TRICK. A bare dot is a pixel; a bright
            // core inside a much wider, much fainter disc is what the eye reads
            // as a light source, even though nothing here emits anything and
            // the darkness layer above is untouched by all of it.
            halo: {scale: 2.8, alpha: 0.30}},
    },
];

/* ---- deterministic scatter ----------------------------------------------- */

/**
 * A fixed-seed LCG (Numerical Recipes constants). Deliberately NOT
 * `Math.random`: the committed PNGs have to be reproducible from this file
 * alone, and a re-tune has to change only what the tuner meant to change.
 */
function rng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** `lo … hi`, from one draw. */
const span = (r, lo, hi) => lo + (hi - lo) * r();

/** Where a particle sits in its own size range, 0 … 1 — the depth cue every
 *  block below rides its alpha on. A big near mark reads solid, a small far one
 *  faint; without it a tile is a field of identical marks and looks like a
 *  pattern swatch. ⚑ DERIVED, never drawn: see the header's draw-order note. */
const near = (v, lo, hi) => (hi > lo ? (v - lo) / (hi - lo) : 1);

/* ---- the canvas ---------------------------------------------------------- */

/** An alpha buffer the particles accumulate into, 0 … 1 per pixel. */
function canvas() {
    return new Float64Array(SIZE * SIZE);
}

/**
 * Writes one pixel of one particle.
 *
 * ⭐ Particles composite by MAX, not by sum. Every mark is the same colour, so
 * two overlapping drops are still one drop's worth of water — adding them would
 * put bright knots wherever the scatter happened to pile up, which reads as a
 * texture defect rather than as heavy rain. The knob for "heavier" is the
 * particle COUNT and the profile's `haze`, never an overlap artefact. ⚑ It is
 * also what lets a fairy mote's core sit inside its own halo without the two
 * summing into a blown-out blob.
 *
 * ⭐ And this is THE WRAP. Every write goes through here, which is what makes
 * the tile periodic regardless of where a particle sits — see the header.
 */
function stamp(buf, x, y, a) {
    if (a <= 0) { return; }
    const ix = ((Math.round(x) % SIZE) + SIZE) % SIZE;
    const iy = ((Math.round(y) % SIZE) + SIZE) % SIZE;
    const i = iy * SIZE + ix;
    if (a > buf[i]) { buf[i] = a; }
}

/** Smooth 0→1 over `EDGE` px, so a mark has an anti-aliased rim instead of a
 *  staircase. Deliberately wider than one pixel: these marks are small, and a
 *  one-pixel rim reads as pixel noise at the size they are drawn. */
const EDGE = 1.6;
function falloff(dist, radius) {
    if (dist >= radius) { return 0; }
    if (dist <= radius - EDGE) { return 1; }
    const t = (radius - dist) / EDGE;
    return t * t * (3 - 2 * t);
}

/* ---- dots ---------------------------------------------------------------- */

/** A soft round disc, optionally inside a wider faint halo. */
function disc(buf, cx, cy, radius, alpha, ox, oy) {
    const reach = Math.ceil(radius) + 1;
    for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
            stamp(buf, cx + dx + ox, cy + dy + oy,
                alpha * falloff(Math.hypot(dx, dy), radius));
        }
    }
}

/** ⛔ Draw order per particle is cx, cy, radius — see the header. */
function drawDots(buf, ox, oy, r, spec) {
    for (let n = 0; n < spec.count; n++) {
        const cx = span(r, 0, SIZE);
        const cy = span(r, 0, SIZE);
        const radius = span(r, spec.minR, spec.maxR);
        const alpha = spec.minA
            + (spec.maxA - spec.minA) * near(radius, spec.minR, spec.maxR);
        // Halo first, core second: MAX compositing means the core wins its own
        // pixels and the halo keeps everything outside them.
        if (spec.halo) {
            disc(buf, cx, cy, radius * spec.halo.scale, alpha * spec.halo.alpha, ox, oy);
        }
        disc(buf, cx, cy, radius, alpha, ox, oy);
    }
}

/* ---- streaks ------------------------------------------------------------- */

/**
 * The lean, DERIVED from the named profile's own `scroll`.
 *
 * ⛔ Hard-fails rather than guessing: a missing profile means someone renamed
 * it, and a vertical fallback would quietly draw the wrong tile.
 */
function leanOf(profileName) {
    const table = JSON.parse(readFileSync(PROFILES, 'utf8'));
    const scroll = table[profileName] && table[profileName].scroll;
    const len = scroll ? Math.hypot(scroll.x, scroll.y) : 0;
    if (!(len > 0)) {
        throw new Error(`atmosphere-profiles.json has no \`${profileName}\` `
            + 'profile with a non-zero `scroll` — the streak lean is derived '
            + 'from it, so there is nothing to draw along.');
    }
    return {x: scroll.x / len, y: scroll.y / len};
}

/** Distance from a point to a segment — a streak is a capsule. */
function distToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0
        ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
        : 0;
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * A capsule drawn along the drift direction, fading along its own length.
 *
 * ⚑ The taper is what separates weather from a scratch on the lens: a uniform
 * capsule reads as a defect, a tapered one as something moving fast enough to
 * smear. Brightest at the LEADING end, which is where the drop actually is.
 *
 * ⛔ Draw order per particle is length, width, bx, by — see the header.
 */
function drawStreaks(buf, ox, oy, r, spec, dir) {
    for (let n = 0; n < spec.count; n++) {
        const length = span(r, spec.minL, spec.maxL);
        const width = span(r, spec.minW, spec.maxW);
        const alpha = spec.minA
            + (spec.maxA - spec.minA) * near(length, spec.minL, spec.maxL);
        // The leading end; the tail trails back UP the drift direction.
        const bx = span(r, 0, SIZE), by = span(r, 0, SIZE);
        const ax = bx - dir.x * length, ay = by - dir.y * length;

        const loX = Math.floor(Math.min(ax, bx) - width - 2);
        const hiX = Math.ceil(Math.max(ax, bx) + width + 2);
        const loY = Math.floor(Math.min(ay, by) - width - 2);
        const hiY = Math.ceil(Math.max(ay, by) + width + 2);
        for (let y = loY; y <= hiY; y++) {
            for (let x = loX; x <= hiX; x++) {
                const d = distToSegment(x, y, ax, ay, bx, by);
                if (d >= width) { continue; }
                // How far along the streak this pixel sits, 0 at the tail.
                const along = Math.min(1, Math.max(0,
                    ((x - ax) * dir.x + (y - ay) * dir.y) / length));
                const taper = 0.25 + 0.75 * along;
                stamp(buf, x + ox, y + oy, alpha * taper * falloff(d, width));
            }
        }
    }
}

/* ---- one tile ------------------------------------------------------------ */

/**
 * ⛔ Streaks BEFORE dots, always. Both orders look the same under MAX
 * compositing, but they consume the shared RNG in different orders, so swapping
 * them re-rolls every particle in the sandstorm tile.
 */
function drawTile(tile, dir) {
    return (buf, ox, oy) => {
        const r = rng(tile.seed);
        if (tile.streaks) { drawStreaks(buf, ox, oy, r, tile.streaks, dir); }
        if (tile.dots) { drawDots(buf, ox, oy, r, tile.dots); }
    };
}

/* ---- checks -------------------------------------------------------------- */

/**
 * Proves the rasteriser WRAPS instead of clamping or clipping: shifting every
 * particle by a whole tile must change nothing.
 *
 * ⚑ Honest about its own reach. Because {@link stamp} indexes modularly the
 * image is periodic by construction, so this cannot fail while the wrap is
 * there — which is exactly the point. It is a regression pin on the wrap, the
 * one thing a later "optimisation" would take out: a bounding-box clip that
 * skips off-tile pixels looks harmless and puts a hard grid line at every tile
 * boundary, drifting across the screen because this air scrolls.
 *
 * ⛔ It does NOT prove the tile looks like weather. Nothing here can; that is
 * what the look sitting is for.
 *
 * ⭐ IT DID FIRE ON ITS FIRST RUN, and the fix is why every draw function takes
 * the offset all the way down to the {@link stamp} call instead of adding it to
 * the particle up front. Shifting a float position by 750 and then doing
 * distance arithmetic on it loses the low bits, so the rain came out different
 * by ~1e-16 — invisible in the PNG, which rounds to bytes, and an exact
 * mismatch here. ⚑ The tempting fix is an epsilon in the comparison; the right
 * one is to keep the offset OUT of the geometry entirely, so the shift is a
 * placement change and nothing else. Snow only passed by luck: its falloff is
 * computed from integer `dx`/`dy`, which never saw the offset at all.
 */
function assertSeamless(draw) {
    const base = canvas();
    draw(base, 0, 0);
    for (const [dx, dy] of [[SIZE, 0], [0, SIZE], [-SIZE, -SIZE]]) {
        const shifted = canvas();
        draw(shifted, dx, dy);
        for (let i = 0; i < base.length; i++) {
            if (base[i] !== shifted[i]) {
                throw new Error('NOT seamless: shifting every particle by '
                    + `(${dx}, ${dy}) — whole tiles — changed pixel ${i}. `
                    + 'The rasteriser is no longer wrapping.');
            }
        }
    }
    console.log('  seam: exact — a whole-tile shift is byte-identical');
    return base;
}

/**
 * Reports how much of the tile the particles actually cover.
 *
 * ⭐ THE number for this family, and the reason it hard-fails. Particles are
 * marks on empty air: past roughly half the tile they have merged and the
 * result is a flat wash with speckle in it — which is the fog family's job. If
 * a re-tune trips this, the fix is fewer or smaller particles, not a higher
 * ceiling. ⚑ Fairy dust runs the highest of the five because a halo is 3.5×
 * the radius it surrounds, so 150 motes cover far more tile than their cores
 * suggest.
 */
const MAX_COVERAGE = 0.5;
function reportCoverage(buf, name) {
    let hit = 0, total = 0, max = 0;
    for (let i = 0; i < buf.length; i++) {
        if (buf[i] > 0) { hit++; }
        total += buf[i];
        max = Math.max(max, buf[i]);
    }
    const coverage = hit / buf.length;
    console.log(`  coverage ${(coverage * 100).toFixed(1)}%  `
        + `mean alpha ${(total / buf.length).toFixed(3)}  peak ${max.toFixed(3)}`);
    if (coverage > MAX_COVERAGE) {
        throw new Error(`${name} covers ${(coverage * 100).toFixed(1)}% of the `
            + `tile (ceiling ${MAX_COVERAGE * 100}%) — that is a wash, not `
            + 'weather. Reduce `count` or the particle size.');
    }
}

/* ---- a minimal PNG writer ------------------------------------------------ */
// Hand-rolled rather than pulled from npm, verbatim the argument
// make-water-tile.mjs and make-fog-tile.mjs both make: these scripts run once
// in a blue moon, and a build-time dependency for a placeholder is not a trade
// worth making.
//
// ⚑ This is the THIRD copy of the writer in tools/. Extracting it means editing
// two byte-pinned generators, so it is offered rather than done here — but a
// FOURTH copy is the point to stop and extract.

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

function writePng(buf, tint, out) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(SIZE, 0);
    ihdr.writeUInt32BE(SIZE, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 6;    // colour type 6 = truecolour RGB + ALPHA (the water tile is 2)
    ihdr[10] = 0;   // deflate
    ihdr[11] = 0;   // adaptive filtering
    ihdr[12] = 0;   // no interlace

    // Scanlines, each prefixed with its filter byte. Filter 1 (Sub) predicts
    // each pixel from its left neighbour — near-zero residuals across the long
    // empty stretches between particles, which is most of these tiles.
    const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
    let o = 0;
    for (let y = 0; y < SIZE; y++) {
        raw[o++] = 1;
        let prev = [0, 0, 0, 0];
        for (let x = 0; x < SIZE; x++) {
            // ⭐ The tint is written at FULL strength everywhere, including where
            // alpha is 0. A transparent pixel carrying black RGB bleeds dark
            // fringes the moment the GPU filters the tile at anything but 1:1 —
            // and `scale` is 0.35, so it would show on every single mark. The
            // fog tile can lift its tint with density because it is opaque
            // everywhere; this family is not, so the colour must stay flat.
            const rgba = [tint[0], tint[1], tint[2], Math.round(255 * buf[y * SIZE + x])];
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
    console.log(`  wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
}

/* ---- go ------------------------------------------------------------------ */

for (const tile of TILES) {
    const name = tile.file.replace('-placeholder.png', '');
    console.log(name);
    let dir = {x: 0, y: 1};
    if (tile.leanFrom) {
        dir = leanOf(tile.leanFrom);
        console.log(`  lean ${(Math.atan2(dir.x, dir.y) * 180 / Math.PI).toFixed(1)}°`
            + ` off vertical, from \`${tile.leanFrom}\`'s scroll`);
    }
    const buf = assertSeamless(drawTile(tile, dir));
    reportCoverage(buf, name);
    writePng(buf, tile.tint, join(GROUND, tile.file));
}
