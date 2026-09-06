#!/usr/bin/env node
// probegen — throwaway density-matched probe zones for the world-scale ladder.
//
// plan-world-scale.md M0.1 (which reuses plan-test-world.md C0). Answers ONE
// question: at what world area does the 33 ms tick break? So the probes must
// hold density and species mix EXACTLY constant while area grows — anything
// else and the ladder measures the generator, not the engine.
//
// Method: tile api/zones/world.json. A k× probe is a cols×rows grid of the
// real world, so density, species mix, prop mix and terrain count per unit
// area are identical to the live map by construction. That is a stronger
// guarantee than a statistical generator gives, and it is ~40 lines.
//
// ⚑ Output goes to a SCRATCH COPY of api/, never api/zones/ — that directory
// is bundled into every client (plan-world-scale.md L4).
//
//   node scripts/probegen.mjs <scratch-api-dir>
//
// Re-run after S3 lands to produce the before/after ratio (§8's headline).

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const outApi = process.argv[2];
if (!outApi) {
  console.error("usage: node scripts/probegen.mjs <scratch-api-dir>");
  process.exit(1);
}
const zonesDir = join(outApi, "zones");
if (!existsSync(zonesDir)) {
  console.error(`no zones dir at ${zonesDir} — copy api/ there first`);
  process.exit(1);
}
if (zonesDir.replace(/\\/g, "/").endsWith("/api/zones")) {
  console.error("refusing to write into the repo's api/zones (L4)");
  process.exit(1);
}

const world = JSON.parse(
  readFileSync(new URL("../api/zones/world.json", import.meta.url), "utf8"),
);
const W = world.bounds.width;
const H = world.bounds.height;

// k -> [cols, rows]. Kept to whole tiles so density is exact, not approximate.
const LADDER = [
  [1, 1, 1],
  [2, 2, 1],
  [3, 3, 1],
  [4, 2, 2],
  [6, 3, 2],
  // M1 (2026-09-06): S3 moved the break far past 6x, so the ladder had to grow.
  // Whole tiles only, so density stays exact rather than approximate.
  [9, 3, 3],
  [16, 4, 4],
  [25, 5, 5],
  [30, 6, 5],
];

const shift = (arr, dx, dy) =>
  (arr ?? []).map((e) => ({ ...e, x: e.x + dx, y: e.y + dy }));

for (const [k, cols, rows] of LADDER) {
  const probe = {
    name: `Probe ${k}x`,
    bounds: { width: W * cols, height: H * rows },
    terrain: [],
    props: [],
    spawns: [],
    campfires: [],
    darkAreas: [],
    anchors: [],
  };

  let tile = 0;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++, tile++) {
      const dx = (cx - (cols - 1) / 2) * W;
      const dy = (cy - (rows - 1) / 2) * H;
      probe.terrain.push(...shift(world.terrain, dx, dy));
      probe.props.push(...shift(world.props, dx, dy));
      probe.spawns.push(...shift(world.spawns, dx, dy));
      probe.darkAreas.push(...shift(world.darkAreas, dx, dy));
      // Campfire ids and anchor names are validated unique ZONE-wide
      // (world/zone.go validate), so every tile past the first needs a suffix.
      // Only tile 0 keeps startingSpawn, so bots all enter at one place.
      for (const c of shift(world.campfires, dx, dy)) {
        probe.campfires.push({
          ...c,
          id: tile === 0 ? c.id : `${c.id}-t${tile}`,
          startingSpawn: tile === 0 && c.startingSpawn,
        });
      }
      for (const a of shift(world.anchors, dx, dy)) {
        probe.anchors.push({ ...a, name: tile === 0 ? a.name : `${a.name}-t${tile}` });
      }
    }
  }

  const path = join(zonesDir, `probe-${k}.json`);
  writeFileSync(path, JSON.stringify(probe, null, 2) + "\n");
  console.log(
    `probe-${k}  ${cols}x${rows} tiles  ${probe.bounds.width}x${probe.bounds.height} u  ` +
      `spawns=${probe.spawns.length} props=${probe.props.length} terrain=${probe.terrain.length}`,
  );
}
