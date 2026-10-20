#!/usr/bin/env node
// Campfire bind persistence — the fix for "logging in does not put me back at
// the campfire I bound to".
//
// Before this change the bind lived only in ConnectionStateSystem.anchors, keyed
// by connection: it survived death and reconnect and nothing else, so every cold
// login spawned the character at a RANDOM startingSpawn fire.
//
//   1  join a fresh character, warp to a NON-starting campfire, press E there and
//      take "Bind & Restock" (standing in the circle binds nothing any more)
//   2  leave to character-select — a real session end, so the return is a cold
//      join out of Postgres (the reconnect stash would prove nothing)
//   3  play the same character again and check WHERE it lands
//
// ⚑ The fire it binds to is deliberately spawnpoint-2 (-141.33, 2.13), which is NOT
// flagged startingSpawn. Binding at the starting fire would pass whether the fix
// works or not, because that is exactly where an unbound character spawns —
// the negative control is the whole point of the venue.
//
// ⚑ The other half of the fix — that the login RE-INSTALLS the bind rather than
// merely using it to place the character once — is pinned in Go, not here; see
// the note at the end of the script for why this harness cannot read it.
//
// Usage: node .claude/skills/verify/campfire-bind-persistence.mjs [label] [url]
// Afterwards: cd backend && go run ./cmd/harnessdb -cleanup
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
// api/zones/world.json bindPoints.
const BOUND_FIRE = { x: -141.33, y: 2.13, id: 'spawnpoint-2' }; // not startingSpawn
const START_FIRE = { x: -239.78, y: 15.36 };               // spawnpoint-1, startingSpawn
const WARP_TO_BOUND = w(BOUND_FIRE.x, BOUND_FIRE.y);

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
// A 401 on a cold load is expected: the client asks the server who it is before
// it can know (same filter, same reason, as chunk4-persistence.mjs).
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

// ⚑ getX/getY are in the wire's 1/120 units, not world units.
const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));
const distanceTo = (p, fire) => Math.hypot(p.x - fire.x, p.y - fire.y);


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

const enterWorld = async () => {
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // --- 1. bind at a fire that is NOT the default spawn ---------------------
  const creation = page.locator('#characterCreation:not(.hidden)');
  await creation.waitFor({ state: 'visible', timeout: 120_000 });
  const name = harnessCharacterName('cfb');
  await page.fill('#characterCreation .characterNameInput', name);
  await page.click('#characterCreation .characterCreateSubmit');
  await enterWorld();

  await cmd('PING'); // the first command after joining is dropped (harness note)
  await cmd('GOD on');  // the eastern fire has company; dying mid-conversation proves nothing
  await cmd(`WARP ${WARP_TO_BOUND}`);
  await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

  const dwellPos = await pos();
  check(distanceTo(dwellPos, BOUND_FIRE) < 1.5, 'the character is standing at the eastern fire',
    `${JSON.stringify(dwellPos)} vs ${JSON.stringify(BOUND_FIRE)}`);
  const bind = await bindAtFire();
  check(bind.ok && bind.home === BOUND_FIRE.id, 'E at the fire + Bind & Restock sets the home marker',
    bind.ok ? `home=${bind.home}` : bind.why);
  check(distanceTo(dwellPos, START_FIRE) > 50, 'and NOT at the starting fire — the venue is the test',
    `${distanceTo(dwellPos, START_FIRE).toFixed(1)} units away`);

  // --- 2. leave the world --------------------------------------------------
  await page.click('#gameSettingsButton');
  await page.click('#leaveToCharacterSelect');
  await page.waitForSelector('#characterSelect:not(.hidden)', { state: 'visible', timeout: 60_000 });
  check(true, 'left the world to character-select');
  await page.waitForTimeout(2000); // the async writer

  // --- 3. come back --------------------------------------------------------
  await page.click('#characterSelect .slotCard .button');
  await enterWorld();

  const backPos = await pos();
  const backDistance = distanceTo(backPos, BOUND_FIRE);
  check(backDistance <= 2.0, 'the cold login lands at the BOUND campfire',
    `${JSON.stringify(backPos)}, ${backDistance.toFixed(2)} units from the fire`);
  check(distanceTo(backPos, START_FIRE) > 50, 'and not at the starting fire',
    `${distanceTo(backPos, START_FIRE).toFixed(1)} units away`);

  // --- 4. the bind is live again, not just consulted once ------------------
  //
  // ⚑ NOT COVERED HERE, and deliberately: "does dying after a cold login send
  // you back to the bound fire" cannot be read from this harness.
  // `window.game.character` is NOT re-pointed at the respawned entity, so every
  // position read after a respawn returns the PRE-DEATH position — 20 s of
  // polling never moved it, while the server log showed the respawn landing at
  // the fire. A leg asserting on that reads as a product failure when the
  // product is fine, which is worse than no leg.
  //
  // The property itself is pinned in Go, where the anchor map is directly
  // observable: sys.TestColdJoin_SpawnsAtThePersistedSpawnPoint asserts the
  // bind is re-installed into s.anchors, which is the same map respawnPosition
  // and recall read.
} catch (err) {
  check(false, 'the run completed', String(err && err.message ? err.message : err));
} finally {
  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log('(run: cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(passed === results.length ? 0 : 1);
