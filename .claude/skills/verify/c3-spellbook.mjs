#!/usr/bin/env node
// The spellbook's structural rework (plan-ui-pass.md C3): the book stops being
// always-on and becomes an openable, category-tabbed, paged panel on desktop
// AND on the phone, and joins the C2 exclusivity family as a full member.
//
// Boundary: this script owns the book's STRUCTURE - open/close, the family
// legs the spellbook is a party to, tabs, pages, and that the pending-equip
// flow survives the panel. What a row SAYS is `round4-tooltip`/`r1-focus-cost`;
// the rest of the matrix is `c2-layering`; the phone's layout is
// `mobile-layout`. The world map is deliberately outside the family
// (`c1-world-map` check 9) and is not asserted here.
//
// Legs:
//   A. closed on join · B opens · B closes · the button opens · Escape closes
//   B. the five family legs (journal / help / settings / conversation / ☰)
//   C. tabs: one per non-empty category, an empty one hidden, switching filters
//   D. pages: derived from DISCOVERED entries only, flipping, no auto-flip
//   E. the click-row-then-click-slot equip flow, with the book open
//   F. tab and page survive a per-tick rebuild
//   G. mobile: the sheet's Spellbook row, full-screen book, sheet exclusivity
//
// ⚑ The conversation's close is SERVER-CONFIRMED (C2's accepted window): leg
// B5b POLLS. An instant assert there is a flake by construction.
//
// ⚑ The DOM stays rendered whether the book is open or shut - that is the rule
// the other 32 scripts depend on - so this script asserts VISIBILITY (the
// `hidden` / `offPage` classes and real boxes), never element existence.
//
// ⚑ Restart the server first, and run this script ALONE.
//
// Usage: node .claude/skills/verify/c3-spellbook.mjs [label] [url]
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
// conversant, so no cluster can quietly answer for it (c2-layering and
// chunkC3-journal use the same venue for the same reason).
const NEAR_EMBERKEEPER = `${35 * 120} ${-22 * 120}`;

// Nine auras cheated in, so the aura tab is genuinely longer than one page of
// eight. Names, not ids: `SKILL <name>` is what the console takes.
const EXTRA_AURAS = ['Aegis', 'Berserker', 'Blight', 'Frostbite', 'Heal',
  'Hoarfrost', 'Immolate', 'Lantern', 'Paladin'];

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];

// Everything the book's state can be read from, in ONE sample - the world
// moves between round trips.
const BOOK_STATE = () => {
  const shown = (id) => {
    const el = document.getElementById(id);
    return !!el && !el.classList.contains('hidden');
  };
  const rows = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')];
  const visible = rows.filter((r) => !r.classList.contains('offPage'));
  const perCategory = {};
  for (const row of rows) {
    perCategory[row.dataset.category] = (perCategory[row.dataset.category] ?? 0) + 1;
  }
  return {
    spellbook: shown('spellbook'),
    journal: shown('journal'),
    help: shown('help'),
    conversation: shown('conversation'),
    settings: shown('gameSettingsPanel'),
    sheet: document.documentElement.classList.contains('menuOpen'),
    button: shown('spellbookButton'),
    badge: document.getElementById('skillPointsBadge')?.textContent ?? '',
    badgeShown: shown('skillPointsBadge'),
    rows: rows.length,
    perCategory,
    // The DOM contract the other 32 scripts stand on.
    contract: {
      list: !!document.getElementById('spellbookList'),
      spend: document.querySelectorAll('#spellbookList .spendBtn').length,
      unspend: document.querySelectorAll('#spellbookList .unspendBtn').length,
      respec: !!document.getElementById('respecButton'),
      hasPoints: !!document.getElementById('spellbook')?.classList.contains('hasPoints'),
    },
    visibleRows: visible.map((r) => r.dataset.skillId),
    visibleCategories: [...new Set(visible.map((r) => r.dataset.category))],
    activeTab: document.querySelector('.spellbookTab.active')?.dataset.category ?? null,
    tabsShown: [...document.querySelectorAll('.spellbookTab')]
      .filter((t) => !t.classList.contains('hidden')).map((t) => t.dataset.category),
    pager: shown('spellbookPager'),
    pageLabel: document.getElementById('spellbookPageLabel')?.textContent ?? '',
    selected: document.querySelector('#spellbookList li.selected')?.dataset.skillId ?? null,
    slot0: document.querySelector('#auraSlotList li[data-slot="0"] .slotLabel')?.textContent ?? '',
  };
};

function wire(page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
}

const state = (page) => page.evaluate(BOOK_STATE);

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

const pressKey = async (page, key) => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press(key);
  await page.waitForTimeout(700);
};

// ---------------------------------------------------------------- desktop ---

const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await deskCtx.newPage();
wire(page);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'book');
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
  await page.waitForTimeout(700);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');  // this run parks in the open; a dead player nulls the scene graph

// --- leg A: the panel opens and closes --------------------------------------

const atJoin = await state(page);
check('A0 ⭐ the book is CLOSED on join, and its rows are in the DOM anyway',
  atJoin.spellbook === false && atJoin.contract.list === true,
  JSON.stringify({ spellbook: atJoin.spellbook, rows: atJoin.rows, contract: atJoin.contract }));
check('A0b the desktop open button is on screen with the book shut',
  atJoin.button === true, `button=${atJoin.button}`);

await pressKey(page, 'KeyB');
const afterB = await state(page);
check('A1 ⭐ B opens the book (D5)', afterB.spellbook === true, JSON.stringify({ spellbook: afterB.spellbook }));

await pressKey(page, 'KeyB');
check('A2 ...and a second B closes it', (await state(page)).spellbook === false, 'toggle');

const buttonClicked = await clickEl(page, '#spellbookButton');
const afterButton = await state(page);
if (!buttonClicked) {
  skip('A3 the desktop button opens the book', 'INCONCLUSIVE - #spellbookButton had no box to click.');
} else {
  check('A3 the desktop button opens the book', afterButton.spellbook === true,
    JSON.stringify({ spellbook: afterButton.spellbook }));
}

await pressKey(page, 'Escape');
check('A4 Escape closes the book (the blanket close-all, D5)',
  (await state(page)).spellbook === false, 'escape');

// --- leg B: the exclusivity family ------------------------------------------

await pressKey(page, 'KeyJ');
await pressKey(page, 'KeyB');
const bookOverJournal = await state(page);
check('B1 ⭐ opening the book closes the journal (C2 D1, the spellbook is a member now)',
  bookOverJournal.spellbook === true && bookOverJournal.journal === false,
  JSON.stringify(bookOverJournal).slice(0, 200));

await pressKey(page, 'KeyJ');
const journalOverBook = await state(page);
check('B2 ...and opening the journal closes the book',
  journalOverBook.journal === true && journalOverBook.spellbook === false,
  JSON.stringify({ journal: journalOverBook.journal, spellbook: journalOverBook.spellbook }));

await pressKey(page, 'KeyJ'); // shut the journal again
await pressKey(page, 'KeyB');
const helpTapped = await clickEl(page, '#helpButton');
const helpOverBook = await state(page);
if (!helpTapped) {
  skip('B3 opening help closes the book', 'INCONCLUSIVE - #helpButton had no box to click.');
} else {
  check('B3 opening help closes the book',
    helpOverBook.help === true && helpOverBook.spellbook === false,
    JSON.stringify({ help: helpOverBook.help, spellbook: helpOverBook.spellbook }));
}

await pressKey(page, 'Escape');
await pressKey(page, 'KeyB');
const gearTapped = await clickEl(page, '#gameSettingsButton');
const settingsOverBook = await state(page);
if (!gearTapped) {
  skip('B4 opening settings closes the book', 'INCONCLUSIVE - #gameSettingsButton had no box to click.');
} else {
  check('B4 opening settings closes the book',
    settingsOverBook.settings === true && settingsOverBook.spellbook === false,
    JSON.stringify({ settings: settingsOverBook.settings, spellbook: settingsOverBook.spellbook }));
}
await pressKey(page, 'Escape');

// --- leg C + D: tabs and pages ----------------------------------------------
// Cheated in rather than earned: nine auras is more than one page of eight, and
// a peasant's own book is one row long.

for (const skill of EXTRA_AURAS) {
  await cmd(`SKILL ${skill}`);
}
await cmd('SKILL Paralyze');   // a cooldown
await cmd('SKILL Torch');      // a passive (⚑ Torch is NOT an aura)
await page.waitForTimeout(2500);
await pressKey(page, 'KeyB');

const stocked = await settle(page, (s) => s.rows >= 10, 20_000);
if (!stocked.spellbook || stocked.rows < 10) {
  skip('C/D tabs and pages', `INCONCLUSIVE - the cheated skills did not arrive (${JSON.stringify({ rows: stocked.rows, spellbook: stocked.spellbook })}).`);
} else {
  const cats = Object.keys(stocked.perCategory).sort();
  check('C1 ⭐ one tab per category that has discovered something',
    JSON.stringify(stocked.tabsShown.slice().sort()) === JSON.stringify(cats),
    `tabs=${stocked.tabsShown} categories=${JSON.stringify(stocked.perCategory)}`);

  check('C2 the open tab shows its own category and nothing else',
    stocked.visibleCategories.length === 1 && stocked.visibleCategories[0] === stocked.activeTab,
    `active=${stocked.activeTab} visible=${stocked.visibleCategories}`);

  // ⚑ Derived, never hardcoded: the expectation is the DOM's own row count.
  const auras = stocked.perCategory.aura ?? 0;
  const pages = Math.max(1, Math.ceil(auras / 8));
  check('D1 ⭐ the page count derives from DISCOVERED entries only',
    stocked.activeTab !== 'aura' || stocked.pageLabel === `1 / ${pages}`,
    `${auras} auras -> "${stocked.pageLabel}" (expected "1 / ${pages}")`);
  check('D2 a page holds at most eight entries',
    stocked.visibleRows.length <= 8, `${stocked.visibleRows.length} rows visible`);

  const firstPage = stocked.visibleRows.join(',');
  await clickEl(page, '.spellbookPageStep[data-step="1"]');
  const second = await state(page);
  check('D3 ⭐ the pager flips to the next page of the same tab',
    second.pageLabel === `2 / ${pages}` && second.visibleRows.join(',') !== firstPage,
    `"${second.pageLabel}" rows=${second.visibleRows}`);

  await clickEl(page, '.spellbookTab[data-category="cooldown"]');
  const cooldownTab = await state(page);
  check('C3 switching tab shows that category, starting at its first page',
    cooldownTab.activeTab === 'cooldown'
      && cooldownTab.visibleCategories.every((c) => c === 'cooldown')
      && cooldownTab.pageLabel.startsWith('1 /'),
    `active=${cooldownTab.activeTab} visible=${cooldownTab.visibleCategories} page="${cooldownTab.pageLabel}"`);

  // --- leg F: the state survives the per-tick rebuild ------------------------
  await clickEl(page, '.spellbookTab[data-category="aura"]');
  await clickEl(page, '.spellbookPageStep[data-step="1"]');
  const beforeRebuild = await state(page);
  await cmd('XP 5000'); // a level-up hands out points -> updateSpellbook rebuilds every row
  await page.waitForTimeout(3000);
  const afterRebuild = await state(page);
  check('F1 ⭐ the tab and the page survive a rebuild of every row',
    afterRebuild.activeTab === beforeRebuild.activeTab
      && afterRebuild.pageLabel === beforeRebuild.pageLabel
      && afterRebuild.spellbook === true,
    `before="${beforeRebuild.activeTab} ${beforeRebuild.pageLabel}" after="${afterRebuild.activeTab} ${afterRebuild.pageLabel}"`);
  check('F2 the points badge rides the open button, and the spend buttons are live',
    afterRebuild.badgeShown === true && /Point/.test(afterRebuild.badge)
      && afterRebuild.contract.hasPoints === true && afterRebuild.contract.spend > 0,
    `badge="${afterRebuild.badge}" shown=${afterRebuild.badgeShown} spend=${afterRebuild.contract.spend}`);
}

// --- leg E: the pending-equip flow, with the book open ----------------------

await clickEl(page, '.spellbookTab[data-category="aura"]');
const equipTarget = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')]
    .find((r) => !r.classList.contains('offPage') && r.dataset.category === 'aura');
  return row ? { id: row.dataset.skillId, name: row.querySelector('.skillName')?.textContent } : null;
});
if (!equipTarget) {
  skip('E1 the click-row-then-click-slot equip flow', 'INCONCLUSIVE - no visible aura row to click.');
} else {
  // ⚑ The NAME, not the row centre: the +/− buttons sit mid-row and take
  // precedence in the pointerdown handler.
  const box = await page.locator(`#spellbookList li[data-skill-id="${equipTarget.id}"]`).first().boundingBox();
  await page.mouse.click(box.x + 25, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const pending = await state(page);
  check('E1 ⭐ clicking a row selects it while the book is open',
    pending.selected === equipTarget.id, `selected=${pending.selected} wanted=${equipTarget.id} (${equipTarget.name})`);

  const slotBox = await page.locator('#auraSlotList li[data-slot="0"]').first().boundingBox();
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2);
  const equipped = await settle(page, (s) => s.slot0.includes(equipTarget.name), 8_000);
  check('E2 ⭐ ...and the slot beside it takes the equip (the flow D1 preserves)',
    equipped.slot0.includes(equipTarget.name), `slot 0 = "${equipped.slot0}" wanted "${equipTarget.name}"`);
}

// --- leg B5: the conversation ------------------------------------------------

await cmd(`WARP ${NEAR_EMBERKEEPER}`);
await page.waitForTimeout(20_000); // camera + position settle across the warp (§20)

const openConversation = async (maxSeconds = 18) => {
  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 3) {
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.down('s');
    await page.waitForTimeout(500);
    await page.keyboard.up('s');
    // ⚑ HOLD E - the interact key is edge-triggered off the throttled rAF clock.
    await page.keyboard.down('e');
    await page.waitForTimeout(1400);
    await page.keyboard.up('e');
    await page.waitForTimeout(700);
    if ((await state(page)).conversation) return true;
  }
  return (await state(page)).conversation;
};

if (!(await state(page)).spellbook) {
  await pressKey(page, 'KeyB');
}
const talked = await openConversation();
if (!talked) {
  skip('B5a a conversation opening closes the open book',
    'INCONCLUSIVE - no conversation opened. Restart the server (conversants wander) and re-run alone.');
  skip('B5b opening the book during a conversation closes the conversation', 'INCONCLUSIVE - no conversation.');
} else {
  const talkState = await state(page);
  check('B5a ⭐ a conversation opening closes the open book (D1)',
    talkState.conversation === true && talkState.spellbook === false,
    JSON.stringify({ conversation: talkState.conversation, spellbook: talkState.spellbook }));

  // The direction that must be POLLED: the close is server-confirmed.
  await pressKey(page, 'KeyB');
  const closed = await settle(page, (s) => s.conversation === false);
  check('B5b ⭐ opening the book EVENTUALLY closes the conversation (server-confirmed)',
    closed.conversation === false && closed.spellbook === true,
    JSON.stringify({ conversation: closed.conversation, spellbook: closed.spellbook }));
}

await page.screenshot({ path: `/tmp/c3-spellbook-${label}-desktop.png` });
await deskCtx.close();

// ----------------------------------------------------------------- mobile ---
// D4: the ☰ sheet gets a Spellbook row and LOSES the embedded book, which now
// opens full-screen and is exclusive with the sheet like the journal.
//
// ⚑ ?mobile is FORCED, never emulated (headless Chromium's hasTouch does not
// flip `pointer: coarse`).

const mobCtx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true });
const mob = await mobCtx.newPage();
wire(mob);
await mob.goto(url + '&mobile', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mob, 'phone');
await mob.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await mob.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await mob.waitForTimeout(2500);

const mobState = () => mob.evaluate(BOOK_STATE);
const boxOf = (selector) => mob.locator(selector).first().boundingBox().catch(() => null);

const sheetTapped = await clickEl(mob, '#mobileMenuButton');
const sheetUp = await mobState();
if (!sheetTapped || !sheetUp.sheet) {
  skip('G1 the ☰ sheet carries a Spellbook row', `INCONCLUSIVE - the sheet did not open (${JSON.stringify({ sheetTapped, sheet: sheetUp.sheet })}).`);
  skip('G2 tapping it opens the book full-screen and closes the sheet', 'INCONCLUSIVE - the sheet did not open.');
  skip('G3 the ☰ takes the screen back from the book', 'INCONCLUSIVE - the sheet did not open.');
} else {
  const rowBox = await boxOf('#spellbookSheetButton');
  const bookBox = await boxOf('#spellbook');
  check('G1 ⭐ the sheet carries a Spellbook row, and NOT the book itself (D4)',
    !!rowBox && sheetUp.spellbook === false && bookBox === null,
    `row=${!!rowBox} bookShown=${sheetUp.spellbook} bookBox=${bookBox === null ? 'none' : 'present'}`);

  await clickEl(mob, '#spellbookSheetButton');
  const bookUp = await mobState();
  const fullScreen = await boxOf('#spellbook');
  const vw = await mob.evaluate(() => window.innerWidth);
  check('G2 ⭐ tapping it opens the book full-screen, and the sheet gets out of the way',
    bookUp.spellbook === true && bookUp.sheet === false
      && !!fullScreen && fullScreen.width >= vw - 2,
    `${JSON.stringify({ spellbook: bookUp.spellbook, sheet: bookUp.sheet })} box=${fullScreen ? Math.round(fullScreen.width) : 'null'} of ${vw}`);
  await mob.screenshot({ path: `/tmp/c3-spellbook-${label}-mobile-book.png` });

  await clickEl(mob, '#mobileMenuButton');
  const backToSheet = await mobState();
  check('G3 ⭐ the ☰ takes the screen back - sheet in, book out (one at a time)',
    backToSheet.sheet === true && backToSheet.spellbook === false,
    JSON.stringify({ sheet: backToSheet.sheet, spellbook: backToSheet.spellbook }));
  await mob.screenshot({ path: `/tmp/c3-spellbook-${label}-mobile-sheet.png` });

  // --- G4: the one open flow question in the C3 spec --------------------------
  // A phone's PASSIVE slots live in the ☰ sheet, so selecting a passive in the
  // full-screen book has to hand the screen back to the sheet (the plan's
  // default, flagged for the PO look). Aura/cooldown selections just close the
  // book, which G2/G3 already walk.
  await mob.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await mob.evaluate(() => {
    const input = document.getElementById('console_command');
    input.value = 'SKILL Torch'; // ⚑ Torch is a PASSIVE, not the light aura
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  await mob.waitForTimeout(2500);

  await clickEl(mob, '#spellbookSheetButton');
  await clickEl(mob, '.spellbookTab[data-category="passive"]');
  const passiveRow = await mob.evaluate(() => {
    const row = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')]
      .find((r) => !r.classList.contains('offPage') && r.dataset.category === 'passive');
    return row ? { id: row.dataset.skillId, text: row.textContent.trim() } : null;
  });
  if (!passiveRow) {
    skip('G4 selecting a passive hands the screen to the sheet, where its slots are',
      'INCONCLUSIVE - no passive row on the phone (the SKILL cheat did not land).');
  } else {
    const rowBox = await boxOf(`#spellbookList li[data-skill-id="${passiveRow.id}"]`);
    await mob.mouse.click(rowBox.x + 25, rowBox.y + rowBox.height / 2);
    await mob.waitForTimeout(800);
    const afterPick = await mobState();
    check('G4 ⭐ picking a PASSIVE closes the book and opens the sheet its slots live in (D4)',
      afterPick.spellbook === false && afterPick.sheet === true && afterPick.selected === passiveRow.id,
      `${JSON.stringify({ spellbook: afterPick.spellbook, sheet: afterPick.sheet, selected: afterPick.selected })} row=${passiveRow.text}`);
    await mob.screenshot({ path: `/tmp/c3-spellbook-${label}-mobile-passive.png` });
  }
}

// A portrait pass, for the eye only: the phone layout is keyed to vmin, so
// portrait and landscape size differently and the tab row is the newest thing
// that has to survive a narrow screen.
//
// ⚑ It must not assume what the legs above left open - G4 ends with the SHEET
// up, and a blind ☰ tap then closes it and shoots the bare world instead. Park
// the state first, then open deliberately.
await mob.setViewportSize({ width: 390, height: 844 });
await mob.waitForTimeout(1200);
await pressKey(mob, 'Escape');
if (!(await mobState()).sheet) {
  await clickEl(mob, '#mobileMenuButton');
}
await mob.screenshot({ path: `/tmp/c3-spellbook-${label}-portrait-sheet.png` });
await clickEl(mob, '#spellbookSheetButton');
await mob.waitForTimeout(600);
console.log('portrait state  :', JSON.stringify(await mobState()).slice(0, 120));
await mob.screenshot({ path: `/tmp/c3-spellbook-${label}-portrait-book.png` });

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
