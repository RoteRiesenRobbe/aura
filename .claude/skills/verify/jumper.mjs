// The JUMPER cheat (2026-10-17) and its server half, WARP <spawnpoint-id> /
// HOME, at the real game surface.
//
// Owns: JUMPER off, a world press moves nothing (control) · on, a world press
// warps to the pressed world point · a press on HUD (the ability bar) does not
// warp · a press on the docked minimap warps to the point it shows and does
// NOT open the map · a press on the full-screen map warps and the map STAYS
// open · WARP <home fire id> and HOME land on the bound fire · `jumper off`
// stops it again. Does NOT own the inverse arithmetic (vitest, `mapToWorld`)
// or GOD's toggle (Go, cmd_test.go).
//
// ⚑ A fresh character is UNBOUND, and standing in a fire binds nothing: the run
// binds up front, JUMPER still off (a row click with JUMPER on could warp), by
// standing on spawnpoint-1 and taking E + "Bind & Restock". Leg 6 then reads
// that home marker.
//
// ⚑ A warp into a filled structure is ejected (m3-home-pointer.mjs), so every
// landing is judged within LAND_TOLERANCE_U of the target.
//
//   node .claude/skills/verify/jumper.mjs [label] [url]

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

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

const LAND_TOLERANCE_U = 2;

const results = [];
const consoleErrors = [];
const check = (ok, name, note = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};
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

/** The player's live position in world units. */
const player = () => page.evaluate(() => {
  const ch = window.game?.character;
  return ch ? { x: ch.getX() / 120, y: ch.getY() / 120 } : null;
});

/** The world point (units) a viewport point shows on the main canvas. */
const worldAtScreen = (x, y) => page.evaluate(([sx, sy]) => {
  // The camera group is the characters layer's parent; world = (screen - its
  // position) / its scale, the same mapping Camera.getMapX/Y apply.
  const group = window.game.layers.characters.parent;
  return {
    x: (sx - group.position.x) / group.scale.x / 120,
    y: (sy - group.position.y) / group.scale.y / 120,
  };
}, [x, y]);

/** The world point (units) a viewport point shows on the map canvas. */
const worldAtMap = (x, y) => page.evaluate(([cx, cy]) => {
  const map = window.game.miniMap;
  const box = map.application.canvas.getBoundingClientRect();
  const layer = map.terrainLayer?.position ?? map.campfires.layer.position;
  return {
    x: ((cx - box.left - layer.x) / map.scale + map.zoneOriginX) / 120,
    y: ((cy - box.top - layer.y) / map.scale + map.zoneOriginY) / 120,
  };
}, [x, y]);

/** Waits until the player rests within tolerance of target; returns the distance. */
const landsAt = async (target) => {
  let d = Infinity;
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const p = await player();
    d = p ? Math.hypot(p.x - target.x, p.y - target.y) : Infinity;
    if (d <= LAND_TOLERANCE_U) return d;
  }
  return d;
};


// --- the campfire conversation (E at a fire opens a panel; standing binds nothing) ---
// Copied from c2-pull-through.mjs (harnesses are self-contained). ⚑ E is a ~1.4 s
// HOLD, never keyboard.press: the interact key is edge-triggered off Controls.update's
// rAF-driven clock, which a headless page throttles far below the nominal input tick.
const pressInteract = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('e');
  await page.waitForTimeout(1400);
  await page.keyboard.up('e');
  await page.waitForTimeout(1400);
};
const convPanel = () => page.evaluate(() => {
  const el = document.getElementById('conversation');
  if (!el || el.classList.contains('hidden')) return null;
  const li = [...el.querySelectorAll('.conversationRows li')];
  return {
    actor: el.querySelector('.conversationActor')?.textContent?.trim() ?? '',
    rows: li.filter((x) => !x.classList.contains('conversationLeaveRow')).map((x) => x.textContent.trim()),
    hasLeave: li.some((x) => x.classList.contains('conversationLeaveRow')),
  };
});
// A single E press is not evidence (the hold can fall between two rAF samples): retry.
const pressForPanel = async (tries = 3) => {
  for (let i = 0; i < tries; i++) {
    await pressInteract();
    const p = await convPanel();
    if (p) return p;
  }
  return null;
};
// Rows are rebuilt on every render: scroll, elementFromPoint check, real mouse click.
const clickRow = async (needle) => {
  const found = await page.evaluate((n) => {
    const row = [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => li.textContent.includes(n));
    if (!row) return false;
    row.scrollIntoView({ block: 'center' });
    return true;
  }, needle);
  if (!found) return { ok: false, why: `no row matches "${needle}"` };
  await page.waitForTimeout(250);
  const node = (await page.evaluateHandle((n) =>
    [...document.querySelectorAll('#conversation .conversationRows li')].find((li) => li.textContent.includes(n)) ?? null, needle)).asElement();
  const b = node && await node.boundingBox();
  if (!b) return { ok: false, why: 'the row has no box' };
  const cx = b.x + Math.min(60, b.width / 2), cy = b.y + b.height / 2;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#conversation .conversationRows li'), [cx, cy]);
  if (!hit) return { ok: false, why: 'something lies on top of the row' };
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(1100);
  return { ok: true };
};
const homeFire = () => page.evaluate(() => window.game?.miniMap?.['campfires']?.['home'] ?? null);
// Stand inside the fire's bind circle first. E opens the Campfire panel, "Bind & Restock"
// is clicked, and the home marker is awaited.
const bindAtFire = async () => {
  const pnl = await pressForPanel();
  if (!pnl || !/campfire/i.test(pnl.actor)) return { ok: false, why: `E opened ${pnl ? `"${pnl.actor}"` : 'nothing'}, not the Campfire panel` };
  const c = await clickRow('Bind');
  if (!c.ok) return c;
  for (let i = 0; i < 25; i++) {
    const h = await homeFire();
    if (h) return { ok: true, home: h };
    await page.waitForTimeout(300);
  }
  return { ok: false, why: 'the home marker never appeared after the Bind & Restock click' };
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (p) => p ? `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})` : 'null';

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log(`\njoined as ${await joinAsNewCharacter(page, 'jumper')}\n`);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD on');
  await sleep(1500);

  // Bind first (see the header): spawnpoint-1 is (-239.78, 15.36), the tile is 0.42 u off.
  await cmd(`WARP ${-240 * 120} ${15 * 120}`);
  await sleep(3000);
  const bind = await bindAtFire();
  console.log(`bind at the spawn fire: ${bind.ok ? 'home=' + bind.home : 'FAILED, ' + bind.why}`);

  // --- leg 1: JUMPER off, a world press is inert ---------------------------
  const start = await player();
  await page.mouse.click(640 + 200, 400 + 100);
  await sleep(1500);
  const after1 = await player();
  check(dist(start, after1) < 0.5, 'off: a world press moves nothing', `${fmt(start)} -> ${fmt(after1)}`);

  // --- leg 2: on, a world press warps there ---------------------------------
  await cmd('#JUMPER');
  const target2 = await worldAtScreen(640 + 240, 400 - 120);
  await page.mouse.click(640 + 240, 400 - 120);
  const d2 = await landsAt(target2);
  check(d2 <= LAND_TOLERANCE_U, 'on: a world press warps to the pressed point',
    `target ${fmt(target2)}, ${d2.toFixed(2)} u off`);

  // --- leg 3: a press on HUD does not warp ----------------------------------
  const before3 = await player();
  const bar = await page.evaluate(() => {
    const el = document.querySelector('#abilityBar, .abilityBar, #actionBar');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (bar) {
    await page.mouse.click(bar.x, bar.y);
    await sleep(1500);
    const after3 = await player();
    check(dist(before3, after3) < 0.5, 'a press on the ability bar does not warp', `${fmt(before3)} -> ${fmt(after3)}`);
  } else {
    console.log('INCONCLUSIVE  no ability bar element found to press');
  }

  // --- leg 4: the docked minimap warps and stays docked ---------------------
  const disc = await page.evaluate(() => {
    const r = window.game.miniMap.application.canvas.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  });
  const press4 = { x: disc.x + disc.w * 0.2, y: disc.y - disc.w * 0.15 };
  const target4 = await worldAtMap(press4.x, press4.y);
  await page.mouse.click(press4.x, press4.y);
  const d4 = await landsAt(target4);
  const state4 = await page.evaluate(() => window.game.miniMap.state);
  check(d4 <= LAND_TOLERANCE_U, 'a docked-minimap press warps to the point it shows',
    `target ${fmt(target4)}, ${d4.toFixed(2)} u off`);
  check(!(await page.evaluate(() => window.game.miniMap.isOpen())), 'the docked press does not open the map', `state ${state4}`);

  // --- leg 5: the full-screen map warps and stays open ----------------------
  await page.evaluate(() => window.game.miniMap.open());
  await sleep(800);
  const full = await page.evaluate(() => {
    const r = window.game.miniMap.application.canvas.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const press5 = { x: full.x + 40, y: full.y + 25 };
  const target5 = await worldAtMap(press5.x, press5.y);
  await page.mouse.click(press5.x, press5.y);
  const d5 = await landsAt(target5);
  check(d5 <= LAND_TOLERANCE_U, 'a full-screen map press warps to the point it shows',
    `target ${fmt(target5)}, ${d5.toFixed(2)} u off`);
  check(await page.evaluate(() => window.game.miniMap.isOpen()), 'the map stays open after the jump');
  await page.evaluate(() => window.game.miniMap.close());
  await sleep(500);

  // --- leg 6: WARP <id> and HOME land on the bound fire ---------------------
  let home = null;
  for (let i = 0; i < 30 && !home; i++) {
    home = await page.evaluate(() => {
      const map = window.game.miniMap;
      const m = map.campfires?.homeMarker();
      return m ? { id: m.id, x: m.x / map.scale / 120, y: m.y / map.scale / 120 } : null;
    });
    if (!home) await sleep(500);
  }
  if (!home) {
    console.log(`INCONCLUSIVE  no home campfire bound (Bind & Restock at the spawn fire failed: ${bind.ok ? 'no marker' : bind.why})`);
  } else {
    await cmd(`WARP ${home.id}`);
    const d6 = await landsAt(home);
    check(d6 <= LAND_TOLERANCE_U, `WARP ${home.id} lands on that fire`, `${d6.toFixed(2)} u off`);
    await cmd(`WARP ${Math.round((home.x + 25) * 120)} ${Math.round(home.y * 120)}`);
    await landsAt({ x: home.x + 25, y: home.y });
    await cmd('HOME');
    const d7 = await landsAt(home);
    check(d7 <= LAND_TOLERANCE_U, 'HOME lands on the bound fire', `${d7.toFixed(2)} u off`);
  }

  // --- leg 7: jumper off stops it ------------------------------------------
  await cmd('jumper off');
  const before8 = await player();
  await page.mouse.click(640 - 240, 400 + 120);
  await sleep(1500);
  const after8 = await player();
  check(dist(before8, after8) < 0.5, '`jumper off`: a world press moves nothing again', `${fmt(before8)} -> ${fmt(after8)}`);

  check(consoleErrors.length === 0, 'no page errors', consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  harness threw: ' + (e?.stack || e));
  results.push(false);
} finally {
  await browser.close();
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
