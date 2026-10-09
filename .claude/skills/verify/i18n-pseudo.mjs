// plan-localization.md D12 + D21: the locale legs.
//   1. under the explicit en pin (Playwright locale en-US, no localStorage),
//      the client resolves `en` and declares <html lang="en" translate="no">;
//   2. under the de pin (localStorage aura.locale=de), it resolves `de` and the
//      settings panel's language label reads German;
//   3. under the pseudo pin (aura.locale=en-XA), every visible DOM text on the
//      account screens and the settings panel carries the pseudo marks: a
//      plain-ASCII word (3+ letters) is a string the plan missed. Player names,
//      digits and the server name are excepted.
// Stays on the account screens (never joins), so it leaves no character.
// Usage: node i18n-pseudo.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const url = process.argv[2]
  || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game';
const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};
const results = [];
const pass = (n, d = '') => { results.push('PASS'); console.log(`  ✅ ${n}${d ? ' — ' + d : ''}`); };
const fail = (n, d = '') => { results.push('FAIL'); console.log(`  ❌ ${n}${d ? ' — ' + d : ''}`); };

// Words that are not translatable text: brand, server and browser names.
const EXEMPT = new Set(['Aura', 'Chrome', 'Firefox', 'Discord', 'Kringel', 'Games', 'Berryhunter']);

const browser = await chromium.launch({ env, args: ['--no-sandbox'] });

async function open(locale, stored) {
  const ctx = await browser.newContext({ locale, viewport: { width: 1280, height: 800 } });
  if (stored) {
    await ctx.addInitScript((v) => window.localStorage.setItem('aura.locale', v), stored);
  }
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForSelector('#characterCreation:not(.hidden), #characterSelect:not(.hidden), #loginPanel:not(.hidden)',
    { timeout: 60000 });
  return { ctx, page };
}

const htmlState = (page) => page.evaluate(() => ({
  lang: document.documentElement.lang,
  translate: document.documentElement.getAttribute('translate'),
  label: document.querySelector('label[for=languageSelect]')?.textContent,
}));

// Leg 1: en
{
  const { ctx, page } = await open('en-US');
  const s = await htmlState(page);
  (s.lang === 'en' && s.translate === 'no') ? pass('en pin resolves en', JSON.stringify(s)) : fail('en pin', JSON.stringify(s));
  await ctx.close();
}

// Leg 2: de, opted in
{
  const { ctx, page } = await open('de-DE', 'de');
  const s = await htmlState(page);
  (s.lang === 'de' && s.label === 'Spielsprache') ? pass('de pin resolves de', JSON.stringify(s)) : fail('de pin', JSON.stringify(s));
  await ctx.close();
}

// Leg 2b: German browser WITHOUT a stored choice stays en until C4's exit (Q3)
{
  const { ctx, page } = await open('de-DE');
  const s = await htmlState(page);
  s.lang === 'en' ? pass('no detection before C4 exit (Q3)') : fail('detection is on', JSON.stringify(s));
  await ctx.close();
}

// Leg 3: pseudo scan
{
  const { ctx, page } = await open('en-US', 'en-XA');
  const words = await page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || el.closest('script,style,#developPanel,#console,.hidden,[data-literal]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!el.getClientRects().length) continue;
      const found = node.textContent.match(/\b[A-Za-z]{3,}\b/g);
      if (found) out.push(...found.map((w) => `${w} (${el.id || el.className || el.tagName})`));
    }
    return out;
  });
  const missed = words.filter((w) => !EXEMPT.has(w.split(' ')[0]));
  missed.length === 0 ? pass('pseudo scan: no unmarked words')
    : fail('pseudo scan: unmarked words', missed.slice(0, 40).join(', '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => r === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
