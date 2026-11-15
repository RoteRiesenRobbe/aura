#!/usr/bin/env node
// Campfire traits CT2 (docs/plan-campfire-traits.md §CT2): the spellbook's
// Campfire tab at the game surface, driven with REAL input (mouse clicks at
// element boxes, B to open the book). ct1-camp-traits owns the server half over
// the raw wire; this script owns what the player sees and presses.
//
//   1  a fresh character's book has a Campfire tab; pressing it swaps the
//      ability list for the trait pane (six rows from the catalog, at 0/max)
//   2  #spellbookList never holds a trait row (the 50 scripts that read it blind)
//   3  more fires: the strip, the tab badge and the open-button badge all read
//      the pool, and the shut book's buttons glow for it
//   4  + on Camp charges: 1/5, the pool drops by one, NO unlock glow, pulse or
//      banner (a bought trait is not a discovery)
//   5  the Camp button's x/cap rises by one (L4: the client cap's trait term)
//   6  the tooltip names the category and carries the generated trait line
//   7  − returns the trait to 0 and the point to the pool
//   8  the camp Reset (two presses) clears every trait; the title's skill
//      Reset and badge step aside while the tab is up
//   9  back to an ability tab: the list returns, the pane goes
//  10  German, phone layout (?mobile, 844x390): four tabs fit the panel,
//      the pane's rows sit on screen
//  11  German, desktop: four tabs fit the book's fixed width (the row may wrap)
//  12  English, desktop: four tabs on one row
//
// Usage: node .claude/skills/verify/ct2-camp-tab.mjs [label] [url]
// Afterwards (stop aurad first): cd backend && go run ./cmd/harnessdb -cleanup
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook, closeSpellbook } from './lib/spellbook.mjs';

const repo = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

const CHARGES = 181;
// The traits as authored, so the row assertions name ids instead of a count.
const TRAIT_IDS = (() => {
  const dir = join(repo, 'api/skills/camp');
  return ['camp-duration', 'camp-heal', 'camp-charges', 'camp-focus-buff', 'camp-damage-buff', 'camp-speed-buff']
    .map((f) => JSON.parse(readFileSync(join(dir, `${f}.json`), 'utf8')))
    .map((d) => ({ id: d.id, max: d.maxLevel }))
    .sort((a, b) => a.id - b.id);
})();
const bindPoints = (() => {
  const out = [];
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') {
      if (Array.isArray(v.bindPoints)) v.bindPoints.forEach((p) => p?.id && out.push(p.id));
      Object.values(v).forEach(walk);
    }
  };
  walk(JSON.parse(readFileSync(join(repo, 'api/zones/world.json'), 'utf8')));
  return [...new Set(out)];
})();

const results = [];
const consoleErrors = [];
const check = (ok, name, note) => {
  results.push({ ok, name, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  - ' + note : ''}`);
};

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-gpu'], env });

async function newPage(opts, init) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  return page;
}
const cmdOn = (page) => async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(600);
};
async function enter(page, tag, flavour = '') {
  await page.goto(url + flavour, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await joinAsNewCharacter(page, tag);
  await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
  await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });
  await page.waitForTimeout(1200);
  const cmd = cmdOn(page);
  await cmd('PING'); // the first command after joining is dropped
  await cmd('GOD on');
  return cmd;
}
const clickBox = async (page, selector, dx = null) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + (dx ?? box.width / 2), box.y + box.height / 2);
  await page.waitForTimeout(400);
  return true;
};
// One atomic read of everything the tab shows.
const tabState = (page) => page.evaluate(() => {
  const hidden = (el) => !el || el.classList.contains('hidden');
  const rows = [...document.querySelectorAll('#campTraitList > li[data-skill-id]')].map((li) => ({
    id: +li.dataset.skillId,
    level: li.querySelector('.skillLevel')?.textContent,
    plusDead: li.querySelector('.spendBtn')?.classList.contains('inactive'),
    minusDead: li.querySelector('.unspendBtn')?.classList.contains('inactive'),
  }));
  const tab = document.querySelector('.spellbookTab[data-category="camp"]');
  return {
    tabShown: !hidden(tab),
    tabActive: !!tab?.classList.contains('active'),
    tabBadge: hidden(tab?.querySelector('.campPointsBadge')) ? null : tab.querySelector('.campPointsBadge').textContent,
    paneShown: !hidden(document.getElementById('campTraitPane')),
    listShown: !hidden(document.getElementById('spellbookScroll')),
    strip: document.getElementById('campPointsText')?.textContent,
    rows,
    traitRowsInAbilityList: document.querySelectorAll('#spellbookList > li[data-category="camp"]').length,
    titleResetShown: (() => { const b = document.getElementById('respecButton'); return !!b && b.getClientRects().length > 0; })(),
    buttonGlow: document.getElementById('spellbookButton')?.classList.contains('hasPoints'),
    buttonBadge: hidden(document.querySelector('#spellbookButton .campPointsBadge')) ? null : document.querySelector('#spellbookButton .campPointsBadge').textContent,
    campCap: document.querySelector('#utilityList li[data-utility="2"] .utilityCharges')?.textContent,
  };
});
const stripPoints = (s) => { const m = /(\d+)/.exec(s?.strip ?? ''); return m ? +m[1] : null; };
const until = async (page, pred, ms = 8_000) => {
  const deadline = Date.now() + ms;
  let s;
  while (Date.now() < deadline) {
    s = await tabState(page);
    if (pred(s)) return s;
    await page.waitForTimeout(200);
  }
  return s;
};

try {
  const page = await newPage({ locale: 'en-US' });
  const cmd = await enter(page, 'ct2');

  // --- 1. the tab and the pane swap -------------------------------------------
  await openSpellbook(page);
  let s = await until(page, (x) => x.tabShown && x.rows.length > 0);
  check(s.tabShown, 'the Campfire tab shows on a fresh character');
  await clickBox(page, '.spellbookTab[data-category="camp"]');
  s = await tabState(page);
  check(s.tabActive && s.paneShown && !s.listShown, 'pressing it swaps the ability list for the trait pane',
    JSON.stringify({ active: s.tabActive, pane: s.paneShown, list: s.listShown }));
  const want = TRAIT_IDS.map((t) => `${t.id}:0/${t.max}`).join(',');
  const got = s.rows.map((r) => `${r.id}:${r.level}`).join(',');
  check(got === want, 'every authored trait is listed from the catalog, at 0/max', got);
  await page.screenshot({ path: `/tmp/ct2-camp-tab-${label}-desktop.png` });

  // --- 2. the ability list stays trait-free ----------------------------------------
  check(s.traitRowsInAbilityList === 0, '#spellbookList holds no trait row', `${s.traitRowsInAbilityList}`);

  // --- 3. the pool, everywhere it is shown -------------------------------------------
  await closeSpellbook(page);
  for (const id of bindPoints.slice(0, 4)) {
    await cmd(`WARP ${id}`);
    await page.waitForTimeout(900);
  }
  s = await until(page, (x) => (stripPoints(x) ?? 0) >= 2);
  const pool = stripPoints(s);
  check(pool >= 2 && s.buttonBadge === String(pool) && s.tabBadge === String(pool),
    'the strip, the tab badge and the open-button badge read the same pool',
    `strip="${s.strip}" tab=${s.tabBadge} button=${s.buttonBadge}`);
  check(!!s.buttonGlow, 'the shut book\'s open button glows for a campfire point');

  // --- 4. + buys a level, silently -----------------------------------------------------
  const capBefore = +(s.campCap ?? '0/0').split('/')[1];
  await openSpellbook(page);
  await clickBox(page, '.spellbookTab[data-category="camp"]');
  const banners = [];
  const watch = setInterval(() => page.evaluate(() => ({
    banner: document.getElementById('alertBanner')?.textContent ?? '',
    pulse: document.getElementById('spellbook')?.classList.contains('unlockPulse'),
    crumb: document.querySelectorAll('.breadcrumb').length,
  })).then((b) => banners.push(b)).catch(() => {}), 200);
  const bannerBefore = await page.evaluate(() => document.getElementById('alertBanner')?.textContent ?? '');
  await clickBox(page, `#campTraitList li[data-skill-id="${CHARGES}"] .spendBtn`);
  s = await until(page, (x) => x.rows.find((r) => r.id === CHARGES)?.level?.startsWith('1/'));
  await page.waitForTimeout(2_000);
  clearInterval(watch);
  const charges = s.rows.find((r) => r.id === CHARGES);
  check(charges?.level === '1/5' && stripPoints(s) === pool - 1, '+ buys level 1 and the pool drops by one',
    `level=${charges?.level} strip="${s.strip}" (pool ${pool})`);
  const noisy = banners.filter((b) => b.pulse || b.crumb > 0 || (b.banner && b.banner !== bannerBefore));
  check(noisy.length === 0, 'no unlock pulse, breadcrumb or banner for a bought trait', JSON.stringify(noisy.slice(0, 2)));

  // --- 5. the Camp button's cap ---------------------------------------------------------
  s = await until(page, (x) => +(x.campCap ?? '0/0').split('/')[1] === capBefore + 1, 4_000);
  check(+(s.campCap ?? '0/0').split('/')[1] === capBefore + 1, 'the Camp button\'s cap rises with the charges trait',
    `${capBefore} -> ${s.campCap}`);

  // --- 6. the tooltip -------------------------------------------------------------------
  const durationRow = `#campTraitList li[data-skill-id="${TRAIT_IDS[0].id}"] .skillName`;
  const box = await page.locator(durationRow).boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.waitForTimeout(600);
  const tip = await page.evaluate(() => document.getElementById('skillTooltip')?.textContent ?? '');
  check(/Campfire trait/.test(tip) && /Camp lifetime: \+0s → \+1s/.test(tip),
    'the tooltip names the category and previews the next level', tip.slice(0, 160));

  // --- 7. − refunds -------------------------------------------------------------------------
  await clickBox(page, `#campTraitList li[data-skill-id="${CHARGES}"] .unspendBtn`);
  s = await until(page, (x) => x.rows.find((r) => r.id === CHARGES)?.level === '0/5');
  check(s.rows.find((r) => r.id === CHARGES)?.level === '0/5' && stripPoints(s) === pool, '− returns the trait to 0 and the point',
    `strip="${s.strip}"`);

  // --- 8. the camp Reset ----------------------------------------------------------------------
  for (const t of TRAIT_IDS.slice(0, 2)) {
    await clickBox(page, `#campTraitList li[data-skill-id="${t.id}"] .spendBtn`);
  }
  s = await until(page, (x) => stripPoints(x) === pool - 2);
  check(!s.titleResetShown, 'the title\'s skill Reset steps aside on the Campfire tab');
  await clickBox(page, '#campRespecButton');
  const armed = await page.evaluate(() => document.getElementById('campRespecButton').classList.contains('armed'));
  await clickBox(page, '#campRespecButton');
  s = await until(page, (x) => x.rows.every((r) => r.level?.startsWith('0/')));
  check(armed && s.rows.every((r) => r.level?.startsWith('0/')) && stripPoints(s) === pool,
    'the camp Reset arms on the first press and clears every trait on the second', `armed=${armed} strip="${s.strip}"`);

  // --- 9. back to the abilities ------------------------------------------------------------------
  const abilityTab = await page.evaluate(() =>
    [...document.querySelectorAll('.spellbookTab')].find((t) => t.dataset.category !== 'camp' && !t.classList.contains('hidden'))?.dataset.category ?? null);
  if (abilityTab) {
    await clickBox(page, `.spellbookTab[data-category="${abilityTab}"]`);
    s = await tabState(page);
    check(s.listShown && !s.paneShown && s.titleResetShown, 'an ability tab brings the list (and the skill Reset) back',
      `tab=${abilityTab}`);
  } else {
    check(true, 'an ability tab brings the list back', 'SKIPPED: this character has no ability yet');
  }
  await page.context().close();

  // --- 10. German, phone layout ----------------------------------------------------------------------
  const phone = await newPage({ locale: 'de-DE', viewport: { width: 844, height: 390 }, hasTouch: true },
    () => window.localStorage.setItem('aura.locale', 'de'));
  const phoneCmd = await enter(phone, 'ct2de', '&mobile');
  // Every ability tab up, so the fit is measured with all four tabs.
  await phoneCmd('SKILL all');
  await phone.waitForTimeout(2_000);
  await openSpellbook(phone);
  await until(phone, (x) => x.tabShown);
  await clickBox(phone, '.spellbookTab[data-category="camp"]');
  await phone.waitForTimeout(500);
  const fit = await phone.evaluate(() => {
    const tabs = document.getElementById('spellbookTabs');
    const panel = document.getElementById('spellbook').getBoundingClientRect();
    const shown = [...tabs.children].filter((t) => t.getClientRects().length > 0);
    const rows = [...document.querySelectorAll('#campTraitList > li')].map((li) => li.getBoundingClientRect());
    return {
      // The label alone: the tab's hidden badge still carries a number.
      labels: shown.map((t) => (t.querySelector('[data-i18n]') ?? t).textContent.trim()),
      overflow: tabs.scrollWidth - tabs.clientWidth,
      outside: shown.filter((t) => t.getBoundingClientRect().right > panel.right + 1).length,
      firstRowOnScreen: rows.length > 0 && rows[0].top >= 0 && rows[0].bottom <= window.innerHeight,
      strip: document.getElementById('campPointsText')?.textContent,
    };
  });
  await phone.screenshot({ path: `/tmp/ct2-camp-tab-${label}-phone-de.png` });
  check(fit.labels.length === 4 && fit.overflow <= 0 && fit.outside === 0 && fit.labels.includes('Lagerfeuer'),
    'German phone: the tabs fit the panel', JSON.stringify(fit));
  check(fit.firstRowOnScreen && /^Lagerfeuerpunkte: \d+$/.test(fit.strip ?? ''), 'German phone: the pane reads', `strip="${fit.strip}"`);

  // --- 11/12. desktop, every tab up: the book's fixed width ----------------------------------------
  // English must keep ONE row; German may wrap the row (two), never a label.
  const desktopFit = async (locale, tag) => {
    const wide = await newPage({ locale: locale === 'de' ? 'de-DE' : 'en-US' },
      locale === 'de' ? () => window.localStorage.setItem('aura.locale', 'de') : undefined);
    const wideCmd = await enter(wide, tag);
    await wideCmd('SKILL all');
    await wide.waitForTimeout(2_000);
    await openSpellbook(wide);
    await until(wide, (x) => x.tabShown);
    await clickBox(wide, '.spellbookTab[data-category="camp"]');
    const fit = await wide.evaluate(() => {
      const tabs = document.getElementById('spellbookTabs');
      const panel = document.getElementById('spellbook').getBoundingClientRect();
      const shown = [...tabs.children].filter((t) => t.getClientRects().length > 0);
      return {
        count: shown.length,
        widths: shown.map((t) => Math.round(t.getBoundingClientRect().width)),
        room: Math.round(tabs.clientWidth),
        overflow: tabs.scrollWidth - tabs.clientWidth,
        outside: shown.filter((t) => t.getBoundingClientRect().right > panel.right + 1).length,
        rows: new Set(shown.map((t) => Math.round(t.getBoundingClientRect().top))).size,
        // One line per label: the global hyphens:auto broke them mid-word once.
        brokenLabels: shown.filter((t) => {
          const range = document.createRange();
          range.selectNodeContents(t.querySelector('[data-i18n]') ?? t);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size > 1;
        }).map((t) => t.textContent),
      };
    });
    await wide.screenshot({ path: `/tmp/ct2-camp-tab-${label}-desktop-${locale}.png` });
    await wide.context().close();
    return fit;
  };
  const de = await desktopFit('de', 'ct2dw');
  check(de.count === 4 && de.overflow <= 0 && de.outside === 0 && de.brokenLabels.length === 0,
    'German desktop: four tabs fit the book, no label broken', JSON.stringify(de));
  const en = await desktopFit('en', 'ct2ew');
  check(en.count === 4 && en.rows === 1 && en.brokenLabels.length === 0,
    'English desktop: four tabs on ONE row', JSON.stringify(en));
} catch (e) {
  check(false, 'the run completed', e.message);
} finally {
  const real = consoleErrors.filter((e) => !/favicon|webglcontextlost/i.test(e));
  check(real.length === 0, 'no console errors', real.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
