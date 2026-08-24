#!/usr/bin/env node
// plan-immune-feedback.md - the wiring the Go pins cannot see: a fully
// mitigated hit puts a grey "Immune" over the target's head, and no damage
// number appears there.
//
// Venue: the Bramble wall in the forest shortcut corridor (-68.7..-65.1,
// -4.8) - the same {"*": 0} + gateKeys shape as the Rockfall the plan names,
// but OUTDOORS: the Rockfall sits in the Dark Tunnel, where showFloatingText's
// darkness suppression would swallow the label and the run would prove
// nothing. The starting damage aura (radius 1.0) ticks on the wall and every
// hit is fully resisted, so the label repeats at aura cadence - the count is
// logged for the plan's §9 cadence question, not asserted.
//
// ⚑ The starting aura is pre-equipped but NOT active - the long-held `1`
//   (~1.4 s, rAF-sampled) switches it on, and `.auraSlot.activeSlot` is the
//   confirmation gate.
// ⚑ The "no damage number" half is scoped BY POSITION (within ~2.5 u of a
//   bramble): mobs fight each other elsewhere in the viewport, so a global
//   "no red text" assert would flake on an unrelated wolf.
// Tri-state: a warp that lands off-target or an aura that never activates is
// INCONCLUSIVE, not red.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';
import { botName } from './botname.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/immune-feedback-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
let inconclusive = false;
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const fail = (msg) => { errors.push('CHECK FAILED: ' + msg); };

await page.goto(url, { waitUntil: 'domcontentloaded' });
await joinAsNewCharacter(page, botName('immune'));
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
await page.evaluate(() => {
  const panel = document.getElementById('developPanel');
  if (panel) panel.style.display = 'none';
  // Cache the scene root while alive (verify skill: a dead player nulls it).
  window.__auraRoot = window.game.character.plate.parent;
});
console.log('joined');

async function runCommand(command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(400);
}

// The middle of the bramble wall; stand 1.4 u north of the -67.5 bramble.
const BRAMBLES = [[-68.7, -4.8], [-67.5, -4.8], [-66.3, -4.8], [-65.1, -4.8]];
const STAND = { x: -67.5, y: -3.4 };

await runCommand('GOD'); // survival only - GOD never touches the MOB's takeDamage
await runCommand(`WARP ${Math.round(STAND.x * 120)} ${Math.round(STAND.y * 120)}`);

// Wait until the character actually reports the warped position (world units).
const landed = await page.waitForFunction(({ x, y }) => {
  const c = window.game.character;
  return Math.hypot(c.getX() / 120 - x, c.getY() / 120 - y) < 1.0;
}, STAND, { timeout: 20_000 }).then(() => true).catch(() => false);
if (!landed) {
  const at = await page.evaluate(() => {
    const c = window.game.character;
    return { x: c.getX() / 120, y: c.getY() / 120 };
  });
  console.log(`INCONCLUSIVE: warp did not land near the bramble wall (at ${at.x.toFixed(1)}, ${at.y.toFixed(1)})`);
  inconclusive = true;
}

// Switch the starting damage aura ON (pre-equipped, NOT active).
await page.keyboard.down('1');
await page.waitForTimeout(1400);
await page.keyboard.up('1');
const auraOn = await page.waitForSelector('.auraSlot.activeSlot', { timeout: 8_000 })
  .then(() => true).catch(() => false);
if (!auraOn) {
  // Retry once - rAF-sampled hotkeys can eat the first hold.
  await page.keyboard.down('1');
  await page.waitForTimeout(1600);
  await page.keyboard.up('1');
  const retried = await page.waitForSelector('.auraSlot.activeSlot', { timeout: 8_000 })
    .then(() => true).catch(() => false);
  if (!retried) {
    console.log('INCONCLUSIVE: the damage aura never activated - nothing can have hit the wall');
    inconclusive = true;
  }
}
console.log('aura active, watching the bramble wall for 12 s');

// One atomic in-page watch: every sample walks the scene graph once, reading
// label text + fill + world position together (verify skill: one sample = one
// evaluate; here one sample = one synchronous walk).
const watch = await page.evaluate(({ brambles }) => new Promise((resolve) => {
  const stage = (() => { let n = window.__auraRoot; while (n.parent) n = n.parent; return n; })();
  const GREY = 0xB0B0B0;
  const seen = new WeakSet(); // count each floating Text once, not per sample
  const out = { immune: 0, immuneNear: 0, immuneGrey: 0, damageNear: 0, samples: [] };
  const hex = (fill) => typeof fill === 'string' ? parseInt(fill.replace('#', ''), 16) : fill;
  const nearWall = (node) => {
    // Detached floating text lives in a world-space layer; position is wire px.
    const wx = node.position.x / 120, wy = node.position.y / 120;
    return brambles.some(([bx, by]) => Math.hypot(wx - bx, wy - by) < 2.5);
  };
  const visit = (node) => {
    if (node.text !== undefined && !seen.has(node)) {
      const t = String(node.text);
      if (t === 'Immune') {
        seen.add(node);
        out.immune++;
        if (nearWall(node)) out.immuneNear++;
        if (hex(node.style?.fill) === GREY) out.immuneGrey++;
      } else if (/^-\d+$/.test(t) && nearWall(node)) {
        seen.add(node);
        out.damageNear++;
        out.samples.push('damage text near wall: ' + t);
      }
    }
    (node.children ?? []).forEach(visit);
  };
  const t0 = Date.now();
  const poll = () => {
    visit(stage);
    if (Date.now() - t0 > 12_000) return resolve(out);
    setTimeout(poll, 120);
  };
  poll();
}), { brambles: BRAMBLES });

await page.screenshot({ path: join(outdir, 'immune-label.png') });
console.log(`"Immune" labels seen: ${watch.immune} (near the wall: ${watch.immuneNear}, grey: ${watch.immuneGrey})`);
console.log(`damage numbers near the wall: ${watch.damageNear}`);
if (watch.samples.length) console.log(watch.samples.join('\n'));
console.log('cadence note (§9): labels repeat at aura tick rate - ' +
  `${watch.immune} in 12 s ≈ one per ${(12 / Math.max(1, watch.immune)).toFixed(1)} s`);

if (!inconclusive) {
  if (watch.immune === 0) {
    fail('no "Immune" label appeared over a fully resisted target in 12 s');
  } else {
    if (watch.immuneNear === 0) fail('"Immune" appeared but never near the bramble wall - wrong subject');
    if (watch.immuneGrey === 0) fail('"Immune" appeared but not in the grey D3 colour');
  }
  if (watch.damageNear > 0) fail('a damage number appeared over the immune wall (D9 guard broken)');
}

await browser.close();
const realErrors = errors.filter(e => !/favicon/i.test(e));
if (realErrors.length) {
  console.log('\nERRORS / FAILURES:');
  realErrors.forEach(e => console.log('  ' + e));
  console.log(`\nRESULT: FAIL (${realErrors.length})`);
  process.exit(1);
}
console.log(inconclusive ? '\nRESULT: INCONCLUSIVE (see above)' : '\nRESULT: PASS');
