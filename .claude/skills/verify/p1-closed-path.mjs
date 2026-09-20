#!/usr/bin/env node
// P1 of plan-zone-polygons.md — a CLOSED path is a ring, in the world, not only
// in the file.
//
// What only a browser can show here:
//   1. the WRAPAROUND SEGMENT WALLS. Every other side of a ring is an ordinary
//      path segment that shipped with world-paths C2; the segment from the LAST
//      point back to the FIRST is the whole of P1's collider change, and if it
//      is missing the ring is a three-sided pen that looks completely correct
//      from every direction but one.
//   2. the ring DRAWS closed (screenshot — Pixi's `poly(points, closed)`).
//
// ⚑ IT IS AN A/B AND ONLY THE A/B PROVES ANYTHING. Run it once with the probe
// ring authored `closed: true` and once with the flag removed: the SAME four
// points must wall the west side in the first run and NOT in the second. A
// single run asserting "I was stopped" cannot tell the wraparound from any
// other segment.
//
//   node .claude/skills/verify/p1-closed-path.mjs closed <url>
//   node .claude/skills/verify/p1-closed-path.mjs open   <url>
//
// ⚑ The probe ring is a TEMPORARY edit to api/zones/world.json (4 points at
// x -27..-19, y 10..18, width 2, blocking). Its WRAPAROUND is the WEST side at
// x = -27 — the point order is chosen so that the one side only a closed path
// walls is the side the player walks into. Restart the server after installing
// it: [[project-zone-edit-half-live]] means the ring RENDERS on a webpack
// reload while the collider is still the one the running server booted with.
//
// ⚑ Venue is (-23, 14), the most open whole-unit tile in the zone (7.23 u of
// clearance to any blocking prop) — the same tile swift-cooldown.mjs measures
// pace on, and for the same reason: on any other ground the walk measures the
// ground rather than the thing under test.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const mode = process.argv[2] || 'closed';      // 'closed' | 'open'
const url = process.argv[3] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The ring, in world units. Points run E along the top, S down the east side,
// W along the bottom — so the WRAPAROUND is the west side at x = -27.
const WEST = -27, EAST = -19, HALF = 1;         // width 2 → half-width 1
const PLAYER_R = 0.25;                          // player.go:28
// Where a wall stops the player: the face, plus half the stroke, plus the body.
const WEST_FACE = WEST + HALF + PLAYER_R;       // -25.75
const EAST_FACE = EAST - HALF - PLAYER_R;       // -20.25
const START = { x: -23, y: 14 };
const WALK_SECS = 5;                            // 1.5 u/s → 7.5 u of intent

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'ring');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const i = document.getElementById('console_command');
    i.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};
// ⚑ ONE page.evaluate per sample: reading x and y as separate round trips lets
// the world move between them.
const pos = () => page.evaluate(() => ({
  x: window.game.character.getX() / 120, y: window.game.character.getY() / 120,
}));

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); };
let inconclusive = null;

await cmd('PING');
await cmd('GOD');                    // standing in the open would end the run
await cmd(`WARP ${START.x * 120} ${START.y * 120}`);
await page.waitForTimeout(24_000);   // the camera interpolates slowly (backlog §20)

const landed = await pos();
if (Math.hypot(landed.x - START.x, landed.y - START.y) > 1.5) {
  inconclusive = `the warp did not land inside the ring (at ${landed.x.toFixed(2)}, ${landed.y.toFixed(2)})`;
}

// Push in one direction for WALK_SECS and report where the player ended up.
const walkTo = async (key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(WALK_SECS * 1000);
  await page.keyboard.up(key);
  await page.waitForTimeout(600);
  return pos();
};

// Back to the middle between legs, so the second leg starts where the first did.
const recentre = async () => {
  await cmd(`WARP ${START.x * 120} ${START.y * 120}`);
  await page.waitForTimeout(3000);
};

if (!inconclusive) {
  // --- leg 1: WEST, into the wraparound ---------------------------------
  const west = await walkTo('a');
  if (mode === 'closed') {
    check('the WRAPAROUND walls: walking west stops at the ring wall',
      west.x > WEST - HALF && west.x < START.x - 1,
      `ended at x=${west.x.toFixed(2)} (wall face ${WEST_FACE}), walked ${(START.x - west.x).toFixed(2)} u`);
  } else {
    check('CONTROL: with no wraparound the west side is OPEN',
      west.x < WEST - HALF,
      `ended at x=${west.x.toFixed(2)}, past the ring's west edge at ${WEST}`);
  }

  // --- leg 2: EAST, into an ORDINARY segment ----------------------------
  // The control that makes leg 1 mean something: this side is walled by the
  // second segment in BOTH modes, so a run where nothing blocks at all (a
  // broken collider, a stale server, a warp that missed) fails here too.
  await recentre();
  const east = await walkTo('d');
  check('CONTROL: the ordinary east segment walls in both modes',
    east.x < EAST + HALF && east.x > START.x + 1,
    `ended at x=${east.x.toFixed(2)} (wall face ${EAST_FACE})`);
}

await page.screenshot({ path: `.claude/skills/verify/p1-ring-${mode}.png` });

console.log(`\n=== P1 closed path — mode: ${mode} ===`);
if (inconclusive) {
  console.log(`INCONCLUSIVE: ${inconclusive}`);
} else {
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
}
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach((e) => console.log('  ' + e));
console.log(`screenshot: .claude/skills/verify/p1-ring-${mode}.png`);
await browser.close();
process.exit(inconclusive || results.some((r) => !r.pass) ? 1 : 0);
