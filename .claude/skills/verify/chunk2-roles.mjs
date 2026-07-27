#!/usr/bin/env node
// plan-entity-model.md chunk 2 — in-game smoke for the authored role
// discriminator.
//
// What it actually proves: a STRUCTURE's aura still runs with no aggro target,
// now that "always-on" comes from the authored role instead of speed 0. That is
// the one behaviour the chunk moves, and it is visible as HP:
//
//   1. warp onto the world Campfire → HP rises FAST (aligned structure): the
//      aura heals 12 %/2 s vs the ~1 %/s baseline regen, so the rate itself is
//      the evidence, not merely "HP went up".
//   2. walk into a Bramble          → blocked (solid structure body intact)
//   3. warp into a PoisonPool       → HP falls (hostile structure, unprovoked)
//      — LAST, because it kills an ungodded level-1 player in seconds.
//
// Followers are deliberately NOT covered here: summoning one needs a cooldown
// equipped through the aura panel, and the follower path is pinned by the Go
// suite (model/mob/companion_test.go + role_test.go, sys spawn test).
//
// Usage: node .claude/skills/verify/chunk2-roles.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// WARP takes 1/120 units and wants whole units.
const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
const POISON_POOL = w(8, -26); // api/zones/world.json PoisonPool (7.8, -26.4)
const CAMPFIRE = w(-58, 24); //                    campfire   (-58.2, 24)
// The bramble wall runs east-west at y = -4.8, x = -68.7…-65.1, so it is
// approached from the SOUTH. (-67, -9) is the clearest launch point: 2.5 units
// to the nearest tree — warping onto a tree strands the player against it and
// the walk silently never starts.
const BRAMBLE_S = w(-67, -9);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#startForm .playerNameSubmit:not([disabled])', { timeout: 120_000 });
await page.fill('#startForm .playerNameInput', 'Role' + String(process.pid).slice(-4));
await page.click('#startForm .playerNameSubmit');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

// The HUD bar text is the server-authoritative absolute pool.
const hp = () => page.evaluate(() => {
  const t = document.querySelector('#healthBar .barText')?.textContent || '';
  const m = t.match(/^(\d+)\/(\d+)$/);
  return m ? { cur: +m[1], max: +m[2] } : null;
});
// ⚑ getX/getY are in the wire's 1/120 units, not world units.
const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));

await cmd('PING'); // the first command after joining is dropped (harness note)

const results = [];

// --- 1. an aligned structure heals you without ever aggroing ---
// 12 % of max per 60-tick tick ≈ 6 HP/s at L1, against a ~1 HP/s out-of-combat
// baseline: over 8 s that is ~48 vs ~8, so the RATE separates the two cleanly.
await cmd(`WARP ${CAMPFIRE}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)
await cmd('DAMAGE 60');
await page.waitForTimeout(2_000);
const beforeFire = await hp();
await page.waitForTimeout(8_000);
const afterFire = await hp();
const firePos = await pos();
await page.screenshot({ path: `/tmp/chunk2-${label}-campfire.png` });
const gained = (afterFire?.cur ?? 0) - (beforeFire?.cur ?? 0);
results.push({
  check: 'Campfire heals unprovoked, at its own rate (aligned structure)',
  detail: `${beforeFire?.cur} → ${afterFire?.cur} HP in 8 s (+${gained}; regen alone would be ~8) at ${JSON.stringify(firePos)}`,
  pass: gained >= 20,
});

// --- 2. the bramble body still blocks (solid structure, unchanged) ---
await cmd(`WARP ${BRAMBLE_S}`);
await page.waitForTimeout(20_000);
// ⚑ The dev console input calls stopPropagation on keydown (Utils.ts), so
// WASD is swallowed while it still has focus — the walk silently never
// happens and the "blocked" assert passes for the wrong reason.
await page.evaluate(() => document.activeElement?.blur());
const beforeWalk = await pos();
// ⚑ Screen-up is DECREASING world y, so the key that walks toward y = -4.8
// from y = -9 is 's', not 'w'.
await page.keyboard.down('s'); // toward the wall
await page.waitForTimeout(6_000);
await page.keyboard.up('s');
const afterWalk = await pos();
await page.screenshot({ path: `/tmp/chunk2-${label}-bramble.png` });
results.push({
  check: 'Bramble still blocks movement (solid structure body)',
  // Bramble radius 0.9 + player 0.25 ⇒ it stops at about y = -5.95, while 6 s
  // of walking covers ~9 units. The lower bound is what makes this a real
  // check: the player must genuinely have walked before being stopped.
  detail: `walked from y=${beforeWalk.y} to y=${afterWalk.y} (wall face at about -5.95)`,
  pass: afterWalk.y > beforeWalk.y + 1 && afterWalk.y < -5.5,
});

// --- 3. a hostile structure hurts you without ever aggroing (kills, so last) ---
await cmd(`WARP ${POISON_POOL}`);
await page.waitForTimeout(5_000);
const beforePool = await hp();
await page.waitForTimeout(6_000);
const afterPool = await hp();
const poolPos = await pos();
results.push({
  check: 'PoisonPool damages on contact (hostile structure, unprovoked)',
  detail: `${beforePool?.cur} → ${afterPool?.cur} HP at ${JSON.stringify(poolPos)}`,
  pass: !!afterPool && !!beforePool && afterPool.cur < beforePool.cur,
});

const ctxLoss = consoleErrors.filter((t) => t.includes('[webgl] world context lost'));
console.log('\nlabel            :', label);
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
}
console.log('webgl ctx losses :', ctxLoss.length, '(any > 0 ⇒ blank world, §29, not this chunk)');
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exitCode = results.every((r) => r.pass) && consoleErrors.length === 0 ? 0 : 1;
