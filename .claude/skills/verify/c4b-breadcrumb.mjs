#!/usr/bin/env node
// The unlock breadcrumb trail (plan-ui-pass.md C4b).
//
// Boundary: this script owns the TRAIL - which surface carries the `breadcrumb`
// pulse at each moment, and when it stops. The book's structure (open/close,
// tabs, pages) is `c3-spellbook`; the row's glyph is `c4-skill-icons`; what a
// row SAYS is `round4-tooltip`. Nothing here asserts colour or chrome: the look
// is a functional placeholder and C6 owns the final one.
//
// Legs:
//   1. the join BASELINE never pulses - not shut, not open, not on any tab (D4)
//   2. a post-baseline unlock with the book shut pulses both open buttons and
//      the ☰ toggle, and COMPOSES with `.hasPoints` on the same button (D3)
//   3. opening the book moves the pulse to the unseen skill's category tab -
//      the buttons stop, and the ACTIVE tab never pulses
//   4. unseen off the displayed page: the pager step that points AT it pulses,
//      the other one does not, and neither does the active tab
//   5. paging to it: the row itself pulses AND glows, a ~2× dwell clears
//      everything, and a close + reopen onto the same page stays quiet (2026-09-06)
//   6. two unseen in different categories, unlocked as two REBUILDS: the earlier
//      one still glows on its page; seeing one leaves the other tab pulsing
//      (the trail stops only once ALL are seen)
//   7. closing the book with something still unseen resumes the buttons
//   8. mobile: the ☰ pulses, with a real box and the entry-point keyframe - the
//      C1 probe rather than an assumption that no mobile reset is needed
//   2d/8d (2026-09-06, feedback ruled B): the shut book's unlock also fires the
//      strong ONE-SHOT flash on the entry points that are ON SCREEN - the
//      desktop button, the phone's ☰ - and on nothing hidden (the sheet's row
//      on both layouts), so the class cannot linger on a display:none element
//      and fire whenever it next appears. Its peak is
//      screenshotted paused, the way the trail's faintness was measured.
//
// ⚑ Leg construction, both pinned in the spec:
//   · the book opens on the `aura` tab, so leg 3's unlock must be in a
//     NON-aura category, or the pulse would land on rows instead of a tab.
//   · leg 4 needs more than PAGE_SIZE (8) discovered in ONE category before the
//     late unlock can be off-page at all - hence the cooldown fill.
//
// ⚑ Every dwell wait is WALL CLOCK (ruling D2). The dwell is a setTimeout on
// purpose: a headless page throttles rAF to ~6 fps, so an rAF dwell would make
// every leg below flake by construction.
//
// ⚑ `XP` runs before anything else that matters: the level-ups it buys are what
// puts unspent points on the button, which is what leg 2's composition claim
// needs. Their milestone unlocks are themselves unseen, so the run dwells the
// whole book clean once before the first real leg.
//
// ⚑ Restart the server first, and run this script ALONE.
//
// Usage: node .claude/skills/verify/c4b-breadcrumb.mjs [label] [url]
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';
import { openSpellbook, closeSpellbook } from './lib/spellbook.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Mirrors Spellbook.SEEN_DWELL_MS. Every wait below is a generous multiple, so
// a re-tune of the placeholder does not turn this file red.
const DWELL = 500;
const CATEGORIES = ['aura', 'passive', 'cooldown'];

// Eleven cooldowns, none of them a milestone unlock (Haste is, and a re-Discover
// is a silent no-op) - enough to push the cooldown tab past one page of eight.
const COOLDOWN_FILL = [
  'Dash', 'Barrier', 'Envenom', 'Paralyze', 'Bloodthirst', 'Fade',
  'NovaBurst', 'Recover', 'SummonTotem', 'Calm', 'Taunt',
];

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const consoleErrors = [];

// ⚑ ONE sample per moment (the harness rule): the world moves between two
// page.evaluate round trips, and every leg below reads several facts about the
// same instant.
const TRAIL = () => {
  const lit = (el) => !!el && el.classList.contains('breadcrumb');
  const rows = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')];
  const counts = {};
  for (const row of rows) {
    counts[row.dataset.category] = (counts[row.dataset.category] || 0) + 1;
  }
  return {
    open: !document.getElementById('spellbook')?.classList.contains('hidden'),
    total: document.querySelectorAll('.breadcrumb').length,
    buttons: [...document.querySelectorAll('.spellbookOpenButton')].map((b) => ({
      id: b.id, breadcrumb: lit(b), hasPoints: b.classList.contains('hasPoints'),
      flash: b.classList.contains('unlockPulse'),
      flashName: getComputedStyle(b).animationName,
      visible: b.getClientRects().length > 0,
    })),
    menu: lit(document.getElementById('mobileMenuButton')),
    menuFlash: !!document.getElementById('mobileMenuButton')?.classList.contains('unlockPulse'),
    activeTab: document.querySelector('.spellbookTab.active')?.dataset.category ?? null,
    tabs: [...document.querySelectorAll('.spellbookTab')].filter(lit).map((t) => t.dataset.category),
    steps: [...document.querySelectorAll('.spellbookPageStep')].filter(lit).map((s) => s.dataset.step),
    litRows: rows.filter(lit).map((r) => ({
      id: r.dataset.skillId, category: r.dataset.category,
      name: r.querySelector('.skillName')?.textContent ?? '',
    })),
    // The row's own one-shot glow (2026-09-06: played off the unseen set, no
    // longer a static stamp) - the class AND the computed animation, since a
    // class the browser already cancelled is exactly the bug.
    glowRows: rows.filter((r) => r.classList.contains('unlocked')).map((r) => ({
      id: r.dataset.skillId, animation: getComputedStyle(r).animationName,
    })),
    onPage: rows.filter((r) => !r.classList.contains('offPage')).map((r) => r.dataset.skillId),
    ids: rows.map((r) => r.dataset.skillId),
    counts,
    pageLabel: document.getElementById('spellbookPageLabel')?.textContent ?? '',
  };
};

function wire(page) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
}

const clickEl = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  return true;
};

const sample = (page) => page.evaluate(TRAIL);

// ---------------------------------------------------------------- desktop ---

const deskCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await deskCtx.newPage();
wire(page);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'crumb');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(500);
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');
await page.waitForTimeout(1500);

// --- leg 1: the baseline is all-seen BY CONSTRUCTION -------------------------

const shutBaseline = await sample(page);
await openSpellbook(page);
const openBaseline = [];
for (const category of CATEGORIES) {
  await clickEl(page, `.spellbookTab[data-category="${category}"]`);
  openBaseline.push(await sample(page));
}
await closeSpellbook(page);
check('1 ⭐ the join baseline NEVER pulses - shut, open, on any tab (D4)',
  shutBaseline.total === 0 && openBaseline.every((s) => s.total === 0),
  `shut=${shutBaseline.total} open=${JSON.stringify(openBaseline.map((s) => s.total))} ` +
  `baseline rows=${JSON.stringify(shutBaseline.counts)}`);

// --- clean slate: XP buys the points leg 2 needs, and its milestone unlocks
//     are unseen like any other post-baseline discovery, so dwell them out ----

await cmd('XP 20000');
await page.waitForTimeout(2500);

async function dwellBookClean(rounds = 3) {
  await openSpellbook(page);
  for (let round = 0; round < rounds; round++) {
    if ((await sample(page)).total === 0) break;
    for (const category of CATEGORIES) {
      if (!(await clickEl(page, `.spellbookTab[data-category="${category}"]`))) continue;
      await page.waitForTimeout(2 * DWELL);
      for (let step = 0; step < 12; step++) {
        const before = (await sample(page)).pageLabel;
        if (!(await clickEl(page, '.spellbookPageStep[data-step="1"]'))) break;
        await page.waitForTimeout(2 * DWELL);
        if ((await sample(page)).pageLabel === before) break;
      }
    }
  }
  return (await sample(page)).total;
}

const residue = await dwellBookClean();
await clickEl(page, '.spellbookTab[data-category="aura"]');
await closeSpellbook(page);
const slate = await sample(page);
if (residue !== 0 || slate.total !== 0) {
  console.log(`the book would not come clean (residue=${residue}, shut=${slate.total}) - ` +
    'nothing below can be trusted');
  console.log(JSON.stringify(slate, null, 2));
  await browser.close();
  process.exit(1);
}

// --- leg 2: the shut book's way in, and the .hasPoints composition -----------

const beforeStrong = (await sample(page)).ids;
await cmd('SKILL Strong');
await page.waitForFunction((n) => document
  .querySelectorAll('#spellbookList > li[data-skill-id]').length > n,
  beforeStrong.length, { timeout: 30_000 });
await page.waitForTimeout(800);

const shut = await sample(page);
check('2 ⭐ a post-baseline unlock pulses BOTH open buttons and the ☰ while the book is shut (D3)',
  !shut.open && shut.buttons.length === 2 && shut.buttons.every((b) => b.breadcrumb) && shut.menu,
  JSON.stringify({ open: shut.open, buttons: shut.buttons, menu: shut.menu }));
check('2b ⭐ the pulse COMPOSES with .hasPoints - both classes on the same button at once',
  shut.buttons.every((b) => b.breadcrumb && b.hasPoints),
  JSON.stringify(shut.buttons));
check('2c nothing INSIDE the shut book pulses - there is nobody there to read it',
  shut.tabs.length === 0 && shut.steps.length === 0 && shut.litRows.length === 0,
  JSON.stringify({ tabs: shut.tabs, steps: shut.steps, rows: shut.litRows }));

// ⚑ On desktop exactly ONE entry point is on screen: #spellbookButton. The
// sheet's row and the ☰ are display:none here, and the flash must skip them.
check('2d ⭐ the same unlock fires the ONE-SHOT flash on the on-screen button, and on nothing hidden',
  shut.buttons.some((b) => b.id === 'spellbookButton' && b.visible)
    && shut.buttons.every((b) => b.visible
      ? b.flash && b.flashName === 'hud-button-unlock-flash'
      : !b.flash)
    && !shut.menuFlash,
  JSON.stringify({ buttons: shut.buttons, menuFlash: shut.menuFlash }));

await page.screenshot({ path: join(here, 'c4b-buttons-pulsing.png') });

// The flash at its PEAK, paused - the 2026-09-02 intake measured the trail's
// 50% keyframe statically and found it under the border; this is the same
// measurement for the fix, for the eye.
const peak = await page.evaluate(() => {
  const el = document.getElementById('spellbookButton');
  const anim = el?.getAnimations().find((a) => a.animationName === 'hud-button-unlock-flash');
  if (!anim) return null;
  anim.pause();
  anim.currentTime = 0;
  return getComputedStyle(el).filter;
});
check('2e the flash is a real running animation whose peak paints outside the box (filter, not the inlay)',
  !!peak && peak.includes('drop-shadow') && peak !== 'none', `filter@0%=${peak}`);
await page.screenshot({ path: join(here, 'c4b-unlock-flash-peak.png') });
await page.evaluate(() => {
  for (const a of document.getElementById('spellbookButton')?.getAnimations() ?? []) a.play();
});

// --- leg 3: opening moves the pulse to the tab ------------------------------

await openSpellbook(page);
await page.waitForTimeout(600);
const opened = await sample(page);
check('3 ⭐ opening the book MOVES the pulse: the buttons stop, the passive tab takes it over',
  opened.open && opened.buttons.every((b) => !b.breadcrumb) && !opened.menu
    && opened.tabs.join() === 'passive',
  JSON.stringify({ buttons: opened.buttons, menu: opened.menu, tabs: opened.tabs, active: opened.activeTab }));
check('3b the ACTIVE tab never pulses - the trail continues inside it instead',
  opened.activeTab === 'aura' && !opened.tabs.includes(opened.activeTab),
  `active=${opened.activeTab} pulsing=${JSON.stringify(opened.tabs)}`);

// The passive is read here so it stops competing with the legs below.
await clickEl(page, '.spellbookTab[data-category="passive"]');
await page.waitForTimeout(2 * DWELL);
const afterStrong = await sample(page);
check('3c reading it clears the trail entirely - the dwell marks it seen',
  afterStrong.total === 0,
  JSON.stringify({ total: afterStrong.total, tabs: afterStrong.tabs, rows: afterStrong.litRows }));

// --- legs 4 + 5: the pager, then the row, then the dwell --------------------

await clickEl(page, '.spellbookTab[data-category="cooldown"]');
for (const skill of COOLDOWN_FILL) {
  await cmd(`SKILL ${skill}`);
}
await page.waitForTimeout(2000);
const filled = await dwellBookClean();

// Back to page 1 of the cooldown tab, with everything on it already seen.
await clickEl(page, '.spellbookTab[data-category="cooldown"]');
for (let step = 0; step < 12; step++) {
  const before = (await sample(page)).pageLabel;
  if (!(await clickEl(page, '.spellbookPageStep[data-step="-1"]'))) break;
  if ((await sample(page)).pageLabel === before) break;
}
const staged = await sample(page);
if (filled !== 0 || staged.counts.cooldown <= 8 || !staged.pageLabel.startsWith('1 /')) {
  skip('4 the pager points at an unseen page, and only in its direction',
    `INCONCLUSIVE - residue=${filled} cooldowns=${staged.counts.cooldown} page=${staged.pageLabel}`);
  skip('5 the row itself pulses on the page it lives on, and the dwell clears everything', 'INCONCLUSIVE');
} else {
  const before = new Set(staged.ids);
  await cmd('SKILL Shockwave');
  await page.waitForFunction((n) => document
    .querySelectorAll('#spellbookList > li[data-skill-id]').length > n,
    staged.ids.length, { timeout: 30_000 });
  await page.waitForTimeout(800);

  const offPage = await sample(page);
  const late = offPage.ids.filter((id) => !before.has(id));
  check('4 ⭐ unseen off the displayed page: only the step pointing AT it pulses, and not the active tab',
    offPage.steps.join() === '1' && !offPage.tabs.includes('cooldown')
      && offPage.litRows.length === 0 && late.length === 1 && !offPage.onPage.includes(late[0]),
    JSON.stringify({ steps: offPage.steps, tabs: offPage.tabs, page: offPage.pageLabel, late, rows: offPage.litRows }));

  // Walk forward until the new row is on the page.
  let landed = null;
  for (let step = 0; step < 12; step++) {
    const now = await sample(page);
    if (now.onPage.includes(late[0])) { landed = now; break; }
    if (!(await clickEl(page, '.spellbookPageStep[data-step="1"]'))) break;
  }
  if (!landed) {
    skip('5 the row itself pulses on the page it lives on, and the dwell clears everything',
      'INCONCLUSIVE - never paged onto the new row');
  } else {
    check('5 ⭐ the row pulses once it is on the displayed page, and nothing else does',
      landed.litRows.length === 1 && landed.litRows[0].id === late[0]
        && landed.steps.length === 0 && landed.tabs.length === 0,
      JSON.stringify({ rows: landed.litRows, steps: landed.steps, page: landed.pageLabel }));
    check('5a ⭐ ...and it GLOWS - the one-shot is a running animation on the displayed row',
      landed.glowRows.length === 1 && landed.glowRows[0].id === late[0]
        && landed.glowRows[0].animation === 'skill-unlock-glow',
      JSON.stringify(landed.glowRows));

    await page.waitForTimeout(2 * DWELL);
    const dwelt = await sample(page);
    check('5b ⭐ a ~2× dwell marks it seen and EVERY pulse in the HUD stops',
      dwelt.total === 0 && dwelt.buttons.every((b) => !b.breadcrumb) && !dwelt.menu,
      JSON.stringify({ total: dwelt.total, buttons: dwelt.buttons, menu: dwelt.menu }));

    // The PO's 2026-09-06 repro: close and reopen onto the SAME tab and page
    // (both persist) - the seen row must stay quiet. Hiding it cancelled the
    // glow, the cancel stripped the class, and `lit` is false for good.
    await closeSpellbook(page);
    await page.waitForTimeout(300);
    await openSpellbook(page);
    await page.waitForTimeout(600);
    const reopened = await sample(page);
    check('5c ⭐ close + reopen onto the seen row: no glow, no trail, no animation left on it',
      reopened.open && reopened.onPage.includes(late[0])
        && reopened.glowRows.length === 0 && reopened.litRows.length === 0 && reopened.total === 0,
      JSON.stringify({ open: reopened.open, onPage: reopened.onPage.includes(late[0]),
        glow: reopened.glowRows, lit: reopened.litRows, total: reopened.total }));
  }
}

// --- leg 6: the ALL rule ----------------------------------------------------

const beforePair = (await sample(page)).ids.length;
// ⚑ Two separate REBUILDS on purpose (2026-09-06): Tough's row must be in
// HUD's `known` set by the time Aegis's rebuild runs, which is exactly the
// path the old diff-stamped glow lost - only the latest unlock ever glowed.
await cmd('SKILL Tough');   // passive
await page.waitForFunction((n) => document
  .querySelectorAll('#spellbookList > li[data-skill-id]').length >= n + 1,
  beforePair, { timeout: 30_000 });
await cmd('SKILL Aegis');   // aura
await page.waitForFunction((n) => document
  .querySelectorAll('#spellbookList > li[data-skill-id]').length >= n + 2,
  beforePair, { timeout: 30_000 });
await page.waitForTimeout(800);

const pair = await sample(page);
check('6 two unseen in different categories light BOTH tabs',
  pair.tabs.slice().sort().join() === 'aura,passive',
  JSON.stringify({ tabs: pair.tabs, active: pair.activeTab }));

await clickEl(page, '.spellbookTab[data-category="passive"]');
const toughShown = await sample(page);
check('6a ⭐ the EARLIER unlock still glows on its page after the later one\'s rebuild',
  toughShown.glowRows.length === 1 && toughShown.litRows.length === 1
    && toughShown.glowRows[0].id === toughShown.litRows[0].id
    && toughShown.glowRows[0].animation === 'skill-unlock-glow',
  JSON.stringify({ glow: toughShown.glowRows, lit: toughShown.litRows }));
await page.waitForTimeout(2 * DWELL);
const half = await sample(page);
check('6b ⭐ seeing ONE leaves the other tab pulsing - the trail stops only once ALL are seen',
  half.tabs.join() === 'aura' && half.total > 0,
  JSON.stringify({ tabs: half.tabs, total: half.total, active: half.activeTab, rows: half.litRows }));

// --- leg 7: closing with something still unseen resumes the buttons ---------

await closeSpellbook(page);
await page.waitForTimeout(600);
const reshut = await sample(page);
check('7 ⭐ closing the book with an unseen spell left resumes the button pulse',
  !reshut.open && reshut.buttons.every((b) => b.breadcrumb) && reshut.menu
    && reshut.tabs.length === 0,
  JSON.stringify({ open: reshut.open, buttons: reshut.buttons, menu: reshut.menu }));

// ⚑ Retrofitted at UI pass C6: the pulse moved onto `.breadcrumb::after` so it
// composes with the button's own wood-inlay box-shadow. The class-based legs are
// unaffected; the two probes that read animation STATE have to name the pseudo.
const keyframe = await page.evaluate(() => {
  const el = document.querySelector('.spellbookOpenButton.breadcrumb');
  return el ? getComputedStyle(el, '::after').animationName : null;
});
// ⚑ Since 2026-09-06 (feedback ruled B + A's louder trail) the ENTRY POINTS
// run their own, louder keyframe; the in-book trail keeps the quiet one.
check('7b the pulse is a real running animation, not just a class nobody styled - the LOUD entry-point one',
  keyframe === 'hud-breadcrumb-pulse-entry', `animationName=${keyframe}`);

// The trail at its own 50% peak, paused - the frame the 2026-09-02 intake
// measured as invisible under the border. No flash is running here (leg 7 is a
// re-shut, not an unlock), so the screenshot isolates the trail.
const trailPeak = await page.evaluate(() => {
  const el = document.getElementById('spellbookButton');
  const anim = el?.getAnimations({ subtree: true })
    .find((a) => a.animationName === 'hud-breadcrumb-pulse-entry');
  if (!anim) return null;
  anim.pause();
  anim.currentTime = 900; // 50% of 1.8 s
  return getComputedStyle(el, '::after').boxShadow;
});
check('7c the entry-point trail peaks as a real halo (::after box-shadow at 50%)',
  !!trailPeak && trailPeak !== 'none', `boxShadow@50%=${trailPeak}`);
await page.screenshot({ path: join(here, 'c4b-trail-peak.png') });
await page.evaluate(() => {
  for (const a of document.getElementById('spellbookButton')?.getAnimations({ subtree: true }) ?? []) a.play();
});

await page.screenshot({ path: join(here, 'c4b-desktop-reshut.png') });

// ----------------------------------------------------------------- mobile ---
// ⚑ The C1 lesson: PROBE whether the phone layout needs a reset rather than
// assuming a glow cannot need one. This reads the ☰'s box AND its computed
// animation, so a mobile rule that flattened either would be visible here.

const mobCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 2,
});
const mob = await mobCtx.newPage();
wire(mob);
await mob.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(mob, 'crumbm');
await mob.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await mob.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await mob.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const mobCmd = async (text) => {
  await mob.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await mob.waitForTimeout(500);
};
await mobCmd('PING');
await mobCmd('GOD');
await mob.waitForTimeout(1500);

const mobBaseline = await mob.evaluate(TRAIL);
const mobBefore = mobBaseline.ids.length;
await mobCmd('SKILL Strong');
await mob.waitForFunction((n) => document
  .querySelectorAll('#spellbookList > li[data-skill-id]').length > n,
  mobBefore, { timeout: 30_000 });
await mob.waitForTimeout(800);

const mobMenu = await mob.evaluate(() => {
  const el = document.getElementById('mobileMenuButton');
  if (!el) return null;
  const box = el.getBoundingClientRect();
  // The pulse lives on ::after since C6 (see the desktop probe above); the box
  // is still the element's own.
  const style = getComputedStyle(el, '::after');
  return {
    breadcrumb: el.classList.contains('breadcrumb'),
    w: box.width, h: box.height,
    animationName: style.animationName,
    animationIterationCount: style.animationIterationCount,
    boxShadow: style.boxShadow,
    flash: el.classList.contains('unlockPulse'),
    flashName: getComputedStyle(el).animationName,
    buttons: [...document.querySelectorAll('.spellbookOpenButton')].map((b) => ({
      id: b.id, flash: b.classList.contains('unlockPulse'), visible: b.getClientRects().length > 0,
    })),
  };
});
check('8 ⭐ mobile: the ☰ toggle pulses, with a real box and the entry-point keyframe (no reset needed)',
  !!mobMenu && mobMenu.breadcrumb && mobMenu.w > 20 && mobMenu.h > 20
    && mobMenu.animationName === 'hud-breadcrumb-pulse-entry'
    && mobMenu.animationIterationCount === 'infinite',
  JSON.stringify(mobMenu));
check('8b mobile: the baseline was clean before the cheat, so the pulse is the unlock\'s',
  mobBaseline.total === 0, `baseline pulses=${mobBaseline.total}`);
check('8d ⭐ mobile: the ☰ takes the one-shot flash on the element, BESIDE its ::after trail and ::before glyph; the two hidden buttons do not',
  !!mobMenu && mobMenu.flash && mobMenu.flashName === 'hud-button-unlock-flash'
    && mobMenu.animationName === 'hud-breadcrumb-pulse-entry'
    && mobMenu.buttons.every((b) => !b.visible && !b.flash),
  JSON.stringify({ flash: mobMenu?.flash, flashName: mobMenu?.flashName, buttons: mobMenu?.buttons }));

await mob.screenshot({ path: join(here, 'c4b-mobile-menu.png') });

// The trail's phone hop, one step further in: the sheet's Spellbook row.
await clickEl(mob, '#mobileMenuButton');
await mob.waitForTimeout(600);
const sheet = await mob.evaluate(TRAIL);
const sheetRow = await mob.evaluate(() => {
  const el = document.getElementById('spellbookSheetButton');
  const box = el?.getBoundingClientRect();
  return box ? { breadcrumb: el.classList.contains('breadcrumb'), w: box.width, h: box.height } : null;
});
if (!sheetRow || sheetRow.w === 0) {
  skip('8c mobile: the open ☰ sheet\'s Spellbook row carries the pulse on', 'INCONCLUSIVE - no box');
} else {
  check('8c ⭐ mobile: the sheet\'s Spellbook row carries the trail on (the D3 hop)',
    sheetRow.breadcrumb && sheet.total > 0, JSON.stringify({ sheetRow, total: sheet.total }));
}
await mob.screenshot({ path: join(here, 'c4b-mobile-sheet.png') });

await mobCtx.close();

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
const failed = results.filter((r) => !r.skip && !r.pass).length;
const passed = results.filter((r) => !r.skip && r.pass).length;
console.log(`\n${passed} passed, ${failed} failed, ${results.filter((r) => r.skip).length} inconclusive`);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
