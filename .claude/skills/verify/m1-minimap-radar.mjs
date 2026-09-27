// plan-minimap-local-viewport.md M1 — the docked minimap as a player-centred
// radar, at the real game surface.
//
// Owns: the docked scale (disc width over the 50 m radar diameter), your own
// dot pinned to the disc centre as you move, every map layer sharing ONE
// offset, terrain + the ground ring drawn docked, your dot at DOT_SIZE in both
// states, full-screen opening centred and un-offset, and D13 — death holds the
// radar where you fell instead of jumping to the zone centre.
// ⚑ Leg 7 turns GOD OFF (the second GOD toggles it) so DAMAGE 100 can kill.
// Does NOT own the toggle's entry points or click-away (c1-world-map), the
// campfire markers (c2-campfire-markers) or the roster (c3-player-roster).
//
// ⚑ Reads private MiniMap fields through window.game.miniMap (TS `private` is
// compile-time only). Every sample is ONE page.evaluate.
// ⚑ The ground ring's colour and the terrain's look are screenshots for the
// eye (m1-radar-*.png), not assertions.
//
//   node .claude/skills/verify/m1-minimap-radar.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'm1';
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
const outDir = process.env.M1_SHOT_DIR || dirname(fileURLToPath(import.meta.url));

// The plan's placeholders, restated so a retune reddens this loudly.
const RADAR_PX = 50 * 120;
const DOT = { docked: 7, full: 20 };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// Open ground (the pace venue) and a spot 40 u away, inside `world`.
const SPOT_A = { x: -23, y: 14 };
const SPOT_B = { x: 17, y: 14 };
// 3 u inside world's western edge (540 wide → x = -270): the ring must show.
const EDGE = { x: -267, y: 14 };

const results = [];
const consoleErrors = [];
const report = (state, name, note = '') => {
  results.push({ state, name, note });
  const icon = state === 'PASS' ? 'PASS' : state === 'FAIL' ? 'FAIL' : 'INCONCLUSIVE';
  console.log(`${icon}  ${name}${note ? '  — ' + note : ''}`);
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

/** One atomic sample of the map's geometry. */
const sample = () => page.evaluate(() => {
  const map = window.game?.miniMap;
  if (!map || !map.layerContainers) return null;
  const pos = (c) => (c ? { x: c.position.x, y: c.position.y } : null);
  const chars = map.layerContainers[0];
  const own = chars.children[0] || null;
  const ch = window.game.character;
  return {
    state: map.state,
    width: map.width,
    height: map.height,
    scale: map.scale,
    layers: {
      character: pos(chars),
      other: pos(map.layerContainers[1]),
      terrain: pos(map.terrainLayer),
      campfires: pos(map.campfires?.layer),
      players: pos(map.players?.layer),
    },
    own: own ? {
      x: chars.position.x + own.position.x,
      y: chars.position.y + own.position.y,
      width: own.width,
    } : null,
    terrainVisible: map.terrain ? map.terrain.visible && map.terrain.worldVisible !== false : null,
    ringVisible: map.groundRingGraphic ? map.groundRingGraphic.visible : null,
    player: ch ? { x: ch.getX(), y: ch.getY() } : null,
    lastFocus: map.lastFocus,
  };
});

/** Waits until the player's position is stable after a warp (the camera and
 *  the snapshot stream both lag a large jump). */
const settleAt = async (target) => {
  for (let i = 0; i < 40; i++) {
    const s = await sample();
    if (s?.player && Math.hypot(s.player.x / 120 - target.x, s.player.y / 120 - target.y) < 1.5) {
      await sleep(1500);
      return true;
    }
    await sleep(500);
  }
  return false;
};

const sameOffset = (s) => {
  const all = Object.values(s.layers).filter(Boolean);
  return all.every(p => Math.abs(p.x - all[0].x) < 0.01 && Math.abs(p.y - all[0].y) < 0.01);
};

const centred = (s, tol = 1.01) =>
  s.own && Math.abs(s.own.x - s.width / 2) <= tol && Math.abs(s.own.y - s.height / 2) <= tol;

const shoot = (name) => page.locator('#minimap > .wrapper')
  .screenshot({ path: join(outDir, `m1-radar-${label}-${name}.png`) }).catch(() => {});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 }).catch(() => {});
  const name = await joinAsNewCharacter(page, 'radar');
  console.log(`\njoined as ${name}\n`);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD');
  await sleep(2500);

  // --- 1. the docked scale is the radar's -------------------------------
  let s = await sample();
  if (!s) throw new Error('window.game.miniMap is not reachable');
  check(s.state === 0, '1a the map starts docked', `state ${s.state}`);
  const want = s.width / RADAR_PX;
  check(Math.abs(s.scale - want) < 1e-9, '1b docked scale = disc width / 50 m',
    `scale ${s.scale.toFixed(5)} vs ${want.toFixed(5)} (disc ${s.width} px)`);

  // --- 2. centred at two spots, one offset for every layer ---------------
  for (const [tag, spot] of [['A', SPOT_A], ['B', SPOT_B]]) {
    await cmd(`WARP ${w(spot.x, spot.y)}`);
    if (!(await settleAt(spot))) {
      report('INCONCLUSIVE', `2${tag} warp to (${spot.x}, ${spot.y})`, 'never arrived');
      continue;
    }
    s = await sample();
    check(centred(s), `2${tag} your dot sits at the disc centre at (${spot.x}, ${spot.y})`,
      s.own ? `dot (${s.own.x.toFixed(1)}, ${s.own.y.toFixed(1)}) vs centre (${s.width / 2}, ${s.height / 2})`
        : 'no own icon');
    check(sameOffset(s), `2${tag} every map layer shares one offset`, JSON.stringify(s.layers));
    await shoot(`docked-${tag}`);
  }

  // --- 3. the docked look ----------------------------------------------
  s = await sample();
  check(s.terrainVisible === true, '3a terrain draws docked (D4)', `visible ${s.terrainVisible}`);
  check(s.ringVisible === true, '3b the ground ring draws docked (D7)', `visible ${s.ringVisible}`);
  check(s.own && Math.abs(s.own.width - DOT.docked) < 0.5, '3c your dot is DOT_SIZE docked (D6)',
    s.own ? `${s.own.width.toFixed(2)} px` : 'no own icon');

  // --- 4. the zone edge -------------------------------------------------
  await cmd(`WARP ${w(EDGE.x, EDGE.y)}`);
  if (await settleAt(EDGE)) {
    s = await sample();
    check(centred(s), '4 still centred at the zone edge (D1: no clamp)',
      s.own ? `dot (${s.own.x.toFixed(1)}, ${s.own.y.toFixed(1)})` : 'no own icon');
    await shoot('edge');
  } else {
    report('INCONCLUSIVE', '4 warp to the zone edge', 'never arrived');
  }

  // --- 5. full-screen is centred and un-offset --------------------------
  await page.keyboard.press('m');
  await sleep(1500);
  s = await sample();
  if (s.state !== 1) {
    report('INCONCLUSIVE', '5 full-screen', `M did not open the map (state ${s.state})`);
  } else {
    const c = { x: s.width / 2, y: s.height / 2 };
    const layersAtCentre = Object.values(s.layers).filter(Boolean)
      .every(p => Math.abs(p.x - c.x) < 0.01 && Math.abs(p.y - c.y) < 0.01);
    check(layersAtCentre, '5a every layer sits at the canvas centre full-screen', JSON.stringify(s.layers));
    check(s.ringVisible === false, '5b the ground ring is hidden full-screen (D3)', `visible ${s.ringVisible}`);
    check(s.own && Math.abs(s.own.width - DOT.full) < 0.5, '5c your dot is DOT_SIZE full-screen (D6)',
      s.own ? `${s.own.width.toFixed(2)} px` : 'no own icon');
    await page.locator('#worldMap .wrapper').screenshot({ path: join(outDir, `m1-radar-${label}-fullscreen.png`) })
      .catch(() => {});
    // A frame later it must still be centred: update() must not re-offset it.
    await sleep(1000);
    const again = await sample();
    check(JSON.stringify(again.layers) === JSON.stringify(s.layers),
      '5d full-screen stays put across frames', JSON.stringify(again.layers));
  }
  await page.keyboard.press('Escape');
  await sleep(1500);
  s = await sample();
  check(s.state === 0 && centred(s), '6 closing resumes the centred radar',
    s.own ? `state ${s.state}, dot (${s.own.x.toFixed(1)}, ${s.own.y.toFixed(1)})` : `state ${s.state}, no own icon`);

  // --- 7. death holds the radar (D13) -----------------------------------
  await cmd(`WARP ${w(SPOT_B.x, SPOT_B.y)}`);
  await settleAt(SPOT_B);
  const before = await sample();
  await cmd('GOD');           // off: DAMAGE 100 must be allowed to kill
  await cmd('DAMAGE 100');
  // The end screen is the death signal (filler-batch). An ordinary death does
  // NOT null the map's character: it keeps reading where it fell.
  const dead = await page.waitForSelector('#endScreen.showing', { timeout: 20_000 })
    .then(() => true, () => false);
  if (!dead) {
    report('INCONCLUSIVE', '7 death holds the radar', 'the character never died');
  } else {
    await sleep(1500);
    const after = await sample();
    const moved = Math.hypot(after.layers.terrain.x - before.layers.terrain.x,
      after.layers.terrain.y - before.layers.terrain.y);
    check(moved < 2, '7 death holds the radar where you fell (D13)',
      `terrain layer moved ${moved.toFixed(1)} px (zone centre would be ${
        Math.hypot(before.layers.terrain.x - after.width / 2, before.layers.terrain.y - after.height / 2).toFixed(0)} px)`);
    await shoot('dead');
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
