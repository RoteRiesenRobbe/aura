#!/usr/bin/env node
// R4 C1 — Recall as a baseline utility (plan-downtime.md D1/D7/D8).
//
// What this owns: the utility BUTTON and its cast at the game surface — a
// fresh level-1 character, with no teacher visited and an empty spellbook,
// presses the always-present Recall button and lands back at their bound
// fire; moving mid-cast cancels it and goes nowhere; the cast bar labels the
// wind-up "Recall"; and the Town Crier no longer offers to teach (D8 — the
// Recall teaching died with the skill).
//
//   1  join fresh, dwell at the spawn fire long enough to bind (~1.7 s of
//      consecutive dwell; we give it several times that), record HOME
//   2  warp to open ground (-23, 14 — the documented clean tile), press the
//      button, watch the cast bar light with "Recall"
//   3  hold W mid-cast: the bar goes out, and 10 s later we are NOT home
//      (movement-interrupt; the damage interrupt is pinned in Go —
//      TestCancelCastOnDamage_UtilityRecallIsInterrupted)
//   4  press again and stand still: ~10 s later we are within jitter of HOME
//   5  talk to the Town Crier: root has quest + lore rows, NO "Teach me
//      something." (its teachings node held only Recall and was deleted with
//      it — the empty-destination prune deliberately spares authored-empty
//      nodes, so the row had to go in content, and this leg is what notices
//      if it ever comes back)
//
// ⚑ HOME is recorded, not hardcoded: a fresh character spawns at a RANDOM
// startingSpawn fire, so asserting a named fire would pin a positional
// accident. Recall-refused-when-unbound is pinned in Go
// (TestUtilityRecall_NoAnchorRejectsPress) — browser-side the fresh spawn
// binds within seconds, so the unbound state is not reachable here.
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
const OPEN_GROUND = { x: -23, y: 14 }; // furthest whole-unit tile from any blocker (verify skill)
const CRIER = { x: -55.7, y: 22.0 };   // isolated enough: Hermit is ~3.8 units from the warp tile

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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
  await cmd('GOD');  // leg 5 stands beside NPCs inside aggro radii

  await page.waitForTimeout(8_000); // dwell-bind needs ~1.7 s; give it margin
  const HOME = await pos();
  check(true, 'joined fresh and dwelled at the spawn fire', `home=${JSON.stringify(HOME)}`);

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
  await page.keyboard.down('e');
  await page.waitForTimeout(1_300); // slot/interact keys are edge-triggered off a throttled clock
  await page.keyboard.up('e');
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
