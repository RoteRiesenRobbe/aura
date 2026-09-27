#!/usr/bin/env node
// Map fog persistence F2 (docs/archive/plan-map-fog-persistence.md §7): the map's
// revealed area survives a real session end.
//
//   1  join a fresh character, warp to a spot FAR from the only starting fire
//      and let both halves see it (the client stamps, the server marks)
//   2  leave to character-select — a real session end, so the return is a cold
//      join out of Postgres (the reconnect stash would prove nothing)
//   3  play the same character again: it spawns back at the starting fire, ~140
//      units away, so the only way the far spot can be revealed is the server's
//      stored reveal arriving in the join's GameState
//
// ⚑ Two controls, because a fog leg passes vacuously in two ways:
//   · NEGATIVE: a spot never visited must still be FOGGED, or the leg passes
//     with everything revealed.
//   · FRESH FOG: the MapFog object after the return must be a NEW one (setup()
//     ran on the new Welcome), or the leg passes on the old session's live
//     stamps without the publication ever arriving.
//
// Usage: node .claude/skills/verify/f2-map-fog-persistence.mjs [label] [url]
// Afterwards: stop aurad, then cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { harnessCharacterName } from './lib/join.mjs';

const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
// api/zones/world.json: the only startingSpawn fire is spawnpoint-1.
const START_FIRE = { x: -237.85, y: 31.49 };
const VISITED = { x: -100, y: 60 };     // ~140 u from the start fire
const NEVER = { x: 100, y: -100 };      // the negative control

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

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
  await page.waitForTimeout(600);
};

const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));

const enterWorld = async () => {
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1500);
};

// The fog mask's alpha at a world position (units), read back off the GPU
// texture of the `world` zone's MapFog. Also returns the fog object's identity
// token so the fresh-fog control can compare it across the session end.
const fogAt = (spots) => page.evaluate((spots) => {
  const map = window.game.miniMap;
  const fog = map.fogByZone.get('world');
  if (!fog) return { error: 'no world fog' };
  fog.__token = fog.__token || Math.random().toString(36).slice(2);
  const { pixels, width, height } = map.application.renderer.extract.pixels({ target: fog.texture });
  const alphas = spots.map(({ x, y }) => {
    const tx = Math.floor((x * 120 - fog.originX + fog.mapWidth / 2) * fog.texelsPerPx);
    const ty = Math.floor((y * 120 - fog.originY + fog.mapHeight / 2) * fog.texelsPerPx);
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return -1;
    return pixels[(ty * width + tx) * 4 + 3];
  });
  return { token: fog.__token, alphas, stored: !!map.storedFog };
}, spots);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // --- 1. see a far spot ---------------------------------------------------
  const creation = page.locator('#characterCreation:not(.hidden)');
  await creation.waitFor({ state: 'visible', timeout: 120_000 });
  const name = harnessCharacterName('fog');
  await page.fill('#characterCreation .characterNameInput', name);
  await page.click('#characterCreation .characterCreateSubmit');
  await enterWorld();

  await cmd('PING'); // the first command after joining is dropped (harness note)
  await cmd('GOD');
  await cmd(`WARP ${w(VISITED.x, VISITED.y)}`);
  await page.waitForTimeout(8_000);
  const there = await pos();
  check(Math.hypot(there.x - VISITED.x, there.y - VISITED.y) < 2, 'warped to the far spot', JSON.stringify(there));

  const before = await fogAt([VISITED, NEVER]);
  check(before.alphas?.[0] > 0, 'the live reveal shows the visited spot', JSON.stringify(before));
  check(before.alphas?.[1] === 0, 'the never-visited spot is fogged', JSON.stringify(before));

  // --- 2. leave the world --------------------------------------------------
  await page.click('#gameSettingsButton');
  await page.click('#leaveToCharacterSelect');
  await page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
  await page.waitForTimeout(2000); // the async writer

  // --- 3. come back --------------------------------------------------------
  await page.click('#characterSelect .slotCard .button');
  await enterWorld();

  const back = await pos();
  check(Math.hypot(back.x - START_FIRE.x, back.y - START_FIRE.y) < 5,
    'the return spawns at the starting fire, far from the visited spot', JSON.stringify(back));

  const after = await fogAt([VISITED, NEVER]);
  check(after.token && after.token !== before.token,
    'the map fog was rebuilt on the new join (control: not the old session\'s stamps)',
    `${before.token} → ${after.token}`);
  check(after.stored, 'the stored reveal arrived in the join\'s GameState');
  check(after.alphas?.[0] > 0, 'the visited spot is STILL revealed after the session end', JSON.stringify(after));
  check(after.alphas?.[1] === 0, 'the never-visited spot is still fogged', JSON.stringify(after));

  // PLACEMENT: the stored reveal is the 11 × 7 two-unit cells around the
  // visited cell, i.e. x −110…−88, y 54…68. A texture drawn at the wrong
  // offset can still cover the centre point, so probe just inside and just
  // outside every edge.
  const inside = [[-9, 0], [10, 0], [0, -5], [0, 6]];
  const outside = [[-13, 0], [14, 0], [0, -9], [0, 10]];
  const edges = await fogAt([...inside, ...outside].map(([dx, dy]) => ({ x: VISITED.x + dx, y: VISITED.y + dy })));
  const inOk = edges.alphas.slice(0, 4).every((a) => a > 0);
  const outOk = edges.alphas.slice(4).every((a) => a === 0);
  check(inOk && outOk, 'the restored area sits exactly where it was seen (edge probes)', JSON.stringify(edges.alphas));
} catch (err) {
  check(false, 'the run completed', String(err && err.message ? err.message : err));
} finally {
  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log('(then: stop aurad, cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(passed === results.length ? 0 : 1);
