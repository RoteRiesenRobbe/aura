#!/usr/bin/env node
// P2/P3/P4 of plan-zone-polygons.md — a filled polygon, in the world.
//
// What only a browser can show here:
//   1. ⭐ EJECTION (L5). Something that ends up INSIDE a filled mass gets out
//      again. This is the whole reason the collider is a boundary stroke over an
//      interior FILL rather than a hollow shell: a shell's failure mode is a
//      TRAPPED entity, sealed in, unable to leave and unable to reach anything
//      while auras pass through it. No Go test can show that the ejection
//      actually terminates against a live physics loop.
//   2. ⭐ THE NOTCH IS NOT WALLED. The probe is a CONCAVE L — the shape a convex
//      phy polygon could not express without decomposition — and its notch is
//      where a point-in-polygon bug shows as invisible collision in open ground.
//   3. The mass BLOCKS from outside, and (as an A/B) only when authored to.
//   4. The mass and its outline DRAW (screenshot).
//
// ⚑ IT IS AN A/B: run `blocking` and then `decor` against the SAME probe shape.
// A single run asserting "I was stopped" cannot tell a polygon collider from any
// other thing in the world that stops a player.
//
//   node .claude/skills/verify/p3-filled-polygon.mjs blocking <url>
//   node .claude/skills/verify/p3-filled-polygon.mjs decor    <url>
//
// ⚑ The probe is a TEMPORARY edit to api/zones/world.json and needs a server
// restart per mode — [[project-zone-edit-half-live]] means the mass RENDERS on a
// webpack reload while the collider is still the one the running server booted
// with. That trap cost a debugging session on 2026-09-07 when water drew and did
// not block.
//
// ⚑ Venue is the most open whole-unit tile in the zone (-23, 14): on any other
// ground the walk measures the ground.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const mode = process.argv[2] || 'blocking';     // 'blocking' | 'decor'
const url = process.argv[3] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The probe L, in world units: a top bar x -30..-16 / y 8..14, and a left leg
// x -30..-23 / y 14..22. The NOTCH — x -23..-16, y 14..22 — is open ground.
const INSIDE = { x: -23, y: 11 };      // deep in the top bar
const NOTCH = { x: -19, y: 18 };       // open, and inside the shape's bounding box
const LEG_EAST = -23;                  // the face the notch walk runs into
const WALK_SECS = 5;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'poly');
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
// ⚑ ONE page.evaluate per sample — two round trips let the world move between
// them, and this run is measuring positions that change under it by design.
const pos = () => page.evaluate(() => ({
  x: window.game.character.getX() / 120, y: window.game.character.getY() / 120,
}));
const warp = async (p) => { await cmd(`WARP ${p.x * 120} ${p.y * 120}`); await page.waitForTimeout(3500); };

// Is a point inside the probe L? Kept here rather than derived, because this is
// the ONE place a hand-written expectation is the right thing: it is the shape
// the script itself installed.
const inProbe = (p) =>
  (p.x >= -30 && p.x <= -16 && p.y >= 8 && p.y <= 14) ||
  (p.x >= -30 && p.x <= LEG_EAST && p.y >= 14 && p.y <= 22);

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

await cmd('PING');
await cmd('GOD');
await warp({ x: -23, y: 14 });
await page.waitForTimeout(24_000);   // the camera interpolates slowly (backlog §20)

// --- leg 1: EJECTION out of the interior fill (L5) -----------------------
await warp(INSIDE);
const landed = await pos();
await page.waitForTimeout(6000);     // multi-tick: ejected from one box into the next
const settled = await pos();
if (mode === 'blocking') {
  check('⭐ a body warped INSIDE the mass is ejected out of it',
    !inProbe(settled),
    `warped to (${landed.x.toFixed(2)}, ${landed.y.toFixed(2)}), settled at `
    + `(${settled.x.toFixed(2)}, ${settled.y.toFixed(2)}) — ${inProbe(settled) ? 'STILL INSIDE' : 'outside'}`);
} else {
  check('CONTROL: a decorative mass does not move anybody',
    inProbe(settled),
    `settled at (${settled.x.toFixed(2)}, ${settled.y.toFixed(2)}), still where it was warped`);
}

// --- leg 2: the CONCAVE NOTCH is open ground -----------------------------
await warp(NOTCH);
await page.waitForTimeout(4000);
const inNotch = await pos();
check('⭐ the concave notch is NOT walled',
  Math.hypot(inNotch.x - NOTCH.x, inNotch.y - NOTCH.y) < 1.5,
  `stood at (${inNotch.x.toFixed(2)}, ${inNotch.y.toFixed(2)}), asked for `
  + `(${NOTCH.x}, ${NOTCH.y}) — a fill bug would have pushed us out of the notch`);

// --- leg 3: walking WEST out of the notch, into the leg's east face ------
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.down('a');
await page.waitForTimeout(WALK_SECS * 1000);
await page.keyboard.up('a');
await page.waitForTimeout(600);
const west = await pos();
if (mode === 'blocking') {
  check('the mass walls from outside',
    west.x > LEG_EAST - 0.5 && west.x < NOTCH.x - 1,
    `stopped at x=${west.x.toFixed(2)} against the leg's east face at ${LEG_EAST}`);
} else {
  check('CONTROL: with blocksMovement absent the mass is walked straight through',
    west.x < LEG_EAST - 1,
    `ended at x=${west.x.toFixed(2)}, past the mass's east face at ${LEG_EAST}`);
}

await warp({ x: -23, y: 14 });
await page.waitForTimeout(20_000);
await page.screenshot({ path: `.claude/skills/verify/p3-polygon-${mode}.png` });

console.log(`\n=== P3 filled polygon — mode: ${mode} ===`);
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`));
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`console errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 5).forEach((e) => console.log('  ' + e));
console.log(`screenshot: .claude/skills/verify/p3-polygon-${mode}.png`);
await browser.close();
process.exit(results.some((r) => !r.pass) ? 1 : 0);
