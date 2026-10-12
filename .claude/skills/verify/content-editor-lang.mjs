// content-editor-lang.mjs — the content editor reads its text from the ARB
// (plan-localization.md C5a/C5b, D25, D27, D28). READ-ONLY: it opens files and
// asserts what the forms show; it saves nothing.
//
//   1. an NPC's dialogue renders one row per line, each with its slug or its
//      shared phrase, and the shared-phrase picker;
//   2. a quest's title, journal and tracker come hydrated from api/lang/en
//      (the tracker in the {n}/{m} form an author types);
//   3. a counted mob shows its English name as Name + Plural (D24);
//   4. a skill's name field shows its authored English name;
//   5. no console error on the way.
//
// The save path (slugs minted, keys moved in every locale, "German owed") is
// pinned by node --test tools/content-editor/content-lang.test.mjs and the
// server round trip; this owns only that the browser renders it.
//
// Needs `node tools/content-editor/server.mjs` (PORT=4611 to run beside a
// running editor). Usage: node content-editor-lang.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:4610';
const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`  ${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector('#npc-list li', { timeout: 30_000 });

const open = async (tab, label) => {
  await page.click(`#sidebar-tabs [data-tab="${tab}"]`);
  const item = page.locator('#sidebar li .item-name', { hasText: label instanceof RegExp ? label : new RegExp('^' + label + '$') }).first();
  await item.click();
  await page.waitForTimeout(400);
};

// 1. dialogue
await open('npc', 'Reinhard');
const dialogue = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.lines-editor .line-row')];
  return {
    rows: rows.length,
    first: rows[0] ? { text: rows[0].querySelector('input[type=text]')?.value, slug: rows[0].querySelector('.slug')?.textContent } : null,
    shared: [...document.querySelectorAll('.option-card select')].some((s) => [...s.options].some((o) => o.textContent === 'shared: ask_task') && s.value === 'ask_task'),
  };
});
check('an NPC line renders as a row with its text and its slug',
  dialogue.rows > 0 && dialogue.first?.text === 'I work this field.' && dialogue.first?.slug === 'id: i_work_this_field', JSON.stringify(dialogue.first));
check('a row naming a shared phrase shows the phrase in its picker', dialogue.shared);

// 2. quest
await open('quest', 'Boars in the Field');
const quest = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('.field')].map((f) => ({ label: f.querySelector('label')?.textContent, value: f.querySelector('input, textarea')?.value }));
  return inputs;
});
const field = (label) => quest.find((f) => f.label === label)?.value;
check('a quest title comes from the English ARB', field('Title') === 'Boars in the Field', field('Title'));
check('a tracker shows the {n}/{m} form an author types', field('Tracker (supports {n}/{m})') === '{n}/{m} boars killed', field('Tracker (supports {n}/{m})'));

// 3. mob name forms
await open('mob', 'Wolf');
const names = await page.evaluate(() => {
  const get = (label) => [...document.querySelectorAll('.field')].find((f) => f.querySelector('label')?.textContent === label)?.querySelector('input')?.value;
  return { one: get('Name (English)'), other: get('Plural (needed when a quest counts it)') };
});
check('a counted mob shows its singular and plural (D24)', names.one === 'Wolf' && names.other === 'Wolves', JSON.stringify(names));

// 4. skill name
await open('skill', /^Long/);
const skillName = await page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).find((v) => v === 'Long-Range Strike') || '');
check('a skill name field shows its authored English name', skillName === 'Long-Range Strike', skillName);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
