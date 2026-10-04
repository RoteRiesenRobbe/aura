// A zone file as the game sees it: `areas` flattened away exactly as zone.go
// and the client's ZoneAreas.flattenAreas do (plan-prop-draw-order.md D11).
// For each kind, the zone level first, then each area in file order; props by
// layer first. Since P4c world.json keeps most of its objects in areas, so a
// harness reading `zone.spawns` raw would see only the zone level.
//
// ⚑ For READING. A harness that edits a zone file must edit the raw file and
// find the object where it sits (c2-mob-level.mjs does).
import { readFileSync } from 'node:fs';

const KINDS = ['decals', 'spawns', 'bindPoints', 'darkAreas', 'regions',
  'paths', 'structures', 'atmospheres', 'clearings', 'anchors'];
const PROP_LAYERS = ['underfoot', 'default', 'buildings', 'canopy'];

export function flattenZone(zone) {
  const parts = [zone, ...(zone.areas || [])];
  const out = { ...zone };
  delete out.areas;
  for (const kind of KINDS) {
    if (parts.some((p) => p[kind])) { out[kind] = parts.flatMap((p) => p[kind] || []); }
  }
  out.props = {};
  for (const layer of PROP_LAYERS) {
    out.props[layer] = parts.flatMap((p) => (p.props && p.props[layer]) || []);
  }
  return out;
}

export function readZone(path) {
  return flattenZone(JSON.parse(readFileSync(path, 'utf8')));
}
