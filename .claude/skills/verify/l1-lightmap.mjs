#!/usr/bin/env node
// plan-lightmap.md: the darkness layer as a lightmap, read as PIXELS.
//
// Venue: the TUNNEL zone (derived from the zone file, never typed in): one
// authored dark circle and one campfire inside it. Its static glow is the
// light under test, so no skill has to be granted or switched on. The probe
// stands inside the circle and samples five world points through the camera
// transform:
//
//   core   inside the campfire's fully lit core
//   edge   in the glow's soft rim (a partial value: the blend's maths shows)
//   near   just inside the rim, the brighter side of the ramp
//   dark   inside the circle, out of every light
//   lit    outside the circle's fade, plain daylight
//
// Modes:
//   baseline  write the samples to l1-lightmap-baseline.json (run on the OLD
//             build, before L1)
//   parity    L1's exit: every sample within ±TOL per channel of the baseline,
//             and `dark` exactly 0,0,0 (no shine-through, PO 2026-10-13)
//   colour    L2's exit: `core` and `near` shift warm against the baseline
//             (R/B up), `dark` still 0,0,0, `lit` unchanged
//   single    L4's exit (D8): the campfire draws ONE light. In the fully lit
//             core one coloured screen leaves the world × the colour; the
//             doubled glow (static + wire) left the world × (1-(1-c)²), paler.
//             The baseline's white core is the world itself, so `core` must
//             read baseline × the campfire colour (read from the skill file).
//
//   node .claude/skills/verify/l1-lightmap.mjs baseline|parity|colour|single [url]
//
// ⛔ Pixels, never structure (plan §6): "is the blend mode screen?" passes on
// a build that composites wrongly.

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';
import { readZone } from './lib/zone.mjs';

const mode = process.argv[2] || 'parity';
const url = process.argv[3]
  || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const outDir = dirname(fileURLToPath(import.meta.url));
const root = join(outDir, '../../..');
const BASELINE = join(outDir, 'l1-lightmap-baseline.json');
const PX = 120;
const VIEW = { width: 2400, height: 1300 };
// Per-channel tolerance for parity: render-target rounding, nothing more.
const TOL = 3;
const results = [];
const pass = (n, d = '') => { results.push('PASS'); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push('FAIL'); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function venue() {
  const zone = readZone(join(root, 'api/zones/tunnel.json'));
  const dark = zone.darkAreas[0];
  const fire = zone.bindPoints[0];
  const campfire = JSON.parse(readFileSync(join(root, 'api/skills/mobs/campfire-aura.json'), 'utf8'));
  const lightEffect = campfire.effects.find(e => e.type === 'light_aura');
  const light = lightEffect.radius;
  const hex = parseInt((lightEffect.color || '#ffffff').slice(1), 16);
  const color = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => c / 255);
  // A point inside the circle, out of the fire's reach, and the stand a few
  // units off it so the player's own sight hole covers none of the samples.
  // Offsets fitted to the tunnel and a 2400x1300 view at the default zoom:
  // the camera fixes the VERTICAL extent (about ±3.8 u), so samples spread sideways.
  return {
    origin: zone.origin,
    color,
    stand: { x: fire.x + 1, y: fire.y - 1 },
    points: {
      core: { x: fire.x - 1.5, y: fire.y + 0.5 },
      near: { x: fire.x - light * 0.6, y: fire.y },
      edge: { x: fire.x - light * 0.79, y: fire.y },
      dark: { x: fire.x + 7, y: fire.y - 3.5 },
      lit: { x: fire.x + 7.5, y: fire.y + 2 },
    },
  };
}

(async () => {
  const v = venue();
  console.log(`venue: tunnel, stand (${v.stand.x.toFixed(2)}, ${v.stand.y.toFixed(2)})`);
  const browser = await chromium.launch({ env });
  const page = await browser.newPage({ viewport: VIEW });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const name = await joinAsNewCharacter(page, 'lmap');
    console.log(`joined as ${name}`);
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
    await cmd(`WARP ${Math.round((v.stand.x + v.origin.x) * PX)} ${Math.round((v.stand.y + v.origin.y) * PX)}`);

    // Settle: still AND on screen (a5's lesson: a clamped camera can park the
    // player off the viewport while perfectly still).
    let last = null, settled = false;
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      const here = await page.evaluate(() => {
        const ch = window.game && window.game.character;
        if (!ch) { return null; }
        const g = ch.shape.getGlobalPosition();
        return { sx: g.x, sy: g.y };
      });
      if (here && last && Math.abs(here.sx - last.sx) < 0.5 && Math.abs(here.sy - last.sy) < 0.5
        && here.sx > 0 && here.sx < VIEW.width && here.sy > 0 && here.sy < VIEW.height) {
        settled = true; break;
      }
      last = here;
    }
    if (!settled) { throw new Error('camera did not settle at the venue'); }
    await sleep(2500);

    const screen = await page.evaluate(({ pts, origin }) => {
      const out = {};
      for (const [k, p] of Object.entries(pts)) {
        const g = window.game.layers.darkness.toGlobal({ x: (p.x + origin.x) * 120, y: (p.y + origin.y) * 120 });
        out[k] = { x: Math.round(g.x), y: Math.round(g.y) };
      }
      return out;
    }, { pts: v.points, origin: v.origin });
    for (const [k, p] of Object.entries(screen)) {
      if (p.x < 3 || p.y < 3 || p.x > VIEW.width - 3 || p.y > VIEW.height - 3) {
        throw new Error(`sample ${k} is off screen at (${p.x}, ${p.y})`);
      }
    }

    // Which build is this? Logged, never asserted: a parity run against the
    // OLD build would pass trivially, so the log says which one was measured.
    const build = await page.evaluate(() => {
      const dk = window.game.layers.darkness;
      const blends = {};
      (dk.children || []).forEach((c) => { blends[c.blendMode] = (blends[c.blendMode] || 0) + 1; });
      return { filter: dk.filters && dk.filters[0] && dk.filters[0].blendMode, blends };
    });
    console.log(`  build: darkness filter blend ${build.filter}, children ${JSON.stringify(build.blends)}`);

    // ⚑ The DOM HUD (minimap, bars, toasts) sits over the corners where the
    // dark and lit samples land; hide everything but the canvas.
    await page.addStyleTag({ content: 'body *{visibility:hidden !important} canvas{visibility:visible !important}' });
    // The minimap is a canvas of its own: hide every canvas but the game's.
    await page.evaluate(() => document.querySelectorAll('canvas').forEach((c) => {
      if (c.width < 1000) { c.style.setProperty('visibility', 'hidden', 'important'); }
    }));
    await sleep(300);

    // Two shots a beat apart, averaged: a wandering mob or a flicker in one
    // frame must not read as a blend change.
    const shoot = async () => {
      const shot = await page.screenshot({ path: join(outDir, `l1-lightmap-${mode}.png`) });
      return page.evaluate(async ({ b64, pts }) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const out = {};
        for (const [k, p] of Object.entries(pts)) {
          const d = g.getImageData(p.x - 2, p.y - 2, 5, 5).data;
          const s = [0, 0, 0];
          for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
          out[k] = s.map(x => x / 25);
        }
        return out;
      }, { b64: shot.toString('base64'), pts: screen });
    };
    const a = await shoot();
    await sleep(1200);
    const b = await shoot();
    const samples = {};
    for (const k of Object.keys(a)) { samples[k] = a[k].map((x, i) => Math.round((x + b[k][i]) / 2 * 10) / 10); }
    for (const [k, s] of Object.entries(samples)) { console.log(`  ${k.padEnd(5)} rgb(${s.join(', ')}) @ screen (${screen[k].x}, ${screen[k].y})`); }

    if (mode === 'baseline') {
      writeFileSync(BASELINE, JSON.stringify({ samples, screen, at: new Date().toISOString() }, null, 2) + '\n');
      console.log(`baseline written to ${BASELINE}`);
    } else {
      if (!existsSync(BASELINE)) { throw new Error('no baseline: run `baseline` on the pre-L1 build first'); }
      const base = JSON.parse(readFileSync(BASELINE, 'utf8')).samples;
      const zero = samples.dark.every(c => c === 0);
      (zero ? pass : fail)('full darkness shows nothing', `dark rgb(${samples.dark.join(', ')})`);
      const close = (k) => samples[k].every((c, i) => Math.abs(c - base[k][i]) <= TOL);
      const diff = (k) => samples[k].map((c, i) => (c - base[k][i]).toFixed(1)).join('/');
      (close('lit') ? pass : fail)('daylight untouched', `Δ ${diff('lit')}`);
      if (mode === 'single') {
        // The two predictions sit ~30 levels apart in G and B, so TOL decides.
        const one = base.core.map((c, i) => c * v.color[i]);
        const two = base.core.map((c, i) => c * (1 - (1 - v.color[i]) ** 2));
        const fmt = (s) => s.map(c => c.toFixed(1)).join('/');
        const near = samples.core.every((c, i) => Math.abs(c - one[i]) <= TOL);
        (near ? pass : fail)('campfire core is ONE light',
          `rgb ${fmt(samples.core)} vs one ${fmt(one)}, doubled ${fmt(two)}`);
      } else if (mode === 'parity') {
        for (const k of ['core', 'near', 'edge']) {
          (close(k) ? pass : fail)(`${k} matches the erase build`, `Δ ${diff(k)}`);
        }
      } else {
        const warm = (s) => (s[0] + 1) / (s[2] + 1);
        for (const k of ['core', 'near']) {
          const before = warm(base[k]), after = warm(samples[k]);
          (after > before * 1.1 ? pass : fail)(`${k} shifts warm`, `R/B ${before.toFixed(2)} → ${after.toFixed(2)}`);
        }
      }
    }
  } catch (e) {
    fail('run', String(e && e.message || e));
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => r === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
