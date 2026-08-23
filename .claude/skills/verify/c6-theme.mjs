#!/usr/bin/env node
// C6 (plan-code-health.md): before/after capture for the behaviour-neutral
// theme-token refactor. NOT a pass/fail harness: it prints one JSON block of
// computed-style facts and drops screenshots, for a diff to compare across the
// refactor. Run once at the pre-change tree ("before") and once after
// ("after"); the JSON must byte-match (screenshots of the live world are for
// the eye: the canvas differs run to run; the DOM chrome should not).
//
// Surfaces: (a) the account/creation screen cold-load DOM, (b) the in-world
// HUD chrome (panels sampled in their default closed state, deterministically),
// with eyeball screenshots of the journal/help/map opened, (c) a forced-?mobile
// client, which also records the #mapButton-vs-#registrationNag stacking
// OBSERVATION (rect overlap + elementFromPoint) that C6's comment rewrite in
// HUD.mobile.less must quote: the old comment claimed a z-index that never
// existed, the replacement states what is actually observed here.
//
// Styles are sampled per selector over a fixed property list; a missing
// selector records null (deterministic as long as the DOM doesn't change).
//
// Usage: node .claude/skills/verify/c6-theme.mjs <label> [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const label = process.argv[2] || 'run';
const base = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outDir = process.env.C6_OUT_DIR || '/tmp/claude-1000/-root-workspaces-aurahunter/513f8234-3ef8-46fa-b587-7bb71a33976d/scratchpad';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const PROPS = [
  'color', 'background-color', 'background-image', 'border-top-width', 'border-top-style',
  'border-top-color', 'border-bottom-color', 'border-radius', 'padding', 'font-size',
  'font-weight', 'letter-spacing', 'text-transform', 'z-index', 'box-shadow', 'text-shadow',
  'min-width', 'gap', 'opacity',
];

// Sampled in the default (mostly closed/hidden) state: getComputedStyle
// resolves colors/paddings on display:none elements fine, and the closed state
// is the deterministic one.
const HUD_SELECTORS = [
  'body',
  '#healthBar', '#healthBar > .indicator', '#healthBar .shieldIndicator',
  '#xpBar', '#xpBar > .indicator',
  '#castBar', '#castBar > .indicator',
  '#spellbook', '#spellbook .spellbookTitle', '#skillPointsBadge', '#respecButton',
  '#auraLoadout', '#auraLoadout .auraLoadoutTitle', '#passiveLoadout', '#cooldownLoadout', '#utilityBar',
  '#journal', '#journal .journalHeader', '#journal .journalTitle', '#journal .journalClose',
  '#help', '#help .helpHeader', '#help .helpTitle', '#help .helpClose',
  '#worldMap', '#worldMap .worldMapHeader', '#worldMap .worldMapTitle', '#worldMap .worldMapClose',
  '#conversation', '#conversation .conversationHeader', '#conversation .conversationActor', '#conversation .conversationLeave',
  '#journalButton', '#mapButton', '#helpButton',
  '#questTracker', '#questTrackerJournal',
  '#gameSettings', '#alertBanner', '#combatIndicator', '#minimap',
];

const COLD_SELECTORS = [
  'body',
  '#accountScreens', '#characterCreation', '#characterCreation .accountForm',
  '#characterCreation .characterNameInput', '#characterCreation .characterCreateSubmit',
  '#creationLoginButton', '.accountPanelFooter', '.accountPanelOptions',
];

const MOBILE_SELECTORS = [
  '#registrationNag', '#registrationNag .button', '#registrationNag .nagDismiss',
  '#mobileMenuButton', '#mapButton', '#journalButton', '#minimap',
];

const sample = (page, selectors) => page.evaluate(({ selectors, props }) => {
  const out = {};
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) { out[sel] = null; continue; }
    const cs = getComputedStyle(el);
    const rec = {};
    for (const p of props) rec[p] = cs.getPropertyValue(p);
    out[sel] = rec;
  }
  return out;
}, { selectors, props: PROPS });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];
const out = { label };

const shot = (page, name) => page.screenshot({ path: join(outDir, `c6-theme-${label}-${name}.png`) });

// --- desktop context ---
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('#characterCreation', { state: 'attached', timeout: 60_000 });
await page.waitForTimeout(1500);
out.coldLoad = await sample(page, COLD_SELECTORS);
await shot(page, 'a-cold');

await joinAsNewCharacter(page, 'csix');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await page.waitForTimeout(2000);

out.hud = await sample(page, HUD_SELECTORS);
await shot(page, 'b-hud');

// Eyeball shots of the opened panels (canvas behind them differs per run).
const openVia = async (sel) => {
  const el = await page.$(sel);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  return true;
};
if (await openVia('#questTrackerJournal')) { await shot(page, 'c-journal'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
if (await openVia('#helpButton')) { await shot(page, 'd-help'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
if (await openVia('#mapButton')) { await shot(page, 'e-map'); await page.keyboard.press('Escape'); await page.waitForTimeout(500); }

// --- mobile context (forced ?mobile; emulation alone doesn't flip pointer:coarse) ---
const mpage = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
mpage.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('[mobile] ' + m.text()); });
mpage.on('pageerror', (e) => consoleErrors.push('[mobile] pageerror: ' + e.message));
await mpage.goto(base + '&mobile', { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mpage, 'csixm');
await mpage.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await mpage.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
await mpage.waitForTimeout(3000);

out.mobile = await sample(mpage, MOBILE_SELECTORS);

// The #mapButton-vs-#registrationNag stacking OBSERVATION (for C6's comment
// rewrite): do their rects overlap, and if so, who does elementFromPoint see?
out.mobileStacking = await mpage.evaluate(() => {
  const btn = document.getElementById('mapButton');
  const nag = document.getElementById('registrationNag');
  if (!btn || !nag) return { present: { btn: !!btn, nag: !!nag } };
  const b = btn.getBoundingClientRect();
  const n = nag.getBoundingClientRect();
  const overlap = !(b.right < n.left || n.right < b.left || b.bottom < n.top || n.bottom < b.top);
  const rec = {
    nagHidden: nag.classList.contains('hidden'),
    btnRect: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
    nagRect: { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.width), h: Math.round(n.height) },
    btnZ: getComputedStyle(btn).zIndex,
    nagZ: getComputedStyle(nag).zIndex,
    overlap,
  };
  if (overlap && b.width && n.width) {
    const cx = Math.max(b.left, n.left) + (Math.min(b.right, n.right) - Math.max(b.left, n.left)) / 2;
    const cy = Math.max(b.top, n.top) + (Math.min(b.bottom, n.bottom) - Math.max(b.top, n.top)) / 2;
    const top = document.elementFromPoint(cx, cy);
    rec.elementOnTop = top ? (top.id || top.className || top.tagName) : null;
    rec.nagCoversButton = !!top && (top === nag || nag.contains(top));
  }
  return rec;
});
await shot(mpage, 'f-mobile');

console.log(JSON.stringify(out, null, 2));
console.log(`console errors   : ${consoleErrors.length}`);
for (const e of consoleErrors.slice(0, 6)) console.log('   · ' + e);
await browser.close();
