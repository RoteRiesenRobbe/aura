#!/usr/bin/env node
// The C5 cost measurement (plan-region-primitive.md section 4.10): what does a
// live blend-band alpha mask cost per frame on a phone-shaped viewport?
//
//   node c5-mask-cost.mjs [label] [url]
//
// Run it TWICE against two builds - the authored blend widths, then every
// blend at 0 - and compare the frame-time stats as a RATIO. Headless perf
// transfers only as ratios, never absolutes (project memory: mobile layout);
// SwiftShader software rendering makes the absolute numbers meaningless but
// keeps the relative cost of an extra full-region filter pass visible.
//
// Why this exists: Pixi's AlphaMaskPipe is a FilterEffect - a render-target
// switch plus a filter pass per masked object per frame, sized to the object's
// bounds. At HEAD the one shipped Fields region spans the whole map, so with a
// non-zero blend EVERY frame pays a full-screen pass on a client that is
// measurably fill-bound. Section 4.10 says the live-vs-flattened choice is a
// measurement, not a design call; this script is that measurement.
//
// It also counts masked nodes in the live scene graph, so a run against the
// wrong build (both A and B masked, or neither) reports itself instead of
// producing a plausible 1.0x ratio that means nothing.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3]
  || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop&mobile';

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

// The throttling flags matter: a headless page throttles rAF hard, and a
// throttled clock measures the throttle, not the render.
const browser = await chromium.launch({
  args: [
    '--no-sandbox',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
  env,
});
// Phone-shaped: the platform already at its render ceiling is the one the
// cost question is about. DPR 3 is the measured mobile fill-rate killer.
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(url, { waitUntil: 'networkidle' });
await joinAsNewCharacter(page, 'mask');

// GOD so standing still for the sample window cannot end in a death that
// nulls the scene-graph entry point mid-measurement.
await page.waitForSelector('#console_command', { state: 'attached' });
await page.evaluate(() => {
  const input = document.getElementById('console_command');
  input.value = 'GOD';
  document.getElementById('console')
    .dispatchEvent(new Event('submit', { cancelable: true }));
  const panel = document.getElementById('developPanel');
  if (panel) { panel.style.display = 'none'; }
});

// Let the join settle and the zone tiles land (the tiles-landed repaint is
// the state a session actually runs in).
await page.waitForTimeout(8000);

// One atomic sample: masked-node census plus a rAF frame-time window.
const result = await page.evaluate(() => new Promise((resolve) => {
  // Root via the documented scene-graph entry point (window.game is a
  // four-method facade; the plate's parent chain reaches the real stage).
  let root = window.game.character.plate.parent;
  while (root.parent) { root = root.parent; }
  let maskedNodes = 0;
  const walk = (node) => {
    if (node.mask) { maskedNodes++; }
    (node.children || []).forEach(walk);
  };
  walk(root);

  const deltas = [];
  let last = null;
  const WINDOW_MS = 12000;
  const start = performance.now();
  const tick = (now) => {
    if (last !== null) { deltas.push(now - last); }
    last = now;
    if (now - start < WINDOW_MS) {
      requestAnimationFrame(tick);
    } else {
      // Drop the first second: join wake-up and texture uploads, not
      // steady state.
      const steady = deltas.filter((_, i) => i > 30).sort((a, b) => a - b);
      const at = (q) => steady[Math.min(steady.length - 1, Math.floor(q * steady.length))];
      resolve({
        maskedNodes,
        frames: steady.length,
        meanMs: steady.reduce((s, d) => s + d, 0) / steady.length,
        medianMs: at(0.5),
        p95Ms: at(0.95),
      });
    }
  };
  requestAnimationFrame(tick);
}));

console.log(`[c5-mask-cost] label=${label}`);
console.log(`  masked nodes in scene: ${result.maskedNodes}`);
console.log(`  frames sampled: ${result.frames}`);
console.log(`  frame time mean=${result.meanMs.toFixed(2)}ms `
  + `median=${result.medianMs.toFixed(2)}ms p95=${result.p95Ms.toFixed(2)}ms`);
if (errors.length > 0) {
  console.log(`  page errors (${errors.length}):`);
  errors.slice(0, 5).forEach((e) => console.log('    ' + e));
}

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
