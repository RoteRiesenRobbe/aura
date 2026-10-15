// plan-localization.md C8: the UI catalog chunk at the game surface.
//   1. de pin, the lang-de chunk held back 3 s: nothing of the game renders
//      while it is in flight (no English flash), then the start screen and
//      the settings arrive in German with no raw key on screen;
//   2. de pin, the chunk BLOCKED: the game still comes up, in English, with
//      <html lang="en"> and exactly one "UI catalog" warning, no page error;
//   3. en (en-US, no pin): the German chunk is never requested.
// Stays on the start/account screens (never joins), so it leaves no character.
// Usage: node i18n-catalog-chunk.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const url = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game';
const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const CHUNK = /\/lang-de\.[0-9a-f]+\.js$/;
// A UI key on screen: two or more dotted lowercase parts (`settings.language.heading`).
const RAW_KEY = /\b[a-z][a-z0-9-]*(\.[a-z0-9-]+){2,}\b/;

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

async function open(locale, stored, route) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 800 } });
  if (stored) await ctx.addInitScript((v) => window.localStorage.setItem('aura.locale', v), stored);
  const page = await ctx.newPage();
  const errors = [];
  const warnings = [];
  const chunkRequests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('request', (r) => { if (CHUNK.test(r.url())) chunkRequests.push(r.url()); });
  if (route) await page.route(CHUNK, route);
  return { ctx, page, errors, warnings, chunkRequests };
}

const panelState = (page) => page.evaluate(() => ({
  lang: document.documentElement.lang,
  heading: document.querySelector('#gameSettingsPanel h2')?.textContent ?? null,
  startScreen: !!document.getElementById('startScreen'),
  text: document.getElementById('startScreen')?.innerText ?? '',
}));

// 1 - held back
{
  let release;
  const held = new Promise((r) => { release = r; });
  const s = await open('de-DE', 'de', async (route) => { await held; await route.continue(); });
  await s.page.goto(url, { waitUntil: 'domcontentloaded' });
  await s.page.waitForTimeout(3000);
  const during = await panelState(s.page);
  check('nothing renders while the chunk is in flight', !during.startScreen && during.heading === null, JSON.stringify({ startScreen: during.startScreen, heading: during.heading }));
  release();
  await s.page.waitForSelector('#startScreen', { state: 'attached', timeout: 30_000 });
  await s.page.waitForTimeout(1500);
  const after = await panelState(s.page);
  check('then German: settings + lang', after.heading === 'Einstellungen' && after.lang === 'de', JSON.stringify({ heading: after.heading, lang: after.lang }));
  const key = after.text.match(RAW_KEY);
  check('no raw key on the start screen', !key, key ? key[0] : '');
  check('no page errors (held)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();
}

// 2 - blocked
{
  const s = await open('de-DE', 'de', (route) => route.abort());
  await s.page.goto(url, { waitUntil: 'domcontentloaded' });
  await s.page.waitForSelector('#startScreen', { state: 'attached', timeout: 30_000 });
  await s.page.waitForTimeout(1500);
  const state = await panelState(s.page);
  check('a blocked chunk degrades to English', state.heading === 'Settings' && state.lang === 'en', JSON.stringify({ heading: state.heading, lang: state.lang }));
  const catalogWarnings = s.warnings.filter((w) => w.includes('UI catalog'));
  check('exactly one catalog warning', catalogWarnings.length === 1, catalogWarnings.join(' | '));
  check('no page errors (blocked)', s.errors.length === 0, s.errors.join(' | '));
  await s.ctx.close();
}

// 3 - English never asks
{
  const s = await open('en-US', null, null);
  await s.page.goto(url, { waitUntil: 'domcontentloaded' });
  await s.page.waitForSelector('#startScreen', { state: 'attached', timeout: 30_000 });
  await s.page.waitForTimeout(1500);
  const state = await panelState(s.page);
  check('English never requests the German chunk', s.chunkRequests.length === 0 && state.heading === 'Settings', JSON.stringify({ requests: s.chunkRequests.length, heading: state.heading }));
  await s.ctx.close();
}

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
