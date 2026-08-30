#!/usr/bin/env node
// UI pass C6 look probe: one desktop pass over every re-chromed surface plus a
// phone pass, screenshots + a computed-style dump. Not a check script - the
// assertions live in the c4b/c3/c5 harnesses; this is the eyeball gate.
//
// ⚑ NAME: this is UI-pass C6. `c6-theme.mjs` beside it is a DIFFERENT C6 (the
// archived plan-code-health.md) - the collision the plan doc flags.
//
// Usage: node .claude/skills/verify/c6-panel-chrome.mjs [url]
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const errors = [];
const browser = await chromium.launch({ args: ['--no-sandbox'], env });

const cmdOn = (page) => async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(500);
};

const clickEl = async (page, selector, dx) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  // ⚑ Spellbook rows are clicked at x+25, never centre (the C5 idiom).
  await page.mouse.click(box.x + (dx ?? box.width / 2), box.y + box.height / 2);
  await page.waitForTimeout(400);
  return true;
};

const styles = (page, spec) => page.evaluate((s) => {
  const out = {};
  for (const [key, sel] of Object.entries(s)) {
    const el = document.querySelector(sel);
    if (!el) { out[key] = 'MISSING'; continue; }
    const c = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    out[key] = {
      display: c.display, bg: c.backgroundColor || c.background,
      border: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
      radius: c.borderRadius, shadow: c.boxShadow.slice(0, 120),
      w: Math.round(box.width), h: Math.round(box.height),
    };
  }
  return out;
}, spec);

// ------------------------------------------------------------------ desktop --
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'c6shot');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
const cmd = cmdOn(page);
await cmd('PING');
await cmd('GOD');
await cmd('XP 9000');
await page.waitForTimeout(1500);

await page.screenshot({ path: join(here, 'c6-desktop-hud.png') });

// the spellbook: chrome + the wood header strip + rows
await clickEl(page, '#spellbookButton');
await page.waitForTimeout(700);
await page.screenshot({ path: join(here, 'c6-desktop-spellbook.png') });

// the tooltip, anchored on a row
const row = await page.locator('#spellbookList > li[data-skill-id]:not(.offPage)').first().boundingBox();
if (row) {
  await page.mouse.move(row.x + 25, row.y + row.height / 2);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(here, 'c6-desktop-tooltip.png') });
}
await clickEl(page, '#spellbookButton');
await page.waitForTimeout(400);

// help
await clickEl(page, '#helpButton');
await page.waitForTimeout(700);
await page.screenshot({ path: join(here, 'c6-desktop-help.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// settings
await clickEl(page, '#gameSettingsButton');
await page.waitForTimeout(700);
await page.screenshot({ path: join(here, 'c6-desktop-settings.png') });
await clickEl(page, '#gameSettingsButton');
await page.waitForTimeout(400);

// journal (the C1 pilot, unchanged - the reference the new strips copy)
await clickEl(page, '#questTrackerJournal');
await page.waitForTimeout(700);
await page.screenshot({ path: join(here, 'c6-desktop-journal.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// a conversation, if an NPC is reachable
await cmd('WARP 4600 2900');
await page.waitForTimeout(2500);
await page.keyboard.press('e');
await page.waitForTimeout(1200);
await page.screenshot({ path: join(here, 'c6-desktop-conversation.png') });

const desk = await styles(page, {
  minimap: '#minimap', healthBar: '#healthBar', xpBar: '#xpBar',
  mapButton: '#mapButton', mapHotkey: '.mapButtonHotkey',
  spellbookButton: '#spellbookButton', spellbook: '#spellbook',
  spellbookTitle: '#spellbook > .spellbookTitle', help: '#help',
  helpHeader: '#help > .helpHeader', conversation: '#conversation',
  settings: '#gameSettingsPanel', tooltip: '#skillTooltip',
});
console.log('DESKTOP ' + JSON.stringify(desk, null, 2));

// ------------------------------------------------------------------- mobile --
const mctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const mob = await mctx.newPage();
mob.on('console', (m) => { if (m.type() === 'error') errors.push('[mob] ' + m.text()); });
mob.on('pageerror', (e) => errors.push('[mob] pageerror: ' + e.message));
await mob.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mob, 'c6shotm');
await mob.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await mob.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await mob.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await mob.waitForTimeout(1500);
await mob.screenshot({ path: join(here, 'c6-mobile-hud.png') });

await clickEl(mob, '#mobileMenuButton');
await mob.waitForTimeout(800);
await mob.screenshot({ path: join(here, 'c6-mobile-sheet.png') });

await clickEl(mob, '#spellbookSheetButton');
await mob.waitForTimeout(900);
await mob.screenshot({ path: join(here, 'c6-mobile-spellbook.png') });

const phone = await styles(mob, {
  healthBar: '#healthBar', xpBar: '#xpBar', journalButton: '#journalButton',
  journalHotkey: '.journalButtonHotkey', sheetButton: '#spellbookSheetButton',
  mapButton: '#mapButton', spellbook: '#spellbook',
  spellbookTitle: '#spellbook > .spellbookTitle', minimap: '#minimap',
  settings: '#gameSettingsPanel', menuButton: '#mobileMenuButton',
});
console.log('MOBILE ' + JSON.stringify(phone, null, 2));

console.log('console errors: ' + errors.length);
for (const e of errors.slice(0, 10)) console.log('  ! ' + e.slice(0, 200));
await browser.close();
