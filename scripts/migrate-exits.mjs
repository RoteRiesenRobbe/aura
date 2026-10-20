// One-off migrations of the talk exits (plan-passages.md), safe to run again:
//
//   node scripts/migrate-exits.mjs api/zones/*.json api/zones/.debug/*.json
//
// P1 (D11): every CaveMouth / CaveExit spawn (zone level or inside an area)
// becomes an exit of the same group, in the order met, written right after
// `spawns` (zone.go's Objects order). An area left with no spawns loses the
// key (an area writes no empty array); the zone level keeps `spawns: []`.
//
// P3b (D12): an exit's look also picks its words, `hidden` is a toggle, and
// `door` is `conversation`. So an exit that still says `door: "CaveExit"`
// (the upward cave exits) drops it and takes the `cave-exit` look where it
// had the Q7 placeholder `stairs-up`; any other `door` is renamed; a
// `look: "hidden"` becomes `hidden: true` with the default look. A door spawn
// migrates straight to that shape: `cave-exit` going up, `hidden` where a
// CaveMouth PROP already draws the hole (within its half width).
//
// ⛔ LOSSLESS OR NOTHING: a door spawn carrying anything an exit cannot hold
// (an angle, a route, a level, no anchor) refuses, and one refusal writes no
// file at all. ⚑ IDEMPOTENT: a file with nothing to move is left alone.
import {readFileSync, writeFileSync} from 'node:fs';

const DOORS = ['CaveMouth', 'CaveExit'];
const SHARED = 'CaveMouth'; // world.SharedConversation
const EXIT_KEYS = ['mob', 'x', 'y', 'angle', 'anchor'];
// D11a: a CaveMouth prop this close already draws the hole (half its 3 u body).
const PROP_REACH = 1.5;
// zone.go's Exit key order.
const EXIT_ORDER = ['id', 'x', 'y', 'rotation', 'anchor', 'look', 'hidden', 'conversation'];

const failures = [];
const outputs = [];

function ordered(e) {
    const out = {};
    for (const k of EXIT_ORDER) { if (e[k] !== undefined) { out[k] = e[k]; } }
    for (const k of Object.keys(e)) { if (!(k in out) && e[k] !== undefined) { out[k] = e[k]; } }
    return out;
}

// One exit in the P3b shape; changed reports whether anything moved.
function reshape(e) {
    const out = {...e};
    if ('door' in out) {
        const door = out.door;
        delete out.door;
        if (door === 'CaveExit') {
            if (out.look === undefined || out.look === 'stairs-up') { out.look = 'cave-exit'; }
        } else if (door !== SHARED) {
            out.conversation = door;
        }
    }
    if (out.look === 'hidden') {
        delete out.look;
        out.hidden = true;
    }
    const next = ordered(out);
    return {exit: next, changed: JSON.stringify(next) !== JSON.stringify(e)};
}

// A door spawn as a P3b exit.
function fromSpawn(s, caveProps) {
    const e = {x: s.x, y: s.y, anchor: s.anchor};
    if (s.mob !== SHARED) {
        e.look = 'cave-exit';
    } else if (caveProps.some(p => Math.hypot(p.x - s.x, p.y - s.y) <= PROP_REACH)) {
        e.hidden = true;
    }
    return ordered(e);
}

// The group migrated, or undefined when nothing in it moved.
function migrate(file, group, areaId, caveProps) {
    let changed = 0;
    const exits = (group.exits || []).map(e => {
        const r = reshape(e);
        if (r.changed) { changed++; }
        return r.exit;
    });
    // A touch exit has no look at all since 2026-10-19 (the glow alone); the
    // retired `hidden` look still becomes the toggle.
    const exitAreas = group.exitAreas && group.exitAreas.map(a => {
        if (a.look === undefined) { return a; }
        changed++;
        const {look, ...rest} = a;
        return look === 'hidden' ? {...rest, hidden: true} : rest;
    });
    const spawns = group.spawns || [];
    const doors = spawns.filter(s => DOORS.includes(s.mob));
    const where = (s) => `${file}: ${s.mob} at (${s.x}, ${s.y})${areaId ? ` in area "${areaId}"` : ''}`;
    for (const s of doors) {
        const extra = Object.keys(s).filter(k => !EXIT_KEYS.includes(k));
        if (extra.length > 0) { failures.push(`${where(s)}: carries ${extra.join(', ')}, which an exit cannot`); }
        if (s.angle) { failures.push(`${where(s)}: has angle ${s.angle}, which an exit cannot hold yet`); }
        if (!s.anchor) { failures.push(`${where(s)}: names no anchor`); }
    }
    if (changed === 0 && doors.length === 0) { return undefined; }
    const allExits = [...exits, ...doors.map(s => fromSpawn(s, caveProps))];
    const rest = spawns.filter(s => !DOORS.includes(s.mob));
    const out = {};
    for (const [k, v] of Object.entries(group)) {
        if (k === 'exits' && doors.length > 0) { continue; }
        if (k === 'exits') { out.exits = allExits; continue; }
        if (k === 'exitAreas') { out.exitAreas = exitAreas; continue; }
        if (k === 'spawns' && doors.length > 0) {
            if (rest.length > 0 || areaId === undefined) { out.spawns = rest; }
            out.exits = allExits;
            continue;
        }
        out[k] = v;
    }
    return {group: out, moved: changed + doors.length};
}

for (const file of process.argv.slice(2)) {
    const text = readFileSync(file, 'utf8');
    const newline = text.endsWith('\n') ? '\n' : '';
    let zone = JSON.parse(text);
    let moved = 0;
    const caveProps = [zone, ...(zone.areas || [])]
        .flatMap(g => Object.values(g.props || {}).flat()).filter(p => p.type === 'CaveMouth');
    const top = migrate(file, zone, undefined, caveProps);
    if (top) { zone = top.group; moved += top.moved; }
    if (zone.areas) {
        zone.areas = zone.areas.map(a => {
            const m = migrate(file, a, a.id, caveProps);
            if (!m) { return a; }
            moved += m.moved;
            return m.group;
        });
    }
    if (moved === 0) {
        console.log(`${file}: nothing to migrate, left alone`);
        continue;
    }
    // The rewrite goes through JSON.stringify, so the file must already be in
    // exactly that form or untouched bytes elsewhere would move.
    if (JSON.stringify(JSON.parse(text), null, 2) + newline !== text.replace(/\r\n/g, '\n')) {
        failures.push(`${file}: not in JSON.stringify(…, null, 2) form, refusing to rewrite`);
        continue;
    }
    outputs.push([file, JSON.stringify(zone, null, 2) + newline]);
    console.log(`${file}: ${moved} exit(s) migrated`);
}
if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}
for (const [file, out] of outputs) { writeFileSync(file, out); }
