// plan-minimap-local-viewport.md M3 — the radar's home-campfire rim pointer,
// at the real game surface.
//
// Owns: no pointer while your bound fire is on the radar, a pointer on the rim
// (at radius − margin) aimed at the fire once it is off it — the bearing is
// checked against the live positions, in two directions — the pointer vanishing
// when zooming out brings the fire back onto the disc, and no pointer
// full-screen. Does NOT own the rim-point arithmetic (vitest, `rimPoint`) or
// the home ring itself (c2-campfire-markers).
//
// ⚑ HOME IS RECORDED, never hardcoded (the r4-recall-utility rule): a fresh
// character binds at whichever starting fire it spawned at. Every venue is an
// offset from that fire.
// ⚑ Leg 4 depends on the zoom arithmetic: 30 m is off a 50 m radar and on a
// 100 m one. It restates both, so a retune of the steps reddens it: update
// NEAR_OFFSET_M with the retune.
//
//   node .claude/skills/verify/m3-home-pointer.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'm3';
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
const shotDir = process.env.M3_SHOT_DIR || dirname(fileURLToPath(import.meta.url));

const MARGIN = 24;         // HOME_POINTER_MARGIN
const FAR_OFFSET_M = 60;   // off the radar at every step
const NEAR_OFFSET_M = 30;  // off at 50 m, on at 100 m (with the 24 px margin)

const results = [];
const consoleErrors = [];
const report = (state, name, note = '') => {
  results.push({ state, name, note });
  console.log(`${state}  ${name}${note ? '  — ' + note : ''}`);
};
const check = (ok, name, note) => report(ok ? 'PASS' : 'FAIL', name, note);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
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
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;

/** One atomic sample, in world units where it matters. */
const sample = () => page.evaluate(() => {
  const map = window.game?.miniMap;
  if (!map) return null;
  const home = map.campfires?.homeMarker();
  const p = map.homePointer;
  const ch = window.game.character;
  return {
    state: map.state,
    scale: map.scale,
    width: map.width,
    height: map.height,
    home: home ? { x: home.x / map.scale / 120, y: home.y / map.scale / 120 } : null,
    player: ch ? { x: ch.getX() / 120, y: ch.getY() / 120 } : null,
    pointer: p ? { visible: p.visible, x: p.position.x, y: p.position.y, rotation: p.rotation } : null,
  };
});

/**
 * Waits for the warp to land and the player to come to rest. ⚑ NOT 'at the
 * target': a warp into a filled structure is ejected, sometimes by metres
 * (measured 14 m north of the spawn fire). Every assertion here uses the LIVE
 * position, so landing somewhere near the target is as good as on it.
 */
const settleAt = async (target) => {
  let last = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const s = await sample();
    if (!s?.player || Math.hypot(s.player.x - target.x, s.player.y - target.y) > 20) continue;
    if (last && Math.hypot(s.player.x - last.x, s.player.y - last.y) < 0.05) {
      await sleep(1000);
      return true;
    }
    last = s.player;
  }
  return false;
};

const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** The pointer aims along the live bearing and sits on the rim. */
const aimed = (s) => {
  const want = Math.atan2(s.home.y - s.player.y, s.home.x - s.player.x);
  const onRim = Math.hypot(s.pointer.x - s.width / 2, s.pointer.y - s.height / 2);
  const reach = Math.min(s.width, s.height) / 2 - MARGIN;
  return {
    ok: angleDiff(s.pointer.rotation, want) < 0.08 && Math.abs(onRim - reach) < 1,
    note: `rotation ${s.pointer.rotation.toFixed(3)} vs bearing ${want.toFixed(3)}, `
      + `${onRim.toFixed(1)} px from centre vs ${reach} px`,
  };
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 }).catch(() => {});
  console.log(`\njoined as ${await joinAsNewCharacter(page, 'pointer')}\n`);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD');

  // The spawn fire binds on dwell; wait for its marker to carry the home flag.
  let s = null;
  for (let i = 0; i < 40; i++) {
    s = await sample();
    if (s?.home) break;
    await sleep(500);
  }
  if (!s?.home) throw new Error('never bound at the spawn fire (no home marker)');
  const home = s.home;
  console.log(`home fire at (${home.x.toFixed(1)}, ${home.y.toFixed(1)})\n`);

  // --- 1. at home: the fire is on the radar ----------------------------
  check(s.pointer && s.pointer.visible === false, '1 no pointer while home is on the radar',
    `visible ${s.pointer?.visible}`);

  // --- 2. two directions off the radar ---------------------------------
  for (const [tag, dx, dy] of [['east', FAR_OFFSET_M, 0], ['north', 0, -FAR_OFFSET_M]]) {
    const spot = { x: home.x + dx, y: home.y + dy };
    await cmd(`WARP ${w(spot.x, spot.y)}`);
    if (!(await settleAt(spot))) {
      const at = (await sample())?.player;
      report('INCONCLUSIVE', `2 ${tag}`, `warp never arrived (at ${at?.x.toFixed(1)}, ${at?.y.toFixed(1)})`);
      continue;
    }
    s = await sample();
    if (!s.pointer?.visible) {
      check(false, `2 ${tag}: the pointer shows with home ${FAR_OFFSET_M} m away`, 'hidden');
      continue;
    }
    const a = aimed(s);
    check(a.ok, `2 ${tag}: the pointer sits on the rim, aimed at home`, a.note);
    await page.locator('#minimap').screenshot({ path: join(shotDir, `m3-pointer-${label}-${tag}.png`) })
      .catch(() => {});
  }

  // --- 3. full-screen: every fire is on the map ------------------------
  await page.keyboard.press('m');
  await sleep(1500);
  s = await sample();
  if (s.state !== 1) {
    report('INCONCLUSIVE', '3 full-screen', `M did not open the map (state ${s.state})`);
  } else {
    check(s.pointer.visible === false, '3 no pointer full-screen (D3)', `visible ${s.pointer.visible}`);
  }
  await page.keyboard.press('Escape');
  await sleep(1200);

  // --- 4. zooming out brings home back onto the disc -------------------
  const near = { x: home.x + NEAR_OFFSET_M, y: home.y };
  await cmd(`WARP ${w(near.x, near.y)}`);
  if (!(await settleAt(near))) {
    report('INCONCLUSIVE', '4 zoom', 'warp never arrived');
  } else {
    s = await sample();
    check(s.pointer.visible === true, `4a ${NEAR_OFFSET_M} m from home: pointer at 50 m`,
      `visible ${s.pointer.visible}`);
    await page.evaluate(() => window.game.miniMap.zoomRadar(1));   // 50 → 100
    await sleep(800);
    s = await sample();
    check(s.pointer.visible === false, `4b ...and none once the 100 m radar shows home`,
      `visible ${s.pointer.visible}`);
    await page.evaluate(() => window.game.miniMap.zoomRadar(-1));  // back to 50
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
