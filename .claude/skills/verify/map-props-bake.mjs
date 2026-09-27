// The map's props, baked from the BUNDLED zone data (MapProps / MapTerrain),
// at the real game surface.
//
// Owns: every placed prop of the zone is in the bake from the first frame, with
// nothing streamed (the count, and the prop colour sampled out of the baked
// texture at a building far from spawn that this run never goes near); no live
// prop icon exists (Layer.OTHER is empty, your own dot is the one icon); and a
// zone crossing re-bakes for the new zone and back, leaving nothing of the old
// zone behind (the pre-bake map kept every streamed tree for the page's life
// and drew them over the next zone). Does NOT own the shape arithmetic (vitest,
// MapProps.test.ts) or the fog over the bake (m1-minimap-radar, c1-world-map).
//
// ⚑ EXPECTATIONS ARE DERIVED from api/zones/*.json and api/props/*.json, never
// hardcoded (the tests-derive rule): a map edit changes the numbers, not the
// verdict. ⚑ It reads the files the WEBPACK BUILD bundled, so rebuild the
// frontend after a zone edit or leg 1 goes red on a stale bundle, correctly.
//
//   node .claude/skills/verify/map-props-bake.mjs [label] [url]

import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'props';
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

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const propDefs = new Map(readdirSync(join(repo, 'api/props'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => readJSON(join(repo, 'api/props', f)))
  .map((d) => [d.name, d]));
const zone = (name) => readJSON(join(repo, 'api/zones', `${name}.json`));
const knownProps = (z) => (z.props || []).filter((p) => propDefs.has(p.type));

// The 'prop' style colour (Graphics.ts miniMap.icons.prop) and its alpha.
const PROP_COLOR = [0x4A, 0x3A, 0x28];
const PROP_ALPHA = 0.85;

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
const page = await context.newPage();
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

const sample = () => page.evaluate(() => {
  const map = window.game?.miniMap;
  if (!map) return null;
  return {
    zone: map.zoneName,
    baked: map.bakedPropCount,
    other: map.layerContainers[1].children.length,
    own: map.layerContainers[0].children.length,
  };
});

/** Waits for the map to report `name` as its zone. */
const waitForZone = async (name) => {
  for (let i = 0; i < 40; i++) {
    const s = await sample();
    if (s?.zone === name) return s;
    await sleep(500);
  }
  return sample();
};

/**
 * The baked texture's RGB at a zone-local point (server units). The texture
 * spans the zone's bounds exactly (MapTerrain frames it so), centred on 0.
 */
const texel = (x, y, w, h) => page.evaluate(({ x, y, w, h }) => {
  const map = window.game.miniMap;
  const tex = map.terrain.texture;
  const { pixels, width, height } = map.application.renderer.extract.pixels(tex);
  const px = Math.floor((x / w + 0.5) * width);
  const py = Math.floor((y / h + 0.5) * height);
  const i = (py * width + px) * 4;
  return [pixels[i], pixels[i + 1], pixels[i + 2]];
}, { x, y, w, h });

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 }).catch(() => {});
  console.log(`\njoined as ${await joinAsNewCharacter(page, 'mapprops')}\n`);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD');

  const start = await waitForZone('world');
  const world = zone('world');
  const worldCount = knownProps(world).length;

  // --- 1. the whole zone is baked, nothing streamed -------------------------
  check(start?.baked === worldCount, '1 every placed prop of the zone is in the bake',
    `baked ${start?.baked}, the zone places ${worldCount}`);
  check(start?.other === 0 && start?.own === 1, '1b no live prop icons; your own dot is the one icon',
    `Layer.OTHER ${start?.other}, Layer.CHARACTER ${start?.own}`);

  // --- 2. a building far from spawn is in the texture -----------------------
  const me = await page.evaluate(() => ({ x: window.game.character.getX() / 120,
    y: window.game.character.getY() / 120 }));
  const buildings = knownProps(world)
    .filter((p) => propDefs.get(p.type).body.width !== undefined)
    .sort((a, b) => Math.hypot(b.x - me.x, b.y - me.y) - Math.hypot(a.x - me.x, a.y - me.y));
  if (buildings.length === 0) {
    report('SKIP', '2 a far building is baked', 'the zone places no rect-bodied prop');
  } else {
    const far = buildings[0];
    const rgb = await texel(far.x, far.y, world.bounds.width, world.bounds.height);
    // Drawn at PROP_ALPHA over whatever was below: each channel sits within
    // (1 - alpha) × 255 of the prop colour.
    const worst = Math.max(...rgb.map((c, i) => Math.abs(c - PROP_COLOR[i])));
    check(worst <= Math.ceil((1 - PROP_ALPHA) * 255) + 2,
      `2 ${far.type} at (${far.x.toFixed(0)}, ${far.y.toFixed(0)}), `
        + `${Math.hypot(far.x - me.x, far.y - me.y).toFixed(0)} m away, is baked`,
      `texel rgb(${rgb.join(', ')}), worst channel ${worst} off the prop colour`);
  }

  // --- 3. a crossing re-bakes, and leaves nothing of the old zone -----------
  const under = zone('underworld');
  const anchor = (under.anchors || [])[0];
  if (!anchor) {
    report('INCONCLUSIVE', '3 crossing', 'the underworld authors no anchor to warp to');
  } else {
    const gx = (under.origin.x + anchor.x) * 120;
    const gy = (under.origin.y + anchor.y) * 120;
    await cmd(`WARP ${Math.round(gx)} ${Math.round(gy)}`);
    const s = await waitForZone('underworld');
    if (s?.zone !== 'underworld') {
      report('INCONCLUSIVE', '3 crossing', `the map never switched (zone ${s?.zone})`);
    } else {
      await sleep(1500);
      const u = await sample();
      const want = knownProps(under).length;
      check(u.baked === want, '3a the underworld bakes its own props',
        `baked ${u.baked}, the zone places ${want}`);
      check(u.other === 0, '3b nothing of the world is left on its map', `Layer.OTHER ${u.other}`);

      await cmd(`WARP ${Math.round(me.x * 120)} ${Math.round(me.y * 120)}`);
      const back = await waitForZone('world');
      check(back?.baked === worldCount, '3c back in the world, its props are baked again',
        `baked ${back?.baked}, the zone places ${worldCount}`);
    }
  }

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
