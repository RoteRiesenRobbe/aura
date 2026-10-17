// One-off (plan-passages.md P1, D11): the doors move out of `spawns` and into
// `exits`, the talk-exit array.
//
//   node scripts/migrate-exits.mjs api/zones/*.json api/zones/.debug/*.json
//
// Every CaveMouth / CaveExit spawn (zone level or inside an area) becomes an
// exit of the same group, in the order met: {x, y, anchor}, plus
// `door: "CaveExit"` for the upward ones so they keep their words (CaveMouth is
// the generic door, so it authors none). `exits` is written right after
// `spawns`, zone.go's Objects order. An area left with no spawns loses the key
// (an area writes no empty array); the zone level keeps `spawns: []`.
//
// ⛔ LOSSLESS OR NOTHING: a door spawn carrying anything an exit cannot hold
// (an angle, a route, a level, no anchor) refuses, and one refusal writes no
// file at all. ⚑ IDEMPOTENT: a file with no door spawn is left alone.
import {readFileSync, writeFileSync} from 'node:fs';

const DOORS = ['CaveMouth', 'CaveExit'];
const GENERIC = 'CaveMouth'; // world.GenericDoor
const EXIT_KEYS = ['mob', 'x', 'y', 'angle', 'anchor'];

const failures = [];
const outputs = [];

// The group with its door spawns moved, or undefined when it has none.
function migrate(file, group, areaId) {
    const spawns = group.spawns || [];
    const doors = spawns.filter(s => DOORS.includes(s.mob));
    if (doors.length === 0) { return undefined; }
    const where = (s) => `${file}: ${s.mob} at (${s.x}, ${s.y})${areaId ? ` in area "${areaId}"` : ''}`;
    for (const s of doors) {
        const extra = Object.keys(s).filter(k => !EXIT_KEYS.includes(k));
        if (extra.length > 0) { failures.push(`${where(s)}: carries ${extra.join(', ')}, which an exit cannot`); }
        if (s.angle) { failures.push(`${where(s)}: has angle ${s.angle}, which an exit cannot hold yet`); }
        if (!s.anchor) { failures.push(`${where(s)}: names no anchor`); }
    }
    const exits = [...(group.exits || []), ...doors.map(s => (
        s.mob === GENERIC ? {x: s.x, y: s.y, anchor: s.anchor} : {x: s.x, y: s.y, anchor: s.anchor, door: s.mob}))];
    const rest = spawns.filter(s => !DOORS.includes(s.mob));
    const out = {};
    for (const [k, v] of Object.entries(group)) {
        if (k === 'exits') { continue; }
        if (k === 'spawns') {
            if (rest.length > 0 || areaId === undefined) { out.spawns = rest; }
            out.exits = exits;
            continue;
        }
        out[k] = v;
    }
    return {group: out, moved: doors.length};
}

for (const file of process.argv.slice(2)) {
    const text = readFileSync(file, 'utf8');
    const newline = text.endsWith('\n') ? '\n' : '';
    let zone = JSON.parse(text);
    let moved = 0;
    const top = migrate(file, zone, undefined);
    if (top) { zone = top.group; moved += top.moved; }
    if (zone.areas) {
        zone.areas = zone.areas.map(a => {
            const m = migrate(file, a, a.id);
            if (!m) { return a; }
            moved += m.moved;
            return m.group;
        });
    }
    if (moved === 0) {
        console.log(`${file}: no door spawn, left alone`);
        continue;
    }
    // The rewrite goes through JSON.stringify, so the file must already be in
    // exactly that form or untouched bytes elsewhere would move.
    if (JSON.stringify(JSON.parse(text), null, 2) + newline !== text.replace(/\r\n/g, '\n')) {
        failures.push(`${file}: not in JSON.stringify(…, null, 2) form, refusing to rewrite`);
        continue;
    }
    outputs.push([file, JSON.stringify(zone, null, 2) + newline]);
    console.log(`${file}: ${moved} door(s) now exits`);
}
if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}
for (const [file, out] of outputs) { writeFileSync(file, out); }
