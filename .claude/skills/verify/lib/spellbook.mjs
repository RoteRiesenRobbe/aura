// The open-the-book step (plan-ui-pass.md C3).
//
// Until C3 the spellbook was always on screen, so ~30 scripts click its rows
// with real mouse input at a boundingBox and never had to ask whether the panel
// was up. It is a closable, tabbed, paged panel now: the rows stay in the DOM
// (every page.evaluate query still works untouched), but a hidden row has NO
// BOX - `rows[i].boundingBox()` returns null and the next line throws.
//
// So: one helper, imported wherever a script needs to touch a row for real,
// rather than thirty hand-written variants of the same three steps.
//
//   import { showSkillRow } from './lib/spellbook.mjs';
//   await showSkillRow(page, /Charm Beast/i);   // then click as before
//
// ⚑ B is a raw window keydown (Controls.handleFunctionKeys), NOT one of the
// rAF-sampled slot hotkeys - a normal press is enough, no 1.3 s hold.

const PANEL_OPEN = () => !document.getElementById('spellbook')?.classList.contains('hidden');

/** Press B unless the book is already open. Returns whether it ended up open. */
export async function openSpellbook(page) {
  if (await page.evaluate(PANEL_OPEN)) {
    return true;
  }
  // Focus parked on <body>: a control that still holds it can swallow the
  // keydown, which reads exactly like a hotkey that was never wired.
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('KeyB');
  await page.waitForSelector('#spellbook:not(.hidden)', { timeout: 10_000 }).catch(() => {});
  return page.evaluate(PANEL_OPEN);
}

/** Press B only if it is open. */
export async function closeSpellbook(page) {
  if (!(await page.evaluate(PANEL_OPEN))) {
    return true;
  }
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('KeyB');
  await page.waitForSelector('#spellbook.hidden', { timeout: 10_000 }).catch(() => {});
  return !(await page.evaluate(PANEL_OPEN));
}

const clickCentre = async (page, selector) => {
  const box = await page.locator(selector).first().boundingBox().catch(() => null);
  if (!box) return false;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(250);
  return true;
};

/**
 * Make one skill's row clickable: open the book, switch to the row's own
 * category tab, and page forward until the row is on the visible page.
 *
 * `match` is a skill id (number or numeric string) or a RegExp / string tested
 * against the row's text. Returns true when the row ended up with a box.
 */
export async function showSkillRow(page, match) {
  if (!(await openSpellbook(page))) {
    return false;
  }

  const isRegex = match instanceof RegExp;
  const needle = isRegex ? match.source : String(match);
  const category = await page.evaluate(({ needle, isRegex }) => {
    const rows = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')];
    const re = isRegex ? new RegExp(needle, 'i') : null;
    const row = rows.find((r) => (re ? re.test(r.textContent) : r.dataset.skillId === needle));
    return row ? row.dataset.category : null;
  }, { needle, isRegex });
  if (!category) {
    return false; // the skill is not in the book at all - the caller's problem
  }

  await clickCentre(page, `.spellbookTab[data-category="${category}"]`);

  const onPage = () => page.evaluate(({ needle, isRegex }) => {
    const rows = [...document.querySelectorAll('#spellbookList > li[data-skill-id]')];
    const re = isRegex ? new RegExp(needle, 'i') : null;
    const row = rows.find((r) => (re ? re.test(r.textContent) : r.dataset.skillId === needle));
    return !!row && !row.classList.contains('offPage');
  }, { needle, isRegex });

  // Bounded: a page step that changes nothing would otherwise spin forever.
  for (let step = 0; step < 20; step++) {
    if (await onPage()) return true;
    if (!(await clickCentre(page, '.spellbookPageStep[data-step="1"]'))) return false;
  }
  return onPage();
}

/**
 * The same, for the suite's other idiom: a script that already holds the row's
 * INDEX in `#spellbookList li` (from its own findIndex) and is about to take a
 * boundingBox off it. Index order is unaffected by the filtering - hidden rows
 * stay in the list - so the caller's index keeps pointing at the same row.
 */
export async function showSkillRowAt(page, index) {
  if (!(index >= 0) || !(await openSpellbook(page))) {
    return false;
  }
  const id = await page.evaluate((i) => {
    const row = document.querySelectorAll('#spellbookList > li')[i];
    return row?.dataset.skillId ?? null;
  }, index);
  return id === null ? false : showSkillRow(page, id);
}
