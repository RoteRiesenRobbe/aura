// One-off (plan-zone-naming.md N2): rename three zone-file keys in place,
// keeping each key's POSITION, so the files differ by those three names only.
//
//   terrain   -> decals
//   polygons  -> structures
//   campfires -> bindPoints
//
//   node scripts/migrate-zone-key-names.mjs api/zones/*.json api/zones/.debug/*.json
//
// ⚑ IDEMPOTENT (the N2 L2 rule): a file already on the new names is left
// alone, so it can run over whatever is in the tree. A file carrying an old
// key AND its new one refuses, rather than picking a side. All or nothing:
// one refused file leaves every file untouched.
import {readFileSync, writeFileSync} from 'node:fs';

const RENAMES = {terrain: 'decals', polygons: 'structures', campfires: 'bindPoints'};

const failures = [];
const outputs = [];
for (const file of process.argv.slice(2)) {
    const text = readFileSync(file, 'utf8');
    const zone = JSON.parse(text);
    const newline = text.endsWith('\n') ? '\n' : '';
    // The rewrite goes through JSON.stringify, so the file must already be in
    // exactly that form or untouched bytes elsewhere would move.
    if (JSON.stringify(zone, null, 2) + newline !== text) {
        failures.push(`${file}: not in JSON.stringify(…, null, 2) form, refusing to rewrite`);
        continue;
    }
    const clash = Object.keys(RENAMES).filter(k => k in zone && RENAMES[k] in zone);
    if (clash.length > 0) {
        failures.push(`${file}: has both ${clash.map(k => `"${k}" and "${RENAMES[k]}"`).join(', ')}`);
        continue;
    }
    const renamed = Object.keys(zone).filter(k => k in RENAMES);
    if (renamed.length === 0) {
        console.log(`${file}: already on the new names, left alone`);
        continue;
    }
    const out = {};
    for (const [k, v] of Object.entries(zone)) { out[RENAMES[k] || k] = v; }
    outputs.push([file, JSON.stringify(out, null, 2) + newline]);
    console.log(`${file}: ${renamed.map(k => `${k} -> ${RENAMES[k]}`).join(', ')}`);
}
if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}
for (const [file, out] of outputs) { writeFileSync(file, out); }
