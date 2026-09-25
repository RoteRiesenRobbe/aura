#!/usr/bin/env node
// Skill VFX C3c, the live preview page (docs/plan-skill-vfx.md §12f.7.4): the
// dev-only `fx-preview.html` entry that the content editor iframes, driving
// the REAL SkillFx renderer from two stub actors with no server.
//
// Legs, all read through `window.__fxPreview.counters()` (= SkillFx.counters(),
// which counts at SPAWN time, so no poll can miss a 200 ms layer):
//   1 `?gallery` spawns at least one Fx of EVERY kind within two cycles, plus
//     the engine's hit mark (`impact`) on the `hit` slots; screenshots.
//   2 `fx-preview.html` alone spawns NOTHING until a message arrives; then a
//     posted `wave` layer spawns a `wave`; screenshot.
//   3 a message from a foreign origin is ignored: a host page on
//     http://127.0.0.2:<port> (a loopback address OUTSIDE the guard's
//     localhost / 127.0.0.1 list) iframes the preview and posts the same wave
//     into it; the frame spawns nothing, then a trusted post from the frame's
//     own origin spawns (the positive control that proves the frame was alive).
//     ⚑ Not a `data:` page, which the spec named: Chrome refuses to load the
//     preview frame at all under a data: (or any public-address) parent
//     (Private Network Access; the frame lands on chrome-error://), so such a
//     page can never post into it. A private but untrusted origin is the
//     only one that reaches the guard.
//   4 the ready handshake reaches the PARENT in both modes (the editor swaps
//     any frame that stays silent for 3 s), read in leg 3's host page and
//     matched by `event.source`, as the editor matches it.
//
// ⚑ Needs the webpack DEV server on the URL given (npm run start, or
// ./scripts/dev-restart.sh frontend): the page is dev-only by construction and
// the prod bundle does not carry it. No aurad, no DB.
// ⚑ The one console error ignored is the 404 on `<origin>/skills`: Skills.ts
// fetches the real catalog at import, and on this page it resolves to the dev
// server, which has none. The page registers its own definitions instead.
//
// Usage: node skill-fx-preview.mjs [devServerUrl] [shotsDir]
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const base = (process.argv[2] || 'http://localhost:2001').replace(/\/$/, '');
const outdir = process.argv[3] || '/tmp/skill-fx-preview';
mkdirSync(outdir, { recursive: true });

const KINDS = ['strike', 'projectile', 'beam', 'cast-pose', 'orbit', 'emitter', 'wave'];
const WAVE_MESSAGE = {
  type: 'aura-fx-preview',
  visual: { layers: [{ kind: 'wave', on: 'fired' }] },
  layerIndex: 0,
  category: 'cooldown',
  paletteTag: 'frost',
  reachUnits: 2,
};

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };
const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  env,
});
const errors = [];
let failed = 0;
const pass = (m) => console.log('PASS: ' + m);
const note = (m) => console.log('NOTE: ' + m);
const fail = (m) => { failed++; console.log('FAIL: ' + m); };

function collect(page, tag) {
  page.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const where = m.location()?.url || '';
    if (/\/skills$/.test(where) || /favicon/i.test(where)) return;
    errors.push(`${tag} console: ${m.text()} ${where}`);
  });
}

const spawned = (c) => Object.values(c.spawnedByKind).reduce((n, v) => n + v, 0);

try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 400 } });

  // --- leg 1: the gallery -------------------------------------------------
  const gallery = await context.newPage();
  collect(gallery, 'gallery');
  // The editor's gallery iframe is 100 % wide x 220 px; the gallery lays its
  // seven slots across whatever width it gets, so 1400 wide = 200 px slots.
  await gallery.setViewportSize({ width: 1400, height: 220 });
  await gallery.goto(`${base}/fx-preview.html?gallery`, { waitUntil: 'domcontentloaded' });
  await gallery.waitForFunction(() => window.__fxPreview?.ready === true, null, { timeout: 30_000 });
  const mode = await gallery.evaluate(() => window.__fxPreview.mode);
  if (mode === 'gallery') pass('?gallery boots in gallery mode');
  else fail(`?gallery booted in mode ${mode}`);
  // Two cycles of the longest slot is well under 4 s (a thrust + the mark, an
  // extend beam, an orbit, all < 1.5 s with the 600 ms gap).
  const allKinds = await gallery.waitForFunction((kinds) => {
    const c = window.__fxPreview.counters().spawnedByKind;
    return kinds.every(k => (c[k] ?? 0) >= 1) && (c.impact ?? 0) >= 1;
  }, KINDS, { timeout: 6_000 }).then(() => true).catch(() => false);
  const g1 = await gallery.evaluate(() => window.__fxPreview.counters());
  console.log(`gallery counters: ${JSON.stringify(g1.spawnedByKind)} live ${g1.live} density ${g1.density}`);
  if (allKinds) pass('the gallery spawned every kind at least once, plus the engine hit mark');
  else fail(`a kind never spawned in the gallery: missing ${KINDS.filter(k => !(g1.spawnedByKind[k] >= 1)).join(', ') || 'impact'}`);
  if (g1.density === 'full') pass('the preview draws at density full');
  else fail(`the preview draws at density ${g1.density}`);
  const labels = await gallery.$$eval('#fx-label span', s => s.map(e => e.textContent));
  if (labels.length === KINDS.length && KINDS.every((k, i) => labels[i].startsWith(k))) pass(`seven labelled slots: ${labels.join(' | ')}`);
  else fail(`gallery labels: ${JSON.stringify(labels)}`);
  // Several frames: a 200 ms layer is only on some of them. Look at them.
  for (let i = 0; i < 4; i++) {
    await gallery.screenshot({ path: join(outdir, `gallery-${i}.png`), clip: { x: 0, y: 0, width: 1400, height: 218 } });
    await gallery.waitForTimeout(170);
  }
  // Then one shot PER SLOT, armed on that kind's own spawn counter with the
  // page clock slowed 8x (the skill-fx.mjs recipe): every Fx clock reads
  // performance.now, so 800 ms of real time is 100 ms into the layer, and a
  // 200 ms thrust or a 480 ms bolt is on the frame instead of between frames.
  // The loops run on setTimeout, which the trick leaves alone.
  for (const [slot, kind] of KINDS.entries()) {
    const armed = await gallery.evaluate((k) => new Promise((resolve) => {
      const base0 = window.__fxPreview.counters().spawnedByKind[k] ?? 0;
      const started = Date.now();
      // ⚑ The deadline is generous and counted in POLLS, not wall time: a
      // headless screenshot can stall the page's main thread for seconds, and
      // after such a stall a wall-clock deadline fired before the slot's own
      // overdue loop timer (measured: a different slot "missed" on each run).
      let polls = 0;
      const poll = setInterval(() => {
        if ((window.__fxPreview.counters().spawnedByKind[k] ?? 0) > base0) {
          clearInterval(poll);
          const real = performance.now.bind(performance);
          const at = real();
          window.__realNow = real;
          performance.now = () => at + (real() - at) / 8;
          resolve(true);
        } else if (++polls > 1_000 && Date.now() - started > 10_000) { clearInterval(poll); resolve(false); }
      }, 10);
    }), kind);
    if (!armed) { fail(`slot ${kind}: no spawn within 10 s to photograph`); continue; }
    await gallery.waitForTimeout(800);
    await gallery.screenshot({ path: join(outdir, `gallery-slot-${slot + 1}-${kind}.png`), clip: { x: slot * 200, y: 0, width: 200, height: 220 } });
    await gallery.evaluate(() => { if (window.__realNow) { performance.now = window.__realNow; window.__realNow = null; } });
  }
  // The gallery FITS ITS FRAME (PO, 2026-09-25: at 100 % zoom the fixed 1400 px
  // strip cut the wave off): at 700 px wide the canvas is 700 px and the seven
  // label cells span exactly the width, nothing overflows.
  await gallery.setViewportSize({ width: 700, height: 220 });
  await gallery.waitForTimeout(500);
  const fit = await gallery.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const cells = [...document.querySelectorAll('#fx-label span')];
    return {
      canvasCss: canvas ? canvas.getBoundingClientRect().width : -1,
      cells: cells.length,
      cellSum: cells.reduce((sum, c) => sum + c.getBoundingClientRect().width, 0),
      scrollW: document.documentElement.scrollWidth,
    };
  });
  if (Math.abs(fit.canvasCss - 700) <= 2 && fit.cells === KINDS.length && Math.abs(fit.cellSum - 700) <= 4 && fit.scrollW <= 700) pass(`the gallery fits a 700 px frame: canvas ${fit.canvasCss} px, ${fit.cells} cells spanning ${fit.cellSum.toFixed(0)} px, no overflow`);
  else fail(`the gallery does not fit a 700 px frame: ${JSON.stringify(fit)}`);
  await gallery.setViewportSize({ width: 1400, height: 220 });
  await gallery.waitForTimeout(3_000);
  const g2 = await gallery.evaluate(() => window.__fxPreview.counters());
  const looping = KINDS.filter(k => (g2.spawnedByKind[k] ?? 0) > (g1.spawnedByKind[k] ?? 0));
  if (looping.length === KINDS.length) pass('every gallery slot keeps looping');
  else fail(`slots that stopped looping: ${KINDS.filter(k => !looping.includes(k)).join(', ')}`);
  await gallery.close();

  // --- leg 2: message mode ------------------------------------------------
  const single = await context.newPage();
  await single.setViewportSize({ width: 480, height: 240 });
  collect(single, 'single');
  await single.goto(`${base}/fx-preview.html`, { waitUntil: 'domcontentloaded' });
  await single.waitForFunction(() => window.__fxPreview?.ready === true, null, { timeout: 30_000 });
  await single.waitForTimeout(1_500);
  const idle = await single.evaluate(() => window.__fxPreview.counters());
  const waiting = await single.textContent('#fx-label');
  if (spawned(idle) === 0 && idle.live === 0 && idle.ambient === 0) pass(`no message, nothing spawned (label "${waiting}")`);
  else fail(`spawned without a message: ${JSON.stringify(idle.spawnedByKind)}`);
  await single.evaluate((msg) => window.postMessage(msg, '*'), WAVE_MESSAGE);
  const waved = await single.waitForFunction(() => (window.__fxPreview.counters().spawnedByKind.wave ?? 0) >= 1, null, { timeout: 3_000 })
    .then(() => true).catch(() => false);
  if (waved) pass('a posted wave layer spawned a wave');
  else fail('a posted wave layer spawned no wave within 3 s');
  await single.waitForTimeout(150);
  await single.screenshot({ path: join(outdir, 'single-wave.png') });
  const after = await single.evaluate(() => window.__fxPreview.counters());
  const others = spawned(after) - (after.spawnedByKind.wave ?? 0);
  if (others === 0) pass(`the wave preview drew only waves (${after.spawnedByKind.wave}), label "${await single.textContent('#fx-label')}"`);
  else fail(`the wave preview drew ${others} other Fx: ${JSON.stringify(after.spawnedByKind)}`);
  // A malformed message (index out of range) is ignored: the wave keeps looping.
  await single.evaluate((msg) => window.postMessage({ ...msg, layerIndex: 3 }, '*'), WAVE_MESSAGE);
  await single.waitForTimeout(1_500);
  const kept = await single.evaluate(() => window.__fxPreview.counters());
  if ((kept.spawnedByKind.wave ?? 0) > (after.spawnedByKind.wave ?? 0)) pass('a malformed message is ignored and the last layer keeps looping');
  else fail('the wave stopped after a malformed message');
  await single.close();

  // --- legs 3 + 4: an untrusted origin, and the handshake at the parent ----
  const html = `<!DOCTYPE html><html><body>
    <iframe id="single" src="${base}/fx-preview.html" width="240" height="120"></iframe>
    <iframe id="gallery" src="${base}/fx-preview.html?gallery" width="240" height="120"></iframe>
    <script>
      window.__ready = [];
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'aura-fx-preview-ready') {
          window.__ready.push(e.source === document.getElementById('single').contentWindow ? 'single'
            : e.source === document.getElementById('gallery').contentWindow ? 'gallery' : 'other');
        }
      });
    </script></body></html>`;
  const server = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(html); });
  await new Promise((resolve) => server.listen(0, '127.0.0.2', resolve));
  const host = await context.newPage();
  collect(host, 'foreign-host');
  await host.goto(`http://127.0.0.2:${server.address().port}/`);
  const handshake = await host.waitForFunction(() => window.__ready.includes('single') && window.__ready.includes('gallery'), null, { timeout: 30_000 })
    .then(() => true).catch(() => false);
  const ready = await host.evaluate(() => window.__ready);
  if (handshake) pass(`the ready handshake reached the parent from both modes (${ready.join(', ')}), matched by event.source`);
  else fail(`ready handshake at the parent: ${JSON.stringify(ready)}`);
  const frame = host.frames().find(f => f.url() === `${base}/fx-preview.html`);
  if (!frame) {
    fail('the single-layer iframe never appeared in the foreign host page');
  } else {
    await frame.waitForFunction(() => window.__fxPreview?.ready === true, null, { timeout: 30_000 });
    await host.evaluate((msg) => document.getElementById('single').contentWindow.postMessage(msg, '*'), WAVE_MESSAGE);
    await host.waitForTimeout(1_500);
    const foreign = await frame.evaluate(() => window.__fxPreview.counters());
    if (spawned(foreign) === 0) pass('a message from http://127.0.0.2 (an untrusted origin) was ignored');
    else fail(`a foreign-origin message spawned: ${JSON.stringify(foreign.spawnedByKind)}`);
    // The positive control: the same frame answers a trusted post.
    await frame.evaluate((msg) => window.postMessage(msg, '*'), WAVE_MESSAGE);
    const control = await frame.waitForFunction(() => (window.__fxPreview.counters().spawnedByKind.wave ?? 0) >= 1, null, { timeout: 3_000 })
      .then(() => true).catch(() => false);
    if (control) pass('control: the same frame drew the wave from a trusted origin');
    else fail('control: the frame drew nothing from a trusted origin either, so the foreign leg proves nothing');
  }
  await host.close();
  server.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('PAGE ERRORS:');
  errors.forEach(e => console.log('  ' + e));
  failed++;
} else {
  pass('no page error (the /skills 404 aside)');
}
note(`screenshots in ${outdir}: gallery-0..3.png, gallery-slot-N-<kind>.png, single-wave.png`);
console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
