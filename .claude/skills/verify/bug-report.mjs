#!/usr/bin/env node
// Bug report BR1 (docs/plan-bug-report.md §5 BR1): the report, client only.
//
//   1  start screen: settings → Report bug → Generate opens the panel; the
//      in-game lines print n/a there, the fps check still measures
//   2  in the world: typing WASD into the box does not move the character (L1)
//   3  Generate: the settings panel shuts (family), the report panel shows the
//      banner, the message verbatim, a measured fps check, an http rtt in ms,
//      the character's name + WARP form, a game version, and a console.error
//      raised before the press (the console buffer, D7)
//   4  Copy confirms (clipboard, or the fallback's own message)
//   5  Escape in the report closes it (L3); X closes it; DONE closes it
//   6  Escape in the form's text box closes the settings panel (L3)
//   7  1440×780: the panel, its text and both buttons fit inside the viewport
//
// Usage: node .claude/skills/verify/bug-report.mjs [label] [url]
// Afterwards (stop aurad first): cd backend && go run ./cmd/harnessdb -cleanup
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

const results = [];
const check = (pass, name, detail = '') => {
  results.push({ ok: !!pass, name, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const shown = (page, id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  return !!el && !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0;
}, id);
const reportText = (page) => page.evaluate(() => document.getElementById('bugReportText').value);
const field = (text, label) => (new RegExp(`^${label}: +(.*)$`, 'm').exec(text) || [])[1];

async function generate(page, message) {
  await page.click('#gameSettingsButton');
  await page.waitForSelector('#gameSettingsPanel:not(.hidden)');
  await page.click('#openBugReport');
  await page.waitForSelector('#bugReportForm:not(.hidden)');
  if (message !== undefined) {
    await page.fill('#bugReportMessage', message);
  }
  await page.click('#generateBugReport');
  await page.waitForSelector('#bugReportPanel:not(.hidden)', { timeout: 10_000 });
  return reportText(page);
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

try {
  await page.goto(url);
  await page.waitForSelector('#gameSettingsButton', { state: 'visible', timeout: 30_000 });

  // --- 1. the start screen -------------------------------------------------------
  {
    const text = await generate(page, 'start screen report');
    check(text.startsWith('== Bug report ==\nstart screen report\n'), 'start screen: the report opens with the message');
    check(field(text, 'character') === 'n/a', 'start screen: the character line is n/a', field(text, 'character'));
    check(/frames · avg/.test(field(text, 'fps check') || ''), 'start screen: the fps check still measures', field(text, 'fps check'));
    await page.click('#doneBugReport');
    check(!(await shown(page, 'bugReportPanel')), 'start screen: DONE closes the panel');
  }

  await joinAsNewCharacter(page, 'bugrp');
  await page.waitForTimeout(1500);

  // --- 2. typing in the box does not drive the game (L1) --------------------------
  const before = await generate(page, 'position probe');
  await page.click('#doneBugReport');
  await page.click('#gameSettingsButton');
  await page.click('#openBugReport');
  await page.click('#bugReportMessage');
  for (const key of ['w', 'a', 's', 'd']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(400);
    await page.keyboard.up(key);
  }
  const typed = await page.inputValue('#bugReportMessage');
  check(typed === 'wasd', 'the keys land in the text box', JSON.stringify(typed));
  await page.fill('#bugReportMessage', '');

  // --- 3. the report ---------------------------------------------------------------
  await page.evaluate(() => console.error('harness-marker: something broke', new Error('boom')));
  await page.fill('#bugReportMessage', 'The map is blue.\n  Second line "quoted" <b>not html</b>');
  await page.click('#generateBugReport');
  await page.waitForSelector('#bugReportPanel:not(.hidden)', { timeout: 10_000 });
  const text = await reportText(page);
  const posBefore = /WARP (-?\d+) (-?\d+)/.exec(field(before, 'character') || '');
  const posAfter = /WARP (-?\d+) (-?\d+)/.exec(field(text, 'character') || '');
  check(posBefore && posAfter && Math.hypot(posAfter[1] - posBefore[1], posAfter[2] - posBefore[2]) < 5,
    'holding WASD in the text box did not move the character', `${posBefore?.[0]} → ${posAfter?.[0]}`);

  check(!(await shown(page, 'gameSettingsPanel')), 'opening the report shut the settings panel');
  const banner = await page.textContent('#bugReportPanel h2');
  check(banner === 'PLEASE SEND THIS REPORT TO US VIA DISCORD:', 'the banner reads as ruled', banner);
  check(text.includes('== Bug report ==\nThe map is blue.\n  Second line "quoted" <b>not html</b>\n'), 'the message is verbatim');
  check(/^\d+ frames|^[\d.]+ s · \d+ frames · avg [\d.]+ fps/.test(field(text, 'fps check') || ''), 'the fps check measured', field(text, 'fps check'));
  check(/^\d+ ms$/.test(field(text, 'http rtt') || ''), 'the http rtt is a number of ms', field(text, 'http rtt'));
  check(/^hrnss_bugrp_\S+ · level \d+ · zone \S+ · at -?[\d.]+, -?[\d.]+ \(WARP -?\d+ -?\d+\)$/.test(field(text, 'character') || ''),
    'the character line carries name, level, zone and WARP', field(text, 'character'));
  check(/^[0-9a-f]{7,}(-dirty)? \(\d{4}-\d\d-\d\d\)$/.test(field(text, 'game version') || ''), 'the game version is stamped', field(text, 'game version'));
  check(/^webgl · resolution [\d.]+ · canvas \d+×\d+ \([\d.]+ Mpx\)/.test(field(text, 'renderer') || ''), 'the renderer line', field(text, 'renderer'));
  check(/^webgl/.test(field(text, 'minimap') || ''), 'the minimap renderer line', field(text, 'minimap'));
  check(/DPR [\d.]+ · window \d+×\d+/.test(field(text, 'screen') || ''), 'the screen line', field(text, 'screen'));
  check(/\[error \d\d:\d\d:\d\d\] harness-marker: something broke Error: boom/.test(text), 'the console buffer caught the error');
  check(field(text, 'report id') === 'n/a', 'report id is n/a until BR2');
  check(/ · cores \d+ · memory (\d+(\.\d+)? GB|n\/a)$/.test(field(text, 'device') || ''), 'the device line carries cores and memory', field(text, 'device'));
  check(/ · camera zoom \d+ · radar \d+ m$/.test(field(text, 'settings') || ''), 'the settings line carries camera zoom and radar', field(text, 'settings'));
  check(/^uptime \d+ (s|min) · PLAYING for \d+ (s|min)$/.test(field(text, 'session') || ''), 'the session line: uptime and PLAYING', field(text, 'session'));

  // --- 4. Copy -----------------------------------------------------------------------
  await page.click('#copyBugReport');
  await page.waitForTimeout(300);
  const status = await page.textContent('#bugReportCopyStatus');
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  check(status === 'Copied!' && clip === text, 'Copy put the whole report on the clipboard', `${status}, ${clip === null ? 'clipboard unreadable' : clip.length + ' chars'}`);

  // --- 5. Escape, X, DONE ---------------------------------------------------------------
  await page.focus('#bugReportText');
  await page.keyboard.press('Escape');
  check(!(await shown(page, 'bugReportPanel')), 'Escape in the report closes it');
  await generate(page, 'x');
  // ⚑ Under &develop the dev panel's table covers the top-right corner (settings has
  // its develop-offset for the same reason), so a real click would land on it.
  await page.dispatchEvent('#closeBugReport', 'pointerdown');
  check(!(await shown(page, 'bugReportPanel')), 'X closes it');

  // --- 6. Escape in the form ---------------------------------------------------------
  await page.click('#gameSettingsButton');
  await page.click('#openBugReport');
  await page.click('#bugReportMessage');
  await page.keyboard.press('Escape');
  check(!(await shown(page, 'gameSettingsPanel')), 'Escape in the form\'s text box closes settings');

  // --- 7. a short viewport -----------------------------------------------------------
  await page.setViewportSize({ width: 1440, height: 780 });
  await page.waitForTimeout(300);
  await generate(page, 'short viewport');
  const fit = await page.evaluate(() => {
    const inside = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    };
    return ['bugReportPanel', 'bugReportText', 'copyBugReport', 'doneBugReport'].every(inside);
  });
  check(fit, '1440×780: panel, text and both buttons fit');
  const scroll = await page.evaluate(() => {
    const t = document.getElementById('bugReportText');
    return {left: t.scrollLeft, top: t.scrollTop, start: t.selectionStart, end: t.selectionEnd, len: t.value.length};
  });
  check(scroll.left === 0 && scroll.top === 0 && scroll.start === 0 && scroll.end === scroll.len,
    'the report opens selected, scrolled to the top left', JSON.stringify(scroll));
  await page.screenshot({ path: `/tmp/bug-report-${label}.png` });
  await page.click('#doneBugReport');
} catch (e) {
  check(false, 'the run completed', e.message);
} finally {
  const real = consoleErrors.filter((e) => !/favicon|webglcontextlost|harness-marker/i.test(e));
  check(real.length === 0, 'no console errors', real.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
