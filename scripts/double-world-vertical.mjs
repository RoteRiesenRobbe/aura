// One-off: append a second copy of terrain/props/spawns shifted down by the current
// height, doubling world height. campfires/darkAreas/regions/anchors stay as the single
// original set, unmoved (same rationale as scale-world-15x.mjs).
import fs from "fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node double-world-vertical.mjs <path-to-world.json>");
  process.exit(1);
}

const world = JSON.parse(fs.readFileSync(path, "utf8"));
const offsetY = world.bounds.height;

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function duplicateDown(arr) {
  return [...arr, ...arr.map((item) => ({ ...item, y: round(item.y + offsetY) }))];
}

world.terrain = duplicateDown(world.terrain);
world.props = duplicateDown(world.props);
world.spawns = duplicateDown(world.spawns);
world.bounds = { width: world.bounds.width, height: world.bounds.height * 2 };

fs.writeFileSync(path, JSON.stringify(world, null, 2) + "\n");
console.log(`bounds -> ${world.bounds.width}x${world.bounds.height}`);
console.log(`terrain: ${world.terrain.length}, props: ${world.props.length}, spawns: ${world.spawns.length}`);
