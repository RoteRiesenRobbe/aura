#!/usr/bin/env node
// plan-world-replacement.md C2 — the walk, as an assertion instead of a memory.
//
// C2 wrote a `level` onto all 423 combat spawns and re-skinned 27 of them. The
// scripted checks in `scripts/world-place.py --check` prove the FILE is what
// the table says. This proves the WORLD is: it walks the ten ratified regions
// low to high and reads the nameplates the server actually sends.
//
// The assertion is LOCAL, and that is the whole design:
//
//   every plate on screen matches a spawn authored WITHIN `LEASH` UNITS OF
//   WHERE THAT PLATE STANDS, on both species and level
//
// so a plate that read the species catalog instead of the placement fails at
// once: the Kobold hideout's Boars are authored at 8, and a catalog-fed one
// would say "Boar 2" with no `Boar 2` authored anywhere near it.
//
// ⚑ **It is deliberately NOT "does this plate belong to the region I warped
// to"**, which is the obvious version and is wrong: the viewport spans ~20
// world units and every venue can see across a region seam. That version
// reported 4 FAILs on a correct world — a Boar from West wildlife visible from
// the Kobold hideout, Bandits from the horde visible from the tunnel — and a
// harness that cries wolf on correct content is worse than no harness.
//
// ⚑ **The D10 BAND claim is NOT checked here, on purpose.** Whether a level
// sits inside its region's band is a property of the FILE, and it is asserted
// where the file is — `scripts/world-place.py --check`. Checking it again off
// a wandering mob's live position would only add flakiness to a fact already
// pinned exactly. What only the game surface can show is that the WIRE agrees
// with the file, which is what this script owns.
//
// ⚑ **Plate text is the DISPLAY name, with spaces** — "Fire Elemental 17",
// not "FireElemental 17". A regex of `^[A-Za-z]+ \d+$` silently drops every
// multi-word species (Dire Wolf, Alpha Wolf, Elite Bandit, Venom Spider,
// Greater Fire Elemental...), which reads as "no plates in view" rather than
// as a bug — the NE fire pocket scored INCONCLUSIVE with three perfectly good
// elemental plates on screen. Spaces are squeezed out before comparing.
//
// ⚑ **A plate's world position is `text.parent.{x,y}`, in WIRE units** (÷120
// for world units) — the Text itself sits at a local y-offset above its mob.
//
// ⚑ The expectations are DERIVED FROM `api/zones/world.json`, never hardcoded.
// A table typed in here would be a third copy of the placement and would go
// green against a world that merely agreed with its author. It also means the
// script keeps working when C2's numbers are re-tuned.
//
// ⚑ Tri-state. Mobs wander, a region's venue can come up empty, and a warp can
// land the camera mid-interpolation — a region with no plates is INCONCLUSIVE,
// never a FAIL. A FAIL means a plate was read and it disagreed with the file.
//
// ⚑ Venues are computed, not authored: per region, the whole-unit point with
// the most combat spawns within 9 units that is ≥2 units clear of every
// blocking prop. So the walk cannot rot when placements move.
//
// Usage: node .claude/skills/verify/c2-world-walk.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = join(import.meta.dirname, '../../..');
const zone = JSON.parse(readFileSync(join(ROOT, 'api/zones/world.json'), 'utf8'));

// The region map and the band table, read out of the one file that owns them.
const regions = JSON.parse(execFileSync('python3', ['-c', `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location('wr', '${join(ROOT, 'scripts/world-regions.py')}')
wr = importlib.util.module_from_spec(spec); spec.loader.exec_module(wr)
catalog, zone, combat, other = wr.load()
out = {}
for s in combat:
    letter, name = wr.region(s['x'], s['y'])
    r = out.setdefault(letter, {'name': name, 'band': wr.BANDS.get(letter), 'spawns': []})
    r['spawns'].append({'mob': s['mob'], 'x': s['x'], 'y': s['y'], 'level': s.get('level')})
json.dump(out, sys.stdout)
`], { encoding: 'utf8' }));

// Low to high — the order C2's own walk instruction gives (§7).
const ORDER = ['F', 'W', 'D', 'K', 'M', 'T', 'B', 'V', 'P', 'R'];

const blockers = zone.props.filter((p) => p.blocksMovement);
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function venueFor(letter) {
  const spawns = regions[letter].spawns;
  let best = null;
  for (const anchor of spawns) {
    const x = Math.round(anchor.x), y = Math.round(anchor.y);
    if (Math.abs(x) > 70 || Math.abs(y) > 34) continue;
    if (blockers.some((p) => dist(x, y, p.x, p.y) < 2)) continue;
    const near = spawns.filter((s) => dist(x, y, s.x, s.y) <= 9);
    if (!best || near.length > best.near.length) best = { x, y, near };
  }
  return best;
}

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const { joinAsNewCharacter } = await import('./lib/join.mjs');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'walk');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

await cmd('PING');  // the first command after joining is dropped
await cmd('GOD');   // the walk parks in aggro range of level-18 predators

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

// One sample = one page.evaluate: the text and the position describe the SAME
// frame, so a mob that moves between two round trips cannot make them disagree.
const plates = () => page.evaluate(() => {
  const out = [];
  const walk = (c) => {
    if (typeof c?.text === 'string' && c.text && c.parent) {
      out.push({ text: c.text, x: c.parent.x / 120, y: c.parent.y / 120 });
    }
    (c?.children || []).forEach(walk);
  };
  walk(window.__auraRoot);
  return out;
});

// How far a mob may legitimately be from its spawn point: wander (≤4) plus a
// chase. Generous on purpose — the assertion's strength is that the exact
// (species, level) pair has to exist nearby, and neighbouring regions author
// the same species at different levels.
const LEASH = 15;

const results = [];
const record = (name, state, detail) => results.push({ name, state, detail });

// Every combat spawn in the world, flat — the plate is matched against where
// it STANDS, not against the region the walk happens to be visiting.
const placed = Object.values(regions).flatMap((r) => r.spawns);

for (const letter of ORDER) {
  const region = regions[letter];
  const venue = venueFor(letter);
  const band = region.band;

  await cmd(`WARP ${venue.x * 120} ${venue.y * 120}`);
  // The camera interpolates a long warp very slowly (backlog §20); a sample
  // taken early describes the PREVIOUS region, silently and plausibly.
  await page.waitForTimeout(20_000);

  const seen = (await plates())
    .filter((p) => /^[A-Za-z][A-Za-z ]* \d+$/.test(p.text))
    .map((p) => ({ ...p, key: p.text.replace(/ (?=\D)/g, '') }));  // "Fire Elemental 17" -> "FireElemental 17"
  await page.screenshot({ path: `/tmp/c2-walk-${label}-${letter}.png` });
  const tag = `${letter} ${region.name} (${venue.x},${venue.y}) band ${band ? band.join('-') : 'unchanged'}`;

  if (!seen.length) {
    record(`${tag}: plates read`, 'INCONCLUSIVE', 'no nameplate in view — mobs wander');
    continue;
  }
  const orphans = seen.filter((p) => !placed.some((s) =>
    `${s.mob} ${s.level}` === p.key && dist(s.x, s.y, p.x, p.y) <= LEASH));
  record(`${tag}: every plate matches a placement authored where it stands`,
    orphans.length ? 'FAIL' : 'PASS',
    orphans.length
      ? `no authored match within ${LEASH}u: ${JSON.stringify(orphans.map((p) => `${p.text} @${p.x.toFixed(0)},${p.y.toFixed(0)}`))}`
      : `${seen.length} plate(s): ${[...new Set(seen.map((p) => p.text))].slice(0, 7).join(', ')}`);
}

console.log('\nlabel:', label);
let pass = 0, fail = 0, inconclusive = 0;
for (const r of results) {
  console.log(`  ${r.state.padEnd(12)} ${r.name}\n                 — ${r.detail}`);
  if (r.state === 'PASS') pass++; else if (r.state === 'FAIL') fail++; else inconclusive++;
}
console.log(`\n${pass} PASS / ${fail} FAIL / ${inconclusive} INCONCLUSIVE`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 8).forEach((e) => console.log('  ' + e));
console.log(`screenshots: /tmp/c2-walk-${label}-<region>.png`);

await browser.close();
process.exit(fail === 0 && consoleErrors.length === 0 ? 0 : 1);
