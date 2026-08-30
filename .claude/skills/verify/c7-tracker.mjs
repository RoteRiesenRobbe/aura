#!/usr/bin/env node
// UI pass C7 - the quest tracker consolidation (plan-ui-pass.md §5 C7, D2/D3/D4).
//
// Boundary: this script owns the TRACKER's shape - the one plain scrim, the
// absence of per-quest boxes, left alignment, the scroll at overflow, the
// hidden scrim at zero quests, and that an entry opens the journal turned to
// the quest that was clicked. It owns nothing about the journal's own interior
// (chunkC3-journal), nothing about quest CONTENT (chunkC4-quests, c1/c2-kill-
// quests), and it never asserts how many quests exist: it accepts the ids it
// needs by cheat and reads their titles out of the /quests catalog.
//
// Why the legs are shaped the way they are:
//
//   · "no per-quest boxes" is read as COMPUTED STYLE, not as DOM structure: the
//     list still renders one <li> per quest (the C7 consolidation was CSS-only),
//     so the claim that survives a re-render is that the li paints no background
//     and no border while the ul around it does - one scrim, N quests.
//   · left alignment is measured with a Range over the title's own text node.
//     The title div is block-level and fills the scrim whichever way its text is
//     aligned, so its element rect would pass either way.
//   · the click leg uses the SECOND quest deliberately. The journal's own
//     fallback selects the first running quest, so a click that opened the
//     panel while ignoring its argument would still look right on the first row.
//
// ⚑ Restart the server first and run this alone (the shared-world rule), and
// ⚑ hide #developPanel after joining: it covers the right-hand side of the
// screen, which is exactly where the tracker lives - a row click would land on
// the dev table with no error at all.
//
// Usage: node .claude/skills/verify/c7-tracker.mjs [label] [url]
import { createRequire } from 'node:module';
import { join } from 'node:path';

const workdir = process.env.AURA_RUN_DIR || join(process.env.HOME, '.cache/aurahunter-run');
const require = createRequire(join(workdir, 'noop.js'));
const { chromium } = require('playwright');
import { joinAsNewCharacter } from './lib/join.mjs';

const label = process.argv[2] || 'run';
const url = process.argv[3] || 'http://localhost:2000/?token=plz&wsUrl=ws://localhost:2000/game&develop';
const libDir = join(workdir, 'libs/usr/lib/x86_64-linux-gnu');
const env = { ...process.env, LD_LIBRARY_PATH: [libDir, join(libDir, 'nss'), process.env.LD_LIBRARY_PATH || ''].join(':') };

// Two quests for the shape legs, a longer list for the overflow leg. Ids only -
// the titles come from the catalog, so re-titling content cannot redden this.
const PAIR = ['wolves-on-the-road', 'boars-in-the-field'];
const MANY = [
  'wolves-on-the-road', 'boars-in-the-field', 'kobolds-on-the-road',
  'dire-wolves-in-the-forest', 'bears-at-the-walls', 'spiders-in-the-diggings',
  'bandits-at-the-shrine', 'dire-wolves-at-the-camp', 'alpha-wolves-at-the-village',
];

const browser = await chromium.launch({ args: ['--no-sandbox'], env });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const results = [];
const check = (name, pass, detail) => results.push({ check: name, pass, detail });
const skip = (name, detail) => results.push({ check: name, skip: true, detail });

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await joinAsNewCharacter(page, 'tracker');
await page.waitForFunction(() => !!window.game?.character, null, { timeout: 120_000 });
await page.waitForSelector('#console_command', { state: 'attached', timeout: 60_000 });
await page.evaluate(() => { const p = document.getElementById('developPanel'); if (p) p.style.display = 'none'; });

const cmd = async (text) => {
  await page.evaluate((t) => {
    const input = document.getElementById('console_command');
    input.value = t;
    document.getElementById('console').dispatchEvent(new Event('submit', { cancelable: true }));
  }, text);
  await page.waitForTimeout(900);
};

// One sample of everything the shape legs assert, read in a single evaluate so
// the world cannot move between two reads of the same moment.
const tracker = () => page.evaluate(() => {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const textBox = (el) => {
    if (!el || !el.firstChild) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return { x: r.x, right: r.right, w: r.width };
  };
  const list = document.getElementById('questTrackerList');
  if (!list) return null;
  const cs = getComputedStyle(list);
  const painted = (el) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    const transparent = bg === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(bg);
    return {
      background: bg,
      paints: !transparent,
      borderWidths: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].join(' '),
      hasBorder: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth]
        .some((w) => parseFloat(w) > 0) && s.borderTopStyle !== 'none',
    };
  };
  return {
    hidden: list.classList.contains('hidden'),
    visible: list.offsetParent !== null,
    listBox: box(list),
    listPaddingLeft: parseFloat(cs.paddingLeft),
    scrollHeight: list.scrollHeight,
    clientHeight: list.clientHeight,
    overflows: list.scrollHeight > list.clientHeight + 2,
    scrollable: cs.overflowY === 'auto' || cs.overflowY === 'scroll',
    listPaint: painted(list),
    // Everything inside the tracker's content area that paints a background:
    // the D2/D3 claim is that this is exactly ONE element, the scrim itself.
    paintedInContent: [list, ...list.querySelectorAll('*')].filter((el) => painted(el).paints).length,
    quests: [...list.querySelectorAll('.questTrackerQuest')].map((li) => {
      const title = li.querySelector('.questTrackerTitle');
      const line = li.querySelector('.questTrackerLine');
      const s = getComputedStyle(li);
      return {
        title: title?.textContent ?? '',
        line: line?.textContent ?? '',
        textAlign: s.textAlign,
        paint: painted(li),
        box: box(li),
        titleTextBox: textBox(title),
        titleColor: title ? getComputedStyle(title).color : '',
        lineColor: line ? getComputedStyle(line).color : '',
      };
    }),
    journalButtonVisible: document.getElementById('questTrackerJournal')?.offsetParent !== null,
  };
});

const journal = () => page.evaluate(() => {
  const panel = document.getElementById('journal');
  if (!panel) return null;
  return {
    open: !panel.classList.contains('hidden'),
    detailTitle: panel.querySelector('.journalDetailTitle')?.textContent ?? '',
  };
});

const waitForTracker = async (predicate, timeout = 20_000) => {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    last = await tracker();
    if (last && predicate(last)) return last;
    await page.waitForTimeout(500);
  }
  return last;
};

await cmd('PING'); // the first command after joining is dropped (harness note)
await cmd('GOD');  // this run stands still for a while; a dead player nulls the scene graph

const catalog = await page.evaluate(async () => {
  try {
    const res = await fetch(new URL('/quests', window.location.origin).toString());
    return { ok: res.ok, body: await res.json() };
  } catch (e) {
    return { ok: false, body: String(e) };
  }
});
const titleOf = (id) => (Array.isArray(catalog.body) ? catalog.body.find((q) => q.id === id)?.title : null) ?? null;

// --- leg 1: zero quests, no scrim -------------------------------------------
// A fresh character carries an empty ledger, so this is the state the run
// starts in - and the tracker's footprint over live play at that point is the
// J button and nothing else (the plan's "zero running quests hides the scrim
// wholesale").

const empty = await tracker();
check('a fresh character shows the J button and NO scrim (zero quests)',
  empty !== null && empty.hidden === true && empty.visible === false && empty.journalButtonVisible === true,
  `hidden=${empty?.hidden}, visible=${empty?.visible}, journalButton=${empty?.journalButtonVisible}`);

// --- leg 2: N quests, ONE scrim, no per-quest boxes -------------------------

const pairTitles = PAIR.map(titleOf);
if (pairTitles.some((t) => t === null)) {
  skip('the tracker lists the accepted quests',
    `INCONCLUSIVE - the catalog does not carry ${PAIR.join(', ')} (got ${JSON.stringify(pairTitles)})`);
} else {
  for (const id of PAIR) await cmd(`QUEST ACCEPT ${id}`);
  const two = await waitForTracker((t) => t.quests.length >= PAIR.length);

  check('the scrim appears and lists one entry per running quest',
    two !== null && two.hidden === false && two.quests.length === PAIR.length
    && pairTitles.every((t) => two.quests.some((q) => q.title === t)),
    `hidden=${two?.hidden}, entries ${JSON.stringify(two?.quests.map((q) => q.title))}`);

  check('each entry is a title over ONE objective line with the "- " prefix',
    two !== null && two.quests.length > 0
    && two.quests.every((q) => q.title.length > 0 && q.line.length > 0),
    JSON.stringify(two?.quests.map((q) => ({ title: q.title, line: q.line }))));

  // D2/D3: ONE scrim around all of them. Read as paint, not as markup - the
  // list still has one li per quest, and what changed is that the li paints
  // nothing while the ul paints the scrim.
  check('⭐ ONE scrim wraps every quest - the entries themselves are BOXLESS (D2/D3)',
    two !== null
    && two.listPaint.paints === true
    && two.quests.every((q) => q.paint.paints === false && q.paint.hasBorder === false)
    && two.paintedInContent === 1,
    `scrim ${two?.listPaint.background}; painted elements in the content area: ${two?.paintedInContent}; `
    + `entries ${JSON.stringify(two?.quests.map((q) => ({ bg: q.paint.background, border: q.paint.borderWidths })))}`);

  // D3 again, the other half: plain, not ink. The ink family carries a 3px
  // solid border plus the wood inlay; the scrim must carry neither.
  check('the scrim is PLAIN, not the ink panel chrome (D3)',
    two !== null && two.listPaint.hasBorder === false,
    `border widths "${two?.listPaint.borderWidths}"`);

  // Left alignment (the ruled flip from today's right alignment), measured on
  // the title's own text run rather than on its full-width element box.
  const alignment = two?.quests.map((q) => ({
    title: q.title,
    textAlign: q.textAlign,
    fromLeft: q.titleTextBox && q.box ? Math.round(q.titleTextBox.x - q.box.x) : null,
    fromRight: q.titleTextBox && q.box ? Math.round(q.box.right - q.titleTextBox.right) : null,
  })) ?? [];
  check('the text is LEFT aligned (today\'s right alignment flips)',
    alignment.length > 0
    && alignment.every((a) => a.textAlign === 'left' && a.fromLeft !== null && a.fromLeft <= 2 && a.fromRight > 2),
    JSON.stringify(alignment));

  // D4: the gold is per-quest. Read as "the title is not the line's colour and
  // is the gold token", never as a hardcoded hue anywhere else.
  const GOLD = 'rgb(255, 215, 94)'; // @gold-levelup #ffd75e
  check('each quest carries its own small GOLD title (D4)',
    two !== null && two.quests.length > 0
    && two.quests.every((q) => q.titleColor === GOLD && q.lineColor !== q.titleColor),
    JSON.stringify(two?.quests.map((q) => ({ title: q.titleColor, line: q.lineColor }))));

  // --- leg 3: a row click opens the journal AT that quest --------------------
  // The second entry, deliberately: the journal's own fallback selects the
  // first running quest, so a click that opened the panel while dropping its
  // argument would still look correct on the first row.
  const target = two?.quests[1];
  if (!target) {
    skip('clicking an entry opens the journal at THAT quest', 'INCONCLUSIVE - fewer than two entries rendered');
  } else {
    if ((await journal())?.open) {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(600);
    }
    await page.mouse.click(target.box.x + target.box.w / 2, target.box.y + target.box.h / 2);
    await page.waitForTimeout(900);
    const j = await journal();
    check('clicking an entry opens the journal at THAT quest',
      j?.open === true && j?.detailTitle === target.title,
      `clicked "${target.title}" → journal open=${j?.open}, detail "${j?.detailTitle}"`);
    await page.screenshot({ path: `.claude/skills/verify/c7-tracker-${label}-journal.png` });
    if ((await journal())?.open) {
      await page.keyboard.press('KeyJ');
      await page.waitForTimeout(600);
    }
  }

  await page.screenshot({ path: `.claude/skills/verify/c7-tracker-${label}-two.png` });
}

// --- leg 4: it scrolls rather than growing past its cap ----------------------
// The plan default: the scrim grows with content up to today's max-height cap
// and scrolls beyond it. Tri-state - if the accepted quests do not fill the
// cap, the run has not reached the case and says so.

const capBefore = await tracker();
for (const id of MANY) await cmd(`QUEST ACCEPT ${id}`);
const many = await waitForTracker((t) => t.quests.length > (capBefore?.quests.length ?? 0));
const trackerBox = await page.evaluate(() => {
  const el = document.getElementById('questTracker');
  const r = el.getBoundingClientRect();
  return { bottom: r.bottom, cap: parseFloat(getComputedStyle(el).maxHeight) };
});

if (!many || !many.overflows) {
  skip('the scrim scrolls once it hits its height cap',
    `INCONCLUSIVE - ${many?.quests.length ?? 0} quests did not overflow the cap `
    + `(scrollHeight ${many?.scrollHeight} vs clientHeight ${many?.clientHeight})`);
} else {
  check('the scrim scrolls once it hits its height cap, rather than growing on',
    many.scrollable === true && many.overflows === true
    && many.listBox.bottom <= trackerBox.bottom + 1,
    `${many.quests.length} quests, scrollHeight ${many.scrollHeight} > clientHeight ${many.clientHeight}, `
    + `overflow-y auto=${many.scrollable}, list bottom ${Math.round(many.listBox.bottom)} `
    + `within tracker bottom ${Math.round(trackerBox.bottom)} (cap ${Math.round(trackerBox.cap)}px)`);
}
await page.screenshot({ path: `.claude/skills/verify/c7-tracker-${label}-full.png` });

// --- leg 5: back to zero, and the scrim goes away again ----------------------
// The hide is the LIST's own class, so it has to survive a ledger that empties
// after having been full - not only the fresh-character case leg 1 saw.

const running = await page.evaluate(() => [...document.querySelectorAll('#questTrackerList .questTrackerQuest')].length);
if (running === 0) {
  skip('abandoning every quest hides the scrim again', 'INCONCLUSIVE - nothing was running to abandon');
} else {
  for (const id of [...new Set([...PAIR, ...MANY])]) await cmd(`QUEST ABANDON ${id}`);
  const gone = await waitForTracker((t) => t.quests.length === 0);
  check('abandoning every quest hides the scrim again',
    gone !== null && gone.quests.length === 0 && gone.hidden === true && gone.visible === false,
    `entries ${gone?.quests.length}, hidden=${gone?.hidden}, visible=${gone?.visible}`);
}

const passed = results.filter((r) => !r.skip && r.pass).length;
const scored = results.filter((r) => !r.skip).length;

console.log('\nlabel :', label);
for (const r of results) console.log(`${r.skip ? 'SKIP' : r.pass ? 'PASS' : 'FAIL'}  ${r.check}\n        ${r.detail}`);
console.log(`\n${passed}/${scored} passed, ${results.filter((r) => r.skip).length} skipped`);
console.log('webgl ctx losses :', consoleErrors.filter((t) => t.includes('[webgl] world context lost')).length);
console.log('console errors   :', consoleErrors.length);
for (const e of consoleErrors.slice(0, 5)) console.log('   ·', e);

await browser.close();
process.exit(results.some((r) => !r.skip && !r.pass) ? 1 : 0);
