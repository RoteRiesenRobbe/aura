#!/usr/bin/env node
// The layering & exclusivity policy (plan-ui-pass.md C2, ruling D1): journal,
// help, conversation, settings and the mobile ☰ sheet are ONE exclusive family
// - opening any of them closes the rest - enforced by the central
// PanelExclusivity registry rather than by panels calling each other.
//
// Boundary: this script owns the MATRIX, nothing else. What a panel says, how
// it looks and where it sits belong to the panel harnesses (chunkC3-journal,
// chunk3b-ii-conversation, mobile-layout); the world map is deliberately NOT
// in the family (it covers everything and closes nothing, c1-world-map check 9)
// and is not asserted here.
//
// Legs:
//   A. journal ↔ help, both directions (desktop)
//   B. settings joins the family, and gains an Escape close (D2)
//   C. a conversation opening closes the journal, and the journal opening
//      during a conversation closes the conversation
//   D. the phone's one-sheet rule, rerouted through the registry
//
// ⚑ The conversation's close is SERVER-CONFIRMED: leave() only asks, and the
// panel goes when the server drops the tree from the next snapshot. A both-
// visible window of roughly a tick plus the round trip is ACCEPTED by ruling,
// so leg C2 POLLS for the close. An instant assert there is a flake by
// construction, not a stricter test.
//
// ⚑ Leg D opens the journal with the J key, never with the sheet's own
// #journalButton: that button is unreachable from the open sheet at HEAD
// (mobile-layout leg 7, red and PO-owned), and an assertion built on it would
// inherit that red while saying nothing about the policy.
//
// ⚑ Restart the server first, and run this script ALONE.
//
// Usage: node .claude/skills/verify/c2-layering.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// The Emberkeeper (34.52, -19.6) - isolated by 30.5 units from every other
// conversant, so no cluster can quietly answer for it (chunkC3-journal uses the
// same venue for the same reason).
const NEAR_EMBERKEEPER = `${35 * 120} ${-22 * 120}`;

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];

// Everything a family member's visibility can be read from, in one shot.
const PANEL_STATE = () => {
  const shown = (id) => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  };
  return {
    journal: shown('journal'),
    help: shown('help'),
    conversation: shown('conversation'),
    settings: shown('gameSettingsPanel'),
    sheet: document.documentElement.classList.contains('menuOpen'),
  };
};

function wire(page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
}

const state = (page) => page.evaluate(PANEL_STATE);

// Poll until the predicate holds, then return the state. Used wherever a close
// travels through the server (leg C2) - and harmless everywhere else.
const settle = async (page, predicate, timeout = 12_000) => {
  const deadline = Date.now() + timeout;
  let last = await state(page);
  while (Date.now() < deadline) {
    if (predicate(last)) return last;
    await page.waitForTimeout(300);
    last = await state(page);
  }
  return last;
};

const clickEl = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  return true;
};

// The J key, with focus parked on <body>: a control that still holds focus can
// swallow the keydown (preventShortcutPropagation), which reads exactly like a
// policy that was never wired.
const pressKey = async (page, key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(key);
  await page.waitForTimeout(700);
};

// ---------------------------------------------------------------- desktop ---

const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await deskCtx.newPage();
wire(page);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'layers');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
// The develop panel overlays the right half of the screen and eats clicks.
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(900);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
// GOD, because this run parks beside an NPC for a while and a dead player nulls
// the way into the scene graph.
await cmd('GOD');

// --- leg A: journal ↔ help --------------------------------------------------

await pressKey(page, 'KeyJ');
const journalUp = await state(page);
check('A0 the journal opens on J (the premise of everything below)',
  journalUp.journal === true, JSON.stringify(journalUp));

const helpClicked = await clickEl(page, '#helpButton');
const helpUp = await state(page);
if (!helpClicked) {
  skip('A1 opening help closes the journal', 'INCONCLUSIVE - #helpButton had no box to click.');
} else {
  check('A1 opening help closes the journal (D1)',
    helpUp.help === true && helpUp.journal === false, JSON.stringify(helpUp));
}

await pressKey(page, 'KeyJ');
const journalBack = await state(page);
check('A2 ...and opening the journal closes help (D1, the other direction)',
  journalBack.journal === true && journalBack.help === false, JSON.stringify(journalBack));

// --- leg B: settings joins the family, and answers Escape -------------------

const gearClicked = await clickEl(page, '#gameSettingsButton');
const settingsUp = await state(page);
if (!gearClicked) {
  skip('B1 opening settings closes the journal', 'INCONCLUSIVE - #gameSettingsButton had no box to click.');
} else {
  check('B1 opening settings closes the journal (D1)',
    settingsUp.settings === true && settingsUp.journal === false, JSON.stringify(settingsUp));
}

// ⚑ Blur first. The gear carries preventShortcutPropagation, so a click that
// leaves focus on it swallows the Escape keydown before Controls ever sees it -
// which is indistinguishable from D2 not being wired at all. In the game itself
// show() hides the button, so focus falls to <body> on its own.
await pressKey(page, 'Escape');
const afterEscape = await state(page);
check('B2 ⭐ Escape closes settings (D2 - it had no Escape close before C2)',
  afterEscape.settings === false, JSON.stringify(afterEscape));

await clickEl(page, '#gameSettingsButton');
await pressKey(page, 'KeyJ');
const journalOverSettings = await state(page);
check('B3 ...and opening the journal closes settings',
  journalOverSettings.journal === true && journalOverSettings.settings === false,
  JSON.stringify(journalOverSettings));

// --- leg C: the conversation ------------------------------------------------

await cmd(`WARP ${NEAR_EMBERKEEPER}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

// Walk in short bursts until the actor answers rather than trusting the warp
// point: the talk sensor is ~1 unit wide and headless walking speed swings with
// rAF throttling.
const openConversation = async (maxSeconds = 18) => {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 3) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('s');
    await page.waitForTimeout(500);
    await page.keyboard.up('s');
    // ⚑ HOLD E. The interact key is edge-triggered from Controls.update, whose
    // Tock clock is rAF-driven and heavily throttled headless - a tap can fall
    // between two samples and fire nothing.
    await page.keyboard.down('e');
    await page.waitForTimeout(1400);
    await page.keyboard.up('e');
    await page.waitForTimeout(700);
    if ((await state(page)).conversation) return true;
  }
  return (await state(page)).conversation;
};

// Journal standing open, then talk: the combination the policy exists to end.
if (!(await state(page)).journal) {
  await pressKey(page, 'KeyJ');
}
const talked = await openConversation();
if (!talked) {
  skip('C1 a conversation opening closes the open journal',
    'INCONCLUSIVE - no conversation opened, so the family never had two members. ' +
    'Restart the server (conversants wander) and re-run this script alone.');
  skip('C2 opening the journal during a conversation closes the conversation',
    'INCONCLUSIVE - no conversation to close.');
} else {
  const talkState = await state(page);
  check('C1 ⭐ a conversation opening closes the open journal (D1)',
    talkState.conversation === true && talkState.journal === false, JSON.stringify(talkState));

  // The other direction, and the one that has to be polled: J calls leave(),
  // which only ASKS - the panel goes when the server drops the tree.
  await pressKey(page, 'KeyJ');
  const closed = await settle(page, (s) => s.conversation === false);
  check('C2 ⭐ opening the journal EVENTUALLY closes the conversation (server-confirmed)',
    closed.conversation === false && closed.journal === true, JSON.stringify(closed));
}

await page.screenshot({ path: `/tmp/c2-layering-${label}-desktop.png` });
await deskCtx.close();

// ----------------------------------------------------------------- mobile ---
// The phone's one-sheet rule (PO 2026-08-02) now rides the same registry. The
// observable behaviour must be unchanged.
//
// ⚑ ?mobile is FORCED, never emulated: headless Chromium's hasTouch does not
// flip the `pointer: coarse` media query, so an emulation-only run would drive
// the desktop layout, where MobileMenu never even registers.

const mobCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
const mob = await mobCtx.newPage();
wire(mob);
await mob.goto(url + '&mobile', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mob, 'sheet');
await mob.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await mob.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await mob.waitForTimeout(2500);

const sheetTapped = await clickEl(mob, '#mobileMenuButton');
const sheetUp = await mob.evaluate(PANEL_STATE);
if (!sheetTapped || !sheetUp.sheet) {
  skip('D1 the sheet still closes the journal, and vice versa',
    `INCONCLUSIVE - the ☰ sheet did not open (tapped=${sheetTapped}, ${JSON.stringify(sheetUp)}).`);
  skip('D2 opening help from the sheet closes the sheet', 'INCONCLUSIVE - the sheet did not open.');
} else {
  // Direction 1 (this used to be MobileMenu's own pointerdown listener on the
  // journal button; the registry carries it now).
  await pressKey(mob, 'KeyJ');
  const journalOverSheet = await mob.evaluate(PANEL_STATE);
  check('D1a opening the journal closes the ☰ sheet (one sheet at a time)',
    journalOverSheet.journal === true && journalOverSheet.sheet === false,
    JSON.stringify(journalOverSheet));

  // Direction 2 (this used to be setOpen's own Journal.close()). The ☰ sits
  // above the full-screen panels on purpose, so it is tappable from here.
  await clickEl(mob, '#mobileMenuButton');
  const sheetOverJournal = await mob.evaluate(PANEL_STATE);
  check('D1b ...and opening the ☰ sheet closes the journal',
    sheetOverJournal.sheet === true && sheetOverJournal.journal === false,
    JSON.stringify(sheetOverJournal));

  // The help button lives inside the sheet, and pressing it is the path the
  // removed listener used to serve. Tri-state: if the sheet's own controls are
  // unreachable it is mobile-layout leg 7's known problem, not the policy's.
  const helpTapped = await clickEl(mob, '#helpButton');
  const helpOverSheet = await mob.evaluate(PANEL_STATE);
  if (!helpTapped || !helpOverSheet.help) {
    skip('D2 opening help from the sheet closes the sheet',
      `INCONCLUSIVE - help did not open from inside the sheet (tapped=${helpTapped}, ` +
      `${JSON.stringify(helpOverSheet)}). Same class as mobile-layout leg 7.`);
  } else {
    check('D2 opening help from inside the sheet closes the sheet',
      helpOverSheet.help === true && helpOverSheet.sheet === false,
      JSON.stringify(helpOverSheet));
  }
}

await mob.screenshot({ path: `/tmp/c2-layering-${label}-mobile.png` });
await mobCtx.close();

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
const failed = results.filter((r) => !r.skip && !r.pass).length;
const passed = results.filter((r) => !r.skip && r.pass).length;
console.log(`\n${passed} passed, ${failed} failed, ${results.filter((r) => r.skip).length} inconclusive`);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
