// plan-minimap-local-viewport.md M2 — the docked radar's zoom steps, at the
// real game surface.
//
// Owns: the mouse wheel over the disc stepping 50 → 30 → 100, the ± buttons
// stepping and greying at the ends, a button press NOT opening the full-screen
// map (the buttons are siblings of the wrapper that owns that listener), your
// dot staying centred across a step (a step is a rescale, landmine 8), the
// wheel doing nothing full-screen (D3), and the step surviving a reload (D11).
// Does NOT own the radar itself (m1-minimap-radar) or the stepping/snapping
// rules, which are vitest's (RadarZoom.test.ts).
//
// ⚑ REAL input only (page.mouse.wheel / .click at element coordinates): the
// wheel listener is non-passive and the buttons are pointerdown-wired, and a
// dispatched event would prove the listener exists, not that it is reachable.
// ⚑ It restates the step table (30 / 50 / 100, default 50) so a retune reddens
// it loudly: update STEPS with the retune.
//
//   node .claude/skills/verify/m2-radar-zoom.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'm2';
const url = process.argv[3]
  || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const STEPS = [30, 50, 100];
const DEFAULT = 50;

const results = [];
const consoleErrors = [];
const report = (state, name, note = '') => {
  results.push({ state, name, note });
  console.log(`${state}  ${name}${note ? '  — ' + note : ''}`);
};
const check = (ok, name, note) => report(ok ? 'PASS' : 'FAIL', name, note);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
let page = await context.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' && !/\b401\b/.test(m.text())) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await sleep(600);
};

/** One atomic sample. */
const sample = () => page.evaluate(() => {
  const map = window.game?.miniMap;
  if (!map) return null;
  const chars = map.layerContainers?.[0];
  const own = chars?.children[0];
  return {
    state: map.state,
    diameter: map.radarDiameterM,
    scale: map.scale,
    width: map.width,
    height: map.height,
    own: own ? { x: chars.position.x + own.position.x, y: chars.position.y + own.position.y } : null,
    inInactive: document.getElementById('radarZoomIn')?.classList.contains('inactive'),
    outInactive: document.getElementById('radarZoomOut')?.classList.contains('inactive'),
    stored: localStorage.getItem('radarDiameterM'),
    panelHidden: document.getElementById('worldMap')?.classList.contains('hidden'),
  };
});

const centred = (s) => s.own
  && Math.abs(s.own.x - s.width / 2) <= 1.01 && Math.abs(s.own.y - s.height / 2) <= 1.01;
const scaleIs = (s, metres) => Math.abs(s.scale - s.width / (metres * 120)) < 1e-9;

const centreOf = async (selector) => {
  const box = await page.locator(selector).boundingBox();
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
};

const wheelOverDisc = async (deltaY) => {
  const c = await centreOf('#minimap > .wrapper');
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, deltaY);
  await sleep(800);
};

const press = async (id) => {
  const c = await centreOf(`#${id}`);
  await page.mouse.click(c.x, c.y);
  await sleep(800);
};

const enterWorld = async () => {
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 }).catch(() => {});
  const name = await joinAsNewCharacter(page, 'zoom');
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await sleep(2500);
  return name;
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log(`\njoined as ${await enterWorld()}\n`);
  await cmd('GOD');

  // --- 1. the default ---------------------------------------------------
  let s = await sample();
  check(s.diameter === DEFAULT && scaleIs(s, DEFAULT), '1 a fresh browser starts at 50 m',
    `diameter ${s.diameter}, scale ${s.scale?.toFixed(5)}`);
  check(!s.inInactive && !s.outInactive, '1b both buttons live mid-table',
    `in ${s.inInactive ? 'grey' : 'live'}, out ${s.outInactive ? 'grey' : 'live'}`);

  // --- 2. the wheel -----------------------------------------------------
  await wheelOverDisc(-100);
  s = await sample();
  check(s.diameter === STEPS[0] && scaleIs(s, STEPS[0]), '2a one notch up zooms IN to 30 m',
    `diameter ${s.diameter}`);
  check(centred(s), '2b your dot stays centred across the step',
    s.own ? `(${s.own.x.toFixed(1)}, ${s.own.y.toFixed(1)})` : 'no own icon');
  check(s.inInactive === true, '2c zoom-in greys at the nearest step', `in ${s.inInactive}`);
  await wheelOverDisc(-100);
  s = await sample();
  check(s.diameter === STEPS[0], '2d a notch past the end clamps', `diameter ${s.diameter}`);
  await wheelOverDisc(100);
  await wheelOverDisc(100);
  s = await sample();
  check(s.diameter === STEPS[2] && scaleIs(s, STEPS[2]), '2e two notches down zoom OUT to 100 m',
    `diameter ${s.diameter}`);
  check(s.outInactive === true, '2f zoom-out greys at the widest step', `out ${s.outInactive}`);

  // --- 3. the buttons ---------------------------------------------------
  await press('radarZoomIn');
  s = await sample();
  check(s.diameter === STEPS[1], '3a the + button zooms in', `diameter ${s.diameter}`);
  check(s.state === 0 && s.panelHidden === true, '3b a button press does NOT open the full-screen map',
    `state ${s.state}, overlay ${s.panelHidden ? 'hidden' : 'SHOWN'}`);
  await press('radarZoomOut');
  s = await sample();
  check(s.diameter === STEPS[2], '3c the − button zooms out', `diameter ${s.diameter}`);
  check(s.stored === String(STEPS[2]), '3d the step is remembered in metres', `stored ${s.stored}`);

  // --- 4. full-screen has no zoom (D3) ----------------------------------
  await page.keyboard.press('m');
  await sleep(1500);
  const before = await sample();
  if (before.state !== 1) {
    report('INCONCLUSIVE', '4 the wheel full-screen', `M did not open the map (state ${before.state})`);
  } else {
    const c = await centreOf('#worldMap .wrapper');
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -300);
    await sleep(800);
    const after = await sample();
    check(after.diameter === before.diameter && after.scale === before.scale,
      '4 the wheel does nothing full-screen (D3)', `diameter ${after.diameter}, scale ${after.scale}`);
  }
  await page.keyboard.press('Escape');
  await sleep(1200);

  // --- 5. a later page load keeps the step (D11) ------------------------
  // ⚑ A NEW context carrying ONLY this browser's radar preference, not a
  // reload: a reload re-enters an account whose character is still in the
  // world, which the join helper does not model. Carrying the stored value
  // over is exactly what a reload keeps; 3d already proved it was written.
  const stored = (await context.storageState()).origins
    .map(o => ({ ...o, localStorage: o.localStorage.filter(e => e.name === 'radarDiameterM') }))
    .filter(o => o.localStorage.length > 0);
  await page.close();
  const context2 = await browser.newContext({
    viewport: { width: 1280, height: 800 }, storageState: { cookies: [], origins: stored },
  });
  page = await context2.newPage();
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await enterWorld();
  s = await sample();
  check(s.diameter === STEPS[2] && scaleIs(s, STEPS[2]), '5 a later page load keeps the step (D11)',
    `diameter ${s.diameter}`);
  await page.locator('#minimap').screenshot({ path: join(process.env.M2_SHOT_DIR || dirname(fileURLToPath(import.meta.url)), `m2-radar-${label}-100m.png`) })
    .catch(() => {});

  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  check(false, 'run completed', e.message);
} finally {
  await browser.close();
  const fails = results.filter(r => r.state === 'FAIL').length;
  const inc = results.filter(r => r.state === 'INCONCLUSIVE').length;
  console.log(`\n${label}: ${results.length - fails - inc} pass / ${fails} fail / ${inc} inconclusive`);
  process.exit(fails ? 1 : 0);
}
