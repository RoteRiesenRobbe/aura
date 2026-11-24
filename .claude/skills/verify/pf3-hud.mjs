#!/usr/bin/env node
// PF3, the desktop HUD batch (docs/plan-vertical-slice.md §5.3 PF3: F4, F9,
// F11, F12, F15). Two halves:
//
//   node pf3-hud.mjs baseline [url]   # phone snapshot -> pf3-phone-baseline.json (run at HEAD, before PF3)
//   node pf3-hud.mjs phone [url]      # phone snapshot, diffed against that baseline
//   node pf3-hud.mjs german [url]     # German: the book's header is the same on every tab, the banner's two rows
//   node pf3-hud.mjs desktop [url]    # the new desktop layout at 1280×800 and 1920×1080
//     PF3_SIZES=1920x1080             # one size per run: a second join in one run has hung at
//                                     # world entry (2026-11-24, cause open), so run each alone
//     PF3_NO_ATLAS=1                  # as a clone without the atlases: the tiles draw letters
//
// ⚑ THE PHONE MUST NOT MOVE (the PO's PF3 rule). "Not by eye": the baseline
// records, for every element with an id under #gameUI (plus the map button's
// spans), whether it is rendered at all and its box, display, visibility,
// opacity, background and padding, in four phone states (plain HUD, ☰ sheet
// open, the book on a skill tab, the book on the Campfire tab). The phone run
// must match it. Three exceptions: inside the open #spellbook the F4 strip
// moves the points + Reset on the phone too (PO 2026-11-24, "phone takes the
// strip too"), so that subtree is reported but not failed; an element that is
// not rendered in either run (display:none on it or an ancestor) cannot have
// moved, so its fields are not compared; and fields that differ between two
// baseline runs at HEAD are recorded as noise and skipped.
//
// ⚑ Detection is forced with ?mobile, like mobile-layout.mjs: headless
// Chromium's hasTouch does not flip `pointer: coarse`.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook } from './lib/spellbook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');

const mode = process.argv[2] || 'desktop';
const base = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const outdir = '/tmp/pf3-hud-shots';
mkdirSync(outdir, { recursive: true });
const BASELINE = join(here, 'pf3-phone-baseline.json');
const PHONE = { width: 844, height: 390 };

const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = {
  ...process.env,
  LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':'),
};

let failures = 0;
const check = (ok, msg, detail = '') => {
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗'} ${msg}${detail ? '  ' + detail : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox'], env });

async function joinGame(viewport, flavour, tag, extra = '') {
  const ctx = await browser.newContext({ locale: 'en-US', viewport, hasTouch: flavour === 'mobile' });
  // PF3_NO_ATLAS=1: a clone without the gitignored atlases (the coworker's).
  if (process.env.PF3_NO_ATLAS) await ctx.route('**/icons/icons.json', (r) => r.abort());
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror: ' + e.message));
  await page.goto(base + '&' + flavour + extra, { waitUntil: 'domcontentloaded' });
  await joinAsNewCharacter(page, tag);
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const panel = document.getElementById('developPanel');
    if (panel) panel.style.display = 'none';
  });
  await page.waitForTimeout(3000);
  return { ctx, page };
}

// --- the phone half -----------------------------------------------------------

async function snapshot(page) {
  return page.evaluate(() => {
    const out = {};
    const els = [...document.querySelectorAll('#gameUI [id], #mapButton > span')];
    for (const el of els) {
      const key = el.id ? '#' + el.id : '#' + el.parentElement.id + ' > .' + [...el.classList].join('.');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out[key] = {
        rendered: el.getClientRects().length > 0,
        box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v)).join(','),
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        background: cs.backgroundColor + ' ' + cs.backgroundImage,
        padding: cs.padding,
        insideBook: !!el.closest('#spellbook'),
      };
    }
    return out;
  });
}

async function phoneStates(tag) {
  const { ctx, page } = await joinGame(PHONE, 'mobile', tag);
  const states = {};
  const settle = () => page.waitForTimeout(600);
  states.plain = await snapshot(page);
  await page.locator('#mobileMenuButton').tap();
  await settle();
  states.sheet = await snapshot(page);
  await page.locator('#spellbookSheetButton').tap();
  await settle();
  states.bookSkills = await snapshot(page);
  const camp = page.locator('.spellbookTab[data-category="camp"]');
  if (await camp.isVisible()) {
    await camp.tap();
    await settle();
    states.bookCamp = await snapshot(page);
  } else {
    console.log('  (the Campfire tab is not shown; state skipped)');
  }
  await page.screenshot({ path: join(outdir, `phone-${tag}.png`) });
  await ctx.close();
  return states;
}

function diff(a, b, skipNoise = {}) {
  const found = [];
  for (const state of Object.keys(a)) {
    const sa = a[state], sb = b[state] || {};
    for (const key of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      if (!sa[key] || !sb[key]) {
        const only = sa[key] || sb[key];
        if (!only.rendered) continue; // added or removed, but never drawn
        found.push({ state, key, field: sa[key] ? 'removed' : 'added', insideBook: only.insideBook });
        continue;
      }
      if (!sa[key].rendered && !sb[key].rendered) continue;
      for (const field of ['rendered', 'box', 'display', 'visibility', 'opacity', 'background', 'padding']) {
        if (skipNoise[`${state}|${key}|${field}`]) continue;
        if (sa[key][field] !== sb[key][field]) {
          found.push({ state, key, field, from: sa[key][field], to: sb[key][field], insideBook: sa[key].insideBook });
        }
      }
    }
  }
  return found;
}


// --- the desktop half ---------------------------------------------------------

const rectOf = (page, sel) => page.evaluate((q) => {
  const el = document.querySelector(q);
  if (!el || el.getClientRects().length === 0) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
}, sel);
const overlap = (a, b) => !!a && !!b && a.x < b.right - 0.5 && b.x < a.right - 0.5 && a.y < b.bottom - 0.5 && b.y < a.bottom - 0.5;
const fmt = (r) => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}` : 'none';

// Kill quests, c7-tracker's: each tracks an objective line.
const SIX_QUESTS = ['wolves-on-the-road', 'boars-in-the-field', 'kobolds-on-the-road', 'dire-wolves-in-the-forest', 'spiders-in-the-diggings', 'bandits-at-the-shrine'];
const TILES = [
  ['mapButton', 'Map (M)'], ['spellbookButton', 'Spellbook (B)'],
  ['questTrackerJournal', 'Journal (J)'], ['appearanceButton', 'Appearance (C)'],
];

async function hoverTooltip(page, sel) {
  await page.mouse.move(1, 1);
  await page.waitForTimeout(150);
  const r = await rectOf(page, sel);
  if (!r) return null;
  await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const tip = document.getElementById('skillTooltip');
    if (!tip || tip.classList.contains('hidden')) return null;
    return tip.querySelector('.tooltipTitle')?.textContent ?? '';
  });
}

async function desktopAt(viewport) {
  console.log(`\n=== desktop ${viewport.width}×${viewport.height} ===`);
  const { ctx, page } = await joinGame(viewport, 'desktop', 'pfdesk');
  const cmd = async (c) => {
    await page.waitForSelector('#console_command', { state: 'attached' });
    await page.evaluate((x) => {
      document.querySelector('#console_command').value = x;
      document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, c);
    await page.waitForTimeout(350);
  };
  const tag = `${viewport.width}x${viewport.height}`;
  await cmd('PING'); // the first command after joining is dropped (harness note)
  await cmd('GOD on');
  for (const q of SIX_QUESTS) await cmd(`QUEST ACCEPT ${q}`);
  await page.waitForTimeout(1500);

  // F12: the 2×2 under the minimap.
  const mini = await rectOf(page, '#minimap');
  const t = {};
  for (const [id] of TILES) t[id] = await rectOf(page, '#' + id);
  const rowsOk = t.mapButton && t.spellbookButton && t.questTrackerJournal && t.appearanceButton
    && Math.abs(t.mapButton.y - t.spellbookButton.y) < 1 && Math.abs(t.questTrackerJournal.y - t.appearanceButton.y) < 1
    && t.mapButton.x < t.spellbookButton.x && t.questTrackerJournal.x < t.appearanceButton.x
    && Math.abs(t.mapButton.x - t.questTrackerJournal.x) < 1 && t.questTrackerJournal.y > t.mapButton.bottom;
  check(rowsOk, 'F12 the four tiles form M B / J C', TILES.map(([id]) => `${id} ${fmt(t[id])}`).join(' · '));
  // The minimap's outer ring reaches 9px past its box; the chips stick up past the tiles.
  const chipTop = await page.evaluate(() => document.querySelector('#mapButton > .mapButtonHotkey').getBoundingClientRect().top);
  check(mini && t.mapButton && chipTop >= mini.bottom + 9 && t.mapButton.x >= mini.x - 1 && t.spellbookButton.right <= mini.right + 1,
    'F12 the grid sits under the minimap\'s ring, inside its width', `minimap ${fmt(mini)} chip top ${Math.round(chipTop)}`);
  const tileFacts = await page.evaluate((ids) => ids.map((id) => {
    const el = document.getElementById(id);
    const label = el.querySelector('span[data-i18n]');
    const token = el.querySelector('.hudTileIcon > .ink-token');
    return { id, title: el.getAttribute('title'), labelShown: label && label.getClientRects().length > 0,
      token: token ? (token.classList.contains('packIcon') ? 'pack' : 'letter') : 'none' };
  }), TILES.map(([id]) => id));
  check(tileFacts.every((f) => f.title === null), 'F12 no tile carries a native title');
  check(tileFacts.every((f) => !f.labelShown), 'F12 the names are not drawn on the tiles');
  // A clone without the atlases (gitignored) has an empty lookup: the letter is right there.
  const packLoaded = await page.evaluate(async () => (await fetch('icons/icons.json').then((r) => r.json()).catch(() => ({ icons: {} })))
    .icons?.['winding-road'] !== undefined);
  const wantToken = packLoaded ? 'pack' : 'letter';
  check(tileFacts.every((f) => f.token === wantToken), `F12 every tile draws its ${packLoaded ? 'PONETI icon' : 'letter fallback (no atlases)'}`,
    tileFacts.map((f) => `${f.id}:${f.token}`).join(' '));
  for (const [id, want] of TILES) {
    const got = await hoverTooltip(page, '#' + id);
    check(got === want, `F12 hovering #${id} shows the game tooltip "${want}"`, `got ${JSON.stringify(got)}`);
  }
  const helpTip = await hoverTooltip(page, '#helpButton');
  check(helpTip === 'How Aura works', 'the ? shows its name in the game tooltip', `got ${JSON.stringify(helpTip)}`);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);

  // F11: one row above the Focus bar.
  const parts = [];
  for (const sel of ['#helpButton', '#zoomControl > .zoomIcon', '#zoomInButton', '#zoomLevelDisplay', '#zoomOutButton']) parts.push(await rectOf(page, sel));
  const focus = await rectOf(page, '#healthBar');
  const row = await rectOf(page, '#zoomControl');
  const centres = parts.map((r) => r && r.y + r.h / 2);
  const oneRow = parts.every(Boolean) && Math.max(...centres) - Math.min(...centres) < 2
    && parts.every((r, i) => i === 0 || r.x >= parts[i - 1].right - 0.5);
  check(oneRow, 'F11 ?, magnifier, +, level, − in one row, in that order', parts.map(fmt).join(' | '));
  check(row && focus && row.bottom <= focus.y && row.right <= viewport.width && row.right >= focus.right - 2,
    'F11 the row sits above the Focus bar, right-aligned with it', `row ${fmt(row)} focus ${fmt(focus)}`);
  // Inline, not the class: HUD.updateCombatIndicator re-applies .hidden every tick.
  await page.evaluate(() => document.getElementById('combatIndicator').style.setProperty('display', 'block', 'important'));
  const combat = await rectOf(page, '#combatIndicator');
  check(combat && !overlap(combat, row) && combat.right <= row.x, 'the combat sword sits left of the row, clear of it', `sword ${fmt(combat)}`);

  // F12: the tracker takes the freed height, clear of everything.
  const tracker = await rectOf(page, '#questTrackerList');
  const entries = await page.evaluate(() => document.querySelectorAll('#questTrackerList > .questTrackerQuest').length);
  const grid = { x: t.mapButton.x, y: t.mapButton.y, right: t.appearanceButton.right, bottom: t.appearanceButton.bottom };
  check(entries === 6, 'six quests are tracked', `${entries}`);
  check(tracker && !overlap(tracker, grid) && tracker.y >= grid.bottom && !overlap(tracker, row) && !overlap(tracker, combat)
    && !overlap(tracker, await rectOf(page, '#vitalSigns')), 'the tracker clears the grid, the zoom row, the sword and the bars',
    `tracker ${fmt(tracker)}`);
  const scrolls = await page.evaluate(() => { const l = document.getElementById('questTrackerList'); return l.scrollHeight > l.clientHeight + 1; });
  console.log(`    (tracker ${Math.round(tracker?.h ?? 0)} px tall, ${scrolls ? 'scrolls' : 'fits'}; zoom row top ${Math.round(row?.y ?? 0)})`);
  await page.evaluate(() => document.getElementById('combatIndicator').style.removeProperty('display'));

  // F9: the player's own plate.
  const nameSize = await page.evaluate(() => window.game.character.nameElement?.style.fontSize);
  check(nameSize === 16, 'F9 the player name draws at 16 px, the NPC plate size', `got ${nameSize}`);

  // F12: the points glow and pill on the spellbook tile (fresh characters have 0).
  await cmd('XP 2000');
  await page.waitForTimeout(1200);
  const glow = await page.evaluate(() => {
    const b = document.getElementById('spellbookButton');
    const pill = document.getElementById('skillPointsBadge');
    const r = pill.getBoundingClientRect(), br = b.getBoundingClientRect();
    return { hasPoints: b.classList.contains('hasPoints'), border: getComputedStyle(b).borderTopColor,
      pill: pill.getClientRects().length ? pill.textContent : null, pillInCorner: r.right >= br.right - 4 && r.top <= br.top + 4 };
  });
  check(glow.hasPoints && /^rgba?\((2[0-9]{2}|1[5-9][0-9]), (1[5-9][0-9]|2[0-9]{2}), /.test(glow.border),
    'F12 the tile glows gold while points wait', JSON.stringify(glow));
  check(/^\d+$/.test(glow.pill ?? '') && glow.pillInCorner, 'F12 the tile carries a number pill in its top-right corner', `pill ${glow.pill}`);
  const tb = await rectOf(page, '.hudTileGrid');
  await page.screenshot({ path: join(outdir, `desktop-${tag}-tiles-points.png`),
    clip: { x: Math.max(0, tb.x - 30), y: Math.max(0, tb.y - 20), width: tb.w + 60, height: tb.h + 40 } });

  // F15: the scrim.
  await cmd('ANNOUNCE PF3 banner scrim check');
  await page.waitForTimeout(900);
  const banner = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('alertBanner'));
    return { bg: cs.backgroundColor, visible: document.getElementById('alertBanner').classList.contains('visible') };
  });
  const alpha = /rgba?\([^)]*,\s*([\d.]+)\)/.exec(banner.bg)?.[1];
  check(alpha && +alpha > 0.2 && +alpha < 0.9, 'F15 the banner has a semi-transparent scrim', `${banner.bg} visible=${banner.visible}`);
  await page.screenshot({ path: join(outdir, `desktop-${tag}-hud.png`) });

  // F4: one strip for both tabs.
  await openSpellbook(page);
  await page.waitForTimeout(400);
  const book = async () => page.evaluate(() => {
    const shown = (id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; };
    const strip = document.getElementById('spellbookStrip');
    return {
      height: Math.round(document.getElementById('spellbook').getBoundingClientRect().height),
      skillText: shown('skillPointsText') ? document.getElementById('skillPointsText').textContent : null,
      campText: shown('campPointsText') ? document.getElementById('campPointsText').textContent : null,
      respec: shown('respecButton'), campRespec: shown('campRespecButton'),
      inStrip: strip?.contains(document.getElementById('respecButton')) && strip?.contains(document.getElementById('campRespecButton')),
      titleExtras: document.querySelector('#spellbook > .spellbookTitle').children.length,
      titles: ['respecButton', 'campRespecButton'].map((id) => document.getElementById(id).getAttribute('title')),
    };
  });
  const skills = await book();
  check(/^Skill points: \d+$/.test(skills.skillText ?? '') && skills.respec && !skills.campRespec && skills.campText === null,
    'F4 a skill tab shows "Skill points: N" + Reset in the body strip', JSON.stringify(skills));
  check(skills.inStrip && skills.titleExtras === 1, 'F4 both Resets live in the strip; the title holds only its text');
  check(skills.titles.every((x) => x === null), 'F4 no Reset carries a native title');
  const respecTip = await hoverTooltip(page, '#respecButton');
  check(respecTip === 'Reset', 'F4 the skill Reset shows the game tooltip', `got ${JSON.stringify(respecTip)}`);
  await page.screenshot({ path: join(outdir, `desktop-${tag}-book-skills.png`) });
  const campTab = await rectOf(page, '.spellbookTab[data-category="camp"]');
  if (campTab) {
    await page.mouse.click(campTab.x + campTab.w / 2, campTab.y + campTab.h / 2);
    await page.waitForTimeout(400);
    const camp = await book();
    check(/^Campfire points: \d+$/.test(camp.campText ?? '') && camp.campRespec && !camp.respec && camp.skillText === null,
      'F4 the Campfire tab shows its points + Reset in the same strip', JSON.stringify(camp));
    check(Math.abs(camp.height - skills.height) <= 1, 'F4 the book keeps its height across the tabs', `${skills.height} vs ${camp.height}`);
    const campTip = await hoverTooltip(page, '#campRespecButton');
    check(campTip === 'Reset', 'F4 the campfire Reset shows the game tooltip', `got ${JSON.stringify(campTip)}`);
    await page.screenshot({ path: join(outdir, `desktop-${tag}-book-camp.png`) });
  } else {
    check(false, 'F4 the Campfire tab is on screen');
  }
  console.log(`    (book height ${skills.height} px)`);
  await ctx.close();
}


// --- German: the book's header must not depend on the selected tab -------------
// PO 2026-11-24: "Abklingfähigkeiten" in bold wrapped the tab row onto a second
// line only while it was selected, so the book's header jumped between tabs.
async function germanBook() {
  console.log('\n=== German book, every tab (1280×800) ===');
  const ctx = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(base + '&desktop', { waitUntil: 'domcontentloaded' });
  await joinAsNewCharacter(page, 'pfde');
  await page.waitForFunction(() => !!window.game?.character, null, { timeout: 30_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(2500);
  const cmd = async (c) => {
    await page.evaluate((x) => {
      document.querySelector('#console_command').value = x;
      document.querySelector('#console').dispatchEvent(new Event('submit', { cancelable: true }));
    }, c);
    await page.waitForTimeout(400);
  };
  await cmd('PING');
  // A level-up's milestone unlock is a server Unlock with its source on line two.
  await cmd('XP 5000');
  await page.waitForSelector('#alertBanner.visible > .alertDetail', { state: 'attached', timeout: 20_000 }).catch(() => {});
  // The unlock banner's two rows (PF3 feedback): a gold headline, a smaller light source line.
  const banner = await page.evaluate(() => {
    const t = document.querySelector('#alertBanner > .alertTitle'), d = document.querySelector('#alertBanner > .alertDetail');
    const st = (e) => e && { size: parseFloat(getComputedStyle(e).fontSize), color: getComputedStyle(e).color };
    return { kind: document.getElementById('alertBanner').className, title: st(t), detail: st(d), text: document.getElementById('alertBanner').textContent };
  });
  await page.screenshot({ path: join(outdir, 'german-banner.png'), clip: { x: 240, y: 0, width: 800, height: 220 } });
  check(!!banner.detail && banner.detail.size < banner.title.size * 0.75 && banner.detail.color !== banner.title.color,
    'the unlock banner\'s source line is smaller and lighter than its headline', JSON.stringify(banner));
  await cmd('SKILL all');
  await page.waitForTimeout(1500);
  await openSpellbook(page);
  await page.waitForTimeout(400);
  const tabs = await page.$$eval('#spellbookTabs > .spellbookTab:not(.hidden)', (els) => els.map((e) => e.dataset.category));
  const seen = [];
  for (const cat of tabs) {
    await page.click(`#spellbookTabs > .spellbookTab[data-category="${cat}"]`);
    await page.waitForTimeout(300);
    seen.push(await page.evaluate((c) => ({
      tab: c,
      row: Math.round(document.getElementById('spellbookTabs').getBoundingClientRect().height),
      book: Math.round(document.getElementById('spellbook').getBoundingClientRect().height),
    }), cat));
    await page.screenshot({ path: join(outdir, `german-book-${cat}.png`), clip: { x: 0, y: 0, width: 470, height: 330 } });
  }
  check(tabs.length >= 4, 'every tab is on screen', tabs.join(','));
  // The header is the PO's ask; the book's total may still differ by the page
  // arrows, which only the ability tabs show (and only past one page).
  check(new Set(seen.map((x) => x.row)).size === 1, 'the tab row keeps one height whichever tab is selected', JSON.stringify(seen));
  await ctx.close();
}

try {
  if (mode === 'baseline') {
    console.log('=== phone baseline (two runs, noise = what differs between them) ===');
    const one = await phoneStates('pfbase');
    const two = await phoneStates('pfbase');
    const noise = {};
    for (const d of diff(one, two)) noise[`${d.state}|${d.key}|${d.field}`] = true;
    writeFileSync(BASELINE, JSON.stringify({ viewport: PHONE, noise, states: one }, null, 1) + '\n');
    const n = Object.values(one).reduce((s, st) => s + Object.keys(st).length, 0);
    console.log(`  wrote ${BASELINE}: ${Object.keys(one).length} states, ${n} element records, ${Object.keys(noise).length} noisy fields`);
    console.log('  noisy:', Object.keys(noise).join(' ') || '(none)');
  } else if (mode === 'desktop') {
    // PF3_SIZES=1920x1080 runs one size (each run mints an anonymous account).
    const sizes = (process.env.PF3_SIZES || '1280x800,1920x1080').split(',').map((x) => x.split('x').map(Number));
    for (const [width, height] of sizes) await desktopAt({ width, height });
  } else if (mode === 'german') {
    await germanBook();
  } else if (mode === 'phone') {
    console.log('=== the phone did not move (vs the HEAD baseline) ===');
    if (!existsSync(BASELINE)) throw new Error('no baseline: run `pf3-hud.mjs baseline` at HEAD first');
    const saved = JSON.parse(readFileSync(BASELINE, 'utf8'));
    const now = await phoneStates('pfphone');
    const all = diff(saved.states, now, saved.noise);
    const outside = all.filter((d) => !d.insideBook);
    const inside = all.filter((d) => d.insideBook);
    for (const d of outside) console.log('    MOVED', JSON.stringify(d));
    check(outside.length === 0, `no phone element outside the open book changed (${outside.length} differences)`);
    console.log(`  (inside the open book, ruled to take the F4 strip: ${inside.length} differences)`);
    for (const d of inside) console.log('    book', JSON.stringify(d));
  }
} finally {
  await browser.close();
}
if (mode !== 'baseline') {
  console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}
