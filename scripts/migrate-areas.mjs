// One-off (plan-prop-draw-order.md P4c, D16): move world.json into `areas`,
// one area per titled region, everything inside a region going with it.
//
//   node scripts/migrate-areas.mjs [--dry-run] [--margin <units>] [api/zones/world.json]
//
// The rules, all D16's:
// - Each titled region goes into its area (D15's id table below), in region
//   file order; Saltgrass Strand goes into `farmlands` (PO 2026-10-03). Areas
//   are ordered by their first region.
// - Every other object goes to the area of the titled region containing it,
//   by the game's own lookup (the LAST containing region wins): a point by its
//   position, a shape only when ALL its vertices land in one area. Anything
//   else stays at the zone level (D11: what spans areas is the floor).
// - ⭐ ORDER-PRESERVING. The game flattens areas back zone level first, then
//   area by area (D11), so a move can reorder two objects of one kind. Where
//   two such objects OVERLAP (their drawn footprints, padded by --margin for
//   feathered edges), the earlier one stays at the zone level instead, until
//   no overlapping pair is reordered. The game then draws and resolves
//   exactly as before. A titled REGION is never demoted: a reordered region
//   overlap refuses the run (D16 measured none), and one that only touches
//   within the margin is listed as a seam notice.
//
// All or nothing, canonical input only (the migrate-prop-layers.mjs posture):
// the file must already be in the converter's serialized form and carry no
// `areas`, so the output is exactly what Tiled would write.
//
// ⚑ Kept as the record of what went where. Once world.json has areas it
// refuses (`areas` present).
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../tools/tiled/extensions/aura-zone/aura-convert.js');

// D15's table: a titled region's title -> its area id.
const AREA_OF_TITLE = {
    'Farmlands': 'farmlands',
    'Saltgrass Strand': 'farmlands',
    'Brackenfold Meadows': 'brackenfold',
    'Deep Woods': 'deep-woods',
    'Southgate Sprawl': 'southgate',
    'The Umberwood': 'umberwood',
    'Brunnstedt': 'brunnstedt',
    'Fort Grimwatch': 'grimwatch',
    'The Ashen Fields': 'ashen-fields',
    'The Cinder Conclave': 'cinder-conclave',
    "Wrecker's Bluff": 'wreckers-bluff',
    'The Greyspine': 'greyspine',
    "Netmender's Coast": 'netmenders-coast',
    'Northgate Commons': 'northgate',
    'Sorrowfen': 'sorrowfen',
    'The Sunscar': 'sunscar',
    'The Fallow Reach': 'fallow-reach',
    'The Glimmerwood': 'glimmerwood',
    'Rimefrost': 'rimefrost',
    'Hollow Marsh': 'hollow-marsh',
    'Moonveil Grove': 'moonveil',
    'The Witherwood': 'witherwood',
    'Mount Wyrmhold': 'wyrmhold',
};

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const mi = args.indexOf('--margin');
// A drawn edge's feather and wander, in world units, on each side. Generous on
// purpose: a pad too wide only keeps more at the zone level.
const MARGIN = mi >= 0 ? Number(args[mi + 1]) : 3;
const FILE = args.filter((a, i) => !a.startsWith('--') && (mi < 0 || i !== mi + 1))[0] || 'api/zones/world.json';
const ROOT = new URL('..', import.meta.url);

function die(msg) {
    console.error('migrate-areas: ' + msg);
    process.exit(1);
}

const text = readFileSync(FILE, 'utf8');
const zone = JSON.parse(text);
const newline = text.endsWith('\n');
if (zone.areas) { die(`${FILE} already has areas (already migrated?)`); }
if (C.serializeZone(zone, newline) !== text) {
    die(`${FILE} is not in the converter's serialized form; open and save it in Tiled first`);
}
const listed = JSON.parse(readFileSync(new URL('api/areas/areas.json', ROOT), 'utf8')).areas;
for (const [title, id] of Object.entries(AREA_OF_TITLE)) {
    if (!listed.includes(id)) { die(`"${title}" maps to "${id}", which api/areas/areas.json does not list`); }
}

/* ---- geometry ------------------------------------------------------------ */

function inPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) { inside = !inside; }
    }
    return inside;
}
function pointSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function cross(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
function properCross(a, b, c, d) {
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function segSeg(a, b, c, d) {
    if (properCross(a, b, c, d)) { return 0; }
    return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}
// A footprint's boundary as segments (a lone point is one degenerate segment).
function segments(f) {
    const p = f.pts, out = [];
    if (p.length === 1) { return [[p[0], p[0]]]; }
    for (let i = 0; i + 1 < p.length; i++) { out.push([p[i], p[i + 1]]); }
    if (f.filled || f.closed) { out.push([p[p.length - 1], p[0]]); }
    return out;
}
function strictlyInside(v, f) {
    return f.filled && inPoly(v, f.pts) && segments(f).every(([a, b]) => pointSeg(v, a, b) > 1e-6);
}
// Do two footprints share area? `pad` widens each boundary; a filled shape
// also covers its inside. Touching exactly (a shared border, pads 0) is not
// overlap: nothing there resolves or draws differently.
function overlaps(A, B, padded = true) {
    if (A.pts.some(v => strictlyInside(v, B)) || B.pts.some(v => strictlyInside(v, A))) { return true; }
    const reach = padded ? A.pad + B.pad : 0;
    const sa = segments(A), sb = segments(B);
    for (const [a, b] of sa) {
        for (const [c, d] of sb) {
            const dist = segSeg(a, b, c, d);
            if (dist === 0 && properCross(a, b, c, d)) { return true; }
            if (padded && dist < reach) { return true; }
        }
    }
    return false;
}

/* ---- footprints, per kind ------------------------------------------------ */

const propBody = {};
for (const f of require('node:fs').readdirSync(new URL('api/props/', ROOT))) {
    const d = JSON.parse(readFileSync(new URL('api/props/' + f, ROOT), 'utf8'));
    const b = d.body || {};
    propBody[d.name] = b.radius ? b.radius : Math.hypot(b.width || 1, b.height || 1) / 2;
}

const pt = (x, y) => [{x, y}];
const FOOTPRINT = {
    decals: d => ({pts: pt(d.x, d.y), pad: d.size * Math.SQRT2}),
    props: p => ({pts: pt(p.x, p.y), pad: (propBody[p.type] || 1) * (p.scale || 1)}),
    spawns: s => ({pts: pt(s.x, s.y), pad: 0}),
    bindPoints: b => ({pts: pt(b.x, b.y), pad: 1}),
    darkAreas: d => ({pts: pt(d.x, d.y), pad: d.radius + MARGIN}),
    regions: r => ({pts: r.points, filled: true, pad: MARGIN}),
    paths: p => ({pts: p.points, closed: !!p.closed, pad: p.width / 2 + (p.outlineWidth || 0) + MARGIN}),
    structures: s => ({pts: s.points, filled: true, pad: (s.outlineWidth || 0) + MARGIN}),
    atmospheres: a => ({pts: a.points, filled: true, pad: MARGIN}),
    clearings: c => ({pts: c.points, filled: true, pad: MARGIN}),
    anchors: a => ({pts: pt(a.x, a.y), pad: 0}),
};
const vertices = (kind, o) => (FOOTPRINT[kind](o).pts.length > 1 ? o.points : [{x: o.x, y: o.y}]);

/* ---- membership ---------------------------------------------------------- */

const titled = zone.regions.map((r, i) => ({r, i})).filter(({r}) => r.title);
for (const {r} of titled) {
    if (!AREA_OF_TITLE[r.title]) { die(`titled region "${r.title}" has no area in the table`); }
}
// The game's lookup: the LAST containing region wins (regions resolve in file
// order). An untitled region that contains the point hides the titled one.
function areaAt(p) {
    for (let i = zone.regions.length - 1; i >= 0; i--) {
        if (inPoly(p, zone.regions[i].points)) {
            return zone.regions[i].title ? AREA_OF_TITLE[zone.regions[i].title] : '';
        }
    }
    return '';
}
function areaOf(kind, o) {
    if (kind === 'regions') { return o.title ? AREA_OF_TITLE[o.title] : ''; }
    const ids = new Set(vertices(kind, o).map(areaAt));
    return ids.size === 1 ? [...ids][0] : '';
}

// Area order: by each area's first titled region.
const AREAS = [];
for (const {r} of titled) {
    const id = AREA_OF_TITLE[r.title];
    if (!AREAS.includes(id)) { AREAS.push(id); }
}
const rank = id => (id === '' ? -1 : AREAS.indexOf(id));

/* ---- order preservation -------------------------------------------------- */

// One ordered list (a kind, or one prop layer): returns each item's area,
// demoting until no overlapping pair is reordered, plus the demotions made.
function settle(kind, list, label) {
    const fp = list.map(o => FOOTPRINT[kind](o));
    const area = list.map(o => areaOf(kind, o));
    const pairs = [];
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            if (overlaps(fp[i], fp[j])) { pairs.push([i, j]); }
        }
    }
    const demoted = [], seams = [];
    for (;;) {
        // Reordered: i was before j, and now flattens after it.
        const flip = pairs.find(([i, j]) => rank(area[i]) > rank(area[j]));
        if (!flip) { break; }
        const [i, j] = flip;
        if (kind === 'regions') {
            if (overlaps(fp[i], fp[j], false)) {
                die(`regions ${i} "${list[i].title}" and ${j} "${list[j].title}" overlap and would swap; ` +
                    'a titled region is never demoted, so D16 needs revisiting');
            }
            const near = closest(fp[i], fp[j]);
            seams.push(`${label} ${i} "${list[i].title}" and ${j} "${list[j].title}" swap draw order; they ` +
                `come within ${near.d.toFixed(2)}u near (${near.x.toFixed(1)}, ${near.y.toFixed(1)}), so their ` +
                'feathered edges may meet there (the lookup is unchanged: they do not overlap)');
            pairs.splice(pairs.indexOf(flip), 1);
            continue;
        }
        demoted.push(`${label} ${i} (${describe(kind, list[i])}) stays at the zone level: it overlaps ` +
            `${label} ${j}, and moving it to "${area[i]}" would put it after that one`);
        area[i] = '';
    }
    return {area, demoted, seams};
}
// The closest approach of two outlines: distance and where.
function closest(A, B) {
    let best = {d: Infinity, x: 0, y: 0};
    for (const [P, Q] of [[A, B], [B, A]]) {
        for (const v of P.pts) {
            for (const [a, b] of segments(Q)) {
                const d = pointSeg(v, a, b);
                if (d < best.d) { best = {d, x: v.x, y: v.y}; }
            }
        }
    }
    return best;
}
function describe(kind, o) {
    return o.title || o.type || o.mob || o.profile || o.name || o.id || kind;
}

/* ---- run ----------------------------------------------------------------- */

const out = {areas: AREAS.map(id => ({id}))};
const zoneLevel = {};
const notices = [], counts = {}, left = [];
const KINDS = C.OBJECT_KINDS;
for (const kind of KINDS) {
    if (kind === 'props') { continue; }
    const list = zone[kind];
    if (!list) { continue; }
    const {area, demoted, seams} = settle(kind, list, kind);
    notices.push(...demoted, ...seams);
    zoneLevel[kind] = list.filter((_, i) => area[i] === '');
    list.forEach((o, i) => { if (area[i] === '') { left.push(`${kind} ${i}: ${describe(kind, o)}`); } });
    out.areas.forEach(a => {
        const mine = list.filter((_, i) => area[i] === a.id);
        if (mine.length > 0) { a[kind] = mine; }
    });
    counts[kind] = `${list.length - zoneLevel[kind].length}/${list.length} into areas`;
}
zoneLevel.props = {};
for (const layer of C.PROP_LAYERS) {
    const list = zone.props[layer] || [];
    const {area, demoted} = settle('props', list, 'props.' + layer);
    notices.push(...demoted);
    zoneLevel.props[layer] = list.filter((_, i) => area[i] === '');
    list.forEach((o, i) => { if (area[i] === '') { left.push(`props.${layer} ${i}: ${o.type}`); } });
    out.areas.forEach(a => {
        const mine = list.filter((_, i) => area[i] === a.id);
        if (mine.length > 0) { (a.props = a.props || {})[layer] = mine; }
    });
    counts['props.' + layer] = `${list.length - zoneLevel.props[layer].length}/${list.length} into areas`;
}

// The migrated zone: every key as before, the leftovers at the zone level.
const migrated = {};
for (const k of Object.keys(zone)) { migrated[k] = k in zoneLevel ? zoneLevel[k] : zone[k]; }
migrated.areas = out.areas;

/* ---- self-check: lossless, and no overlapping pair reordered ------------- */

// D11's flatten, as zone.go and ZoneAreas.ts do it.
function flatten(z) {
    const parts = [z, ...(z.areas || [])];
    const flat = {};
    for (const kind of KINDS) {
        if (kind === 'props') {
            flat.props = {};
            for (const layer of C.PROP_LAYERS) {
                flat.props[layer] = parts.flatMap(p => (p.props && p.props[layer]) || []);
            }
        } else {
            flat[kind] = parts.flatMap(p => p[kind] || []);
        }
    }
    return flat;
}
const back = flatten(JSON.parse(C.serializeZone(migrated, newline)));
function checkOrder(kind, before, after, label) {
    const key = o => JSON.stringify(o);
    if (before.length !== after.length) { die(`${label}: ${before.length} objects became ${after.length}`); }
    const pos = new Map();
    after.forEach((o, n) => pos.set(key(o) + '#' + after.slice(0, n).filter(x => key(x) === key(o)).length, n));
    const at = before.map((o, n) => pos.get(key(o) + '#' + before.slice(0, n).filter(x => key(x) === key(o)).length));
    if (at.some(n => n === undefined)) { die(`${label}: an object changed or vanished on the way through`); }
    const fp = before.map(o => FOOTPRINT[kind](o));
    for (let i = 0; i < before.length; i++) {
        for (let j = i + 1; j < before.length; j++) {
            if (at[i] > at[j] && overlaps(fp[i], fp[j], kind !== 'regions')) {
                die(`${label} ${i} and ${j} overlap and were reordered`);
            }
        }
    }
}
for (const kind of KINDS) {
    if (kind === 'props') {
        for (const layer of C.PROP_LAYERS) {
            checkOrder('props', zone.props[layer] || [], back.props[layer], 'props.' + layer);
        }
    } else {
        checkOrder(kind, zone[kind] || [], back[kind], kind);
    }
}

console.log(`${FILE}: ${AREAS.length} areas (margin ${MARGIN}u)`);
for (const [k, v] of Object.entries(counts)) { console.log(`  ${k.padEnd(18)} ${v}`); }
console.log(`\nLeft at the zone level (${left.length}, by index in the original file; spanning areas, ` +
    'outside every titled region, or kept for order):');
left.forEach(l => console.log('  ' + l));
if (notices.length > 0) {
    console.log(`\nOrder notices (${notices.length}):`);
    notices.forEach(n => console.log('  ' + n));
}
if (DRY) {
    console.log('\n--dry-run: nothing written');
} else {
    writeFileSync(FILE, C.serializeZone(migrated, newline));
    console.log(`\nwrote ${FILE}`);
}
