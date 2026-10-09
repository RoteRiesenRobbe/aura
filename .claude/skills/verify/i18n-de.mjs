#!/usr/bin/env node
// plan-localization.md §6: the German legs at the game surface. Boots with the
// de pin (localStorage aura.locale=de), joins a fresh character and checks:
//   1. the settings panel speaks German (UI catalog, C0b);
//   2. a cheat-taught skill's unlock banner is German, with the skill named
//      from the localized catalog and the keyed source label (C2, D8);
//   3. accepting a quest shows its German title in the tracker and a
//      German objective line in the tracker (C1 catalogs + C2 objectives);
//   4. a kill quest's tracker line uses the German plural template (Q2);
//   5. the /lang bundle serves German dialogue (C3).
// Usage: node i18n-de.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
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
const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1600, height: 900 } });
await ctx.addInitScript(() => window.localStorage.setItem('aura.locale', 'de'));
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await joinAsNewCharacter(page, 'i18n', { timeout: 30_000 });
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });

async function run(command) {
  await page.waitForSelector('#console_command', { state: 'attached' });
  await page.evaluate((cmd) => {
    document.querySelector('#console_command').value = cmd;
    document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, command);
  await page.waitForTimeout(600);
}
const banner = () => page.evaluate(() => document.getElementById('alertBanner')?.textContent ?? '');
const tracker = () => page.evaluate(() => [...document.querySelectorAll('#questTrackerList li')].map(li => li.textContent.trim()));

// 1
const settings = await page.evaluate(() => ({
  heading: document.querySelector('#gameSettingsPanel h2')?.textContent,
  label: document.querySelector('label[for=languageSelect]')?.textContent,
  lang: document.documentElement.lang,
}));
check('settings speak German', settings.heading === 'Einstellungen' && settings.label === 'Spielsprache' && settings.lang === 'de', JSON.stringify(settings));

// 2
await run('SKILL Lantern');
const unlock = await banner();
check('unlock banner is German, skill named from the catalog', /Neue/.test(unlock) && /Laterne/.test(unlock) && /Cheat/.test(unlock), JSON.stringify(unlock));

// 3
await run('QUEST ACCEPT village-welcome');
await page.waitForTimeout(800);
const welcomeLines = await tracker();
// The cheat accept fires no journal banner; the tracker carries the title.
check('the tracker names the quest in German', welcomeLines.some(l => /Willkommen im Dorf/.test(l)), JSON.stringify(welcomeLines));
check('objective lines are German', welcomeLines.some(l => /Sprich mit Reinhard/.test(l)), JSON.stringify(welcomeLines));

// 4
await run('QUEST ACCEPT wolves-on-the-road');
await page.waitForTimeout(800);
const wolfLines = await tracker();
check('a kill tracker reads German', wolfLines.some(l => /Wölfe getötet/.test(l)), JSON.stringify(wolfLines));

// 5
const bundle = await page.evaluate(async () => {
  const u = new URL(location.href);
  const r = await fetch(`${u.protocol}//${u.hostname}:2000/lang?lang=de`);
  const j = await r.json();
  return Object.keys(j).filter(k => k.startsWith('conv.')).length + ' ' + (Object.values(j).find(v => /Hast du eine Aufgabe/.test(v)) || '');
});
check('/lang serves German dialogue', /Hast du eine Aufgabe/.test(bundle), bundle.slice(0, 80));

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
