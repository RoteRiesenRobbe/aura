// The WIZARD cheat and SKILL all (2026-10-17) at the real game surface.
//
// Owns: SKILL all puts every authored skill (api/skills, mob skills included)
// in the spellbook without page errors · WIZARD on: a fired cooldown shows no
// countdown and fires again at once · WIZARD off: the same press starts its
// countdown · WIZARD on again resets that running countdown. Does NOT own the
// command parsing (Go, cmd_test.go).
//
//   node .claude/skills/verify/wizard.mjs [label] [url]

import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';
import { showSkillRowAt } from './lib/spellbook.mjs';

const url = process.argv[3]
  || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};
const here = dirname(fileURLToPath(import.meta.url));
const shotDir = process.env.WIZARD_SHOT_DIR || here;

// Every authored skill, derived from the content tree (never hardcoded).
const countJson = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((n, e) =>
  n + (e.isDirectory() ? countJson(join(dir, e.name)) : e.name.endsWith('.json') ? 1 : 0), 0);
const AUTHORED = countJson(join(here, '../../../api/skills'));

const results = [];
const consoleErrors = [];
const check = (ok, name, note = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
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
  await sleep(600);
};

const rowCount = () => page.evaluate(() => document.querySelectorAll('#spellbookList li').length);
const slotText = () => page.evaluate(() =>
  document.querySelector('#cooldownSlotList li:first-child')?.textContent?.trim() || '');
const countingDown = async () => /\d+(\.\d+)?s/.test(await slotText());

// ⚑ The hold is ~1.4 s: slot hotkeys are edge-triggered off an rAF-driven
// clock a headless page throttles (swift-cooldown.mjs).
const fireQ = async () => {
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('q');
  await sleep(1400);
  await page.keyboard.up('q');
};

/** Whether the slot showed a countdown at any sample over ms. */
const sawCountdown = async (ms) => {
  for (let t = 0; t < ms; t += 250) {
    if (await countingDown()) return true;
    await sleep(250);
  }
  return false;
};

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  console.log(`\njoined as ${await joinAsNewCharacter(page, 'wizard')}\n`);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => {
    const p = document.getElementById('developPanel');
    if (p) p.style.display = 'none';
  });
  await cmd('GOD on');

  // --- leg 1: SKILL all ------------------------------------------------------
  const before = await rowCount();
  await cmd('SKILL all');
  let after = before;
  for (let i = 0; i < 20 && after < AUTHORED; i++) {
    await sleep(500);
    after = await rowCount();
  }
  check(after >= AUTHORED, 'SKILL all fills the spellbook with every authored skill',
    `${before} -> ${after} rows, ${AUTHORED} authored`);

  // --- equip Swift in cooldown slot 1 -----------------------------------------
  const i = await page.evaluate(() =>
    [...document.querySelectorAll('#spellbookList li')].findIndex((li) => /^\s*Swift\b/i.test(li.textContent)));
  if (i >= 0) {
    await showSkillRowAt(page, i);
    await page.screenshot({ path: join(shotDir, 'wizard-spellbook.png') });
    const rows = await page.$$('#spellbookList li');
    const box = await rows[i].boundingBox();
    await page.mouse.click(box.x + 25, box.y + box.height / 2);
    await sleep(700);
    const slot = await page.$('#cooldownSlotList li:first-child');
    const sb = await slot.boundingBox();
    await page.mouse.click(sb.x + sb.width / 2, sb.y + sb.height / 2);
    await sleep(700);
    await page.keyboard.press('KeyB');
    await sleep(500);
  }
  const equipped = /Swift/i.test(await slotText());
  check(equipped, 'Swift binds into cooldown slot 1', JSON.stringify((await slotText()).slice(0, 40)));

  if (equipped) {
    // --- leg 2: WIZARD on, no countdown ---------------------------------------
    await cmd('WIZARD on');
    await fireQ();
    // The Swift circle on the buff tray proves the press really fired.
    const fired = await page.evaluate(() =>
      !!document.querySelector('#buffTray .buffCircle[data-skill-name="Swift"]'));
    check(fired && !(await sawCountdown(3000)), 'WIZARD on: a fired cooldown shows no countdown',
      `Swift on the tray: ${fired}, slot ${JSON.stringify(await slotText())}`);

    // --- leg 3: WIZARD off, the countdown is back ---------------------------
    await cmd('WIZARD off');
    await fireQ();
    check(await sawCountdown(3000), 'WIZARD off: the same press starts its countdown',
      JSON.stringify(await slotText()));

    // --- leg 4: WIZARD on resets the running countdown ----------------------
    await cmd('WIZARD');
    await sleep(1500);
    check(!(await countingDown()), 'bare WIZARD turns it on and resets the running countdown',
      JSON.stringify(await slotText()));
  }

  check(consoleErrors.length === 0, 'no page errors', consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  console.log('FAIL  harness threw: ' + (e?.stack || e));
  results.push(false);
} finally {
  await browser.close();
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
