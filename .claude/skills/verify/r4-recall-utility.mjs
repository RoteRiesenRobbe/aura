#!/usr/bin/env node
// R4 C1 — Recall as a baseline utility (plan-downtime.md D1/D7/D8).
//
// What this owns: the utility BUTTON and its cast at the game surface — a
// fresh level-1 character, with no teacher visited and an empty spellbook,
// presses the always-present Recall button and lands back at their bound
// fire; moving mid-cast cancels it and goes nowhere; the cast bar labels the
// wind-up "Recall"; and the Town Crier no longer offers to teach (D8 — the
// Recall teaching went with the utility; the skill file itself is back since
// 2026-09-18, cheat-only).
//
//   1  join fresh, stand in the spawn fire's circle, press E and take "Bind &
//      Restock" (standing binds nothing any more; a fresh character is
//      UNBOUND), record HOME
//   2  warp to open ground (the empty clearing at spawnpoint-5), press the
//      button, watch the cast bar light with "Recall"
//   3  hold W mid-cast: the bar goes out, and 10 s later we are NOT home
//      (movement-interrupt; the damage interrupt is pinned in Go —
//      TestCancelCastOnDamage_UtilityRecallIsInterrupted)
//   4  press again and stand still: ~10 s later we are within jitter of HOME
//   5  talk to the Town Crier: root has quest + lore rows, NO "Teach me
//      something." (its teachings node held only Recall and was deleted with
//      the teaching — the empty-destination prune deliberately spares authored-empty
//      nodes, so the row had to go in content, and this leg is what notices
//      if it ever comes back)
//
// ⚑ HOME is recorded, not hardcoded. Recall-refused-when-unbound is pinned in Go
// (TestUtilityRecall_NoAnchorRejectsPress).
//
// Usage: node .claude/skills/verify/r4-recall-utility.mjs [label] [url]
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

const w = (x, y) => `${Math.round(x) * 120} ${Math.round(y) * 120}`;
const SPAWN_FIRE_TILE = { x: -240, y: 15 }; // spawnpoint-1 (-239.78, 15.36), 0.42 u: inside its bind circle
const OPEN_GROUND = { x: -168, y: -84 };    // spawnpoint-5's clearing: no spawn within 40 u, 120+ u from HOME
const CRIER = { x: -185, y: 8 };            // 0.57 u from the TownCrier spawn; the spawnpoint-3 fire is 4.7 u off

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};

// getX/getY are in the wire's 1/120 units.
const pos = () => page.evaluate(() => ({
  x: +(window.game.character.getX() / 120).toFixed(2),
  y: +(window.game.character.getY() / 120).toFixed(2),
}));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const castBar = () => page.evaluate(() => {
  const bar = document.getElementById('castBar');
  return { casting: bar?.classList.contains('casting') ?? false, text: bar?.querySelector('.barText')?.textContent ?? '' };
});


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

const pressRecall = () => page.click('#utilityList li[data-utility="1"]');

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // --- 1. join fresh, bind at the spawn fire by standing on it -------------
  const creation = page.locator('#characterCreation:not(.hidden)');
  await creation.waitFor({ state: 'visible', timeout: 120_000 });
  await page.fill('#characterCreation .characterNameInput', harnessCharacterName('rcl'));
  await page.click('#characterCreation .characterCreateSubmit');
  await page.waitForSelector('#accountScreens.hidden', { state: 'attached', timeout: 120_000 });
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
  await cmd('PING'); // the first command after joining is dropped
  await cmd('GOD on');  // leg 5 stands beside NPCs inside aggro radii

  await cmd(`WARP ${w(SPAWN_FIRE_TILE.x, SPAWN_FIRE_TILE.y)}`);
  await page.waitForTimeout(3_000);
  const bind = await bindAtFire();
  check(bind.ok, 'joined fresh and took Bind & Restock at the spawn fire', bind.ok ? `home=${bind.home}` : bind.why);
  const HOME = await pos();

  const button = await page.evaluate(() => {
    const li = document.querySelector('#utilityList li[data-utility="1"]');
    return li ? { label: li.querySelector('.slotLabel')?.textContent } : null;
  });
  check(!!button && button.label === 'Recall',
    'the Recall button is present, no teacher visited', JSON.stringify(button));

  // ⚑ Through a HOVER, not a title= attribute: the buttons carried a native
  // browser tooltip until the PO called it out (2026-08-03), and they now
  // render through the same element every ability uses. Reading the rendered
  // panel is what would notice a fall back to title=.
  await page.hover('#utilityList li[data-utility="1"]');
  await page.waitForTimeout(700);
  const tip = await page.evaluate(() => {
    // ⚑ #skillTooltip, the element itself — a [class*=ooltip] selector matches
    // the inner .tooltipTitle first and reads back only the title.
    const el = document.getElementById('skillTooltip');
    return el && !el.classList.contains('hidden') ? el.textContent ?? '' : '';
  });
  await page.mouse.move(640, 400); // park it: an open tooltip covers the panels beside the bar
  check(/^Recall/.test(tip) && /Utility/.test(tip) && /campfire/.test(tip),
    'hovering it renders the GAME tooltip, not the browser one', JSON.stringify(tip.slice(0, 90)));

  // --- 2. warp out, press, the cast bar lights -----------------------------
  await cmd(`WARP ${w(OPEN_GROUND.x, OPEN_GROUND.y)}`);
  await page.waitForTimeout(20_000); // camera + position settle across a long warp (§20)
  const out = await pos();
  check(dist(out, HOME) > 20, 'warped well away from the bound fire', `${dist(out, HOME).toFixed(1)} units out`);

  await pressRecall();
  await page.waitForFunction(() => {
    const bar = document.getElementById('castBar');
    return bar?.classList.contains('casting') && /Recall/.test(bar.querySelector('.barText')?.textContent ?? '');
  }, null, { timeout: 5_000 });
  const bar = await castBar();
  check(bar.casting && /Recall/.test(bar.text), 'the cast bar winds up labelled "Recall"', bar.text);

  // --- 3. moving cancels the cast and we go nowhere -------------------------
  await page.keyboard.down('w');
  await page.waitForTimeout(1_500); // a long hold — headless rAF sampling (verify skill)
  await page.keyboard.up('w');
  await page.waitForFunction(() => !document.getElementById('castBar')?.classList.contains('casting'),
    null, { timeout: 5_000 });
  check(true, 'moving mid-cast puts the bar out');
  await page.waitForTimeout(10_500); // past where completion would have landed
  const afterInterrupt = await pos();
  check(dist(afterInterrupt, HOME) > 20, 'the interrupted cast teleported nobody',
    `still ${dist(afterInterrupt, HOME).toFixed(1)} units from home`);

  // --- 4. stand still: completion lands at the bound fire -------------------
  await pressRecall();
  await page.waitForTimeout(12_000); // 300 ticks = 10 s + margin
  const backHome = await pos();
  check(dist(backHome, HOME) <= 2.5, 'the completed cast lands at the bound fire',
    `${JSON.stringify(backHome)}, ${dist(backHome, HOME).toFixed(2)} units from home`);
  const barAfter = await castBar();
  check(!barAfter.casting, 'and the bar is down again');

  // --- 5. the Town Crier no longer offers to teach ---------------------------
  await cmd(`WARP ${w(CRIER.x, CRIER.y)}`);
  await page.waitForTimeout(20_000);
  await pressForPanel(); // slot/interact keys are edge-triggered off a throttled clock
  await page.waitForSelector('#conversation:not(.hidden)', { state: 'visible', timeout: 10_000 });
  const talk = await page.evaluate(() => ({
    actor: document.querySelector('#conversation .conversationActor')?.textContent ?? '',
    rows: [...document.querySelectorAll('#conversation .conversationRows li')].map((li) => li.textContent ?? ''),
  }));
  check(/Town Crier/.test(talk.actor), 'the conversation is the CRIER’s (the cluster warning)', talk.actor);
  check(talk.rows.some((r) => r.includes('Do you have a task for me')),
    'his quest row is still there', JSON.stringify(talk.rows));
  check(!talk.rows.some((r) => r.includes('Teach me something')),
    'and "Teach me something." is GONE — Recall needs no teacher any more', JSON.stringify(talk.rows));
} catch (err) {
  check(false, 'the run completed', String(err && err.message ? err.message : err));
  try { await page.screenshot({ path: '/tmp/r4-recall-fail.png' }); } catch { /* best effort */ }
} finally {
  check(consoleErrors.length === 0, `${consoleErrors.length} console errors`,
    consoleErrors.slice(0, 3).join(' | '));
  await browser.close();
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
console.log('(run: cd backend && go run ./cmd/harnessdb -cleanup)');
process.exit(passed === results.length ? 0 : 1);
