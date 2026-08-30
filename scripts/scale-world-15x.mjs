// One-off: tile terrain/props/spawns into a 5x3 grid (15 copies) across a space 15x the
// current area. campfires/darkAreas/regions/anchors are left untouched (single copy, unmoved)
// since they're hand-authored quest/NPC content, not generic filler.
import fs from "fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scale-world-15x.mjs <path-to-world.json>");
  process.exit(1);
}

const world = JSON.parse(fs.readFileSync(path, "utf8"));

const COLS = Number(process.argv[3] ?? 5);
const ROWS = Number(process.argv[4] ?? 3);
const tileW = world.bounds.width;
const tileH = world.bounds.height;

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function tileArray(arr) {
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const offsetX = (c - Math.floor(COLS / 2)) * tileW;
      const offsetY = (r - Math.floor(ROWS / 2)) * tileH;
      for (const item of arr) {
        out.push({ ...item, x: round(item.x + offsetX), y: round(item.y + offsetY) });
      }
    }
  }
  return out;
}

world.terrain = tileArray(world.terrain);
world.props = tileArray(world.props);
world.spawns = tileArray(world.spawns);
world.bounds = { width: tileW * COLS, height: tileH * ROWS };

fs.writeFileSync(path, JSON.stringify(world, null, 2) + "\n");
console.log(`bounds -> ${world.bounds.width}x${world.bounds.height}`);
console.log(`terrain: ${world.terrain.length}, props: ${world.props.length}, spawns: ${world.spawns.length}`);
