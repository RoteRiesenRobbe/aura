// plan-region-primitive.md C4 — region ground TEXTURES at the real game surface.
// plan-region-primitive.md C5 - and the BLEND BAND's world-vs-map parity (leg 5).
//
// Owns: that a textured profile paints its tile in the world, that the tile
// loaded as a separate file (never inlined), that the paint spec the renderer
// used is a texture and not the fallback colour (D14), that the full-screen
// map bakes the SAME thing (§4.7/L2 — a map that disagrees is a wrong drawing
// of the world), and that a feathered region's edge is a RAMP in both drawings
// rather than a band in one and a step in the other. Does NOT own the region
// lookup (vitest) or the map's states (c1-world-map).
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
    edge: softEdge(zone, table),
    bounds: zone.bounds,
  };
}

/**
 * One polygon edge worth sampling the C5 band across, or `null`.
 *
 * ⚑ Derived from the content, never typed in - same rule as `expectations()`
 * above, and it is why this returns `null` today: `world.json` currently draws
 * ONE region covering the whole map, so its only edges ARE the world border.
 * ⛔ Sampling there would false-fail by construction: the map bakes a frame of
 * exactly mapWidth × mapHeight, so it CROPS the outward half of the band that
 * the world view happily draws over the shallow-water ring. The leg reports
 * INCONCLUSIVE instead, and turns into a real assertion the day a second region
 * is authored.
 *
 * Wants an INTERIOR edge (both ends well inside the bounds), long enough to
 * have a clean middle, on a profile whose `blend` is actually non-zero.
 */
function softEdge(zone, table) {
  const halfW = (zone.bounds ? zone.bounds.width : 0) / 2;
  const halfH = (zone.bounds ? zone.bounds.height : 0) / 2;
  const INSET = 6;          // world units clear of the border, on both ends
  const MIN_LENGTH = 6;     // world units, so the midpoint is away from corners
  for (const r of (zone.regions || [])) {
    const profile = table[r.profile] || {};
    // Same rule as buildProfiles: 0 is a hard edge and a valid authored value.
    const blend = typeof profile.blend === 'number' && isFinite(profile.blend) && profile.blend > 0
      ? profile.blend : 0;
    if (!blend) { continue; }
    const pts = r.points || [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const inside = p => Math.abs(p.x) < halfW - INSET && Math.abs(p.y) < halfH - INSET;
      if (!inside(a) || !inside(b)) { continue; }
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < MIN_LENGTH) { continue; }
      return {
        profile: r.profile,
        blend,
        // Midpoint in world units, and the edge's unit NORMAL - the direction a
        // run has to travel to cross the band rather than ride along it.
        mid: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2},
        normal: {x: -dy / length, y: dx / length},
      };
    }
  }
  return null;
}

/**
 * World px → page CSS px, read off the LIVE scene graph rather than recomputed.
 *
 * ⚑ Recomputing it here would be a second copy of the camera's maths (and of
 * MapScale's), free to drift from the one the renderer actually used - which is
 * exactly the class of bug this file exists to catch. A region Graphics' own
 * `worldTransform` is the answer the renderer arrived at, so a run placed with
 * it lands where the pixels are however the camera is clamped or scaled.
 */
async function worldToPage(page) {
  return page.evaluate(() => {
    const root = window.game?.character?.plate?.parent?.parent;
    if (!root) { return null; }
    const stage = (function top(c) { return c.parent ? top(c.parent) : c; })(root);
    let node = null;
    (function walk(n) {
      if (!node && n.context && n.context.fillStyle) { node = n; }
      (n.children || []).forEach(walk);
    })(stage);
    if (!node) { return null; }
    const m = node.worldTransform;
    // The biggest canvas on the page is the game's; the docked minimap is a
    // thumbnail and the full-screen map is hidden while the world is sampled.
    const canvas = [...document.querySelectorAll('canvas')]
      .sort((p, q) => q.clientWidth * q.clientHeight - p.clientWidth * p.clientHeight)[0];
    const box = canvas.getBoundingClientRect();
    return {a: m.a, d: m.d, tx: m.tx + box.left, ty: m.ty + box.top};
  });
}

/** World px → page CSS px for the OPEN full-screen map. Origin-centred on its
 *  own canvas and fitted to both axes - MapScale's two facts, and nothing else
 *  is needed because there is no translation term. */
async function mapToPage(page, mapWidthPx, mapHeightPx) {
  return page.evaluate(([mw, mh]) => {
    const canvas = document.querySelector('#worldMap canvas');
    if (!canvas) { return null; }
    const box = canvas.getBoundingClientRect();
    const scale = Math.min(box.width / mw, box.height / mh);
    if (!(scale > 0)) { return null; }
    return {a: scale, d: scale, tx: box.left + box.width / 2, ty: box.top + box.height / 2};
  }, [mapWidthPx, mapHeightPx]);
}

/**
 * Samples a straight run of pixels across the rendered page.
 *
 * The screenshot goes back INTO the page as a data URI and is decoded by the
 * browser's own 2D canvas - a WebGL canvas cannot be read back directly (Pixi
 * does not keep the drawing buffer) and Node has no PNG decoder to hand.
 */
async function sampleRun(page, from, to, samples) {
  // A projected run that leaves the viewport makes page.screenshot throw, which
  // would turn an unreadable sample into a FAIL of the whole script. An
  // unreadable sample is not evidence either way, so it degrades to `null` and
  // the classifier reports 'unread'.
  try {
    return await sampleRunUnsafe(page, from, to, samples);
  } catch {
    return null;
  }
}

async function sampleRunUnsafe(page, from, to, samples) {
  const pad = 2;
  const clip = {
    x: Math.max(0, Math.floor(Math.min(from.x, to.x) - pad)),
    y: Math.max(0, Math.floor(Math.min(from.y, to.y) - pad)),
    width: Math.ceil(Math.abs(to.x - from.x)) + 2 * pad,
    height: Math.ceil(Math.abs(to.y - from.y)) + 2 * pad,
  };
  const png = (await page.screenshot({clip})).toString('base64');
  return page.evaluate(async ([b64, c, a, b, n]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = Math.round(a.x + (b.x - a.x) * t - c.x);
      const y = Math.round(a.y + (b.y - a.y) * t - c.y);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) { return null; }
      const o = (y * img.width + x) * 4;
      out.push([data[o], data[o + 1], data[o + 2]]);
    }
    return out;
  }, [png, clip, from, to, samples]);
}

/**
 * Is this run a RAMP or a STEP?
 *
 * ⚑ Not a measurement of band WIDTH in world units, on purpose: the camera
 * scale, the map's fit and the tile detail all move that number, and a leg that
 * pinned it would go red for the wrong reason the first time a profile's
 * `blend` is tuned. What is compared across the two drawings is the SHAPE of
 * the transition, which is scale-free.
 *
 * ⚑ The first draft scored "share of the run's total colour change carried by
 * one adjacent pair" and was defeated by ground-tile grain: per-pixel noise
 * inflates the total, drives the share down and reports every hard edge as a
 * ramp - a false PASS, the worst kind for a parity leg. Projecting each sample
 * onto the axis between the run's two ENDS discards everything that is not
 * movement from one side to the other, noise very much included.
 */
function classifyRun(run) {
  if (!run || run.length < 16) { return {verdict: 'unread'}; }
  const n = run.length;
  const ends = Math.max(2, Math.round(n * 0.15));
  const mean = a => [0, 1, 2].map(c => a.reduce((s, p) => s + p[c], 0) / a.length);
  const A = mean(run.slice(0, ends));
  const B = mean(run.slice(n - ends));
  const v = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const len2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  // The two ends look the same: the run never crossed a visible boundary, so
  // there is nothing to classify and calling it a gradient would be a free pass.
  if (Math.sqrt(len2) < 18) { return {verdict: 'flat', width: 0}; }
  const raw = run.map(p =>
    ((p[0] - A[0]) * v[0] + (p[1] - A[1]) * v[1] + (p[2] - A[2]) * v[2]) / len2);
  // A 3-tap smooth on the PROJECTION (never on the colours - that widens a step
  // as much as it calms the grain) before counting how far the crossing takes.
  const t = raw.map((_, i) => {
    let sum = 0, count = 0;
    for (let j = i - 1; j <= i + 1; j++) {
      if (j < 0 || j >= n) { continue; }
      sum += raw[j];
      count++;
    }
    return sum / count;
  });
  const width = t.filter(x => x > 0.1 && x < 0.9).length / n;
  return {verdict: width <= 0.08 ? 'step' : width >= 0.15 ? 'ramp' : 'mixed', width};
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

    // --- 5. C5 BLEND-BAND PARITY -----------------------------------------
    // ⛔ The divergence no single screenshot catches, the C5 shape of §4.7's
    // trap: bands in the world and hard edges on the map (or the reverse). Each
    // picture looks plausible alone, so the two are sampled across the SAME
    // authored edge and classified the same way, and the leg only passes when
    // they agree. A blend of 0 everywhere is not a failure - it is the C4 world,
    // and softEdge() returns null for it.
    if (!want.edge) {
      inconclusive('no interior region edge with a non-zero blend in this zone',
        'C5 band parity unread — author a second region, or a blend > 0');
    } else if (!mapOpen) {
      inconclusive('the map never opened', 'C5 band parity unread');
    } else {
      const e = want.edge;
      const bandPx = e.blend * 120;
      const midPx = {x: e.mid.x * 120, y: e.mid.y * 120};
      const runAcross = (t) => {
        // 1.5 bands each way: enough to hold the whole ramp AND some of the
        // flat ground on both sides, which is what makes the classifier's
        // "share of total change" mean anything.
        const reach = bandPx * 1.5;
        const project = (k) => ({
          x: t.tx + t.a * (midPx.x + e.normal.x * k),
          y: t.ty + t.d * (midPx.y + e.normal.y * k),
        });
        return [project(-reach), project(reach)];
      };

      // The world half: close the map, stand ON the edge so the camera cannot
      // put it off screen, and read the transform the renderer actually used.
      await page.keyboard.press('m');
      await sleep(1200);
      await cmd(`WARP ${Math.round(midPx.x)} ${Math.round(midPx.y)}`);
      await sleep(22000);
      const worldT = await worldToPage(page);
      const worldRun = worldT && await sampleRun(page, ...runAcross(worldT), 64);
      const world = classifyRun(worldRun);
      await page.screenshot({ path: join(outDir, `${label}-band-world.png`) });

      // The map half: the same world edge, through MapScale's fit.
      await page.keyboard.press('m');
      await sleep(2500);
      const mapT = await mapToPage(page, want.bounds.width * 120, want.bounds.height * 120);
      // ⚑ The SAME sample count as the world run, although the map's run spans
      // far fewer pixels: the verdict is a fraction of the run, so the two are
      // only comparable if both runs are cut into the same number of pieces.
      const mapRun = mapT && await sampleRun(page, ...runAcross(mapT), 64);
      const map = classifyRun(mapRun);
      await page.screenshot({ path: join(outDir, `${label}-band-map.png`) });

      const shape = v => `${v.verdict}${v.width !== undefined ? ` (crossing ${(v.width * 100).toFixed(0)}% of the run)` : ''}`;
      const detail = `${e.profile} blend ${e.blend}u — world: ${shape(world)}, map: ${shape(map)}`;
      if (world.verdict === 'ramp' && map.verdict === 'ramp') {
        pass('the region edge is a RAMP in both drawings of the world', detail);
      } else if (world.verdict === 'step' && map.verdict === 'step') {
        fail('both drawings show a HARD STEP where a band is authored', detail);
      } else if ((world.verdict === 'ramp') !== (map.verdict === 'ramp')
        && world.verdict !== 'unread' && map.verdict !== 'unread') {
        fail('WORLD AND MAP DISAGREE about the region edge — one feathers, one does not', detail);
      } else {
        // 'flat' (the run crossed nothing visible), 'mixed', or 'unread'. Terrain
        // blobs and props sit on this ground, so an unreadable run is a bad
        // sample and not evidence either way.
        inconclusive('the band runs did not read cleanly', detail);
      }
    }
  } catch (e) {
    fail('run threw', e.message);
  } finally {
    if (errors.length) { console.log('\nconsole/page errors:\n' + errors.join('\n')); }
    console.log('\n' + results.map(r => `${r[0]} ${r[1]}`).join('\n'));
    await browser.close();
  }
})();
