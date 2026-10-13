#!/usr/bin/env node
// What the darkness layer COSTS per frame on a desktop GPU (cleanup.md entry 5, closed 2026-10-13;
// plan-lightmap.md D3). A MEASUREMENT script: its deliverable is the table it
// prints; it asserts only that the run was honest (a real GPU, frames not
// vsync-capped, the venue reached).
//
// Two venues, both derived:
//   - DAYLIGHT on the main world: the nearest point to the zone's centre that
//     is >= 14 u from every darkness-declaring atmosphere and dark circle, so no
//     darkness is on screen. Since L1 the darkness layer still renders here,
//     because the white base quad makes its bounds the whole viewport.
//   - The UNDERWORLD's middle: Cave Air everywhere, the lightmap full screen.
//
// Variants, toggled IN THE SAME SESSION so the A/B shares a venue, a GPU state
// and a scene (ROUNDS rounds, order rotated each round, median over rounds):
//   built     - the page as shipped
//   no-base   - the base quad hidden: ≈ the pre-L1 cost (the bounds were the
//               dark shapes and lights only). Draws WRONG colours; timing only.
//   res-0.5   - both darkness and haze filters at resolution 0.5 (entry 5(a))
//   no-dark   - the darkness layer hidden: the floor, what the layer costs at all
//
// ⛔ Frame time is read from rAF deltas with VSYNC OFF and the frame-rate limit
// lifted, or every variant reads 16.7 ms and the A/B is meaningless. The script
// reports the WebGL renderer: SwiftShader means the numbers are CPU raster and
// say nothing about a GPU, and it refuses.
//
//   node .claude/skills/verify/darkness-frametime.mjs [dpr=1] [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readZone } from './lib/zone.mjs';
import { joinAsNewCharacter } from './lib/join.mjs';

const dpr = Number(process.argv[2] || 1);
const label = process.argv[3] || `frametime-dpr${dpr}`;
const url = process.argv[4]
  || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const HEADED = process.env.AURA_HEADED === '1';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const outDir = dirname(fileURLToPath(import.meta.url));
const root = join(outDir, '../../..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PX = 120;
const VIEW = { width: 1920, height: 1080 };
const SAMPLE_MS = 4000;
const ROUNDS = 5;
const VARIANTS = ['built', 'no-base', 'res-0.5', 'no-dark'];

/** Distance from a point to an axis-aligned box. */
const boxDist = (p, b) => Math.hypot(
  Math.max(b.x0 - p.x, 0, p.x - b.x1), Math.max(b.y0 - p.y, 0, p.y - b.y1));

function daylightVenue() {
  const zone = readZone(join(root, 'api/zones/world.json'));
  const air = JSON.parse(readFileSync(join(root, 'api/atmospheres/profiles.json'), 'utf8'));
  const boxes = (zone.atmospheres || [])
    .filter(a => air[a.profile] && air[a.profile].darkness > 0)
    .map(a => {
      const xs = a.points.map(q => q.x), ys = a.points.map(q => q.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    })
    .concat((zone.darkAreas || []).map(c => ({
      x0: c.x - c.radius, x1: c.x + c.radius, y0: c.y - c.radius, y1: c.y + c.radius })));
  const w = zone.bounds.width / 2 - 10, h = zone.bounds.height / 2 - 10;
  let best = null;
  for (let x = -w; x <= w; x += 2) {
    for (let y = -h; y <= h; y += 2) {
      const p = { x, y };
      if (boxes.some(b => boxDist(p, b) < 14)) { continue; }
      const d = Math.hypot(x, y);
      if (!best || d < best.d) { best = { x, y, d }; }
    }
  }
  return { name: 'daylight (world)', x: best.x, y: best.y };
}

function underworldVenue() {
  const zone = readZone(join(root, 'api/zones/underworld.json'));
  return { name: 'underworld', x: zone.origin.x, y: zone.origin.y };
}

const median = (a) => { const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };

(async () => {
  const venues = [daylightVenue(), underworldVenue()];
  const browser = await chromium.launch({
    headless: !HEADED,
    args: [
      '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
      '--disable-gpu-vsync', '--disable-frame-rate-limit',
    ],
  });
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const out = { dpr, view: VIEW, headed: HEADED, venues: {} };

  try {
    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) { return 'no webgl2'; }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    });
    out.gpu = gpu;
    console.log(`GPU: ${gpu} · ${VIEW.width}x${VIEW.height} @ DPR ${dpr}${HEADED ? ' (headed)' : ''}`);
    if (/swiftshader|llvmpipe|software/i.test(gpu)) {
      console.log('⛔ software rasteriser: these numbers say nothing about a GPU. Retry with AURA_HEADED=1.');
      process.exit(1);
    }

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log(`joined as ${await joinAsNewCharacter(page, 'frametime')}`);
    await sleep(6000);
    const cmd = async (text) => {
      await page.evaluate((t) => {
        const input = document.getElementById('console_command');
        if (!input) { return; }
        input.value = t;
        document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
      }, text);
      await sleep(700);
    };
    await cmd('GOD');
    await page.evaluate(() => {
      const p = document.getElementById('developPanel');
      if (p) { p.style.display = 'none'; }
    });

    for (const venue of venues) {
      await cmd(`WARP ${Math.round(venue.x * PX)} ${Math.round(venue.y * PX)}`);
      // Poll until the camera has settled on the player (a cross-zone jump has
      // been measured at ~40 s).
      let last = null, settled = false;
      for (let i = 0; i < 40 && !settled; i++) {
        await sleep(1500);
        const here = await page.evaluate(() => {
          const ch = window.game && window.game.character;
          if (!ch) { return null; }
          const g = ch.shape.getGlobalPosition();
          return { wx: ch.getX() / 120, wy: ch.getY() / 120, sx: g.x, sy: g.y };
        });
        settled = here && last && Math.abs(here.sx - last.sx) < 0.5 && Math.abs(here.sy - last.sy) < 0.5
          && Math.abs(here.wx - venue.x) < 1 && Math.abs(here.wy - venue.y) < 1;
        last = here;
      }
      if (!settled) { console.log(`⚠️  ${venue.name}: camera never settled at the venue, skipped`); continue; }
      await sleep(3000);

      const runs = {};
      for (let round = 0; round < ROUNDS; round++) {
        // Rotated each round so no variant always runs first or last.
        const order = VARIANTS.map((_, i) => VARIANTS[(i + round) % VARIANTS.length]);
        for (const variant of order) {
          const stats = await page.evaluate(async ({ variant, ms }) => {
            const dk = window.game.layers.darkness;
            const hz = window.game.layers.haze;
            const base = dk.children[0];
            // ⚑ The base quad is the layer's FIRST child and a WHITE sprite
            // (DarknessOverlay.loadZone, plan-lightmap.md D3).
            const isBase = !!(base && base.texture);
            const filters = [...(dk.filters || []), ...(hz.filters || [])];
            const saved = { visible: dk.visible, baseVisible: base && base.visible,
              res: filters.map(f => f.resolution) };
            if (variant === 'no-base' && isBase) { base.visible = false; }
            if (variant === 'res-0.5') { filters.forEach(f => { f.resolution = 0.5; }); }
            if (variant === 'no-dark') { dk.visible = false; }
            await new Promise(r => setTimeout(r, 600));
            // ⭐ GPU time per frame, from a TIME_ELAPSED query on the game's own
            // context: one query closed and the next opened in each of OUR rAF
            // callbacks, so each query spans exactly one frame of the game's
            // drawing whatever order the callbacks run in. This is the number
            // fill rate shows up in; rAF deltas on a fast desktop GPU are
            // CPU/compositor-bound and noisier than the A/B.
            const canvas = document.querySelector('canvas');
            const gl = canvas && canvas.getContext('webgl2');
            const ext = gl && gl.getExtension('EXT_disjoint_timer_query_webgl2');
            const deltas = [], gpu = [], pending = [];
            let open = null;
            const harvest = () => {
              while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
                const qy = pending.shift();
                if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
                  gpu.push(gl.getQueryParameter(qy, gl.QUERY_RESULT) / 1e6);
                }
                gl.deleteQuery(qy);
              }
            };
            await new Promise((resolve) => {
              let prev = performance.now();
              const end = prev + ms;
              const tick = (now) => {
                deltas.push(now - prev); prev = now;
                if (ext) {
                  if (open) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(open); }
                  open = now < end ? gl.createQuery() : null;
                  if (open) { gl.beginQuery(ext.TIME_ELAPSED_EXT, open); }
                  harvest();
                }
                if (now < end) { requestAnimationFrame(tick); } else { resolve(); }
              };
              requestAnimationFrame(tick);
            });
            for (let i = 0; i < 30 && ext && pending.length; i++) {
              await new Promise(r => requestAnimationFrame(r));
              harvest();
            }
            dk.visible = saved.visible;
            if (base) { base.visible = saved.baseVisible; }
            filters.forEach((f, i) => { f.resolution = saved.res[i]; });
            deltas.shift();
            gpu.shift();
            const quant = (arr) => {
              const s = [...arr].sort((a, b) => a - b);
              const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
              return s.length ? { p50: q(0.5), p95: q(0.95) } : { p50: NaN, p95: NaN };
            };
            const raf = quant(deltas), g = quant(gpu);
            return { n: deltas.length, p50: raf.p50, p95: raf.p95,
              mean: deltas.reduce((a, b) => a + b, 0) / deltas.length,
              gpuN: gpu.length, gpu50: g.p50, gpu95: g.p95, timer: !!ext,
              darkVisible: saved.visible, filterRes: saved.res };
          }, { variant, ms: SAMPLE_MS });
          (runs[variant] = runs[variant] || []).push(stats);
        }
      }
      const row = {};
      for (const v of VARIANTS) {
        row[v] = {
          p50: median(runs[v].map(r => r.p50)),
          p95: median(runs[v].map(r => r.p95)),
          fps: 1000 / median(runs[v].map(r => r.mean)),
          spread: [Math.min(...runs[v].map(r => r.p50)), Math.max(...runs[v].map(r => r.p50))],
          frames: runs[v].reduce((a, r) => a + r.n, 0),
          gpu50: median(runs[v].map(r => r.gpu50)),
          gpu95: median(runs[v].map(r => r.gpu95)),
          gpuSpread: [Math.min(...runs[v].map(r => r.gpu50)), Math.max(...runs[v].map(r => r.gpu50))],
        };
      }
      out.venues[venue.name] = { at: { x: venue.x, y: venue.y }, filterRes: runs.built[0].filterRes,
        darkActive: runs.built[0].darkVisible, timer: runs.built[0].timer, row };
      console.log(`\n${venue.name} at (${venue.x}, ${venue.y}) · darkness layer active: `
        + `${runs.built[0].darkVisible} · filter resolution(s) as built: ${runs.built[0].filterRes.join(', ')}`
        + ` · GPU timer: ${runs.built[0].timer ? 'yes' : 'NO (rAF only)'}`);
      console.log('  variant   GPU p50 ms  GPU p95 ms  (range)       rAF p50 ms   fps');
      for (const v of VARIANTS) {
        const r = row[v];
        console.log(`  ${v.padEnd(9)} ${r.gpu50.toFixed(3).padStart(10)} ${r.gpu95.toFixed(3).padStart(11)}`
          + `  ${(r.gpuSpread[0].toFixed(2) + '-' + r.gpuSpread[1].toFixed(2)).padEnd(12)}`
          + ` ${r.p50.toFixed(2).padStart(10)} ${r.fps.toFixed(0).padStart(6)}`);
      }
      if (Math.abs(row.built.p50 - 16.67) < 0.3 && Math.abs(row['no-dark'].p50 - 16.67) < 0.3) {
        console.log('  ⚠️  every variant reads ~16.7 ms: frames are vsync-capped and this A/B proves nothing');
      }
    }
  } finally {
    writeFileSync(join(outDir, `${label}.json`), JSON.stringify(out, null, 1));
    if (errors.length) { console.log(`\n${errors.length} page error(s): ${errors[0]}`); }
    await browser.close();
  }
})();
