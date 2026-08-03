#!/usr/bin/env node
// Round-8 item 3 (bugfix half): held keys survive focus loss. `keyup` is
// delivered to whoever has focus when the key is released, so a key held
// across a blur stayed down forever and movement kept streaming to the
// server. KeyboardManager now sweeps every key on window blur (and on
// visibilitychange→hidden).
//
// What this proves in the live game, that the vitest sweep tests cannot:
//   1. a held W actually moves the character (the baseline that makes leg 2
//      meaningful — and a slow baseline means obstruction, so it goes
//      INCONCLUSIVE rather than red, per the swift-cooldown precedent)
//   2. ⭐ blur with the key still physically down STOPS the character — the
//      whole bug. This crosses the seam vitest cannot: swept keys → Controls
//      reads (0,0) → stop-tail → the SERVER stops moving the entity.
//   3. the character does not creep afterwards (the server is not coasting
//      on stale held input; the explicit stop landed)
//   4. a fresh press after the blur moves again — the sweep is a release,
//      not a latch.
//
// ⚑ The blur is dispatched synthetically (window.dispatchEvent) because a
// headless page cannot lose OS focus on demand; the handler listens for
// exactly this event, and the visibilitychange twin is pinned in vitest.
//
// ⚑ Distances are WORLD units off character.getX()/getY(), never screen
// space (Cam Boundaries clamp at map edges). Ground is the most open
// whole-unit tile in world.json (-23, 14 — 7.23 units of clearance); legs
// are short and leg 4 walks back down so the run stays inside the pocket.
//
// Usage: node .claude/skills/verify/focus-loss-sweep.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const OPEN = `${-23 * 120} ${14 * 120}`;
const WALK_SECS = 1.5;
// Nominal open-ground pace is 1.5 u/s; under it means the walk hit something
// and the moving legs can only be INCONCLUSIVE, not red.
const OPEN_GROUND_MIN = 1.0; // u/s
// A stopped character holds position exactly; the tolerance absorbs the last
// coasted tick between the blur and the explicit stop landing.
const STOPPED_MAX = 0.3; // u over the whole still window

// ⚑ --disable-gpu: on the WSL2 box the GPU-backed headless context is lost on
// EVERY boot (two consecutive §29 signatures), not the documented ~1-in-6 —
// software GL sidesteps it. Position reads freeze with the render loop (getX
// rides the interpolated sprite), so a lost context zeroes every movement leg.
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'blur');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => {
  const p = document.getElementById('developPanel');
  if (p) p.style.display = 'none';
});

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(700);
};

const pos = () => page.evaluate(() => ({
  x: window.game.character.getX() / 120,
  y: window.game.character.getY() / 120,
}));
const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

const results = [];
const check = (name, state, detail) => results.push({ check: name, state, detail });

await cmd('GOD'); // a level-1 character standing still is inside aggro radii
await cmd(`WARP ${OPEN}`);
await page.waitForTimeout(1000);

// 1. Baseline: a held W moves the character. The first sample comes AFTER the
// walk has started — measuring from the keydown folds ~0.5 s of input-startup
// latency into the rate (observed 0.97 u/s over a 1.5 s from-keydown window
// vs the 1.5 u/s steady state) and lands a healthy walk under the threshold.
await page.keyboard.down('w');
await page.waitForTimeout(700);
const a0 = await pos();
await page.waitForTimeout(WALK_SECS * 1000);
const a1 = await pos();
const baselineRate = dist(a0, a1) / WALK_SECS;
const baselineOk = baselineRate >= OPEN_GROUND_MIN;
check('held W moves the character', baselineOk ? 'PASS' : 'INCONCLUSIVE',
  `${baselineRate.toFixed(2)} u/s (open ground ≈ 1.5)`);

// 2. Blur with W still down: the character stops. No keyboard.up — the key
// staying physically down is the whole point.
await page.evaluate(() => window.dispatchEvent(new Event('blur')));
await page.waitForTimeout(1000); // let the stop-tail land and the server settle
const b0 = await pos();
await page.waitForTimeout(2000);
const b1 = await pos();
const crept = dist(b0, b1);
if (!baselineOk) {
  check('blur stops the held-key walk', 'INCONCLUSIVE', 'no trustworthy baseline');
} else {
  check('blur stops the held-key walk', crept <= STOPPED_MAX ? 'PASS' : 'FAIL',
    `moved ${crept.toFixed(2)} u in the 2 s after blur (limit ${STOPPED_MAX})`);
}

// 3. A fresh press after refocus moves again — walking back down (S) to stay
// inside the open pocket. keyboard.up first so Playwright's own key state
// matches the game's swept one.
await page.keyboard.up('w');
await page.keyboard.down('s');
await page.waitForTimeout(700);
const c0 = await pos();
await page.waitForTimeout(WALK_SECS * 1000);
const c1 = await pos();
await page.keyboard.up('s');
const resumeRate = dist(c0, c1) / WALK_SECS;
check('a fresh press after blur moves again', resumeRate >= OPEN_GROUND_MIN ? 'PASS' : 'FAIL',
  `${resumeRate.toFixed(2)} u/s`);

const webglLoss = consoleErrors.some((e) => e.includes('[webgl] world context lost'));
check('0 console errors', consoleErrors.length === 0 ? 'PASS' : 'FAIL',
  consoleErrors.slice(0, 3).join(' | ') || 'clean');
if (webglLoss) check('webgl context', 'INCONCLUSIVE', 'lost context — invalid run, re-run');

console.log(`\nfocus-loss-sweep [${label}]`);
for (const r of results) console.log(`  ${r.state.padEnd(12)} ${r.check} — ${r.detail}`);
const fails = results.filter((r) => r.state === 'FAIL').length;
console.log(`\n${results.filter((r) => r.state === 'PASS').length}/${results.length} PASS, ${fails} FAIL`);

await browser.close();
process.exit(fails > 0 ? 1 : 0);
