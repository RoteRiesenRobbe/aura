// Zone census: what each painted region of a zone holds, what the mob roster
// leaves unplaced, and the placement mistakes a Tiled session can make silently.
// Read-only; it never writes a file.
//
//   node scripts/zone-census.mjs              # api/zones/world.json
//   node scripts/zone-census.mjs tunnel       # any live zone by name
//   node scripts/zone-census.mjs --grid       # also a 60 u density heatmap
//
// A thing belongs to the LAST region that contains it (the region stack's
// last-wins rule, plan-region-primitive.md D0). "Hostile" means the mob's
// faction is hostileTo "aligned", i.e. it fights players.
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ZONES = path.join(ROOT, "api", "zones");

// A fire this close to a hostile spawn pulls a resting player into a fight.
export const FIRE_GAP = 12;
// Two mutually hostile factions this close fight each other unobserved
// (aggroRadius ~3 u + wanderRadius 2 u on each side, plus a margin).
export const FACTION_GAP = 14;

// ---- geometry -------------------------------------------------------------

export function inPolygon(pt, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a.y > pt.y) !== (b.y > pt.y) &&
            pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

export function area(poly) {
    let s = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
    return Math.abs(s) / 2;
}

export function centroid(poly) {
    const n = poly.length;
    return {x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n};
}

function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pathDistance(p, path) {
    const pts = path.points;
    let d = Infinity;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, segmentDistance(p, pts[i - 1], pts[i]));
    if (path.closed && pts.length > 2) d = Math.min(d, segmentDistance(p, pts[pts.length - 1], pts[0]));
    return d;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- content --------------------------------------------------------------

function readJsonTree(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...readJsonTree(p));
        else if (e.name.endsWith(".json")) out.push(JSON.parse(fs.readFileSync(p, "utf8")));
    }
    return out;
}

export function loadContent() {
    const factions = new Map(readJsonTree(path.join(ROOT, "api", "factions")).map(f => [f.name, f.hostileTo || []]));
    const mobs = new Map(readJsonTree(path.join(ROOT, "api", "mobs")).filter(m => m.name).map(m => [m.name, m]));
    const hostile = name => (factions.get(mobs.get(name)?.faction) || []).includes("aligned");
    const enemies = (a, b) => {
        const fa = mobs.get(a)?.faction, fb = mobs.get(b)?.faction;
        return (factions.get(fa) || []).includes(fb) || (factions.get(fb) || []).includes(fa);
    };
    return {factions, mobs, hostile, enemies};
}

export function loadZone(name) {
    return JSON.parse(fs.readFileSync(path.join(ZONES, name + ".json"), "utf8"));
}

// Every placement of a zone: `props` is one array per prop layer since
// plan-prop-draw-order.md P3, and the census does not care which.
export function propsOf(zone) {
    return Object.values(zone.props || {}).flat();
}

function zoneFiles(dir) {
    return fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

// Index of the owning region (last wins), or -1 for unpainted ground.
export function regionOf(pt, regions) {
    for (let i = regions.length - 1; i >= 0; i--) if (inPolygon(pt, regions[i].points)) return i;
    return -1;
}

// Why a point is not walkable, or "" when it is.
export function blockedBy(pt, zone, margin = 0) {
    for (const p of zone.structures || []) if (p.blocksMovement && inPolygon(pt, p.points)) return "structure " + p.profile;
    for (const p of zone.paths || []) if (p.blocksMovement && pathDistance(pt, p) < p.width / 2 + margin) return "path " + p.profile;
    return "";
}

// ---- report ---------------------------------------------------------------

function range(levels) {
    const l = levels.filter(v => v != null);
    if (!l.length) return "-";
    const lo = Math.min(...l), hi = Math.max(...l);
    return lo === hi ? String(lo) : `${lo}-${hi}`;
}

function census(zoneName, grid) {
    const zone = loadZone(zoneName);
    const {mobs, hostile, enemies} = loadContent();
    const regions = zone.regions || [];
    const rows = regions.map((r, i) => ({i, profile: r.profile, area: area(r.points), hostile: [], other: [], props: 0, fires: [], air: new Set()}));
    const ground = {i: -1, profile: "(unpainted)", area: 0, hostile: [], other: [], props: 0, fires: [], air: new Set()};
    const row = pt => rows[regionOf(pt, regions)] || ground;

    for (const s of zone.spawns || []) (hostile(s.mob) ? row(s).hostile : row(s).other).push(s);
    for (const p of propsOf(zone)) row(p).props++;
    for (const c of zone.bindPoints || []) row(c).fires.push(c.id);
    for (const a of zone.atmospheres || []) {
        const touched = new Set([...a.points, centroid(a.points)].map(p => regionOf(p, regions)));
        for (const t of touched) (rows[t] || ground).air.add(a.profile);
    }

    const b = zone.bounds;
    console.log(`Zone "${zone.name}"  ${b.width} x ${b.height} u  ·  ${(zone.spawns || []).length} spawns · ` +
        `${propsOf(zone).length} props · ${(zone.bindPoints || []).length} bind points · ` +
        `${regions.length} regions · ${(zone.atmospheres || []).length} atmospheres\n`);

    const table = [...rows, ground].filter(r => r.i >= 0 || r.hostile.length + r.other.length + r.props + r.fires.length > 0);
    console.log("#   region              area u²  hostile  levels  other  props  fires  atmosphere");
    for (const r of table) {
        console.log(`${String(r.i).padStart(2)}  ${r.profile.padEnd(18)}  ${String(Math.round(r.area)).padStart(7)}  ` +
            `${String(r.hostile.length).padStart(7)}  ${range(r.hostile.map(s => s.level)).padStart(6)}  ` +
            `${String(r.other.length).padStart(5)}  ${String(r.props).padStart(5)}  ${String(r.fires.length).padStart(5)}  ` +
            `${[...r.air].join(", ") || "-"}`);
    }

    console.log("\nSpecies per region (hostile, count × level range):");
    for (const r of table) {
        if (!r.hostile.length) continue;
        const by = new Map();
        for (const s of r.hostile) by.set(s.mob, [...(by.get(s.mob) || []), s.level]);
        console.log(`  ${String(r.i).padStart(2)} ${r.profile}: ` +
            [...by].map(([m, l]) => `${m} ×${l.length} (${range(l)})`).join(", "));
    }

    const hist = new Map();
    for (const s of (zone.spawns || []).filter(s => hostile(s.mob))) {
        const band = s.level == null ? "none" : `${Math.floor((s.level - 1) / 5) * 5 + 1}-${Math.floor((s.level - 1) / 5) * 5 + 5}`;
        hist.set(band, (hist.get(band) || 0) + 1);
    }
    console.log("\nHostile spawns by level band: " +
        [...hist].sort((a, b) => parseInt(a[0]) - parseInt(b[0])).map(([k, v]) => `${k}: ${v}`).join(" · "));

    // The roster left on the shelf: definitions no live zone places, with the
    // levels the debug world proved them at.
    const live = new Set(zoneFiles(ZONES).flatMap(z => (z.spawns || []).map(s => s.mob)));
    const proven = new Map();
    const debugDir = path.join(ZONES, ".debug");
    if (fs.existsSync(debugDir)) {
        for (const z of zoneFiles(debugDir)) for (const s of z.spawns || []) {
            proven.set(s.mob, new Set([...(proven.get(s.mob) || []), ...(s.level != null ? [s.level] : [])]));
        }
    }
    const shelf = [...mobs.values()].filter(m => !live.has(m.name));
    const fmt = m => `${m.name}${m.tier && m.tier !== "normal" ? " [" + m.tier + "]" : ""}` +
        (proven.has(m.name) ? ` (debug: ${[...proven.get(m.name)].sort((a, b) => a - b).join("/") || "placed"})` : "");
    console.log(`\nUnplaced in every live zone: ${shelf.length} of ${mobs.size} definitions`);
    console.log("  hostile:  " + (shelf.filter(m => hostile(m.name)).map(fmt).join(", ") || "none"));
    console.log("  other:    " + (shelf.filter(m => !hostile(m.name)).map(fmt).join(", ") || "none"));

    const warn = [];
    for (const r of rows) {
        if (!r.hostile.length) warn.push(`region ${r.i} ${r.profile}: no hostile spawns`);
        if (r.fires.length < 2) warn.push(`region ${r.i} ${r.profile}: ${r.fires.length} campfire(s)`);
        if (!r.air.size) warn.push(`region ${r.i} ${r.profile}: no atmosphere`);
    }
    for (const s of zone.spawns || []) {
        const why = blockedBy(s, zone);
        if (why) warn.push(`spawn ${s.mob} (${s.x}, ${s.y}) stands in ${why}`);
    }
    for (const c of zone.bindPoints || []) {
        const why = blockedBy(c, zone);
        if (why) warn.push(`campfire ${c.id} (${c.x}, ${c.y}) stands in ${why}`);
        for (const s of zone.spawns || []) {
            if (hostile(s.mob) && dist(c, s) < FIRE_GAP) warn.push(`campfire ${c.id}: hostile ${s.mob} ${dist(c, s).toFixed(1)} u away (< ${FIRE_GAP})`);
        }
    }
    const spawns = zone.spawns || [];
    for (let i = 0; i < spawns.length; i++) for (let j = i + 1; j < spawns.length; j++) {
        const a = spawns[i], c = spawns[j];
        if (a.mob !== c.mob && enemies(a.mob, c.mob) && dist(a, c) < FACTION_GAP) {
            warn.push(`${a.mob} (${a.x}, ${a.y}) and ${c.mob} are enemies ${dist(a, c).toFixed(1)} u apart (< ${FACTION_GAP})`);
        }
    }
    console.log(`\nWarnings: ${warn.length}`);
    for (const w of warn) console.log("  ⚑ " + w);

    if (grid) {
        const cell = 60, w = Math.ceil(b.width / cell), h = Math.ceil(b.height / cell);
        const counts = Array.from({length: h}, () => new Array(w).fill(0));
        for (const p of [...(zone.spawns || []), ...propsOf(zone)]) {
            const cx = Math.floor((p.x + b.width / 2) / cell), cy = Math.floor((p.y + b.height / 2) / cell);
            if (counts[cy] && cx >= 0 && cx < w) counts[cy][cx]++;
        }
        console.log(`\nSpawns + props per ${cell} u cell (x → east, first row = top of the map):`);
        for (const r of counts) console.log(r.map(v => String(v).padStart(5)).join(""));
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    census(args.find(a => !a.startsWith("--")) || "world", args.includes("--grid"));
}
