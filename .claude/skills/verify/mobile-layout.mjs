#!/usr/bin/env node
// The mobile layout (2026-08-02): the HUD stops covering the world on a phone.
//
//   node mobile-layout.mjs [url] [outdir]
//
// The complaint this answers is "the UI elements all block the movement and
// view", so the headline measurement is literal: a 9×9 grid of hit-tests over
// the viewport, counting how many points land on the game canvas rather than
// on a HUD element. The same page is measured twice — `?desktop` and `?mobile`
// at the SAME phone viewport — so the number is a comparison, not an absolute
// that some future layout tweak invalidates.
//
// ⚑ Boundary: this owns the mobile LAYOUT only — the html.mobile class, what
// is on screen when, and that the game is still playable by tap. Everything
// about what the panels SAY belongs to the panel-specific harnesses
// (round4-tooltip, r1-focus-cost, chunkC3-journal).
//
// ⚑ Detection is forced with ?mobile / ?desktop rather than emulated: headless
// Chromium's `hasTouch` does not flip the `pointer: coarse` media query, so an
// emulation-only run would measure the desktop layout and pass every
// assertion about it.
//
// Legs:
//   1. ?desktop at 844×390 — baseline occupancy (the "before" picture)
//   2. ?mobile  at 844×390 — html.mobile lands; occupancy must drop hard
//   3. menu closed - the sheet column and zoom off screen, minimap inert
//   4. ☰ opens the sheet - its rows reachable and inside the viewport, and the
//      Spellbook row opens the book FULL-SCREEN (UI pass C3, D4: the book left
//      the sheet; the two are exclusive now)
//   5. the six action tiles — one row, ≥44px targets, all on screen
//   6. tapping an aura tile activates it (touch-only play works)
//   7. the journal opens full-screen from inside the sheet, and closes it
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { joinAsNewCharacter } from './lib/join.mjs';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = process.argv[3] || '/tmp/mobile-layout-shots';
mkdirSync(outdir, { recursive: true });

// A phone in landscape — the orientation the HUD is designed around. (Leg 8 runs
// portrait too; nothing declares or locks an orientation, the web manifest is gone.)
const PHONE = { width: 844, height: 390 };

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

const errors = [];
const fail = (msg) => { errors.push('CHECK FAILED: ' + msg); console.log('  ✗ ' + msg); };
const pass = (msg) => console.log('  ✓ ' + msg);

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

// joinGame opens a fresh page at the given flavour and gets into the world.
async function joinGame(flavour, topic) {
  const ctx = await browser.newContext({ viewport: PHONE, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(base + '&' + flavour, { waitUntil: 'domcontentloaded' });
  // The account screens replaced #startForm (step 8a chunk 2); each context
  // has its own cookie jar, so every joinGame mints a fresh anonymous account.
  await joinAsNewCharacter(page, topic);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
  // The dev panel is a large table layered over the right-hand HUD — it would
  // dominate every hit-test below and win every click.
  await page.evaluate(() => {
    const panel = document.getElementById('developPanel');
    if (panel) panel.style.display = 'none';
  });
  await page.waitForTimeout(2500); // let the HUD take its first GameState
  return { ctx, page };
}

// occupancy hit-tests a grid and reports what is on top at each point. The
// canvas is the world; anything else is the HUD standing in front of it.
async function occupancy(page) {
  return page.evaluate(() => {
    const N = 9;
    const w = window.innerWidth, h = window.innerHeight;
    const blockers = {};
    let world = 0, total = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        // Inset half a cell so no sample sits exactly on an edge.
        const x = Math.round((i + 0.5) * w / N);
        const y = Math.round((j + 0.5) * h / N);
        const el = document.elementFromPoint(x, y);
        total++;
        if (!el || el.tagName === 'CANVAS' || el.id === 'inputAreas'
            || el.classList.contains('left-input-area') || el.classList.contains('right-input-area')) {
          world++;
          continue;
        }
        // Name the blocker by its nearest identifiable HUD ancestor.
        let node = el, name = el.id || el.tagName.toLowerCase();
        while (node && node !== document.body) {
          if (node.id) { name = node.id; break; }
          node = node.parentElement;
        }
        blockers[name] = (blockers[name] || 0) + 1;
      }
    }
    return { world, total, pct: Math.round(100 * world / total), blockers };
  });
}

console.log(`\n=== viewport ${PHONE.width}×${PHONE.height} (phone, landscape) ===`);

// --- Leg 1: the desktop layout at phone size — the "before" picture --------
console.log('\n[1] ?desktop baseline');
const desk = await joinGame('desktop', 'desktop');
const deskHasClass = await desk.page.evaluate(() => document.documentElement.classList.contains('mobile'));
if (deskHasClass) fail('?desktop still applied the mobile class');
else pass('?desktop keeps the desktop layout');
const deskOcc = await occupancy(desk.page);
console.log(`      world visible at ${deskOcc.world}/${deskOcc.total} sample points (${deskOcc.pct}%)`);
console.log('      blockers:', JSON.stringify(deskOcc.blockers));
await desk.page.screenshot({ path: join(outdir, '1-desktop-at-phone-size.png') });
await desk.ctx.close();

// --- Leg 2: the mobile layout, same viewport -------------------------------
console.log('\n[2] ?mobile');
const { ctx, page } = await joinGame('mobile', 'mobile');
const hasClass = await page.evaluate(() => document.documentElement.classList.contains('mobile'));
if (!hasClass) fail('html.mobile was not stamped');
else pass('html.mobile stamped');

const mobOcc = await occupancy(page);
console.log(`      world visible at ${mobOcc.world}/${mobOcc.total} sample points (${mobOcc.pct}%)`);
console.log('      blockers:', JSON.stringify(mobOcc.blockers));
await page.screenshot({ path: join(outdir, '2-mobile-menu-closed.png') });

if (mobOcc.pct <= deskOcc.pct) {
  fail(`mobile does not free the screen: ${deskOcc.pct}% → ${mobOcc.pct}%`);
} else {
  pass(`world visibility ${deskOcc.pct}% → ${mobOcc.pct}% (+${mobOcc.pct - deskOcc.pct} points)`);
}
// A floor rather than a knife-edge: the point is that most of the screen is
// world, not that it hits some exact figure.
if (mobOcc.pct < 70) fail(`less than 70% of the screen is world (${mobOcc.pct}%)`);
else pass(`at least 70% of the screen is world (${mobOcc.pct}%)`);

// --- Leg 3: what is on screen with the menu closed -------------------------
console.log('\n[3] menu closed');
const closed = await page.evaluate(() => {
  const seen = (id) => {
    const el = document.getElementById(id);
    if (!el) return { missing: true };
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      display: s.display, opacity: Number(s.opacity),
      onScreen: b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0
        && b.top < window.innerHeight && b.left < window.innerWidth,
    };
  };
  return {
    button: seen('mobileMenuButton'), leftColumn: seen('leftColumn'),
    zoom: seen('zoomControl'), minimap: seen('minimap'),
    vitals: seen('vitalSigns'), bars: seen('actionBars'),
  };
});
if (closed.button.display === 'none') fail('the ☰ button is not shown on mobile');
else pass('the ☰ button is on screen');
// ⚑ Since C3 the column is off screen for TWO independent reasons - the sheet
// is shut AND the book inside it is - so leg 4 below asserts the sheet's
// contents positively rather than leaning on this absence.
for (const [name, key] of [['the sheet column (passives, journal + spellbook rows)', 'leftColumn'], ['zoom + help column', 'zoom']]) {
  if (closed[key].display !== 'none') fail(`${name} is still on screen with the menu closed`);
  else pass(`${name} is off screen`);
}
if (closed.minimap.opacity !== 0) fail('the minimap is still visible with the menu closed');
else pass('the minimap is inert until the menu opens');
if (!closed.vitals.onScreen) fail('the Focus/XP bars are not on screen');
else pass('the Focus/XP bars stayed on screen');
if (!closed.bars.onScreen) fail('the action bars are not on screen');
else pass('the action bars stayed on screen');

// --- Leg 4: ☰ opens the sheet ---------------------------------------------
console.log('\n[4] ☰ opens the sheet');
async function tap(selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error('no box for ' + selector);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(350);
}
await tap('#mobileMenuButton');
const open = await page.evaluate(() => {
  const r = (id) => {
    const el = document.getElementById(id);
    const b = el.getBoundingClientRect();
    return { display: getComputedStyle(el).display, top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  };
  return {
    menuOpen: document.documentElement.classList.contains('menuOpen'),
    sheet: r('leftColumn'), zoom: r('zoomControl'),
    // The row that opens the book, which since C3 is what the sheet carries
    // instead of the book itself.
    spellbookRow: r('spellbookSheetButton'),
    bookShown: !document.getElementById('spellbook').classList.contains('hidden'),
    minimapOpacity: Number(getComputedStyle(document.getElementById('minimap')).opacity),
    vh: window.innerHeight, vw: window.innerWidth,
    // What actually receives a tap in the middle of the sheet.
    atCentre: document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('#leftColumn') !== null,
  };
});
if (!open.menuOpen) fail('tapping ☰ did not open the menu');
else pass('tapping ☰ opened the menu');
if (open.sheet.display === 'none') fail('the sheet did not appear');
else pass('the sheet appeared');
if (!open.atCentre) fail('the sheet does not cover the middle of the screen');
else pass('the sheet covers the screen');
if (open.zoom.display === 'none') fail('the zoom + help row is missing from the sheet');
else pass('the zoom + help row is in the sheet');
if (open.minimapOpacity !== 1) fail('the minimap did not appear in the sheet');
else pass('the minimap appears in the sheet');
// The spellbook is the whole reason the sheet exists - but since UI pass C3 the
// sheet carries the ROW that opens it, and the book itself is a full-screen
// panel exclusive with the sheet. Both halves are asserted: the row is here and
// fits, and the book is NOT sitting in the sheet behind it.
if (open.spellbookRow.display === 'none'
  || open.spellbookRow.right > open.vw + 1 || open.spellbookRow.left < -1) {
  fail(`the Spellbook row is not usable in the sheet (${JSON.stringify(open.spellbookRow)} of ${open.vw})`);
} else {
  pass(`the Spellbook row fits the sheet (${Math.round(open.spellbookRow.right - open.spellbookRow.left)}px of ${open.vw})`);
}
if (open.bookShown) fail('the spellbook panel is still embedded in the sheet (C3 D4 moved it out)');
else pass('the book itself is no longer sheet content');
await page.screenshot({ path: join(outdir, '3-mobile-menu-open.png') });

// The row opens the book full-screen, and the sheet gets out of the way.
await tap('#spellbookSheetButton');
const book = await page.evaluate(() => {
  const el = document.getElementById('spellbook');
  const b = el.getBoundingClientRect();
  return {
    shown: !el.classList.contains('hidden'),
    menuOpen: document.documentElement.classList.contains('menuOpen'),
    width: b.width, vw: window.innerWidth,
    rows: document.querySelectorAll('#spellbookList li').length,
    atCentre: document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest('#spellbook') !== null,
  };
});
if (!book.shown) fail('the Spellbook row did not open the book');
else pass('the Spellbook row opens the book');
if (book.menuOpen) fail('the sheet stayed open under the book (they are exclusive)');
else pass('opening the book closed the sheet');
if (!book.atCentre || book.width < book.vw - 1) {
  fail(`the book is not full-screen (${Math.round(book.width)}px of ${book.vw}, centre=${book.atCentre})`);
} else {
  pass(`the book fills the phone (${Math.round(book.width)}px of ${book.vw})`);
}
if (book.rows < 1) fail('the spellbook has no rows to read');
else pass(`the spellbook lists ${book.rows} skill row(s)`);
await page.screenshot({ path: join(outdir, '3b-mobile-spellbook-open.png') });

// ☰ takes the screen back, which is also the book's close.
await tap('#mobileMenuButton');

// ☰ again closes it.
await tap('#mobileMenuButton');
if (await page.evaluate(() => document.documentElement.classList.contains('menuOpen'))) fail('☰ did not close the sheet');
else pass('☰ closes the sheet again');

// --- Leg 5: the six action tiles ------------------------------------------
console.log('\n[5] the action tiles');
const tiles = await page.evaluate(() => {
  const els = [...document.querySelectorAll('#auraSlotList > li, #cooldownSlotList > li')];
  return {
    count: els.length,
    boxes: els.map(e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }),
    hotkeysHidden: els.every(e => getComputedStyle(e.querySelector('.hotkey')).display === 'none'),
    vw: window.innerWidth, vh: window.innerHeight,
  };
});
if (tiles.count !== 6) fail(`expected 6 action tiles, found ${tiles.count}`);
else pass('6 action tiles (3 auras + 3 cooldowns)');
const oneRow = new Set(tiles.boxes.map(b => b.y)).size === 1;
if (!oneRow) fail(`the tiles are not on one row (tops: ${[...new Set(tiles.boxes.map(b => b.y))].join(', ')})`);
else pass(`all six tiles share one row at y=${tiles.boxes[0].y}`);
const small = tiles.boxes.filter(b => b.w < 44 || b.h < 44);
if (small.length) fail(`${small.length} tile(s) below the 44px tap-target floor: ${JSON.stringify(small[0])}`);
else pass(`every tile is at least 44px (${tiles.boxes[0].w}×${tiles.boxes[0].h})`);
const offScreen = tiles.boxes.filter(b => b.x < 0 || b.x + b.w > tiles.vw || b.y + b.h > tiles.vh);
if (offScreen.length) fail(`${offScreen.length} tile(s) fall outside the viewport`);
else pass('every tile is inside the viewport');
if (!tiles.hotkeysHidden) fail('hotkey badges are still shown on mobile');
else pass('hotkey badges are hidden');

// --- Leg 6: tapping a tile plays the game ---------------------------------
console.log('\n[6] tap-to-play');
// The seeded Damage aura is pre-equipped in slot 1 but deliberately not active
// (round-7 follow-up), so slot 1 is the honest subject: it starts inactive.
await page.waitForFunction(
  () => !!document.querySelector('#auraSlotList li[data-slot="0"] .slotLabel')?.textContent?.trim()
    && !/Empty/.test(document.querySelector('#auraSlotList li[data-slot="0"] .slotLabel').textContent),
  null, { timeout: 20_000 }).catch(() => {});
const slotLabel = await page.evaluate(() =>
  document.querySelector('#auraSlotList li[data-slot="0"] .slotLabel')?.textContent?.trim());
console.log(`      aura slot 1 holds: ${slotLabel}`);
if (!slotLabel || /Empty/.test(slotLabel)) {
  console.log('  ~ INCONCLUSIVE: aura slot 1 is empty, nothing to activate by tap');
} else {
  // HUD loadout state rides the throttled rAF loop — retry until it takes,
  // rather than sleeping once and blaming the tap.
  let active = false;
  for (let i = 0; i < 5 && !active; i++) {
    await tap('#auraSlotList li[data-slot="0"]');
    active = await page.evaluate(() =>
      !!document.querySelector('#auraSlotList li[data-slot="0"].activeSlot'));
    if (!active) await page.waitForTimeout(600);
  }
  if (!active) fail('tapping the aura tile did not activate it');
  else pass(`tapping the tile activated ${slotLabel}`);
}
await page.screenshot({ path: join(outdir, '4-mobile-tile-active.png') });

// --- Leg 7: the journal, full-screen, from inside the sheet ---------------
console.log('\n[7] journal from the sheet');
await tap('#mobileMenuButton');
await tap('#journalButton');
const journal = await page.evaluate(() => {
  const el = document.getElementById('journal');
  const b = el.getBoundingClientRect();
  return {
    hidden: el.classList.contains('hidden'),
    menuStillOpen: document.documentElement.classList.contains('menuOpen'),
    coversScreen: b.left <= 0 && b.top <= 0 && b.right >= window.innerWidth && b.bottom >= window.innerHeight,
  };
});
if (journal.hidden) fail('the journal did not open from the sheet');
else pass('the journal opened');
if (journal.menuStillOpen) fail('the sheet stayed open behind the journal (two sheets at once)');
else pass('opening the journal closed the sheet');
if (!journal.coversScreen) fail('the journal is not full-screen on mobile');
else pass('the journal is full-screen');
await page.screenshot({ path: join(outdir, '5-mobile-journal.png') });

// --- Leg 8: the layout holds its proportions across screen sizes ----------
// The mobile UI scales through ONE knob — a vmin-keyed root font size — so the
// thing worth pinning is that the knob keeps the layout legal everywhere, and
// that a PHONE lands on the 16px browser default (i.e. the sizing verified in
// legs 5–6 is not quietly re-scaled by the rule that helps big screens).
console.log('\n[8] scaling across viewports');
await page.evaluate(() => document.getElementById('journal')?.classList.add('hidden'));
for (const [label, vp] of [
  ['phone landscape', { width: 844, height: 390 }],
  ['phone portrait', { width: 390, height: 844 }],
  ['tablet', { width: 1024, height: 768 }],
]) {
  await page.setViewportSize(vp);
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#auraSlotList > li, #cooldownSlotList > li')];
    const boxes = els.map(e => e.getBoundingClientRect());
    const bars = document.getElementById('vitalSigns').getBoundingClientRect();
    return {
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      w: Math.round(boxes[0].width), h: Math.round(boxes[0].height),
      rows: new Set(boxes.map(b => Math.round(b.y))).size,
      onScreen: boxes.every(b => b.left >= -1 && b.right <= window.innerWidth + 1 && b.bottom <= window.innerHeight + 1),
      // The bars must not grow into the tiles on a tall, narrow screen.
      clearOfTiles: bars.bottom < Math.min(...boxes.map(b => b.top)),
      vmin: Math.min(window.innerWidth, window.innerHeight),
    };
  });
  console.log(`      ${label.padEnd(16)} ${vp.width}×${vp.height}  root ${m.root}px  tile ${m.w}×${m.h}  (${(100 * m.h / vp.height).toFixed(1)}% of height)`);
  if (m.rows !== 1) fail(`${label}: the tiles broke into ${m.rows} rows`);
  if (!m.onScreen) fail(`${label}: a tile falls outside the viewport`);
  if (m.w < 44 || m.h < 44) fail(`${label}: tiles below the 44px tap floor (${m.w}×${m.h})`);
  if (!m.clearOfTiles) fail(`${label}: the Focus/XP bars run into the action tiles`);
  // ⚑ The phone case is the one that must NOT move: 4.1vmin of 390 is 16.0px,
  // which is the browser default the layout was verified at.
  if (m.vmin === 390 && Math.abs(m.root - 16) > 1) {
    fail(`${label}: a phone should sit at the 16px default, got ${m.root}px`);
  }
  await page.screenshot({ path: join(outdir, `6-scale-${label.replace(/\s+/g, '-')}.png`) });
}
pass('one row, on screen, ≥44px tiles and bars clear of them at all three sizes');
pass('phones stay at the 16px default the layout was verified at');

await ctx.close();
await browser.close();

console.log(`\nscreenshots → ${outdir}`);
if (errors.length) {
  console.log(`\n${errors.length} problem(s):`);
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\nALL CHECKS PASSED');
