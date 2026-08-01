#!/usr/bin/env node
// Rolling-filler batch verification (plan-playtest-feedback.md §Rolling filler).
//
// Two of the four fixes have a real in-game surface worth proving:
//
//   1. DAMAGE <pct> subtracts a percentage of the player's OWN pool. It used to
//      call SubFraction(), a fraction of the vitals.VitalSign type ceiling
//      (2^32-1), so every argument was instantly lethal.
//   2. The minimap survives death (CLEAR_MINIMAP_ON_DEATH now false) and the
//      respawned character does not leave a duplicate/frozen player dot behind
//      — Player.remove() now takes its own icon off the map, which the
//      wholesale clear used to do as a side effect.
//
// The other two (Ctrl +/- suppression, floating numbers in darkness) are
// covered by KeyboardManager.test.ts and by the shared isHidden() choke point.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/filler-shots';
mkdirSync(outdir, { recursive: true });

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const failures = [];
const fail = (msg) => { failures.push(msg); console.log('  ✗ ' + msg); };
const pass = (msg) => console.log('  ✓ ' + msg);

await page.goto(url, { waitUntil: 'domcontentloaded' });

const playerName = await joinAsNewCharacter(page, 'fill', { timeout: 30_000 });
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
console.log('joined as ' + playerName);

async function runCommand(command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    const input = document.querySelector('#console_command');
    input.value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(500);
}

// health reads straight off the HUD bar: "<health>/<maxHealth>"
const readHealth = () => page.evaluate(() => {
  const text = document.querySelector('#healthBar .barText')?.textContent ?? '';
  const [health, maxHealth] = text.split('/').map(Number);
  return { health, maxHealth, text };
});

// A cheat is a round trip: command → server tick → snapshot → HUD. Reading
// immediately after the submit races that and silently reports "no damage".
async function readHealthAfterChange(from) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await readHealth();
    if (now.health !== from) return now;
    await page.waitForTimeout(100);
  }
  return readHealth();
}

// ---------------------------------------------------------------- DAMAGE ----
console.log('\n--- 1. DAMAGE cheat subtracts a percentage of the player pool ---');

// GOD would make the player invulnerable; the cheat has to land, so no GOD here.
// The first command after joining is unreliable (observed dropped outright), so
// spend a harmless one warming the channel before anything is asserted on.
await runCommand('PING');
await page.waitForTimeout(1500);
const before = await readHealth();
console.log('  health before: ' + before.text);
if (!before.maxHealth) fail('could not read the HUD health bar');

await runCommand('DAMAGE 10');
const after10 = await readHealthAfterChange(before.health);
console.log('  after DAMAGE 10: ' + after10.text);

if (after10.health === 0) {
  fail('DAMAGE 10 still killed the player outright — the fix is not live');
} else {
  pass('DAMAGE 10 was survivable');
}

const expected10 = before.health - Math.round(before.maxHealth * 0.10);
// ±2 HP of slack absorbs a regen tick landing between the two reads.
if (Math.abs(after10.health - expected10) > 2) {
  fail(`DAMAGE 10 took ${before.health - after10.health} HP, expected ~${before.health - expected10}`);
} else {
  pass(`DAMAGE 10 removed ${before.health - after10.health} HP of a ${before.maxHealth} pool (~10 %)`);
}

await runCommand('DAMAGE 50');
const after50 = await readHealthAfterChange(after10.health);
console.log('  after DAMAGE 50: ' + after50.text);
if (after50.health === 0) {
  fail('DAMAGE 50 killed a player who still had >50 % — still scaling off the type max');
} else {
  pass('DAMAGE 50 was survivable from ~90 % health');
}

// --------------------------------------------------------------- MINIMAP ----
console.log('\n--- 2. minimap survives death, no duplicate player dot ---');

// The &develop panel is drawn over the minimap corner — hide it or every
// minimap screenshot is a screenshot of the dev panel.
await page.addStyleTag({ content: '#developPanel { display: none !important; }' });

const readPosition = () => page.evaluate(() => ({
  x: Math.round(window.game.character.getX()),
  y: Math.round(window.game.character.getY()),
}));

// The own-character minimap icon is a solid 0x00008B disc
// (Graphics.ts miniMap.icons.character). Counting connected blobs of that
// colour counts player dots — which is exactly the regression under test:
// before Player.remove() took its own icon off the map, the dead character's
// dot stayed behind forever and the respawn added a second one.
//
// The PNG is decoded in-page (Image + 2D canvas) rather than in Node: the
// minimap is a WebGL canvas, so reading its pixels directly is unreliable
// without preserveDrawingBuffer, whereas a Playwright element screenshot
// composites correctly.
async function countPlayerDots(pngPath) {
  const base64 = readFileSync(pngPath).toString('base64');
  return page.evaluate(async (b64) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = 'data:image/png;base64,' + b64;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const {data, width, height} = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Generous tolerance: the icon is antialiased and sits over varying terrain.
    const isDot = (i) => data[i] < 60 && data[i + 1] < 60
      && data[i + 2] > 100 && data[i + 2] < 190 && data[i + 3] > 128;

    const seen = new Uint8Array(width * height);
    const blobs = [];
    for (let p = 0; p < width * height; p++) {
      if (seen[p] || !isDot(p * 4)) continue;
      // flood fill this blob
      const stack = [p];
      seen[p] = 1;
      let size = 0;
      while (stack.length) {
        const q = stack.pop();
        size++;
        const qx = q % width, qy = (q / width) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = qx + dx, ny = qy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (seen[n] || !isDot(n * 4)) continue;
          seen[n] = 1;
          stack.push(n);
        }
      }
      // Ignore single stray antialiased pixels; the icon is a disc of radius
      // size*3 and is many pixels across.
      if (size >= 6) blobs.push(size);
    }
    return blobs;
  }, base64);
}

// Die well away from the respawn anchor, so a stale dot (the bug) lands
// visibly apart from the live one instead of merging with it into one blob.
// Deliberately WALKED, not WARPed: a teleport triggers the render-interpolation
// crawl (backlog §20) and the client's rendered position — which is what the
// minimap icon follows — lags for many seconds afterwards.
const startSpot = await readPosition();
await page.keyboard.down('KeyD');
await page.waitForTimeout(9000);
await page.keyboard.up('KeyD');
await page.waitForTimeout(1500);
const deathSpot = await readPosition();
const walked = Math.abs(deathSpot.x - startSpot.x) + Math.abs(deathSpot.y - startSpot.y);
console.log('  walked ' + walked + ' px from ' + JSON.stringify(startSpot)
  + ' to ' + JSON.stringify(deathSpot));
if (walked < 100) fail('the character barely moved (' + walked + ' px) — held-input harness issue');

const minimap = page.locator('#minimap > .wrapper');
await minimap.screenshot({ path: join(outdir, 'minimap-1-alive.png') });

await runCommand('DAMAGE 100');
const after100 = await readHealthAfterChange(after50.health);
console.log('  after DAMAGE 100: ' + after100.text);
if (after100.health !== 0) {
  fail('DAMAGE 100 did NOT empty the pool, got ' + after100.text);
} else {
  pass('DAMAGE 100 still empties the pool (guard behaviour preserved)');
}

// DAMAGE 100 above already killed us; the end screen is the death signal
// (endScreen.html — "You Died" + a bare Respawn submit, no name re-entry).
await page.waitForSelector('#endScreen.showing', { timeout: 20_000 });
await page.waitForTimeout(2500);
console.log('  died, end screen shown');
await minimap.screenshot({ path: join(outdir, 'minimap-2-dead.png') });

const minimapMounted = await page.evaluate(
  () => !!document.querySelector('#minimap > .wrapper canvas'));
console.log('  minimap canvas still mounted while dead: ' + minimapMounted);
if (!minimapMounted) fail('the minimap canvas disappeared on death');

await page.evaluate(() => {
  document.querySelector('#endForm').dispatchEvent(new Event('submit', { cancelable: true }));
});
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
await page.waitForTimeout(4000);
const respawnSpot = await readPosition();
console.log('  respawned at ' + JSON.stringify(respawnSpot));
await minimap.screenshot({ path: join(outdir, 'minimap-3-respawned.png') });

const movedOnRespawn = Math.abs(respawnSpot.x - deathSpot.x) + Math.abs(respawnSpot.y - deathSpot.y);
console.log('  death spot → respawn spot: ' + movedOnRespawn + ' px apart');

const dotsAlive = await countPlayerDots(join(outdir, 'minimap-1-alive.png'));
const dotsDead = await countPlayerDots(join(outdir, 'minimap-2-dead.png'));
const dotsRespawned = await countPlayerDots(join(outdir, 'minimap-3-respawned.png'));
console.log('  player-dot blobs — alive: ' + JSON.stringify(dotsAlive)
  + ', dead: ' + JSON.stringify(dotsDead)
  + ', respawned: ' + JSON.stringify(dotsRespawned));

if (dotsAlive.length !== 1) {
  fail('expected exactly 1 player dot while alive, found ' + dotsAlive.length
    + ' — the pixel probe is miscalibrated, treat the rest of this check as unproven');
} else {
  pass('exactly 1 player dot while alive (probe calibrated)');
}
if (dotsDead.length > 0) {
  fail('the dead character still has ' + dotsDead.length
    + ' dot(s) on the minimap — Player.remove() did not take its icon off');
} else {
  pass('no player dot remains while dead');
}
if (dotsRespawned.length !== 1) {
  fail('expected exactly 1 player dot after respawn, found ' + dotsRespawned.length
    + ' — the death/respawn cycle leaks icons');
} else {
  pass('exactly 1 player dot after respawn — no duplicate, no stale dot');
}

const health = await readHealth();
console.log('  health after respawn: ' + health.text);
if (health.health <= 0) fail('respawned at 0 health');

// The duplicate-dot regression would surface as a throw inside MiniMap.remove
// (unguarded icon deref) or as an orphaned icon; the throw is caught by the
// pageerror listener, the orphan by the screenshot comparison.
console.log('\n--- page errors ---');
if (errors.length === 0) {
  pass('no console/page errors across join → damage → death → respawn');
} else {
  errors.forEach(e => console.log('  ! ' + e));
  fail(errors.length + ' console/page error(s)');
}

console.log('\n=== ' + (failures.length === 0 ? 'ALL CHECKS PASSED' : failures.length + ' CHECK(S) FAILED') + ' ===');
console.log('screenshots in ' + outdir);
await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
