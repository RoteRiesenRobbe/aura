#!/usr/bin/env node
// Pack icons at the real HUD surface: after a join, the spellbook rows and the
// ability bar draw their skills from the icon-pack atlases (README "Icons
// (PONETI pack)"), not from the glyph or the letter fallback.
//
// What it shows: the lookup loaded (icons > 0), every visible token whose skill
// authors a packIcon carries `.packIcon` with a background sprite whose atlas
// URL answers 200, and no page error. Screenshot of the open book to
// /tmp/aura-dev/pack-icons.png.
//
// ⛔ What it CANNOT show: that a pick FITS its skill. That is the PO's look.
//
//   node .claude/skills/verify/pack-icons.mjs [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook, showSkillRow } from './lib/spellbook.mjs';

// Nine cooldowns, four of them two-word names, so the Cooldowns tab holds a full
// page of eight with multi-line rows plus a second page: the spellbook's fixed
// height (PO 2026-09-24: no scrolling, no dynamic height) is measured on that.
const GRANTS = ['NovaBurst', 'SummonTotem', 'SummonCompanion', 'FirstAid', 'Swift', 'Ignite', 'Taunt', 'Recover', 'Barrier'];
const url = process.argv[2] || 'http://localhost:2001/?token=plz&wsUrl=ws://localhost:2000/game&develop&start-cmds='
  + encodeURIComponent(GRANTS.map((g) => `SKILL ${g}`).join(','));

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'icons');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForTimeout(1500);
const bookOpen = await openSpellbook(page);
await page.waitForTimeout(500);
// The grants land over a few snapshots; wait for the two-word cooldown row.
await page.waitForFunction(() => [...document.querySelectorAll('#spellbookList li .skillName')].some((n) => /Summon Companion/i.test(n.textContent || '')), null, { timeout: 30_000 }).catch(() => {});
const onCooldowns = await showSkillRow(page, /Nova Burst/i);
await page.waitForTimeout(300);

const report = await page.evaluate(() => {
  const tokens = [...document.querySelectorAll('.ink-token')];
  const kinds = { pack: 0, glyph: 0, letter: 0 };
  const sprites = [];
  for (const t of tokens) {
    if (t.classList.contains('packIcon')) {
      kinds.pack++;
      const img = t.querySelector('.packImage');
      sprites.push(img ? getComputedStyle(img).backgroundImage : '(no packImage child)');
    } else if (t.classList.contains('letterFallback')) kinds.letter++;
    else kinds.glyph++;
  }
  const rows = [...document.querySelectorAll('#spellbook li[data-skill-id]')].map((li) => ({
    id: li.dataset.skillId,
    name: li.querySelector('.skillName')?.textContent?.trim(),
    kind: li.querySelector('.ink-token.packIcon') ? 'pack' : li.querySelector('.ink-token.letterFallback') ? 'letter' : 'glyph',
  }));
  // The bar fill (PO 2026-09-24): a pack token in a slot spans the slot's inner
  // circle, not a 26 px square inside it. Measured off the boxes, not the CSS.
  const slot = document.querySelector('#abilityBar li[data-skill-id]:not([data-skill-id="0"])');
  const slotToken = slot?.querySelector('.ink-token.packIcon');
  const fill = slot && slotToken ? (() => {
    const s = slot.getBoundingClientRect(); const k = slotToken.getBoundingClientRect();
    const inner = s.width - 2 * parseFloat(getComputedStyle(slot).borderLeftWidth);
    return { slotInner: Math.round(inner), token: Math.round(k.width), ratio: +(k.width / inner).toFixed(2), radius: getComputedStyle(slotToken).borderRadius };
  })() : null;
  // The book: a fixed-height page that never scrolls, even with two-line names.
  const scroll = document.getElementById('spellbookScroll');
  const content = scroll?.querySelector('.simplebar-content-wrapper') || scroll;
  const visible = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')].filter((li) => li.offsetParent !== null);
  const book = scroll ? {
    panelWidth: Math.round(document.getElementById('spellbook').getBoundingClientRect().width),
    scrollClient: content.clientHeight, scrollContent: content.scrollHeight,
    overflows: content.scrollHeight > content.clientHeight + 1,
    visibleRows: visible.length,
    rowHeights: [...new Set(visible.map((li) => Math.round(li.getBoundingClientRect().height)))],
    rowTokenPx: Math.round(visible[0]?.querySelector('.ink-token')?.getBoundingClientRect().width || 0),
    // Force the multi-line case rather than hope for it: a name wide enough to
    // wrap twice over, then re-measure. The row must not grow and the page must
    // not scroll; the CSS clips a third line instead (HUD.less, the book block).
    forced: (() => {
      const li = visible[0]; const n = li?.querySelector('.skillName'); if (!li || !n) return null;
      const before = n.textContent; n.textContent = 'Summon Companion Of The Northern Wastes And Beyond';
      const lines = Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight));
      const out = { lines, rowHeight: Math.round(li.getBoundingClientRect().height), overflows: content.scrollHeight > content.clientHeight + 1 };
      n.textContent = before; return out;
    })(),
  } : null;
  return { tokens: tokens.length, kinds, sprites: [...new Set(sprites)], rows, fill, book };
});

// Every atlas the sprites point at must be served.
const atlasUrls = report.sprites.map((s) => (s.match(/url\("?([^")]+)"?\)/) || [])[1]).filter(Boolean);
const atlasStatus = {};
for (const a of new Set(atlasUrls)) {
  atlasStatus[a] = await page.evaluate(async (u) => (await fetch(u, { cache: 'no-store' })).status, a);
}
// Guarded like PackIconFiles.load: a missing lookup on the dev server comes
// back as the HTML page (SPA fallback), which is exactly the no-atlas case.
const lookupCount = await page.evaluate(async () => { try { return Object.keys((await (await fetch('icons/icons.json', { cache: 'no-store' })).json()).icons).length; } catch { return 0; } });

await page.screenshot({ path: '/tmp/aura-dev/pack-icons.png' });
await browser.close();

const fail = [];
if (!bookOpen) fail.push('spellbook did not open');
if (lookupCount === 0) fail.push('icons/icons.json holds no icons');
if (report.kinds.pack === 0) fail.push('no token draws from the pack');
if (report.rows.some((r) => r.kind !== 'pack')) fail.push(`rows not on the pack: ${report.rows.filter((r) => r.kind !== 'pack').map((r) => `${r.name}(${r.kind})`).join(', ')}`);
for (const [a, s] of Object.entries(atlasStatus)) if (s !== 200) fail.push(`${a} -> HTTP ${s}`);
if (!onCooldowns) fail.push('could not surface the Nova Burst row (grants not landed?)');
if (!report.book) fail.push('no #spellbookScroll');
else {
  if (report.book.overflows) fail.push(`spellbook page scrolls: content ${report.book.scrollContent} px in ${report.book.scrollClient} px`);
  if (report.book.rowHeights.length !== 1) fail.push(`row heights vary: ${report.book.rowHeights.join(', ')} px (a two-line name must not grow its row)`);
  const f = report.book.forced;
  if (!f) fail.push('no row to force a multi-line name on');
  else if (f.lines < 2) fail.push(`forced name did not wrap (${f.lines} line)`);
  else if (f.rowHeight !== report.book.rowHeights[0] || f.overflows) fail.push(`a ${f.lines}-line name changed the row to ${f.rowHeight} px / overflow=${f.overflows}`);
}
if (!report.fill) fail.push('no pack token in an ability-bar slot to measure');
else if (report.fill.ratio < 0.9) fail.push(`bar token fills only ${report.fill.ratio} of the slot's inner circle (${report.fill.token} of ${report.fill.slotInner} px)`);
if (errors.length) fail.push(`${errors.length} page error(s): ${errors.slice(0, 3).join(' | ')}`);

console.log(JSON.stringify({ lookupCount, tokens: report.tokens, kinds: report.kinds, atlasStatus, rows: report.rows.length, fill: report.fill, book: report.book }, null, 2));
console.log(fail.length ? '✖ FAIL: ' + fail.join('; ') : `✓ PASS: ${report.kinds.pack} pack token(s), ${report.rows.length} spellbook row(s) all on the pack, atlases served`);
process.exit(fail.length ? 1 : 0);
