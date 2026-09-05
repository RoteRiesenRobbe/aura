// One-off: the vertical-doubling step appended a copy below the original without
// recentering, so content ran past the doubled bounds. Shift every coordinate-bearing
// field by the same amount to bring it back inside bounds, preserving all relative
// positions (campfires/anchors stay aligned with the terrain around them).
import fs from "fs";

const path = process.argv[2];
const shiftY = Number(process.argv[3]);
if (!path || Number.isNaN(shiftY)) {
  console.error("usage: node recenter-world-y.mjs <path-to-world.json> <shiftY>");
  process.exit(1);
}

const world = JSON.parse(fs.readFileSync(path, "utf8"));

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function shiftPoints(arr) {
  return arr.map((p) => ({ ...p, y: round(p.y + shiftY) }));
}

world.terrain = shiftPoints(world.terrain);
world.props = shiftPoints(world.props);
world.spawns = shiftPoints(world.spawns);
world.campfires = shiftPoints(world.campfires);
world.darkAreas = shiftPoints(world.darkAreas);
world.anchors = shiftPoints(world.anchors);
world.regions = world.regions.map((r) => ({ ...r, points: shiftPoints(r.points) }));

fs.writeFileSync(path, JSON.stringify(world, null, 2) + "\n");
console.log(`shifted all content by y+=${shiftY}`);
