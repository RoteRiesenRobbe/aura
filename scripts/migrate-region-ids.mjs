// One-off (plan-region-identity.md R1): a region names its place by an id, and
// the place's title and subtitle move into api/regions/regions.json.
//
//   node scripts/migrate-region-ids.mjs api/zones/*.json api/zones/.debug/*.json
//
// Each region that carries a `title` (zone level or inside an area) gets an
// `id` as its FIRST key (zone.go's struct order) and loses `title` and
// `subtitle`; the list gains {id, title, subtitle} in the order met. Nothing
// else moves, so the game looks and announces exactly as before.
//
// The id: the region's AREA id (plan-prop-draw-order.md D15), for readability
// only, unless that area's id is already taken by another title, or the
// region sits in no area; then ID_FOR names it (D15's convention: the short
// name a player would call the place). A title neither rule resolves refuses.
//
// ⚑ IDEMPOTENT (the N2 L2 rule): a file with no titled region is left alone,
// and a list entry already present with the same text is kept. A clash (one id,
// two titles) refuses. All or nothing: one refusal writes no file at all.
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const LIST = path.join(ROOT, 'api', 'regions', 'regions.json');

// Titles that cannot take their area's id (PO-confirmed at the start of R1).
const ID_FOR = {
    'Saltgrass Strand': 'saltgrass', // inside the farmlands area (D16), beside the Farmlands
    'Den of Evil': 'den-of-evil', // koboldCave.json, which has no areas
};

const list = existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')).regions : [];
const byId = new Map(list.map(r => [r.id, r]));
const failures = [];
const outputs = [];

function idFor(title, areaId) {
    if (ID_FOR[title]) { return ID_FOR[title]; }
    const taken = byId.get(areaId);
    if (areaId && (!taken || taken.title === title)) { return areaId; }
    return undefined;
}

// Rewrites one region array in place, recording each place in the list.
function migrate(file, regions, areaId) {
    let changed = 0;
    (regions || []).forEach((r, i) => {
        if (!('title' in r) && !('subtitle' in r)) { return; }
        const where = `${file}: region ${i}${areaId ? ` in area "${areaId}"` : ''}`;
        if (!r.title) { failures.push(`${where}: a subtitle without a title`); return; }
        if (r.id) { failures.push(`${where}: has an id AND a title`); return; }
        const id = idFor(r.title, areaId);
        if (!id) { failures.push(`${where}: no id for "${r.title}"; add it to ID_FOR`); return; }
        const entry = r.subtitle ? {id, title: r.title, subtitle: r.subtitle} : {id, title: r.title};
        const known = byId.get(id);
        if (known && (known.title !== entry.title || (known.subtitle || '') !== (entry.subtitle || ''))) {
            failures.push(`${where}: id "${id}" is already "${known.title}" in the list`);
            return;
        }
        if (!known) { list.push(entry); byId.set(id, entry); }
        const rest = Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'title' && k !== 'subtitle'));
        for (const k of Object.keys(r)) { delete r[k]; }
        Object.assign(r, {id}, rest);
        changed++;
    });
    return changed;
}

for (const file of process.argv.slice(2)) {
    const text = readFileSync(file, 'utf8');
    const zone = JSON.parse(text);
    const newline = text.endsWith('\n') ? '\n' : '';
    let changed = migrate(file, zone.regions, undefined);
    for (const a of zone.areas || []) { changed += migrate(file, a.regions, a.id); }
    if (changed === 0) {
        console.log(`${file}: no titled region, left alone`);
        continue;
    }
    // The rewrite goes through JSON.stringify, so the file must already be in
    // exactly that form or untouched bytes elsewhere would move.
    if (JSON.stringify(JSON.parse(text), null, 2) + newline !== text) {
        failures.push(`${file}: not in JSON.stringify(…, null, 2) form, refusing to rewrite`);
        continue;
    }
    outputs.push([file, JSON.stringify(zone, null, 2) + newline]);
    console.log(`${file}: ${changed} region(s) now name their place by id`);
}
if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}
for (const [file, out] of outputs) { writeFileSync(file, out); }
mkdirSync(path.dirname(LIST), {recursive: true});
writeFileSync(LIST, JSON.stringify({regions: list}, null, 2) + '\n');
console.log(`${path.relative(ROOT, LIST)}: ${list.length} place(s)`);
