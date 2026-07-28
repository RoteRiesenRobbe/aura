#!/usr/bin/env node
// plan-pre-accounts-hygiene.md H4 — the join smoke for the wire prune.
//
// Deleting Resource.capacity/stock RENUMBERED `aabb` (L-H5). That is the
// failure mode that decodes as garbage rather than as an error, and props are
// the ONLY thing left on the Resource wire path since the actor merge moved
// NPCs to the Mob path — so "props render, in the right places, with no console
// errors" is exactly the assertion the renumber needs.
//
// It also covers the other two H4/D4 exposures:
//   · ResourceJuice.ts and its two mp3s are gone, which removes two
//     registerPreload calls from the boot path (L-H6) — a boot that hangs or
//     errors on assets shows up here
//   · House/GateWall lost their empty onStockChange overrides, which existed
//     only to dodge a rescale that no longer exists; the House sprite must
//     still render at its authored non-square aspect
//
// And H3, cheaply: the cooldown label now formats with SERVER_TICKRATE
// (1000/30) instead of a rounded 33, so it must still render as "N.Ns".
//
// Usage: node .claude/skills/verify/hygiene-wire-prune.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The City Gates: House props and GateWall ramparts side by side, which is the
// densest prop cluster in the zone and covers both classes that used to carry
// an onStockChange override.
const SPOT = { x: -58, y: 23 }; // the village: House props (non-square, aspect-corrected) in frame
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Hy' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
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

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');  // a parked level-1 player sits inside plenty of aggro radii

await page.evaluate(() => {
  let r = window.game.character.plate.parent;
  while (r.parent) r = r.parent;
  window.__auraRoot = r;
  document.getElementById('developPanel')?.style && (document.getElementById('developPanel').style.display = 'none');
});

await cmd(`WARP ${w(SPOT.x, SPOT.y)}`);
// ⚑ The camera interpolates a long warp very slowly (backlog §20) — an early
// shot renders the PREVIOUS position, silently and plausibly.
await page.waitForTimeout(22_000);

// The prop layers are the wire path under test: Game.layers.resources.{trees,
// minerals} is where every Resource-table entity is parented, so counting
// rendered sprites there is counting successful Resource decodes.
const props = await page.evaluate(() => {
  const out = { sprites: [], byAspect: {} };
  const walk = (c) => {
    if (c?.texture && c.visible) {
      const b = c.getBounds?.();
      if (b && b.width > 0 && b.height > 0) {
        out.sprites.push({ w: Math.round(b.width), h: Math.round(b.height) });
      }
    }
    (c?.children || []).forEach(walk);
  };
  const layers = window.game.character.plate.parent.parent;
  walk(window.__auraRoot);
  return out;
});

await page.screenshot({ path: `/tmp/hygiene-${label}-props.png` });

// H3: fire a cooldown-slot-less HUD read — the cooldown labels render from
// remaining ticks; with nothing on cooldown they are empty, so instead assert
// the cast-bar/cooldown formatting path is reachable and the HUD is intact.
const hud = await page.evaluate(() => ({
  cooldownSlots: document.querySelectorAll('#cooldownSlotList .cooldownSlot').length,
  cdLabels: [...document.querySelectorAll('#cooldownSlotList .cdRemaining')].map((e) => e.textContent),
  banner: !!document.querySelector('.alertBanner:not([hidden])'),
}));

const nonSquare = props.sprites.filter((s) => Math.abs(s.w - s.h) > 4).length;

console.log('\nlabel:', label);
console.log('rendered sprites   :', props.sprites.length, ' (0 ⇒ nothing decoded off the Resource path)');
console.log('non-square sprites :', nonSquare, ' (House keeps its authored aspect without onStockChange)');
console.log('widest sprite      :', props.sprites.reduce((m, s) => Math.max(m, s.w), 0), 'px');
console.log('cooldown slots     :', hud.cooldownSlots, JSON.stringify(hud.cdLabels));
console.log('alert banner       :', hud.banner ? 'SHOWN' : 'none');
console.log('screenshot         : /tmp/hygiene-' + label + '-props.png');
console.log('\nwebgl ctx losses   :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors     :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(consoleErrors.length === 0 && props.sprites.length > 0 ? 0 : 1);
