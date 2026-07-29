#!/usr/bin/env node
// Swift re-roled from a passive to a movement cooldown (PO ruling 2026-07-29,
// plan-playtest-feedback.md §Open questions 4).
//
// What this proves in the live game:
//   1. Swift reads as a COOLDOWN client-side and binds to a cooldown slot —
//      a passive could not, so the category flip is proven by where it fits
//   2. its tooltip names the pace and the window (the new speed_burst case)
//   3. firing it lights the speed pip on the player
//   4. ⭐ the player actually MOVES FARTHER while it is up — the only check
//      that says the buff reached the movement site rather than just the
//      buff store (the standing "never assert on Derived" habit)
//   5. it EXPIRES on its own: the pip goes out and the pace returns to normal.
//      That is what makes it a burst rather than the passive it replaced.
//
// ⚑⚑ WHERE YOU STAND DECIDES WHAT YOU MEASURE. This script cost four runs to
// the same trap: warped to a spot that happened to sit in a ~2-unit pocket
// between blocking props, EVERY walk measured the pocket instead of the pace —
// 2.04 units whether sprinting or not (a flat 1.00× "the buff does nothing"),
// and a leg pushing into the wall the previous leg had already reached measured
// 0.00, which looked convincingly like an input-handling bug. On open ground the
// player walks a clean 1.5 u/s, exactly the configured 0.05 × 30 ticks. So the
// spot below is the most open whole-unit tile in the zone, computed from
// world.json (max distance to any blocksMovement prop and to the border:
// 7.23 units at -23,14), the legs are short enough not to reach that edge, and
// an unbuffed leg slower than OPEN_GROUND_MIN reports INCONCLUSIVE rather than a
// number — a blocked baseline can only flatter or fake the result.
//
// ⚑ The legs are timed against the 5 s buff window (150 ticks): 2.5 s each, so
// the whole sprint leg is inside it. A longer walk averages the sprint away.
//
// ⚑ Distances are WORLD units off character.getX()/getY(), never screen space —
// `Cam Boundaries: On` clamps the camera at map edges, so the player is not
// drawn at the viewport centre and a screen metric lies (2026-07-27).
//
// ⚑ The pip signal is DRAWN INSTRUCTIONS, not `visible`: EffectPips early-returns
// when the mask is unchanged, so a never-pipped Graphics keeps its constructed
// visible=true with nothing in it (2026-07-29, chunk3-charm).
//
// Usage: node .claude/skills/verify/swift-cooldown.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The most open whole-unit tile in world.json: 7.23 units of clearance to the
// nearest blocking prop and to the border. WARP granularity is 1 unit, so this
// has to be a whole-unit coordinate.
const OPEN = `${-23 * 120} ${14 * 120}`;
const WALK_SECS = 2.5;
// Nominal pace is WalkingSpeedPerTick 0.05 × 30 ticks = 1.5 u/s, measured at
// 1.42–1.60 u/s on this ground. Anything much under this means the walk hit
// something, and the run says so instead of reporting a ratio.
const OPEN_GROUND_MIN = 1.2;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Swi' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
// The dev panel covers the right-hand HUD and would swallow slot clicks.
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

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

await cmd('PING');
await cmd('GOD');              // standing still in wildlife range would end the run
await cmd('SKILL Swift');
await cmd('WARP ' + OPEN);
await page.waitForTimeout(22_000);   // the camera interpolates slowly (backlog §20)

// --- 1. it reads as a cooldown ---
const rowInfo = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#spellbookList li')];
  const i = rows.findIndex((li) => /Swift/i.test(li.textContent));
  return { i, text: i >= 0 ? rows[i].textContent.trim() : '' };
});
check('Swift is in the spellbook', rowInfo.i >= 0, `row ${rowInfo.i}: ${JSON.stringify(rowInfo.text.slice(0, 40))}`);

// --- 2. the tooltip: hover the row and read the rendered lines ---
let tooltipText = '';
if (rowInfo.i >= 0) {
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowInfo.i].boundingBox();
  await page.mouse.move(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(600);
  tooltipText = await page.evaluate(() => {
    const el = document.getElementById('skillTooltip');
    return el && !el.classList.contains('hidden') ? el.textContent : '';
  });
}
check('The tooltip names the pace and the window',
  /Move\s+1\.5×/.test(tooltipText) && /as fast for/.test(tooltipText),
  `tooltip: ${JSON.stringify(tooltipText.slice(0, 160))}`);
check('The tooltip calls it a Cooldown, not a Passive',
  /Cooldown/i.test(tooltipText) && !/Passive/i.test(tooltipText),
  `category line present in: ${JSON.stringify(tooltipText.slice(0, 80))}`);

// --- 3. bind it to a COOLDOWN slot (a passive would not fit one) ---
if (rowInfo.i >= 0) {
  const rows = await page.$$('#spellbookList li');
  const box = await rows[rowInfo.i].boundingBox();
  // Click the NAME, not the row centre — mid-row sits the skill-point spender.
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(700);
  const slot = await page.$('#cooldownSlotList li:first-child');
  if (slot) {
    const sb = await slot.boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(700);
  }
}
const equipped = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList')?.textContent?.trim() || '');
check('It binds into a cooldown slot', /Swift/i.test(equipped),
  `cooldown bar reads: ${JSON.stringify(equipped.slice(0, 60))}`);

// --- the pip strip on the player's own plate ---
// Same shape as the mob strip: a container at x=0, y>0 holding exactly one
// Graphics, parked below the overhead bar (Character.ts: y = barHeight/2 + 9).
const pipOn = () => page.evaluate(`
  (() => {
    let found = null;
    const walk = (c) => {
      if (found !== null || !c) return;
      const kids = c.children || [];
      if (kids.length === 1 && kids[0] && kids[0].context && c.x === 0 && c.y > 0) {
        found = !!kids[0].visible && (kids[0].context.instructions || []).length > 0;
        return;
      }
      kids.forEach(walk);
    };
    walk(window.game.character.plate);
    return found;
  })()
`);

// Units per second is a fair metric here even under a throttled rAF: the server
// coasts on held movement for up to maxHoldTicks (15) between input packets, so
// a headless client's sparse packets still produce continuous motion — measured
// 1.42–1.60 u/s against a nominal 1.5.
const walk = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  const from = await pos();
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
  await page.waitForTimeout(400);
  const to = await pos();
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return { dist, pace: dist / seconds };
};

// ⚑ The hold is ~1.4 s: slot hotkeys are edge-triggered off an rAF-driven clock
// and a headless page throttles rAF hard enough that a short press is missed.
const fireQ = async () => {
  for (let i = 0; i < 60; i++) {
    const busy = await page.evaluate(() =>
      /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li:first-child')?.textContent || ''));
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(1400);
  await page.keyboard.up('q');
};

// --- 4. the measurement: alternating buffed / unbuffed legs, several times ---
// ⚑ A single pair is not enough. The FIRST walk after the warp reproducibly
// covers about half the ground of every later one (the client is still settling
// on the warped position), so a one-shot baseline flatters the sprint by ~2×
// and a one-shot post-expiry leg then looks like the buff never wore off. Four
// cycles with a discarded warm-up, alternating direction BETWEEN cycles so no
// directional bias can ride along, and the assertion is on medians.
// Legs alternate east/west so the player oscillates around the open tile instead
// of marching out of it, and the two blocks swap which arm walks which way, so a
// direction-specific obstruction cannot masquerade as the buff.
const keys = ['d', 'a'];
let legIdx = 0;
const nextKey = () => keys[legIdx++ % 2];

const cold = [];
const hot = [];
let pipBefore = null;
let pipDuring = null;
let pipAfter = null;

await walk(nextKey(), WALK_SECS);   // warm-up, discarded (the first walk after a warp is short)
await page.waitForTimeout(1000);

// block 0: cold legs walk 'a', sprint legs walk 'd'. block 1: swapped, so a
// direction-specific obstruction cannot masquerade as the buff.
for (let block = 0; block < 2; block++) {
  for (let c = 0; c < 2; c++) {
    if (pipBefore === null) pipBefore = await pipOn();
    cold.push(await walk(nextKey(), WALK_SECS));
    if (pipAfter === null && (block > 0 || c > 0)) pipAfter = await pipOn();

    await fireQ();
    if (pipDuring === null) pipDuring = await pipOn();
    hot.push(await walk(nextKey(), WALK_SECS));

    if (block === 0 && c === 0) await page.screenshot({ path: `/tmp/swift-${label}-sprint.png` });
    await page.waitForTimeout(6000);   // the 150-tick burst runs out here
  }
  // One discarded walk between blocks flips which direction each arm walks.
  if (block === 0) await walk(nextKey(), 1.5);
}
await page.screenshot({ path: `/tmp/swift-${label}-end.png` });

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const coldPace = median(cold.map((w) => w.pace));
const hotPace = median(hot.map((w) => w.pace));
const fmtLegs = (xs) => xs.map((w) => `${w.dist.toFixed(2)}u=${w.pace.toFixed(2)}u/s`).join(', ');

check('Firing it lights the speed pip on the player',
  pipBefore === false && pipDuring === true,
  `pip before firing: ${pipBefore}, during: ${pipDuring}`);

const ratio = coldPace > 0 ? hotPace / coldPace : 0;
const openGround = coldPace >= OPEN_GROUND_MIN;
check('The player moves faster while the sprint is up',
  openGround && ratio > 1.3 && ratio < 1.7,
  openGround
    ? `unbuffed [${fmtLegs(cold)}] median ${coldPace.toFixed(2)} u/s; `
      + `sprinting [${fmtLegs(hot)}] median ${hotPace.toFixed(2)} u/s `
      + `→ ${ratio.toFixed(2)}× (authored 1.5× at level 1)`
    : `INCONCLUSIVE — the unbuffed baseline is only ${coldPace.toFixed(2)} u/s against a nominal 1.5, `
      + `so the walks were obstructed and no ratio from them means anything. Legs: [${fmtLegs(cold)}]`);

// --- 5. it runs out on its own ---
// Every cold leg from cycle 2 on is a post-expiry leg: the burst was fired in
// the previous cycle and 6 s of idling passed. Their pace matching the very
// first (never-buffed) leg is what says the buff ended rather than latched.
check('It expires on its own — pip out, pace back to normal',
  pipAfter === false && openGround && ratio > 1.3,
  `pip during: ${pipDuring} → after a cycle: ${pipAfter}; `
  + `post-expiry legs sit at the unbuffed median (${coldPace.toFixed(2)} u/s), `
  + `not the sprint one (${hotPace.toFixed(2)} u/s)`);

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log('\nwebgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
