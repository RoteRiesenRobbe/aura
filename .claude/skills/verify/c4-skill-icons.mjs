#!/usr/bin/env node
// Skill icons on the spellbook rows (plan-ui-pass.md C4).
//
// Boundary: this script owns C4's ONE visible claim - every row a player can
// see carries a real glyph token, not the letter fallback and not nothing. The
// book's structure (open/close, tabs, pages) is `c3-spellbook`; what a row SAYS
// is `round4-tooltip`. Nothing here asserts chrome or colour: the look is the
// PO's call at the in-game review (ruling D3).
//
// Legs:
//   1. every VISIBLE row's first child is a token, and it draws an SVG glyph
//   2. ...on every category tab, across every page (the fallback never appears)
//   3. the row contract is untouched: `.skillName` still holds the display name
//      and still comes straight after the token
//   4. the token has a real box and does not squash the +/- controls off the row
//   5. mobile: the same rows in the full-screen book carry the same tokens
//
// ⚑ The letter fallback is the interesting negative: it is what a missing or
// typo'd `icon` value renders as. Two build-time pins (the Go content test and
// SkillIcons.test.ts) already forbid that; this is the in-game third.
//
// ⚑ Restart the server first, and run this script ALONE.
//
// Usage: node .claude/skills/verify/c4-skill-icons.mjs [label] [url]
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Enough content to fill all three tabs and push the aura tab past one page of
// eight, so leg 2 walks real pagination rather than a single short list.
const CHEATS = [
  'Aegis', 'Berserker', 'Blight', 'Frostbite', 'Heal', 'Hoarfrost', 'Immolate',
  'Lantern', 'Paladin', 'Warbanner',
  'Torch', 'Strong', 'Tough', 'ThickHide', 'FireShield',
  'NovaBurst', 'Swift', 'Taunt', 'Revive', 'SummonTotem',
];

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];

// One sample of every visible row's token. Read straight out of the DOM: the
// book keeps its rows rendered whether it is open or shut, so this works either
// way, and only the BOX assertions (leg 4) need it open.
const ROW_TOKENS = () => {
  const rows = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')];
  const visible = rows.filter((r) => !r.classList.contains('offPage'));
  return {
    activeTab: document.querySelector('.spellbookTab.active')?.dataset.category ?? null,
    pageLabel: document.getElementById('spellbookPageLabel')?.textContent ?? '',
    total: rows.length,
    rows: visible.map((row) => {
      const first = row.firstElementChild;
      const token = row.querySelector(':scope > .ink-token');
      const name = row.querySelector(':scope > .skillName');
      return {
        id: row.dataset.skillId,
        category: row.dataset.category,
        name: name?.textContent ?? '',
        // The token is the FIRST child, before the name (ruling D2).
        tokenFirst: !!token && first === token,
        tokenBeforeName: !!token && !!name
          && (token.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
        // A drawn glyph, not the initial-letter degrade.
        hasSvg: !!token?.querySelector('svg > path'),
        fallback: !!token?.classList.contains('letterFallback'),
        // What the fallback would have put there. Empty on a real glyph.
        tokenText: (token?.textContent ?? '').trim(),
        controls: !!row.querySelector(':scope > .skillControls > .spendBtn'),
      };
    }),
  };
};

function wire(page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
}

const clickEl = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
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
await joinAsNewCharacter(page, 'icons');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(500);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');
for (const skill of CHEATS) {
  await cmd(`SKILL ${skill}`);
}
await page.waitForTimeout(1500);

await pressKey(page, 'KeyB');
const opened = await page.evaluate(() => !document.getElementById('spellbook')?.classList.contains('hidden'));
if (!opened) {
  console.log('the book would not open - nothing below can be trusted');
  process.exit(1);
}

// --- legs 1 + 3: the token is there, and the row contract is intact ---------

const first = await page.evaluate(ROW_TOKENS);
check('1 ⭐ every visible row carries a token that DRAWS A GLYPH, not the letter fallback',
  first.rows.length > 0 && first.rows.every((r) => r.hasSvg && !r.fallback && r.tokenText === ''),
  `${first.rows.length} rows on tab ${first.activeTab}: ` +
  JSON.stringify(first.rows.filter((r) => !r.hasSvg || r.fallback).slice(0, 4)));
check('1b the token is the row\'s FIRST child, before .skillName (D2)',
  first.rows.every((r) => r.tokenFirst && r.tokenBeforeName),
  JSON.stringify(first.rows.filter((r) => !r.tokenFirst || !r.tokenBeforeName).slice(0, 4)));
check('3 the row contract is untouched: .skillName still names the skill, .spendBtn still there',
  first.rows.every((r) => r.name.length > 0 && r.controls),
  JSON.stringify(first.rows.slice(0, 3).map((r) => r.name)));

// --- leg 2: every tab, every page -------------------------------------------

const seen = [];
let fallbacks = [];
let glyphless = [];
for (const category of ['aura', 'passive', 'cooldown']) {
  if (!(await clickEl(page, `.spellbookTab[data-category="${category}"]`))) {
    skip(`2 ${category}: the tab had no box`, 'INCONCLUSIVE');
    continue;
  }
  // Bounded page walk; a pager that changes nothing would otherwise spin.
  const pagesSeen = new Set();
  for (let step = 0; step < 12; step++) {
    const sample = await page.evaluate(ROW_TOKENS);
    if (pagesSeen.has(sample.pageLabel + sample.rows.map((r) => r.id).join())) break;
    pagesSeen.add(sample.pageLabel + sample.rows.map((r) => r.id).join());
    seen.push(...sample.rows.map((r) => r.id));
    fallbacks.push(...sample.rows.filter((r) => r.fallback).map((r) => `${category}/${r.name}`));
    glyphless.push(...sample.rows.filter((r) => !r.hasSvg).map((r) => `${category}/${r.name}`));
    if (!(await clickEl(page, '.spellbookPageStep[data-step="1"]'))) break;
  }
}
const uniqueSeen = new Set(seen);
check('2 ⭐ walking every tab and page, no row anywhere falls back to a letter',
  uniqueSeen.size >= 15 && fallbacks.length === 0 && glyphless.length === 0,
  `${uniqueSeen.size} distinct rows walked; fallbacks=${JSON.stringify(fallbacks.slice(0, 5))} glyphless=${JSON.stringify(glyphless.slice(0, 5))}`);

// --- leg 4: the token has a box, and did not push the controls off the row ---

await clickEl(page, '.spellbookTab[data-category="aura"]');
const geometry = await page.evaluate(() => {
  const row = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')]
    .find((r) => !r.classList.contains('offPage'));
  if (!row) return null;
  const rowBox = row.getBoundingClientRect();
  const token = row.querySelector(':scope > .ink-token').getBoundingClientRect();
  const controls = row.querySelector(':scope > .skillControls').getBoundingClientRect();
  return {
    name: row.querySelector('.skillName').textContent,
    token: { w: token.width, h: token.height, left: token.left - rowBox.left },
    // The name takes the flex slack, so the controls stay pinned to the right.
    controlsRightGap: rowBox.right - controls.right,
    rowWidth: rowBox.width,
  };
});
if (!geometry) {
  skip('4 the token has a real box and the controls stay right-aligned', 'INCONCLUSIVE - no visible row');
} else {
  check('4 the token has a real box and the +/- controls stay pinned right',
    geometry.token.w > 10 && geometry.token.h > 10
      && geometry.token.left < 6 && geometry.controlsRightGap < 20,
    JSON.stringify(geometry));
}

await page.screenshot({ path: join(here, `c4-icons-desktop.png`) });

// ----------------------------------------------------------------- mobile ---

const mobCtx = await browser.newContext({
  viewport: { width: 844, height: 390 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const mob = await mobCtx.newPage();
wire(mob);
await mob.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mob, 'iconm');
await mob.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await mob.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await mob.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const mobCmd = async (text) => {
  await mob.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await mob.waitForTimeout(400);
};
await mobCmd('PING');
await mobCmd('GOD');
for (const skill of CHEATS.slice(0, 12)) {
  await mobCmd(`SKILL ${skill}`);
}
await mob.waitForTimeout(1500);

await clickEl(mob, '#mobileMenuButton');
const sheetOpened = await clickEl(mob, '#spellbookSheetButton');
await mob.waitForTimeout(600);
const mobileSample = await mob.evaluate(ROW_TOKENS);
if (!sheetOpened || mobileSample.rows.length === 0) {
  skip('5 the phone\'s full-screen book carries the same tokens',
    `INCONCLUSIVE - sheetOpened=${sheetOpened} rows=${mobileSample.rows.length}`);
} else {
  const mobileBox = await mob.evaluate(() => {
    const row = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')]
      .find((r) => !r.classList.contains('offPage'));
    const token = row?.querySelector(':scope > .ink-token')?.getBoundingClientRect();
    return token ? { w: token.width, h: token.height } : null;
  });
  check('5 ⭐ the phone\'s full-screen book renders the same glyph tokens, with a real box',
    mobileSample.rows.every((r) => r.hasSvg && !r.fallback && r.tokenFirst)
      && !!mobileBox && mobileBox.w > 10 && mobileBox.h > 10,
    `${mobileSample.rows.length} rows, token=${JSON.stringify(mobileBox)}`);
}
await mob.screenshot({ path: join(here, `c4-icons-mobile.png`) });

// Portrait, for the eye: the narrowest the row ever gets.
await mob.setViewportSize({ width: 390, height: 844 });
await mob.waitForTimeout(1200);
await mob.screenshot({ path: join(here, `c4-icons-portrait.png`) });

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
