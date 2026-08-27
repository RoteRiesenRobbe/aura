/**
 * The spellbook panel's STRUCTURE (plan-ui-pass.md C3): it is a panel you open
 * and close now, with a tab per category and pages inside a tab. What the rows
 * SAY, and every interaction on them (spend, unspend, click-to-equip), stays in
 * HUD.ts - this file owns visibility, the tab, the page, and nothing else.
 *
 * Five rules worth knowing before editing:
 *
 *   · ⚑ THE LIST STAYS IN THE DOM. Open/close toggles a class on the panel and
 *     filtering marks rows `offPage`; nothing is ever removed. 32 verify
 *     scripts query `#spellbookList` through `page.evaluate` with no idea the
 *     book has a state at all, and they keep working because of this rule.
 *     Anything that "cleans up" by dropping rows breaks them silently.
 *   · ⚑ `pointerdown`, never `click` - MouseManager preventDefaults `mousedown`
 *     on the document element, which suppresses the synthetic click (see
 *     Journal.ts).
 *   · ⚑ EVERY path that opens the panel notifies PanelExclusivity, which shuts
 *     the rest of the family (C2, D1); `close()` is a no-op when the panel is
 *     already shut, because the registry calls it on every family open.
 *   · ⚑ CATALOG-FREE by design: HUD.ts stamps each row with `data-category`
 *     when it builds it, so this file never asks Skills.ts anything. That is
 *     what lets the whole module run under a plain jsdom fixture.
 *   · ⚑ The tab and the page survive the per-tick rebuild, exactly like
 *     `selectedSkillId` next door: `refresh()` re-applies them to the freshly
 *     built rows. The page index is CLAMPED rather than remembered blindly (a
 *     shorter list must not leave the reader on a page that no longer exists),
 *     and an unlock never flips the page - it lands where it lands.
 */

import * as PanelExclusivity from '../../logic/PanelExclusivity';

/** The three shipped categories, in tab order. Utility is deferred (D3). */
const TABS = ['aura', 'passive', 'cooldown'] as const;
type SpellbookTab = typeof TABS[number];

/**
 * Entries per page. ⚑ PLACEHOLDER (D2) - like every number in this project it
 * is an example for thinking, not a decision.
 */
export const PAGE_SIZE = 8;

/** How many pages `count` entries fill. An empty book still has one page. */
export function pageCount(count: number): number {
    return Math.max(1, Math.ceil(count / PAGE_SIZE));
}

/** Hold a page index inside the list it indexes - the list moves under it. */
export function clampPage(page: number, count: number): number {
    return Math.min(Math.max(page, 0), pageCount(count) - 1);
}

let panelElement: HTMLElement;
let listElement: HTMLElement;
let pagerElement: HTMLElement;
let pageLabelElement: HTMLElement;
let tabElements: HTMLElement[] = [];

let open = false;
let tab: SpellbookTab = 'aura';
let page = 0;
// ⚑ The listeners below are closures, so the DOM cannot de-duplicate them the
// way it does Journal's named `toggle`: a second setup() would bind them twice
// and one click on the pager would then flip two pages. HUD.setup() runs once
// per page load today (leaving the world reloads it), but backlog §52 is a live
// plan to change exactly that, so the guard is cheaper than the bug.
let wired = false;

export function setup() {
    panelElement = document.getElementById('spellbook');
    if (!panelElement) {
        return;
    }
    listElement = document.getElementById('spellbookList');
    pagerElement = document.getElementById('spellbookPager');
    pageLabelElement = document.getElementById('spellbookPageLabel');
    tabElements = [...panelElement.querySelectorAll('.spellbookTab')] as HTMLElement[];

    if (!wired) {
        wired = true;

        for (const element of tabElements) {
            element.addEventListener('pointerdown', () => selectTab(element.dataset.category as SpellbookTab));
        }

        for (const step of panelElement.querySelectorAll('.spellbookPageStep')) {
            step.addEventListener('pointerdown',
                () => flipPage(Number((step as HTMLElement).dataset.step)));
        }

        // Two of them, one per layout: the desktop button under the map and the
        // ☰ sheet's row (D4). They share a class rather than being wired one by
        // one, so a third entry point is markup only.
        for (const button of document.querySelectorAll('.spellbookOpenButton')) {
            button.addEventListener('pointerdown', toggle);
        }

        PanelExclusivity.register('spellbook', close);
    }

    render();
}

/** B, the desktop button, and the sheet's Spellbook row. */
export function toggle() {
    if (!panelElement) {
        return;
    }
    open = !open;
    if (open) {
        PanelExclusivity.notifyOpened('spellbook');
    }
    render();
}

/** Escape, the registry, and a second B. A no-op when already shut. */
export function close() {
    if (!open) {
        return;
    }
    open = false;
    render();
}

export function isOpen(): boolean {
    return open;
}

/** HUD.updateSpellbook rebuilt the rows: re-apply the tab and the page. */
export function refresh() {
    if (!panelElement) {
        return;
    }
    render();
}

function selectTab(next: SpellbookTab) {
    if (!next || next === tab) {
        return;
    }
    tab = next;
    // A fresh tab starts at its own beginning: carrying page 3 into a category
    // with two pages would land on a clamped page nobody asked for.
    page = 0;
    render();
}

function flipPage(step: number) {
    if (!step) {
        return;
    }
    // No clamp here - render() clamps against the list as it actually stands,
    // which is the only count that can be trusted after a rebuild.
    page += step;
    render();
}

function render() {
    panelElement.classList.toggle('hidden', !open);

    const rows = [...listElement.children] as HTMLElement[];
    const entries = rows.filter((row) => row.dataset.skillId !== undefined);

    // An empty category hides its tab, and one that empties under the reader
    // hands the book to a category that still has something in it - the same
    // zero-hint policy the section headers had before the tabs existed.
    const counts = new Map<string, number>();
    for (const entry of entries) {
        counts.set(entry.dataset.category, (counts.get(entry.dataset.category) ?? 0) + 1);
    }
    if (!counts.has(tab)) {
        tab = TABS.find((candidate) => counts.has(candidate)) ?? tab;
    }
    for (const element of tabElements) {
        element.classList.toggle('hidden', !counts.has(element.dataset.category));
        element.classList.toggle('active', element.dataset.category === tab);
    }

    const inTab = entries.filter((entry) => entry.dataset.category === tab);
    page = clampPage(page, inTab.length);
    const onPage = new Set(inTab.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
    // The category headers go with their rows: the tab above the list says the
    // same word, and a band repeating it would be the one thing on screen the
    // tabs made redundant. They stay in the DOM (the harness rule) as the rows
    // do - `chunk4-persistence` reads the whole list and knows about them.
    for (const row of rows) {
        row.classList.toggle('offPage', !onPage.has(row));
    }

    const pages = pageCount(inTab.length);
    pagerElement.classList.toggle('hidden', pages <= 1);
    pageLabelElement.textContent = `${page + 1} / ${pages}`;
    for (const step of panelElement.querySelectorAll('.spellbookPageStep')) {
        const delta = Number((step as HTMLElement).dataset.step);
        step.classList.toggle('inactive', clampPage(page + delta, inTab.length) === page);
    }
}
