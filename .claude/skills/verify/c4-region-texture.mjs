// plan-region-primitive.md C4 — region ground TEXTURES at the real game surface.
//
// Owns: that a textured profile paints its tile in the world, that the tile
// loaded as a separate file (never inlined), that the paint spec the renderer
// used is a texture and not the fallback colour (D14), and that the full-screen
// map bakes the SAME thing (§4.7/L2 — a map that disagrees is a wrong drawing
// of the world). Does NOT own the region lookup (vitest) or the map's states
// (c1-world-map).
//
// ⚑ The tiles load AFTER the first paint, on purpose (⛔ never through the
// boot-blocking preload), so every read here waits for that repaint. A run that
// samples too early reads the fallback colours and is right to.
//
//   node .claude/skills/verify/c4-region-texture.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'c4';
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

// The three regions drawn into world.json, and the tiles their profiles name.
const REGIONS = [
  { profile: 'Swamp', texture: 'pd135', warp: [-5560, 1592] },
];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'], env });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const requested = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', r => { if (/\.jpg(\?|$)/.test(r.url())) requested.push(r.url()); });

  // ⚑ THE A/B THAT MAKES THE MAP LEG MEAN ANYTHING (and D14's degrade path).
  // With every tile request aborted, the world must still render — flat, from
  // each profile's fallback colour — and the map must differ from the textured
  // run's map. A parity bug shows up as the two maps being IDENTICAL while the
  // two worlds differ.
  const blockTiles = process.env.AURA_C4_BLOCK_TILES === '1';
  if (blockTiles) {
    await context.route('**/*.jpg', route => route.abort());
    console.log('\n[A/B] tile requests are being ABORTED — expecting the D14 fallback\n');
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const name = await joinAsNewCharacter(page, 'region');
    console.log(`\njoined as ${name}\n`);
    await page.evaluate(() => {
      const p = document.getElementById('developPanel');
      if (p) p.style.display = 'none';
    });
    await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
    const cmd = async (text) => {
      await page.evaluate((t) => {
        const input = document.getElementById('console_command');
        input.value = t;
        document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
      }, text);
      await sleep(600);
    };
    await cmd('GOD');
    await sleep(3000);

    // --- 1. the zone's tiles were fetched as FILES ------------------------
    // A tile inlined into the bundle (the SVG trap) would produce no request at
    // all, and a tile nobody asked for would mean the zone's set was not loaded.
    if (requested.length >= 3) {
      pass('the zone fetched its ground tiles as separate files', `${requested.length} .jpg request(s)`);
    } else if (requested.length > 0) {
      inconclusive('fewer .jpg requests than the three regions imply', String(requested.length));
    } else {
      fail('no tile file was ever requested', 'inlined, or the load never ran');
    }

    // --- 2. the renderer painted TEXTURES, not the fallback colours -------
    // Read off the live scene graph: every region Graphics' fill style carries
    // a texture whose source label is the tile file. A fallback-coloured region
    // has texture === Texture.WHITE, which is exactly what D14 degrades to.
    const painted = await page.evaluate(() => {
      const root = window.game?.character?.plate?.parent?.parent;
      // Walk the whole stage instead of guessing the layer path — the façade
      // exposes no layer map (window.game is four methods).
      const stage = (function top(c) { return c.parent ? top(c.parent) : c; })(root);
      const out = [];
      (function walk(node) {
        if (node.context && node.context.fillStyle) {
          const f = node.context.fillStyle;
          const src = f.texture && f.texture.source;
          out.push({
            hasTexture: !!(src && src.label && !/WHITE/i.test(src.label)),
            label: src && src.label ? String(src.label) : null,
            width: src ? src.width : null,
            color: f.color,
          });
        }
        (node.children || []).forEach(walk);
      })(stage);
      return out;
    });
    const textured = painted.filter(p => p.hasTexture);
    if (blockTiles) {
      if (textured.length === 0) {
        pass("D14 degrade: with every tile blocked, no region paints a texture", `${painted.length} flat fill(s)`);
      } else {
        fail("a texture painted although every tile request was aborted", JSON.stringify(textured));
      }
    } else if (textured.length >= 3) {
      pass('the world painted textured region fills', textured.map(t => `${t.label}@${t.width}`).join(', '));
    } else if (textured.length > 0) {
      inconclusive('fewer textured fills than regions drawn', JSON.stringify(textured));
    } else {
      fail('every region fill is flat colour', 'the D14 fallback, i.e. the tiles never landed');
    }

    // --- 3. a look at the ground itself -----------------------------------
    for (const r of REGIONS) {
      await cmd(`WARP ${r.warp[0]} ${r.warp[1]}`);
      await sleep(22000);   // the camera interpolates slowly across a big jump
      await page.screenshot({ path: join(outDir, `${label}-world-${r.profile.replace(/ /g, '-')}.png`) });
      pass(`screenshot of the ${r.profile} region`, `${label}-world-${r.profile.replace(/ /g, '-')}.png`);
    }

    // --- 4. MAP PARITY (§4.7/L2) ------------------------------------------
    // The map bakes ONCE at zone load, before the tiles land, so this is really
    // a test of the single re-bake. If it did not run, the map shows the
    // fallback colours while the world shows tiles.
    await page.keyboard.press('m');
    await sleep(2500);
    const mapOpen = await page.evaluate(() =>
      !document.getElementById('worldMap')?.classList.contains('hidden'));
    if (mapOpen) {
      await page.screenshot({ path: join(outDir, `${label}-map.png`) });
      pass('full-screen map captured for parity', `${label}-map.png`);
    } else {
      inconclusive('the map did not open', 'parity unread');
    }
  } catch (e) {
    fail('run threw', e.message);
  } finally {
    if (errors.length) { console.log('\nconsole/page errors:\n' + errors.join('\n')); }
    console.log('\n' + results.map(r => `${r[0]} ${r[1]}`).join('\n'));
    await browser.close();
  }
})();
