#!/usr/bin/env node
// A4 of plan-region-atmosphere.md — a CLEARING is its own class, and it cuts a
// real hole in the air at the real game surface.
//
// What only a browser can show here, and it is not the picture:
//
//   1. ⛔ THE SEAM. `DarknessOverlay.isHidden` is the GAMEPLAY query deciding
//      whether a mob's nameplate is readable. Before A4 a clearing WAS an
//      atmosphere declaring `darkness: 0`, so the profile walk answered 0 on
//      its own; A4 took the profile away, and a profile-less shape is INVISIBLE
//      to that walk. Get this wrong and the picture is PERFECT — the hole is
//      painted, the mob is lit — while the sim hides every nameplate inside the
//      lit pocket. Nothing throws and no screenshot shows it. That is the whole
//      reason this script exists.
//
//   2. The erase actually LANDS in the darkness layer's own render target
//      rather than punching through the ground beneath it.
//
// ⚑ IT IS AN A/B AND ONLY THE A/B PROVES ANYTHING. A single "I was lit" reading
// cannot tell a working clearing from a zone that is not dark anywhere. Every
// leg below pairs a point INSIDE the clearing with a control point inside the
// same bank and OUTSIDE the clearing.
//
// ⚑ The venue is DERIVED from api/zones/world.json, never typed in: the probe
// looks for a clearing that actually overlaps a darkness-declaring atmosphere
// and computes both points from the two shapes. A harness that hardcodes where
// the PO put their fog is stale the next time they move it (verify SKILL.md
// rule 1, and the c4-region-texture lesson).
//
// ⚑ Restart the server after any zone edit — [[project-zone-edit-half-live]].
//
//   node .claude/skills/verify/a4-clearing.mjs [label] [url]

import { createRequire } from 'node:module';
import fs from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

// 'on'  — the zone as authored, the clearing present.
// 'off' — run this AFTER temporarily deleting zone.clearings from world.json.
//
// ⛔ THE A/B IS THE ONLY HONEST PIXEL LEG, and the first draft of this script
// got it wrong in a way worth recording. It sampled the clearing at one point
// and a "control" point 7 units away inside the same bank, and called the
// clearing proven because the first was brighter. But two points that far apart
// sit on DIFFERENT GROUND — different regions, different textures, different
// colours — so the brightness difference measured the terrain at least as much
// as the air. Worse, both crops were dominated by the same centred avatar and
// HUD, which compresses any real difference toward 1.0.
//
// ⭐ The fix is p1-closed-path's: hold the POINT fixed and change the one thing
// under test. Same tile, same ground, same HUD, clearing present vs absent —
// then the only variable left is the hole.
const mode = process.argv[2] === 'off' ? 'off' : 'on';
const label = process.argv[3] || ('a4-' + mode);
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
const results = [];
const pass = (n, d = '') => { results.push(['PASS', n, d]); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push(['FAIL', n, d]); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const skip = (n, d = '') => { results.push(['SKIP', n, d]); console.log(`  ⚠️  ${n}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const PX = 120;   // api/shared-constants.json pointsPerMeter

// ⚑ Roughly what the local player's own light erases around them, in world
// units — the starting aura's radius, the scale Lantern (4.0) and Torch (2.5)
// are quoted at in atmosphere-profiles.json. It is a THRESHOLD FOR REPORTING,
// never an assertion: all it decides is whether this script is allowed to call
// a flat pixel reading "inconclusive" instead of "broken".
const OWN_LIGHT_U = 4;

/** Ray casting, the same rule Regions.pointInPolygon uses. */
function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) { inside = !inside; }
  }
  return inside;
}

/**
 * Find a real venue in the authored zone: a point inside BOTH a clearing and a
 * darkness-declaring atmosphere, plus a control inside that atmosphere and
 * outside every clearing.
 *
 * ⚑ Sampled on a grid rather than solved: the shapes are arbitrary polygons and
 * "a point inside the overlap" has no closed form worth writing here.
 */
function venue() {
  const root = join(outDir, '../../..');
  const zone = JSON.parse(readFileSync(join(root, 'api/zones/world.json'), 'utf8'));
  const air = JSON.parse(readFileSync(
    join(root, 'frontend/src/client-data/atmosphere-profiles.json'), 'utf8'));

  const dark = (zone.atmospheres || []).filter(a => {
    const p = air[a.profile];
    return p && typeof p.darkness === 'number' && p.darkness > 0;
  });
  const holes = (zone.clearings || []).filter(
    c => c.clears === 'darkness' || c.clears === 'both');
  if (dark.length === 0 || holes.length === 0) { return null; }

  const xs = [], ys = [];
  dark.forEach(a => a.points.forEach(p => { xs.push(p.x); ys.push(p.y); }));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);

  // ⛔ THE DEEPEST POINT INSIDE, not the first one found. The probe crops a
  // patch of screen NEXT TO the avatar (the avatar itself is identical in both
  // runs and only dilutes the reading), so the sample lands a couple of units
  // away from where the player stands — and the first grid hit is by
  // construction near an EDGE, where that offset walks straight out of the hole
  // into the bank. That is not a subtle failure: it inverted the whole A/B and
  // reported "no hole was cut" for a clearing that was working perfectly
  // (measured 2026-09-16). Standing in the middle is what makes the patch
  // trustworthy, and it is the same "a fixture has to be AWKWARD" lesson
  // zone-polygons P3 records — here applied to where the probe LOOKS.
  const clearance = (pt, polys) => {
    let best = 0;
    for (let r = 0.5; r <= 12; r += 0.5) {
      const ok = polys.some(poly => inPoly(pt, poly)
        && inPoly({ x: pt.x + r, y: pt.y }, poly) && inPoly({ x: pt.x - r, y: pt.y }, poly)
        && inPoly({ x: pt.x, y: pt.y + r }, poly) && inPoly({ x: pt.x, y: pt.y - r }, poly));
      if (!ok) { break; }
      best = r;
    }
    return best;
  };

  let lit = null, litDepth = 0, control = null;
  const STEP = 0.25;
  const holePolys = holes.map(c => c.points);
  const bankPolys = dark.map(a => a.points);
  for (let x = x0; x <= x1; x += STEP) {
    for (let y = y0; y <= y1; y += STEP) {
      const pt = { x: +x.toFixed(2), y: +y.toFixed(2) };
      if (!bankPolys.some(poly => inPoly(pt, poly))) { continue; }

      const depth = clearance(pt, holePolys);
      if (depth > litDepth) { litDepth = depth; lit = pt; }

      if (!control) {
        const nearHole = holes.some(c => inPoly(pt, c.points)
          || inPoly({ x: pt.x + 3, y: pt.y }, c.points) || inPoly({ x: pt.x - 3, y: pt.y }, c.points)
          || inPoly({ x: pt.x, y: pt.y + 3 }, c.points) || inPoly({ x: pt.x, y: pt.y - 3 }, c.points));
        const solidBank = bankPolys.some(poly => inPoly(pt, poly)
          && inPoly({ x: pt.x + 1, y: pt.y }, poly) && inPoly({ x: pt.x - 1, y: pt.y }, poly)
          && inPoly({ x: pt.x, y: pt.y + 1 }, poly) && inPoly({ x: pt.x, y: pt.y - 1 }, poly));
        if (!nearHole && solidBank) { control = pt; }
      }
    }
  }
  // ⚑ The patch offset below is ~1.5 units; anything shallower than that cannot
  // hold it, so refuse rather than measure the wrong ground.
  if (litDepth < 2) { lit = null; }

  return lit && control
    ? { lit, control, dark, holes, litDepth, darkness: air[dark[0].profile].darkness }
    : null;
}

(async () => {
  // ⛔ THE "off" HALF CANNOT DERIVE THE VENUE, because deriving it needs the
  // clearing that has just been removed — and re-deriving would in any case pick
  // a DIFFERENT point, which is exactly the confound this A/B exists to remove.
  // The point is taken from the stash the "on" half wrote, so both halves
  // measure the same tile by construction.
  const stashPath = join(outDir, '.a4-luminance.json');
  const prior = fs.existsSync(stashPath) ? JSON.parse(readFileSync(stashPath, 'utf8')) : {};
  let want = venue();
  if (!want && mode === 'off' && prior.point) {
    want = { lit: prior.point, control: prior.point, dark: [], holes: [], darkness: prior.darkness };
    console.log('(off half: reusing the point the "on" half measured)');
  }
  if (!want) {
    console.log('⚠️  world.json authors no clearing overlapping a dark atmosphere — nothing to probe.');
    process.exit(0);
  }
  console.log(`A4 venue (derived): lit ${JSON.stringify(want.lit)} · control ${JSON.stringify(want.control)}`);
  console.log(`  ${want.dark.length} darkness bank(s), ${want.holes.length} darkness-cutting clearing(s)`);
  const DARKNESS = want.darkness;
  if (want.litDepth) { console.log(`  sample point sits ${want.litDepth} u clear of every clearing edge`); }

  // ⛔ NO --use-gl=swiftshader. Under SwiftShader on this host PixiJS fails to
  // compile its batch shader AND its own error reporter throws on the way out
  // (logPrettyShaderError), so the renderer never starts and every reading below
  // is of a blank page. Measured 2026-09-16. The default GL backend renders.
  const browser = await chromium.launch({ env });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // ⚑ PORT 2001, the webpack dev server. On 2000 the account screens never
    // become visible on this host and the join times out; on 2001 they overlay
    // the game UI as designed. Measured 2026-09-16.
    const name = await joinAsNewCharacter(page, 'a4');
    console.log(`joined as ${name}`);
    await sleep(6000);

    // ⚑ The DEV PANEL's console form, not window.game — the same seam every
    // other probe in this directory drives cheats through. `window.game` is a
    // separate surface (BrowserConsole) and is NOT reliably armed on this host;
    // see the seam leg below, which reports honestly rather than passing.
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

    /** Mean luminance of a centre patch of the canvas — what the player sees. */
    const brightness = async (tag) => {
      await sleep(1600);
      const shot = await page.screenshot({
        path: join(outDir, `${label}-${tag}.png`),
        // ⛔ NOT the centre — the avatar, its aura ring and the HUD sit there,
        // are IDENTICAL in both runs, and only dilute the signal toward 1.0.
        // ⛔ And not far off it either: at ~120 px/unit this offset is about 1.5
        // units, which is why the venue above insists on >= 2 u of clearance.
        // An offset that leaves the hole samples the bank in BOTH runs and
        // reports a working clearing as broken.
        clip: { x: 1280 / 2 + 60, y: 800 / 2 + 40, width: 160, height: 160 },
      });
      // Decode the PNG through the browser, so this script needs no image lib.
      return page.evaluate(async (b64) => {
        const img = new Image();
        img.src = 'data:image/png;base64,' + b64;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        }
        return sum / (d.length / 4);
      }, shot.toString('base64'));
    };

    // --- 1. ⛔ THE SEAM, asked BEFORE the player goes anywhere near it ------
    //
    // ⛔⛔ THE PLAYER'S OWN LIGHT LIGHTS THE PLAYER. isHidden() returns false for
    // any point inside any light, and the local player carries one — so asking
    // it about the tile you are standing on ALWAYS answers "lit", whatever the
    // air is doing. This leg was written the other way round first and both
    // readings came back false, which reads exactly like a broken clearing and
    // is nothing of the kind. Ask from a distance; the query takes explicit
    // world-pixel coordinates precisely so it can be asked about somewhere else.
    //
    // ⚑ Hence: no WARP before this, and the pixel A/B below runs AFTER it.
    const seam = mode === 'off' ? {skipHalf: true} : await page.evaluate(({ lit, control, px }) => {
      const fn = window.game && window.game.darkness && window.game.darkness.isHidden;
      if (typeof fn !== 'function') { return { unavailable: true }; }
      return { lit: fn(lit.x * px, lit.y * px), control: fn(control.x * px, control.y * px) };
    }, { lit: want.lit, control: want.control, px: PX });

    if (seam.skipHalf) {
      // The seam is an 'on'-only question: with no clearing authored there is
      // nothing for it to answer about.
    } else if (seam.unavailable) {
      // ⛔ REPORTED, NEVER PASSED OVER — the seam is what this script is for.
      skip('the isHidden SEAM is UNPROVEN in-game — window.game is not armed',
        'it is mutation-verified under vitest instead; this is the in-game half');
    } else if (seam.control === true && seam.lit === false) {
      pass('⭐ THE SEAM: the sim reports LIT inside the clearing and DARK outside it',
        `lit=${seam.lit} control=${seam.control} — a profile-less shape reached the walk`);
    } else if (seam.control === true && seam.lit === true) {
      fail('⛔ THE A4 SEAM IS BROKEN: the sim still calls the clearing dark',
        'nameplates inside the lit pocket are hidden, and the picture looks perfect');
    } else {
      fail('the control point is not dark, so the A/B proves nothing',
        `lit=${seam.lit} control=${seam.control} — is the player standing on it, or is the zone lit?`);
    }

    // --- 2. THE DRAWING, structurally ---------------------------------------
    //
    // ⭐ This is the leg that actually proves the hole is DRAWN, and it is
    // structural rather than photographic for a reason the pixel A/B below
    // explains at length: on this zone's geometry the camera cannot see the
    // difference. An erase-blended Graphics in the scene graph is what
    // `cutHole` produces and nothing else in this feature does.
    const erase = await page.evaluate(() => {
      const root = window.game && window.game.character
        && window.game.character.plate && window.game.character.plate.parent
        && window.game.character.plate.parent.parent;
      if (!root) { return null; }
      const stage = (function top(c) { return c && c.parent ? top(c.parent) : c; })(root);
      let erase = 0, graphics = 0;
      (function walk(node) {
        if (node.context) { graphics++; if (node.blendMode === 'erase') { erase++; } }
        (node.children || []).forEach(walk);
      })(stage);
      return { erase, graphics };
    });
    if (erase === null) {
      skip('could not reach the scene graph', 'window.game.character is not armed');
    } else if (mode === 'on' && erase.erase > 0) {
      pass('an erase-blended Graphics is in the scene graph — the hole was cut',
        `${erase.erase} erase of ${erase.graphics} Graphics`);
    } else if (mode === 'on') {
      fail('⛔ NO erase-blended Graphics anywhere — cutHole never ran',
        JSON.stringify(erase));
    } else {
      console.log(`  (off half: ${erase.erase} erase Graphics — campfire glows and the player's own light)`);
    }

    // --- 3. THE PIXEL A/B: what the camera can and cannot settle -----------
    //
    // ⛔ THE A/B IS THE WHOLE LEG. A single "it looks bright" reading cannot tell
    // a working clearing from a zone that is not dark anywhere, so both points
    // sit inside the SAME darkness bank and differ only in whether a clearing
    // covers them.
    await cmd(`WARP ${Math.round(want.lit.x * PX)} ${Math.round(want.lit.y * PX)}`);
    const here = await brightness(mode);

    // ⚑ The reading is STORED, and the run that has both compares them. Neither
    // run alone can say anything — which is the point.
    const stash = join(outDir, '.a4-luminance.json');
    const readings = fs.existsSync(stash) ? JSON.parse(readFileSync(stash, 'utf8')) : {};
    readings[mode] = here;
    readings.point = want.lit;
    if (want.darkness !== undefined) { readings.darkness = want.darkness; }
    if (want.litDepth) { readings.depth = want.litDepth; }
    writeFileSync(stash, JSON.stringify(readings, null, 1));
    console.log(`  luminance at (${want.lit.x}, ${want.lit.y}) with clearing ${mode.toUpperCase()}: ${here.toFixed(1)}`);

    if (readings.on === undefined || readings.off === undefined) {
      skip(`only the "${mode}" half of the A/B has been run`,
        `now run the other: node .claude/skills/verify/a4-clearing.mjs ${mode === 'on' ? 'off' : 'on'}`);
    } else {
      // ⚑ THE BAR IS DERIVED, not picked. How much brighter a cut hole can be is
      // bounded by how dark the bank was: this one is darkness ${DARKNESS},
      // further scaled by the overlay's own MAX_ALPHA. A round multiple would
      // fail on a legitimately thin bank. What is asserted is a separation well
      // outside frame noise, with both numbers printed for a human to judge —
      // every number here is [PLACEHOLDER] anyway.
      const ratio = readings.on / readings.off;
      console.log(`  A/B at one fixed point: on ${readings.on.toFixed(1)} vs off ${readings.off.toFixed(1)} (×${ratio.toFixed(2)})`);
      if (ratio > 1.10) {
        pass('⭐ THE SAME TILE is brighter with the clearing than without it',
          `×${ratio.toFixed(2)} — the erase landed, and terrain cannot explain it`);
      } else if (readings.depth !== undefined && readings.depth <= OWN_LIGHT_U) {
        // ⛔⛔ THE CAMERA CANNOT SETTLE THIS ON THIS GEOMETRY, and saying so is
        // the only honest outcome. The clearing has to OVERLAP a darkness bank
        // to have anything to erase, and here that overlap is a strip only
        // ~${(readings.depth * 2).toFixed(1)} u across — narrower than the player's
        // OWN light, which erases the same darkness in BOTH runs. So the screen
        // is identical whether or not the clearing exists, and no threshold can
        // distinguish a working erase from a missing one.
        //
        // ⚑ THIS IS A CONTENT LIMITATION, NOT A DEFECT, and not a reason to
        // weaken the bar until it goes green: the drawing is proven structurally
        // by leg 2 and the sim by leg 1, and a pixel leg that passed here would
        // pass with cutHole deleted. To make the camera able to answer, author a
        // clearing whose overlap with a dark bank is comfortably wider than the
        // light the player carries.
        skip('the CAMERA cannot settle this on this zone\'s geometry',
          `×${ratio.toFixed(2)} — the dark/clear overlap is ~${(readings.depth * 2).toFixed(1)} u, `
          + `inside the player's own light; legs 1 and 2 carry the proof`);
      } else {
        fail('⛔ the clearing changes nothing on screen — no hole was cut', `×${ratio.toFixed(2)}`);
      }
    }

    if (errors.length === 0) { pass('no page errors'); }
    else { fail(`${errors.length} page error(s)`, errors[0]); }
  } finally {
    await browser.close();
  }

  const failed = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.filter(r => r[0] === 'PASS').length} passed, ${failed} failed, `
    + `${results.filter(r => r[0] === 'SKIP').length} unproven`);
  process.exit(failed > 0 ? 1 : 0);
})();
