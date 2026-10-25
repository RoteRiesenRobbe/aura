// Cuts today's geometry out of a zone file for a level draft map
// (docs/content-zone-design-guide.md, "Every zone plan has a draft map").
//
//   node tools/level-draft/extract-geo.mjs --frame x0,y0,x1,y1 --out <file.json> [--zone api/zones/world.json]
//
// Keeps every path, structure, atmosphere and region whose bounding box overlaps
// the frame, and every prop, spawn and bind point inside it. Coordinates are
// world units, rounded to 0.1. The draft page draws from this file; nothing here
// is design, it is the "today" layer.
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
if (!args.frame || !args.out) {
  console.error("usage: extract-geo.mjs --frame x0,y0,x1,y1 --out <file.json> [--zone api/zones/world.json]");
  process.exit(2);
}
const [x0, y0, x1, y1] = args.frame.split(",").map(Number);
const zone = JSON.parse(fs.readFileSync(args.zone || "api/zones/world.json", "utf8"));

const r = v => Math.round(v * 10) / 10;
const P = pts => pts.map(q => [r(q.x), r(q.y)]);
const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const overlaps = pts => {
  const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
  return Math.max(...xs) >= x0 && Math.min(...xs) <= x1 && Math.max(...ys) >= y0 && Math.min(...ys) <= y1;
};
// props may be one list or nested by layer (plan-prop-draw-order.md)
const flat = x => Array.isArray(x) ? x : Object.values(x || {}).flat();

const out = { frame: [x0, y0, x1, y1], paths: [], structs: [], props: [], spawns: [], atm: [], regions: [] };
// the zone's top level plus each named area (areas[] since prop-draw-order P4)
for (const a of [{ id: "top", ...zone, areas: undefined }, ...(zone.areas || [])]) {
  for (const p of a.paths || []) if (p.points && overlaps(p.points))
    out.paths.push({ src: a.id, profile: p.profile, w: p.width, block: !!(p.blocksMovement || p.blocking), closed: !!p.closed, pts: P(p.points) });
  for (const s of a.structures || []) if (s.points && overlaps(s.points))
    out.structs.push({ src: a.id, profile: s.profile, pts: P(s.points) });
  for (const t of a.atmospheres || []) if (t.points && overlaps(t.points))
    out.atm.push({ profile: t.profile, pts: P(t.points) });
  for (const g of a.regions || []) if (g.points && overlaps(g.points))
    out.regions.push({ id: g.id || "", area: a.id, pts: P(g.points) });
  for (const p of flat(a.props)) if (inside(p.x, p.y))
    out.props.push([p.type || p.prop, r(p.x), r(p.y), r(p.scale || 1)]);
  for (const s of a.spawns || []) if (inside(s.x, s.y))
    out.spawns.push([s.mob, r(s.x), r(s.y), s.level ?? null]);
  for (const b of a.bindPoints || []) if (inside(b.x, b.y))
    out.props.push(["Campfire", r(b.x), r(b.y), 1]);
}
fs.writeFileSync(args.out, JSON.stringify(out));
console.log(`${args.out}: ${out.paths.length} paths, ${out.structs.length} structures, ${out.props.length} props, ` +
  `${out.spawns.length} spawns, ${out.atm.length} atmospheres, ${out.regions.length} regions`);
