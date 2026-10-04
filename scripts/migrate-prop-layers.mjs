// One-off (plan-prop-draw-order.md P3, item 4): rewrite each zone file's flat
// `props` array as the four prop-layer arrays, by D1's table, keeping file order
// inside each layer. Everything else in the file is left byte for byte, and a
// type the table does not name refuses rather than being guessed.
//
//   node scripts/migrate-prop-layers.mjs api/zones/*.json api/zones/.debug/*.json
//
// ⚑ Already run. Kept as the record of which type went where; once every zone
// file is in the new shape it refuses them all (`props` is no longer an array).
import {readFileSync, writeFileSync} from 'node:fs';

// D1, bottom to top. The key order is the rank, as in zone.go's PropLayers.
const LAYER_OF = {
    underfoot: ['Bridge'],
    default: ['Crate', 'BrokenCrate', 'Cart', 'BurntCart', 'Haystack', 'Well', 'Torch', 'Tombstone',
        'FencePost', 'BrokenFence', 'Rock', 'Boulder', 'Stump', 'FallenLog', 'Bush'],
    buildings: ['House', 'Cottage', 'Barn', 'Mill', 'RuinedHouse', 'GateWall', 'Gate', 'Palisade', 'CaveMouth'],
    canopy: ['Tree', 'OakTree', 'PineTree', 'DeadTree'],
};
const layerOf = {};
for (const [layer, types] of Object.entries(LAYER_OF)) {
    for (const t of types) { layerOf[t] = layer; }
}

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
    if (!Array.isArray(zone.props)) {
        failures.push(`${file}: props is not an array (already migrated?)`);
        continue;
    }
    const layers = {};
    for (const name of Object.keys(LAYER_OF)) { layers[name] = []; }
    const unknown = new Set();
    zone.props.forEach((p) => {
        const layer = layerOf[p.type];
        if (layer === undefined) { unknown.add(p.type); return; }
        layers[layer].push(p);
    });
    if (unknown.size > 0) {
        failures.push(`${file}: no layer for type(s) ${[...unknown].join(', ')}; add them to LAYER_OF`);
        continue;
    }
    zone.props = layers;
    outputs.push([file, JSON.stringify(zone, null, 2) + newline]);
    console.log(`${file}: ${Object.entries(layers).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
}
if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exit(1);
}
// All or nothing: one refused file leaves every file untouched.
for (const [file, out] of outputs) { writeFileSync(file, out); }
