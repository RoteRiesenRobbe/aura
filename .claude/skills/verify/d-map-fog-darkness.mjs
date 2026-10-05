#!/usr/bin/env node
// plan-map-fog-darkness.md §6 — the map reveal respects darkness, at the real
// game surface. ⛔ Needs the DEBUG zone set (`dev-restart-windows.sh all debug`):
// its caves are `darkAreas` circles, and one sits beside a campfire.
//
// Legs, each read off the map fog's own RenderTexture alpha:
//   1. unlit, deep in a cave → the cell under the player stays black, while the
//      spawn area (lit daylight) was mapped (the control);
//   2. unlit, beside a campfire inside darkness → the fire's pocket is mapped,
//      and dark ground past the fire's reach in the same AOI is not;
//   3. Lantern on, back in the cave → its circle is mapped, a dark cell 7 u
//      away (outside the 4 u light) is not;
//   4. relog → the restored map equals the live one at every probe.
//
// ⚑ The venues are DERIVED from api/zones/.debug/world_debug.json (the largest
// dark-circle cluster and the campfire inside a dark circle), never typed in.
//
//   node .claude/skills/verify/d-map-fog-darkness.mjs [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZone } from './lib/zone.mjs';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRow, closeSpellbook } from './lib/spellbook.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };
const url = process.argv[2] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const zone = readZone(join(root, 'api/zones/.debug/world_debug.json'));
const campfireSkill = require(join(root, 'api/skills/mobs/campfire-aura.json'));
const FIRE_LIGHT = campfireSkill.effects.find((e) => e.type === 'light_aura').radius;
const LANTERN = 4; // api/skills/lantern.json at level 1 [PLACEHOLDER]
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const inDark = (p) => zone.darkAreas.some((c) => dist(p, c) <= c.radius);
const nearFire = (p, r) => zone.bindPoints.some((f) => dist(p, f) <= r);

// The cave: the dark circle with the most dark neighbours, far from every fire.
const cave = zone.darkAreas
  .filter((c) => !nearFire(c, FIRE_LIGHT + 12))
  .map((c) => ({ c, n: zone.darkAreas.filter((d) => dist(c, d) < 10).length }))
  .sort((a, b) => b.n - a.n)[0].c;
const V = { x: Math.round(cave.x), y: Math.round(cave.y) };
// A dark spot 7 u east or west of V, past a Lantern's reach.
const FAR = [{ x: V.x + 7, y: V.y }, { x: V.x - 7, y: V.y }].find((p) => inDark(p) && !nearFire(p, FIRE_LIGHT));
// The campfire whose own spot is dark: its pocket is the static light.
const fire = zone.bindPoints.find((f) => zone.darkAreas.some((c) => dist(f, c) <= c.radius + 2));
const C = fire && [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
  .map((d) => ({ x: Math.round(fire.x) + d.x * 2, y: Math.round(fire.y) + d.y * 2 })).find(inDark);
// Dark ground in C's AOI that the fire does not reach.
let C_DARK = null;
if (C) {
  for (let dx = -8; dx <= 8 && !C_DARK; dx += 2) {
    for (let dy = -5; dy <= 5 && !C_DARK; dy += 1) {
      const p = { x: C.x + dx, y: C.y + dy };
      if (inDark(p) && dist(p, fire) > FIRE_LIGHT + 2.5) C_DARK = p;
    }
  }
}

const results = [];
const errors = [];
const check = (ok, name, note = '') => {
  results.push(ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL');
  console.log(`${ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};
console.log(`venues: cave V=${JSON.stringify(V)} far=${JSON.stringify(FAR)} fire=${fire?.id} C=${JSON.stringify(C)} cDark=${JSON.stringify(C_DARK)}`);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error' && !/\b401\b/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const cmd = async (text, wait = 600) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(wait);
};
const enterWorld = async () => {
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(2000);
};
const warp = async (p) => { await cmd(`WARP ${p.x * 120} ${p.y * 120}`); await page.waitForTimeout(4000); };
const pos = () => page.evaluate(() => ({ x: window.game.character.getX() / 120, y: window.game.character.getY() / 120 }));
const alphaAt = (spots) => page.evaluate((spots) => {
  const map = window.game.miniMap;
  const fog = map.fog;
  if (!fog) return null;
  const { pixels, width, height } = map.application.renderer.extract.pixels({ target: fog.texture });
  return spots.map(({ x, y }) => {
    const tx = Math.floor((x * 120 - fog.originX + fog.mapWidth / 2) * fog.texelsPerPx);
    const ty = Math.floor((y * 120 - fog.originY + fog.mapHeight / 2) * fog.texelsPerPx);
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return -1;
    return pixels[(ty * width + tx) * 4 + 3];
  });
}, spots);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, 'fogdark');
  await enterWorld();
  const spawn = await pos();
  await cmd('PING'); // the first command after joining is dropped
  await cmd('GOD');
  await cmd('XP 99999999');
  await cmd('SKILL Lantern');

  // --- leg 1: unlit cave -----------------------------------------------------
  await warp(V);
  const at1 = await pos();
  check(dist(at1, V) < 2, 'warped into the cave', JSON.stringify(at1));
  const a1 = await alphaAt([V, spawn]);
  check(a1?.[1] > 0, 'control: the daylit spawn area was mapped', JSON.stringify(a1));
  check(a1?.[0] === 0, 'an unlit cave cell stays black on the map', JSON.stringify(a1));

  // --- leg 2: the campfire pocket ---------------------------------------------
  if (C && C_DARK) {
    await warp(C);
    const a2 = await alphaAt([C, C_DARK]);
    check(a2?.[0] > 0, `the campfire pocket (${fire.id}) is mapped with no own light`, JSON.stringify(a2));
    check(a2?.[1] === 0, 'dark ground past the fire\'s reach stays black', JSON.stringify(a2));
  } else {
    check(null, 'campfire pocket legs', 'no campfire inside darkness in the debug world');
  }

  // --- leg 3: the Lantern -------------------------------------------------------
  const lanternId = await page.waitForFunction(() => [...document.querySelectorAll('#spellbookList [data-skill-id]')]
    .find((e) => /Lantern/i.test(e.textContent))?.dataset.skillId ?? null, null, { timeout: 20_000 })
    .then((h) => h.jsonValue()).catch(() => null);
  let lit = false;
  if (lanternId) {
    await showSkillRow(page, lanternId);
    const row = page.locator(`#spellbookList [data-skill-id="${lanternId}"]`).first();
    const box = await row.boundingBox();
    await page.mouse.click(box.x + 25, box.y + box.height / 2);
    const slot = await page.locator('#auraSlotList .auraSlot[data-slot="1"]').first().boundingBox();
    await page.mouse.click(slot.x + slot.width / 2, slot.y + slot.height / 2);
    await closeSpellbook(page);
    await page.waitForTimeout(800);
    const s2 = await page.locator('#auraSlotList .auraSlot[data-slot="1"]').first().boundingBox();
    await page.mouse.click(s2.x + s2.width / 2, s2.y + s2.height / 2);
    lit = await page.waitForFunction(() => !!document.querySelector('#auraSlotList .auraSlot[data-slot="1"].activeSlot'),
      null, { timeout: 8_000 }).then(() => true).catch(() => false);
  }
  check(lit, 'the Lantern is the active aura');
  await warp(V);
  await page.waitForTimeout(1500);
  const a3 = await alphaAt([V, FAR]);
  check(a3?.[0] > 0, 'the Lantern maps the cave cell under the player', JSON.stringify(a3));
  check(a3?.[1] === 0, `a dark cell 7 u away (outside the ${LANTERN} u light) stays black`, JSON.stringify(a3));

  // --- leg 4: relog, the restored map equals the live one ----------------------
  const probes = [V, FAR, spawn, ...(C ? [C, C_DARK] : [])];
  const live = await alphaAt(probes);
  await page.click('#gameSettingsButton');
  await page.click('#leaveToCharacterSelect');
  await page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2000);
  await page.click('#characterSelect .slotCard .button');
  await enterWorld();
  const restored = await alphaAt(probes);
  const same = live && restored && live.every((a, i) => (a > 0) === (restored[i] > 0));
  check(same, 'after a relog the restored map equals the live one', `live ${JSON.stringify(live)} restored ${JSON.stringify(restored)}`);
} catch (err) {
  check(false, 'the run completed', String(err?.message ?? err));
} finally {
  check(errors.length === 0, `${errors.length} console errors`, errors.slice(0, 3).join(' | '));
  await browser.close();
}
const passed = results.filter((r) => r === 'PASS').length;
const failed = results.filter((r) => r === 'FAIL').length;
console.log(`\n${passed} PASS / ${failed} FAIL / ${results.length - passed - failed} SKIP`);
console.log('(then: stop aurad, cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(failed === 0 ? 0 : 1);
