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
import { readFileSync } from 'node:fs';
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

/**
 * What this zone SHOULD paint, derived from the content rather than typed in.
 *
 * ⚑ An earlier draft hardcoded "three regions, warp to the Swamp" and was stale
 * within a day: the look pass rewrote `world.json` down to one full-map region
 * and re-pointed half the profiles at different tiles. A harness that encodes
 * how much content existed the week it was written goes red for the wrong
 * reason (verify SKILL.md, rule 1) — so every expectation below comes out of
 * the two files that actually decide it.
 *
 * ⚑ Warp targets are BBOX CENTRES, which for a concave polygon can land outside
 * its own region. That is tolerable only because the warp legs are screenshots
 * for a human, never assertions; the counted legs read the scene graph.
 */
function expectations() {
  const root = join(outDir, '../../..');
  const zone = JSON.parse(readFileSync(join(root, 'api/zones/world.json'), 'utf8'));
  const table = JSON.parse(readFileSync(join(root, 'frontend/src/client-data/profiles.json'), 'utf8'));
  const regions = (zone.regions || []).map((r) => {
    const xs = r.points.map(p => p.x), ys = r.points.map(p => p.y);
    const texture = table[r.profile] && table[r.profile].texture;
    return {
      profile: r.profile,
      // Same rule as buildProfiles: only a well-formed stem counts as a tile.
      texture: typeof texture === 'string' && /^[A-Za-z0-9_-]+$/.test(texture) ? texture : null,
      warp: [
        Math.round(((Math.min(...xs) + Math.max(...xs)) / 2) * 120),
        Math.round(((Math.min(...ys) + Math.max(...ys)) / 2) * 120),
      ],
    };
  });
  const textured = regions.filter(r => r.texture);
  return {
    regions,
    textured,
    tiles: [...new Set(textured.map(r => r.texture))],
  };
}

(async () => {
  const want = expectations();
  console.log(`\nworld.json draws ${want.regions.length} region(s), `
    + `${want.textured.length} of them textured, needing ${want.tiles.length} tile(s): `
    + `${want.tiles.join(', ') || '(none)'}`);
  if (want.textured.length === 0) {
    console.log('\n⚠️  No region in this zone names a usable texture — this script '
      + 'has nothing to measure. Author a `texture` on a profile a region uses.\n');
    process.exit(0);
  }

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
    if (requested.length >= want.tiles.length) {
      pass('the zone fetched its ground tiles as separate files',
        `${requested.length} .jpg request(s) for ${want.tiles.length} tile(s)`);
    } else if (requested.length > 0) {
      inconclusive('fewer .jpg requests than this zone\'s tiles imply',
        `${requested.length} of ${want.tiles.length}`);
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
    } else if (textured.length === want.textured.length) {
      pass('the world painted a textured fill for every textured region',
        `${textured.length}/${want.textured.length}: `
        + textured.map(t => `${t.label}@${t.width}`).join(', '));
    } else if (textured.length > 0) {
      // ⚑ MORE fills than the zone file has regions means a STALE `dist`, not a
      // renderer bug: the client draws the zone data webpack BUNDLED, while
      // these expectations come off the file on disk. Same trap SKILL.md
      // records for c2-frost-shield — a content edit is invisible in game until
      // `npm run build`. Reported, never passed over: a "≥" here would have
      // gone green with six fills against one region.
      inconclusive(
        textured.length > want.textured.length
          ? 'MORE textured fills than the zone file draws — rebuild frontend/dist'
          : 'fewer textured fills than this zone\'s textured regions',
        `${textured.length} painted vs ${want.textured.length} authored`);
    } else {
      fail('every region fill is flat colour', 'the D14 fallback, i.e. the tiles never landed');
    }

    // --- 3. a look at the ground itself -----------------------------------
    // Screenshots for a human, not assertions. Capped at three so a zone that
    // grows to twenty regions does not turn this into a ten-minute run.
    for (const r of want.textured.slice(0, 3)) {
      await cmd(`WARP ${r.warp[0]} ${r.warp[1]}`);
      await sleep(22000);   // the camera interpolates slowly across a big jump
      const shot = `${label}-world-${r.profile.replace(/ /g, '-')}.png`;
      await page.screenshot({ path: join(outDir, shot) });
      pass(`screenshot of the ${r.profile} region (${r.texture})`, shot);
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
