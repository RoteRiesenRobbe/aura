#!/usr/bin/env node
// `blend` on the DARKNESS half of an atmosphere — the soft border, measured as a
// NUMBER rather than eyeballed (2026-09-17, PO ask: "its border is too sharp").
//
// What only a browser can show here:
//
//   1. The darkness surface is MASKED at all. `paintAir`'s `flat` branch used to
//      return a plain `Graphics().poly().fill()` before any mask was built, so
//      every dark bank had a hard polygon edge and `blend` was read on the haze
//      path only. A masked surface in the scene graph is what the fix produces
//      and nothing else on this layer does.
//
//   2. ⭐ THE RAMP ITSELF, in pixels. This is the leg that matters, because a
//      mask that is built, attached, and then composited wrongly inside the
//      darkness layer's AlphaFilter render target would satisfy leg 1 and still
//      draw a hard edge — or a full opaque rectangle over the mask footprint,
//      which is the documented failure mode of a detached mask.
//
// ⚑ VENUE: DERIVED, never typed in — the first darkness-declaring atmosphere
// (or, for the clearing subject, the first darkness-cutting clearing) with an
// AXIS-ALIGNED VERTICAL edge at least 8 u long, and the probe stands inside it.
// A vertical edge is what lets every column be averaged down a tall strip, and
// that averaging is what takes the ground texture out of the reading.
//
// ⛔ IT NEEDS A TEMPORARY PROBE SHAPE, and that is not an accident of the
// current content: nothing shipped authors an axis-aligned atmosphere, and the
// underworld's own `Cave Air` quad is LARGER THAN ITS ZONE — its edges sit
// outside the walkable area, where the camera clamps at the map boundary and
// the player is drawn hundreds of px off centre with the edge off screen
// entirely. Shrink it to a rect well inside the bounds (x 0..20, y -12..12
// works), add a clearing rect inside that for the clearing subject, restart the
// server, and restore api/zones/underworld.json afterwards.
// ⚑ [[project-zone-edit-half-live]] — the client HMRs a zone edit, the server
// reads it once at boot.
//
// ⚑ THE PLAYER'S OWN LIGHT IS NOT A CONFOUND HERE, and that is measured rather
// than hoped: an unaided player carries `SELF_SIGHT_FLOOR_PX = 40` px of hole,
// i.e. 0.33 u — the probe stands 2 u from the edge, so its own light never
// reaches the band. (a4-clearing's venue had the opposite problem and its pixel
// leg is inconclusive because of it.)
//
// ⚑ IT IS AN A/B, because a lone "the edge is 180 px wide" reading cannot tell a
// ramp from a camera that is out of focus, a half-loaded tile or a blur that was
// always there. Run `on` (the profile as authored), then set the four darkness
// profiles to `blend: 0`, let the dev server rebuild, and run `off`.
//
//   node .claude/skills/verify/a5-darkness-blend.mjs on|off [label] [url]

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

// on | off | clearing-on | clearing-off. The SUBJECT picks which soft edge is
// measured; the MODE is which half of that subject's A/B this run is.
const arg = process.argv[2] || 'on';
const subject = arg.indexOf('clearing') === 0 ? 'clearing' : 'air';
const mode = /off$/.test(arg) ? 'off' : 'on';
const key = subject === 'clearing' ? 'clearing-' + mode : mode;
const label = process.argv[3] || ('a5-' + key);
// ⚑ PORT 2001, the webpack dev server — the same note a4-clearing carries: on
// 2000 the account screens never become visible on this host and the join times
// out. It also means an edit to atmosphere-profiles.json reaches the next run
// through HMR, which is what makes the A/B cheap.
const url = process.argv[4]
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
const results = [];
const pass = (n, d = '') => { results.push(['PASS', n, d]); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push(['FAIL', n, d]); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const skip = (n, d = '') => { results.push(['SKIP', n, d]); console.log(`  ⚠️  ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PX = 120;            // api/shared-constants.json pointsPerMeter
const VIEW = { width: 1280, height: 800 };
const STAND_OFF_U = 2;     // how far west of the edge the probe stands

/**
 * The venue, derived: a zone whose atmosphere declares darkness and has an
 * axis-aligned VERTICAL edge long enough to average down.
 */
function venue() {
  const air = JSON.parse(readFileSync(
    join(root, 'frontend/src/client-data/atmosphere-profiles.json'), 'utf8'));
  for (const file of fs.readdirSync(join(root, 'api/zones'))) {
    if (!file.endsWith('.json')) { continue; }
    const zone = JSON.parse(readFileSync(join(root, 'api/zones', file), 'utf8'));
    const origin = zone.origin || { x: 0, y: 0 };
    for (const atm of (zone.atmospheres || [])) {
      const p = air[atm.profile];
      if (!p || !(p.darkness > 0)) { continue; }
      if (subject === 'clearing') {
        // The rim of a hole rather than the edge of a bank. ⚑ Inside the hole
        // is the LIT half and outside it is the dark bank, so the luminance
        // profile falls exactly as it does for a bank edge and everything below
        // reads the same way.
        for (const c of (zone.clearings || [])) {
          if (c.clears !== 'darkness' && c.clears !== 'both') { continue; }
          for (let i = 0; i < c.points.length; i++) {
            const a = c.points[i], b = c.points[(i + 1) % c.points.length];
            if (Math.abs(a.x - b.x) > 0.01) { continue; }
            if (Math.abs(a.y - b.y) < 8) { continue; }
            const cxs = c.points.map(q => q.x);
            if (a.x !== Math.min(...cxs)) { continue; }
            return {
              zone: file, profile: atm.profile + ' (clearing rim)',
              blend: 'CLEARING_FADE', darkness: p.darkness,
              edgeX: a.x,
              stand: { x: a.x + STAND_OFF_U, y: (a.y + b.y) / 2 },
              origin,
            };
          }
        }
        continue;
      }
      // A vertical edge: two consecutive points sharing an x, far apart in y.
      for (let i = 0; i < atm.points.length; i++) {
        const a = atm.points[i], b = atm.points[(i + 1) % atm.points.length];
        if (Math.abs(a.x - b.x) > 0.01) { continue; }
        if (Math.abs(a.y - b.y) < 8) { continue; }
        const xs = atm.points.map(q => q.x);
        // The WESTERN edge, and stand INSIDE the bank looking back out at it —
        // inside is where the darkness is, so the probe's own tile is the dark
        // half and the lit half is what it looks across at.
        if (a.x !== Math.min(...xs)) { continue; }
        return {
          zone: file, profile: atm.profile, blend: p.blend,
          darkness: p.darkness,
          edgeX: a.x,
          stand: { x: a.x + STAND_OFF_U, y: (a.y + b.y) / 2 },
          origin,
        };
      }
    }
  }
  return null;
}

/**
 * Per-column mean luminance across a horizontal band, so a VERTICAL edge is
 * read as a 1-D profile and the ground texture averages out.
 */
async function columnProfile(page, tag, band) {
  const shot = await page.screenshot({ path: join(outDir, `${label}-${tag}.png`) });
  return page.evaluate(async ({ b64, band }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, band.y, c.width, band.h).data;
    const cols = new Array(c.width).fill(0);
    for (let y = 0; y < band.h; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        cols[x] += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
    }
    return cols.map(v => v / band.h);
  }, { b64: shot.toString('base64'), band });
}

/**
 * How wide the transition is, in PIXELS: the distance between the 20 % and 80 %
 * crossings of the local luminance range around the edge.
 *
 * ⚑ 20/80 rather than 10/90 on purpose — a Gaussian ramp has long tails that a
 * wider pair would read as noise-dependent, and the number is a comparison
 * between two runs, not an absolute anyone tunes against.
 */
function rampWidth(cols, centre, halfWindow) {
  const lo = Math.max(0, Math.round(centre - halfWindow));
  const hi = Math.min(cols.length - 1, Math.round(centre + halfWindow));
  const raw = cols.slice(lo, hi + 1);
  // ⚑ Smoothed over 5 columns before any threshold is applied. The crossings
  // below are FIRST/LAST-index searches, so one noisy column of ground texture
  // would move a crossing by tens of pixels and the number would be of the
  // tile, not the ramp.
  const K = 2;
  const win = raw.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - K); j <= Math.min(raw.length - 1, i + K); j++) { sum += raw[j]; n++; }
    return sum / n;
  });
  const min = Math.min(...win), max = Math.max(...win);
  if (max - min < 4) { return { width: null, min, max }; }
  const t20 = min + (max - min) * 0.2;
  const t80 = min + (max - min) * 0.8;
  // ⛔ THE EDGE CAN FALL AS WELL AS RISE, and the first draft assumed it rose.
  // Standing INSIDE a dark bank and looking west, the profile starts BRIGHT and
  // drops — so a first-crossing search matched column 0 for both thresholds and
  // reported a 0 px transition for a perfectly good 2 u ramp, which reads
  // exactly like the feature not working.
  const firstAtLeast = (t) => { for (let i = 0; i < win.length; i++) { if (win[i] >= t) { return i; } } return null; };
  const lastAtLeast = (t) => { for (let i = win.length - 1; i >= 0; i--) { if (win[i] >= t) { return i; } } return null; };
  const rising = win[win.length - 1] > win[0];
  const x20 = rising ? firstAtLeast(t20) : lastAtLeast(t20);
  const x80 = rising ? firstAtLeast(t80) : lastAtLeast(t80);
  if (x20 === null || x80 === null) { return { width: null, min, max }; }
  return { width: Math.abs(x80 - x20), min, max, lo, rising };
}

(async () => {
  const want = venue();
  if (!want) {
    console.log('⚠️  no zone authors a darkness atmosphere with a long vertical edge — nothing to probe.');
    process.exit(0);
  }
  console.log(`A5 venue (derived): ${want.zone} · ${want.profile} `
    + `(darkness ${want.darkness}, blend ${want.blend ?? 'unauthored'})`);
  console.log(`  edge at x=${want.edgeX}; standing ${STAND_OFF_U} u inside at `
    + `(${want.stand.x}, ${want.stand.y})`);

  const browser = await chromium.launch({ env });
  const page = await browser.newPage({ viewport: VIEW });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const name = await joinAsNewCharacter(page, 'a5');
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
    // ⚑ #developPanel covers the right-hand side of the screen and would sit
    // ON TOP of the very columns this probe reads.
    await page.evaluate(() => {
      const p = document.getElementById('developPanel');
      if (p) { p.style.display = 'none'; }
    });

    const gx = Math.round((want.stand.x + want.origin.x) * PX);
    const gy = Math.round((want.stand.y + want.origin.y) * PX);
    await cmd(`WARP ${gx} ${gy}`);

    // ⚑ Poll for the camera rather than sleeping a fixed interval: a CROSS-ZONE
    // jump has been measured at ~40 s to settle, and a shot taken early renders
    // the PREVIOUS position with no error and a perfectly plausible frame.
    let settled = false, last = null;
    for (let i = 0; i < 40; i++) {
      await sleep(1500);
      const here = await page.evaluate(() => {
        const ch = window.game && window.game.character;
        if (!ch) { return null; }
        const g = ch.shape.getGlobalPosition();
        return { wx: ch.getX(), wy: ch.getY(), sx: g.x, sy: g.y };
      });
      // ⛔ ON SCREEN as well as STILL. A tiny zone's camera CLAMPS at the map
      // edge, so a settled player can sit hundreds of px outside the viewport —
      // and then every column this probe reads is of somewhere else. The first
      // draft checked stillness alone, reported "settled at screen 1780" on a
      // 1280-wide page, and measured nothing.
      if (here && last && Math.abs(here.sx - last.sx) < 0.5 && Math.abs(here.sy - last.sy) < 0.5
        && here.sx > 0 && here.sx < VIEW.width
        && here.sy > 0 && here.sy < VIEW.height) { settled = true; break; }
      last = here;
    }
    if (!settled) {
      skip('the camera never settled at the venue', 'nothing below can be trusted');
      throw new Error('camera did not settle');
    }
    const pos = await page.evaluate(() => {
      const ch = window.game.character;
      const g = ch.shape.getGlobalPosition();
      return { wx: ch.getX() / 120, wy: ch.getY() / 120, sx: g.x, sy: g.y };
    });
    console.log(`  settled at world (${pos.wx.toFixed(2)}, ${pos.wy.toFixed(2)}), `
      + `screen (${pos.sx.toFixed(0)}, ${pos.sy.toFixed(0)})`);

    // --- 1. THE MASK, structurally ------------------------------------------
    const surfaces = await page.evaluate(() => {
      const dk = window.game && window.game.layers && window.game.layers.darkness;
      if (!dk) { return null; }
      let masked = 0, plain = 0;
      (function walk(node) {
        if (node.context) {
          if (node.mask) { masked++; } else { plain++; }
        }
        (node.children || []).forEach(walk);
      })(dk);
      // ⛔ SCOPED TO THE ATMOSPHERE CONTAINER for the erase counts, never to the
      // whole layer: the layer also holds the campfire glows and the player's
      // own lantern, which are erase-blended sprites too and would be counted as
      // clearings. The container is DarknessOverlay's own child — the only
      // plain Container among the layer's children.
      const air = (dk.children || []).find(c => !c.context && !c.texture);
      let eraseSprite = 0, eraseGraphics = 0;
      if (air) {
        (function walk(node) {
          if (node.blendMode === 'erase') {
            if (node.context) { eraseGraphics++; } else { eraseSprite++; }
          }
          (node.children || []).forEach(walk);
        })(air);
      }
      return { masked, plain, eraseSprite, eraseGraphics, foundAir: !!air };
    });
    if (surfaces === null) {
      skip('could not reach the darkness layer', 'window.game.layers is not armed');
    } else if (subject === 'clearing') {
      // ⚑ A clearing's hole is an ERASE, and the structural question is WHICH
      // KIND: a feathered hole is an erase-blended SPRITE (the blurred
      // silhouette drawn directly), a hard one is an erase-blended GRAPHICS.
      // ⛔ It is deliberately NOT "is the erase masked" — the first build did
      // mask it, that assertion passed, and the hole did not exist on screen at
      // all, because a masked object loses its blend mode in PixiJS.
      if (mode === 'on' && surfaces.eraseSprite > 0 && surfaces.eraseGraphics === 0) {
        pass("the clearing's hole is a RAMPED erase SPRITE — CLEARING_FADE reached cutHole",
          `${surfaces.eraseSprite} erase sprite, ${surfaces.eraseGraphics} hard erase Graphics`);
      } else if (mode === 'on') {
        fail("⛔ the clearing's hole is not a ramped erase sprite",
          JSON.stringify(surfaces));
      } else if (surfaces.eraseGraphics > 0 && surfaces.eraseSprite === 0) {
        pass('(off half) the hole is a HARD erase Graphics, as a zero band should produce',
          JSON.stringify(surfaces));
      } else {
        console.log(`  (off half: ${JSON.stringify(surfaces)})`);
      }
    } else if (mode === 'on' && surfaces.masked > 0) {
      pass('the darkness surface is MASKED — `blend` reached the flat branch',
        `${surfaces.masked} masked, ${surfaces.plain} unmasked Graphics in the darkness layer`);
    } else if (mode === 'on') {
      fail('⛔ NO masked Graphics in the darkness layer — paintAir still returns early',
        JSON.stringify(surfaces));
    } else if (surfaces.masked === 0) {
      pass('(off half) no masked Graphics, as blend: 0 should produce',
        `${surfaces.plain} unmasked Graphics`);
    } else {
      fail('(off half) a mask survived blend: 0', JSON.stringify(surfaces));
    }

    // --- 2. ⭐ THE RAMP, in pixels -------------------------------------------
    //
    // ⚑ MAPPED, never assumed from the player's position: `Cam Boundaries: On`
    // clamps the camera at the map edges, so the player is NOT drawn at the
    // centre in a small zone and any offset arithmetic off their sprite is
    // wrong there. toGlobal is the documented world→screen mapping.
    const edgeCol = await page.evaluate(({ wx, wy }) => {
      const parent = window.game.character.shape.parent;
      return parent.toGlobal({ x: wx * 120, y: wy * 120 }).x;
    }, { wx: want.edgeX + want.origin.x, wy: want.stand.y + want.origin.y });
    if (edgeCol < 60 || edgeCol > VIEW.width - 60) {
      skip('the authored edge is off screen at this venue',
        `column ${edgeCol.toFixed(0)} of ${VIEW.width}`);
      throw new Error('edge off screen');
    }
    // ⚑ A band BELOW the avatar, not above it: the top-left of the screen
    // carries the resource and XP bars, which are bright, fixed, and would sit
    // inside the very columns this probe reads.
    const band = {
      y: Math.min(VIEW.height - 190, Math.max(0, Math.round(pos.sy) + 60)),
      h: 180,
    };
    const cols = await columnProfile(page, mode, band);
    const half = 200;   // ± 1.7 u around the authored line
    const ramp = rampWidth(cols, edgeCol, half);
    console.log(`  edge expected at column ${edgeCol.toFixed(0)}; `
      + `band rows ${band.y}..${band.y + band.h}`);
    console.log(`  luminance across the window: ${ramp.min.toFixed(1)} … ${ramp.max.toFixed(1)}`);

    const stash = join(outDir, '.a5-ramp.json');
    const readings = fs.existsSync(stash) ? JSON.parse(readFileSync(stash, 'utf8')) : {};
    if (ramp.width === null) {
      skip('no usable luminance step at the edge column',
        `range ${(ramp.max - ramp.min).toFixed(1)} — is the bank drawn at all?`);
    } else {
      console.log(`  20→80 % transition width with ${key.toUpperCase()}: `
        + `${ramp.width} px (${(ramp.width / PX).toFixed(2)} u)`);
      readings[key] = ramp.width;
      writeFileSync(stash, JSON.stringify(readings, null, 1));
    }

    const onKey = subject === 'clearing' ? 'clearing-on' : 'on';
    const offKey = subject === 'clearing' ? 'clearing-off' : 'off';
    if (readings[onKey] === undefined || readings[offKey] === undefined) {
      skip(`only the "${key}" half of the A/B has been run`,
        subject === 'clearing'
          ? `now set CLEARING_FADE to ${mode === 'on' ? '0' : '2'} in RegionPaint.ts and run the other`
          : `now author blend: ${mode === 'on' ? '0' : '2'} on the darkness profiles and run the other`);
    } else {
      const factor = readings[onKey] / Math.max(1, readings[offKey]);
      console.log(`  A/B at one fixed edge: on ${readings[onKey]} px vs off ${readings[offKey]} px `
        + `(×${factor.toFixed(1)})`);
      // ⚑ The bar is DERIVED: a blend of B world units should span about B×120
      // px, and the hard edge is a handful of px of antialiasing. Asking for a
      // 5× separation is well outside anything a screenshot's noise can invent,
      // and far under the ~30× the authored numbers predict.
      const what = subject === 'clearing' ? 'CLEARING_FADE' : '`blend`';
      if (factor >= 5) {
        pass(`⭐ THE SAME EDGE ramps with ${what} and steps without it`,
          `${readings[offKey]} px → ${readings[onKey]} px (×${factor.toFixed(1)})`);
      } else {
        fail(`⛔ ${what} changed nothing at the edge`,
          `${readings[offKey]} px → ${readings[onKey]} px (×${factor.toFixed(1)})`);
      }
    }

    if (errors.length === 0) { pass('no page errors'); }
    else { fail(`${errors.length} page error(s)`, errors[0]); }
  } catch (e) {
    fail('the run threw', String(e).split('\n')[0]);
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.filter(r => r[0] === 'PASS').length} passed, ${failed} failed, `
    + `${results.filter(r => r[0] === 'SKIP').length} unproven`);
  process.exit(failed > 0 ? 1 : 0);
})();
