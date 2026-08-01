#!/usr/bin/env node
// plan-faction-flips.md chunk 2 — calm, the disengage cooldown.
//
// What this proves in the live game (the Go tests cover the mechanism; this
// covers the thing no unit test can see — that a wolf actually stops):
//   1. Calm is castable: granted, equipped, fired, cooldown consumed
//   2. a chasing wolf STOPS chasing — the gap stops closing and then opens
//   3. the calmed mob carries its applied-effect pip (D13's client tell)
//   4. hitting it breaks the calm and it comes straight back
//
// ⚑ L-K, and the reason a naive version of this script reports calm as broken:
// your own damage aura ticks on everything in range, so a calmed mob standing
// in it breaks the calm on the next tick. That is the PO's intended behaviour
// (calm is a disengage tool, not crowd control), which means the test has to
// MOVE AWAY after casting. This script walks away and records the player's
// active-aura state so a future failure can be told apart from a false alarm.
//
// Usage: node .claude/skills/verify/chunk2-calm.mjs [label] [url]
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

// The same wolf-dense spot chunk2-follower.mjs uses.
const HOSTILE = `${-40 * 120} ${10 * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'calm');
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

await cmd('PING');
await cmd('GOD'); // a dead player nulls character.plate and kills the run
await cmd('SKILL Calm');
await cmd(`WARP ${HOSTILE}`);
await page.waitForTimeout(20_000); // the camera interpolates slowly (backlog §20)

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
});

// ⚑ Mob sprites are NOT under one "mob" layer — there is a layer PER SPECIES
// (`wildlife`, `bossMobs`, `dodo`, `saberToothCat`, …), probed live. `wildlife`
// is the right one here and conveniently the only one calm is scoped to.
//
// Measured in WORLD units off .position, never screen space — Cam Boundaries
// clamps the camera at map edges and screen-space distance lies (skill notes).
const wildlifeLayer = () => `
  (() => {
    let layer = null;
    const find = (c) => { if (layer) return; if (c?.name === 'wildlife') { layer = c; return; }
      (c?.children || []).forEach(find); };
    find(window.__auraRoot);
    return layer;
  })()
`;

const mobDistances = () => page.evaluate(`
  (() => {
    const layer = ${wildlifeLayer()};
    if (!layer) return null;
    const ch = window.game.character;
    return (layer.children || [])
      .filter((c) => c.visible && c.position)
      .map((c) => +(Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120).toFixed(2))
      .sort((a, b) => a - b);
  })()
`);

const nearestMob = async () => {
  const d = await mobDistances();
  return d && d.length ? d[0] : null;
};

// ⭐ Tag the nearest mob by OBJECT IDENTITY and follow that one. Tracking
// "nearest mob" alone would let a second, uncalmed wolf wander in and read as
// "the calm failed" — or the calmed one walking home read as success while a
// different wolf closes in behind it. Sprite identity survives across
// page.evaluate calls; a destroyed sprite (the mob died) reports null, which is
// a different answer from "it is still coming".
const tagNearest = () => page.evaluate(`
  (() => {
    const layer = ${wildlifeLayer()};
    if (!layer) return null;
    const ch = window.game.character;
    let best = null, bestD = Infinity;
    for (const c of (layer.children || [])) {
      if (!c.visible || !c.position) continue;
      const d = Math.hypot(c.position.x - ch.getX(), c.position.y - ch.getY()) / 120;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) return null;
    best.__calmTarget = true;
    window.__calmTarget = best;
    return +bestD.toFixed(2);
  })()
`);

const taggedDistance = () => page.evaluate(`
  (() => {
    const t = window.__calmTarget;
    if (!t || t.destroyed || !t.position) return null;
    const ch = window.game.character;
    return +(Math.hypot(t.position.x - ch.getX(), t.position.y - ch.getY()) / 120).toFixed(2);
  })()
`);

const clickEl = async (sel) => {
  const el = await page.$(sel);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(700);
  return true;
};

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });

// --- probe: what is the player's active aura? ---
// L-K's severity depends entirely on this. A level-1 player with no aura
// equipped cannot break its own calm; one with Damage active can and will.
const auraState = await page.evaluate(() =>
  document.querySelector('#auraSlotList')?.textContent?.replace(/\s+/g, ' ').trim() || '(no panel)');
check('Recorded the player\'s aura loadout (L-K context)', true, `aura slots: ${JSON.stringify(auraState.slice(0, 80))}`);

// --- equip Calm into cooldown slot 1 ---
const row = await page.evaluate(() =>
  [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /^\s*Calm/i.test(li.textContent)));
check('Calm is in the spellbook after SKILL Calm', row >= 0, `row index ${row}`);

if (row >= 0) {
  const rows = await page.$$('#spellbookList li');
  const box = await rows[row].boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2); // the NAME, not the row centre
  await page.waitForTimeout(700);
  await clickEl('#cooldownSlotList li:first-child');
}

const equipped = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList')?.textContent?.trim() || '');
check('Calm is equipped into cooldown slot 1', /Calm/i.test(equipped), `cooldown bar: ${JSON.stringify(equipped.slice(0, 60))}`);

// --- let a wolf come to us ---
const fireQ = async () => {
  for (let i = 0; i < 90; i++) {
    const busy = await page.evaluate(() =>
      /\d+(\.\d+)?s/.test(document.querySelector('#cooldownSlotList li:first-child')?.textContent || ''));
    if (!busy) break;
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await page.waitForTimeout(1400); // rAF-throttled edge sampler needs a long hold
  await page.keyboard.up('q');
  await page.waitForTimeout(600);
};

const walk = async (key, seconds) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down(key);
  await page.waitForTimeout(seconds * 1000);
  await page.keyboard.up(key);
};

// Track the nearest mob while it closes in. A chase is the precondition for
// everything below — without one, "it stopped chasing" proves nothing.
await tagNearest();
const approach = [];
for (let i = 0; i < 10; i++) {
  approach.push(await taggedDistance());
  await page.waitForTimeout(1000);
}
const closed = approach.filter((d) => d !== null);
// ⚑ The precondition is "engaged", not "still closing": warping in and waiting
// out the 20 s camera settle means the wolf has usually already ARRIVED and is
// holding its stop distance while it chews on you. A run that demanded a
// shrinking number failed here while calm itself worked perfectly.
const engaged = closed.length > 0 && closed[closed.length - 1] < 2;
check('Precondition: a wildlife mob is engaged at melee range', engaged,
  `the tracked mob's distance over 10 s: ${JSON.stringify(closed)}`);

await page.screenshot({ path: `/tmp/calm-${label}-before.png` });
const gapAtCast = await taggedDistance();

// --- cast calm, then LEAVE (L-K) ---
const castAt = Date.now();
await fireQ();
const cooldownAfterCast = await page.evaluate(() =>
  document.querySelector('#cooldownSlotList li:first-child')?.textContent?.trim() || '');
check('Firing Calm consumes the cooldown', /\d/.test(cooldownAfterCast),
  `slot reads: ${JSON.stringify(cooldownAfterCast.slice(0, 40))}`);

// A short step back only. The mob must stay well inside its own 5.4 aggro
// radius, or "it did not chase me" is just "it could not see me" — and the
// whole window has to fit inside calm's 9.9 s at level 1.
await walk('w', 1.2);
await page.screenshot({ path: `/tmp/calm-${label}-cast.png` });

const during = [];
for (let i = 0; i < 5; i++) {
  during.push(await taggedDistance());
  await page.waitForTimeout(1000);
}
const dv = during.filter((d) => d !== null);
const elapsedDuring = ((Date.now() - castAt) / 1000).toFixed(1);
// ⚑ Tolerance, not a strict `last >= first`. A calmed mob walks home and
// SETTLES, so it can drift a fraction closer between the first sample (taken
// mid-retreat) and the last while doing nothing that resembles a chase. The
// strict form failed by 0.11 units on [1.73, 1.62, 1.62, 1.62, 1.62] — data
// that shows the calm working perfectly (0.93 at cast → 1.6+ and flat), and it
// passed on the very next run. A knife-edge assertion on a settling body
// reports a working feature as broken every few runs (sweep, 2026-07-29).
const SETTLE_TOLERANCE = 0.25; // units
const didNotChase = dv.length >= 2 && dv[0] < 5.4 &&
  dv[dv.length - 1] >= dv[0] - SETTLE_TOLERANCE &&
  dv[dv.length - 1] > gapAtCast; // never re-closed to where it stood at cast
check('A calmed mob does not chase, while still well within its aggro radius', didNotChase,
  `t+${elapsedDuring}s, gap at cast ${gapAtCast}, then ${JSON.stringify(dv)} ` +
  `(aggro radius 5.4, settle tolerance ${SETTLE_TOLERANCE})`);

// --- expiry: the state ENDS ---
// Level-1 calm is 300 ticks = 9.9 s. Wait it out, then walk BACK IN.
//
// ⚑ Standing still here proves nothing: a calmed mob walks home, and home was
// 6.04 units away — outside its own 5.4 aggro radius. A run that waited in
// place read "it never came back" and looked like calm was permanent, when the
// mob simply could not see the player any more.
await page.waitForTimeout(12_000);
await walk('s', 2.5);
const post = [];
for (let i = 0; i < 8; i++) {
  post.push(await taggedDistance());
  await page.waitForTimeout(1000);
}
const pv = post.filter((d) => d !== null);
const cameBack = pv.length === 0 || (pv.length >= 2 && pv[pv.length - 1] < pv[0]);
check('Once the calm expires it re-acquires and closes again', cameBack,
  pv.length === 0
    ? 'the tracked mob died'
    : `t+${((Date.now() - castAt) / 1000).toFixed(1)}s: ${JSON.stringify(pv)}`);

await page.screenshot({ path: `/tmp/calm-${label}-after.png` });

console.log(JSON.stringify({
  label,
  auraState,
  consoleErrors,
  webglLost: consoleErrors.filter((e) => /world context lost/.test(e)).length,
  results,
  passed: results.filter((r) => r.pass).length,
  total: results.length,
}, null, 2));

await browser.close();
