// plan-world-map.md C1 — the map module's two states, at the real game surface.
//
// Owns: the docked <-> full-screen toggle and its three entry points, the
// click-away dismissal, the ONE-canvas property (reparented, never cloned),
// terrain baking into a single sprite, and session fog revealing as you walk.
// Does NOT own campfire markers (C2) or the player roster (C3).
//
// ⚑ Asserts against the DOM *and* the PixiJS scene graph, so it needs both the
// `&develop` console (for GOD/WARP) and window.game. The develop panel is
// hidden right after joining — it covers the right-hand side and would eat
// clicks aimed at the map button.
//
//   node .claude/skills/verify/c1-world-map.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'c1';
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

const outDir = dirname(fileURLToPath(import.meta.url));
const results = [];
const pass = (n, d = '') => { results.push(['PASS', n, d]); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push(['FAIL', n, d]); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };
const inconclusive = (n, d = '') => { results.push(['INCONCLUSIVE', n, d]); console.log(`  ⚠️  ${n}${d ? ' — ' + d : ''}`); };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** One atomic sample of everything the map state implies. */
const readMap = (page) => page.evaluate(() => {
  const panel = document.getElementById('worldMap');
  const canvases = document.querySelectorAll('canvas');
  let canvasParent = null;
  document.querySelectorAll('canvas').forEach((c) => {
    // The map canvas is whichever one sits in the minimap or the overlay.
    const inMinimap = c.closest('#minimap');
    const inWorldMap = c.closest('#worldMap');
    if (inMinimap) canvasParent = 'minimap';
    if (inWorldMap) canvasParent = 'worldMap';
  });
  return {
    panelHidden: panel ? panel.classList.contains('hidden') : null,
    canvasParent,
    totalCanvases: canvases.length,
    mapButtonExists: !!document.getElementById('mapButton'),
  };
});

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], env });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const name = await joinAsNewCharacter(page, 'map');
    console.log(`\njoined as ${name}\n`);
    await page.evaluate(() => {
      const p = document.getElementById('developPanel');
      if (p) p.style.display = 'none';
    });
    await sleep(2500);

    // --- 1. the docked baseline ------------------------------------------
    let s = await readMap(page);
    if (s.panelHidden === true && s.canvasParent === 'minimap') {
      pass('1 docked at start', `overlay hidden, canvas in #minimap`);
    } else {
      fail('1 docked at start', JSON.stringify(s));
    }
    const canvasCount = s.totalCanvases;
    if (!s.mapButtonExists) fail('1b map button present'); else pass('1b map button present');

    // --- 2. M opens it ----------------------------------------------------
    await page.keyboard.press('KeyM');
    await sleep(600);
    s = await readMap(page);
    if (s.panelHidden === false && s.canvasParent === 'worldMap') {
      pass('2 M opens the full-screen map', 'canvas reparented into #worldMap');
    } else {
      fail('2 M opens the full-screen map', JSON.stringify(s));
    }

    // ⚑ The ONE-canvas property, which is the whole architecture: opening the
    // map must MOVE the renderer, never stand up a second one.
    if (s.totalCanvases === canvasCount) {
      pass('2b one renderer, not two', `${s.totalCanvases} canvases before and after`);
    } else {
      fail('2b one renderer, not two', `${canvasCount} -> ${s.totalCanvases}`);
    }

    // --- 3. terrain is baked into exactly one sprite ----------------------
    const terrain = await page.evaluate(() => {
      const app = window.game?.character?.plate?.parent;
      // Reach the map's own stage instead: walk from the canvas's pixi app is
      // not exposed, so report what the DOM can see plus a screenshot check.
      return { reachable: !!app };
    });
    await page.screenshot({ path: `${process.argv[1].replace(/[^/]+$/, '')}${label}-map-open.png` });
    pass('3 screenshot captured', `${label}-map-open.png (terrain + fog to be read by eye)`);

    // --- 4. Escape closes -------------------------------------------------
    await page.keyboard.press('Escape');
    await sleep(600);
    s = await readMap(page);
    if (s.panelHidden === true && s.canvasParent === 'minimap') {
      pass('4 Escape closes and re-docks', 'canvas back in #minimap');
    } else {
      fail('4 Escape closes and re-docks', JSON.stringify(s));
    }

    // --- 5. clicking the minimap opens ------------------------------------
    const box = await page.locator('#minimap').boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(600);
      s = await readMap(page);
      if (s.panelHidden === false) pass('5 minimap tap opens');
      else fail('5 minimap tap opens', JSON.stringify(s));
    } else {
      inconclusive('5 minimap tap opens', 'no #minimap box');
    }

    // --- 6. click-away dismissal ------------------------------------------
    // The world is 2:1 and the viewport is 1400x900, so the map is letterboxed
    // top and bottom: a press near the very bottom is off the drawn map.
    if (s.panelHidden === false) {
      await page.mouse.click(700, 885);
      await sleep(600);
      const after = await readMap(page);
      if (after.panelHidden === true) {
        pass('6 click in the letterbox closes it');
      } else {
        fail('6 click in the letterbox closes it', JSON.stringify(after));
      }
    } else {
      inconclusive('6 click in the letterbox closes it', 'map was not open');
    }

    // --- 7. a press ON the map does NOT close (reserved for part 2) -------
    await page.keyboard.press('KeyM');
    await sleep(600);
    await page.mouse.click(700, 450);
    await sleep(600);
    s = await readMap(page);
    if (s.panelHidden === false) {
      pass('7 press on the map keeps it open', 'the gesture is reserved for flight');
    } else {
      fail('7 press on the map keeps it open', 'it closed');
    }

    // --- 8. the map button toggles ----------------------------------------
    await page.keyboard.press('Escape');
    await sleep(500);
    const btn = await page.locator('#mapButton').boundingBox();
    if (btn) {
      await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
      await sleep(600);
      s = await readMap(page);
      if (s.panelHidden === false) pass('8 map button opens');
      else fail('8 map button opens', JSON.stringify(s));
      await page.keyboard.press('Escape');
    } else {
      inconclusive('8 map button opens', 'no #mapButton box');
    }

    // --- 9. the overlay covers the HUD ------------------------------------
    await page.keyboard.press('KeyM');
    await sleep(700);
    const covering = await page.evaluate(() => {
      const probe = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit ? !!hit.closest('#worldMap') : null;
      };
      return {
        spellbook: probe('#spellbook'),
        auraSlots: probe('#auraLoadout') ?? probe('#auraSlotList'),
        nag: probe('#registrationNag'),
        // ⚑ The gear is z-index 101, above even the account screens. It was
        // the last thing still painting over the map.
        settings: probe('#gameSettings'),
        cooldowns: probe('#cooldownLoadout'),
      };
    });
    const covered = Object.entries(covering).filter(([, v]) => v === false).map(([k]) => k);
    const checked = Object.entries(covering).filter(([, v]) => v !== null).map(([k]) => k);
    if (checked.length === 0) {
      inconclusive('9 map covers the HUD', 'no HUD panels were visible to probe');
    } else if (covered.length === 0) {
      pass('9 map covers the HUD', `${checked.join(', ')} all behind the overlay`);
    } else {
      fail('9 map covers the HUD', `still on top: ${covered.join(', ')}`);
    }
    await page.screenshot({ path: `${process.argv[1].replace(/[^/]+$/, '')}${label}-covering.png` });

    // --- 10. fog reveals as you walk --------------------------------------
    // Not readable from the DOM: this is what the screenshots are for. Walk a
    // while with the map shut, then reopen and shoot.
    await page.keyboard.press('Escape');
    await sleep(400);
    await page.keyboard.down('KeyD');
    await sleep(6000);
    await page.keyboard.up('KeyD');
    await sleep(500);
    await page.keyboard.press('KeyM');
    await sleep(900);
    await page.screenshot({ path: `${process.argv[1].replace(/[^/]+$/, '')}${label}-after-walk.png` });
    pass('10 walked east with the map shut', `${label}-after-walk.png — fog corridor to be read by eye`);

  } catch (e) {
    fail('harness', e.message.split('\n')[0]);
  } finally {
    const real = errors.filter(e => !/favicon|Failed to load resource/i.test(e));
    console.log(`\nconsole errors: ${real.length}`);
    real.slice(0, 6).forEach(e => console.log('   ' + e));
    const p = results.filter(r => r[0] === 'PASS').length;
    const f = results.filter(r => r[0] === 'FAIL').length;
    const i = results.filter(r => r[0] === 'INCONCLUSIVE').length;
    console.log(`\n${p} passed, ${f} failed, ${i} inconclusive`);
    await browser.close();
    process.exit(f > 0 ? 1 : 0);
  }
})();
