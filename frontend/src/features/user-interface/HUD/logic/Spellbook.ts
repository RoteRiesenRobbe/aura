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
 *
 * Since C4b this file also owns the UNSEEN SET behind the breadcrumb trail. It
 * lives here because the trail's whole question - where is the reader, and how
 * do they get from there to the new spell - is answered by the visibility, tab
 * and page state above, and nowhere else.
 */

import {playCssAnimation} from '../../../common/logic/Utils';
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

/**
 * How long a page has to stand open before the unseen rows on it count as read
 * (C4b, D2). ⚑ PLACEHOLDER, like PAGE_SIZE above - an example for thinking.
 *
 * ⚑ It is spent on a WALL-CLOCK setTimeout and must stay one: a hidden or
 * backgrounded page throttles rAF to ~6 fps ([[project-input-jitter]]), so a
 * frame-counted dwell would flake every headless leg by construction.
 */
export const SEEN_DWELL_MS = 500;

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

// The breadcrumb trail's memory (C4b): skill ids discovered THIS SESSION that
// the player has not looked at yet. Ids are the row's own `data-skillId`
// strings, so the module stays catalog-free. Session-only by ruling D1 - a
// reload starts with an empty set, and the join baseline never enters it
// because HUD.ts only ever calls noteUnlocked from its post-baseline diff.
const unseen = new Set<string>();
let dwellTimer: ReturnType<typeof setTimeout> | undefined;

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

/**
 * HUD.updateSpellbook found these ids in its post-baseline diff - the same diff
 * that stamps `.unlocked` on the row. Recording only, deliberately: it is
 * called mid-rebuild, before every row exists, and the `Spellbook.refresh()`
 * that closes updateSpellbook is what renders the trail.
 */
export function noteUnlocked(ids: number[]) {
    for (const id of ids) {
        unseen.add(String(id));
    }
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

    applyTrail(entries, inTab, onPage);
}

/**
 * The breadcrumb trail (C4b): while anything is unseen, one light pulse marks
 * the single next step from wherever the reader is - the open buttons and the
 * ☰ while the book is shut (D3), then the category tab, then the pager, then
 * the row itself. Everything here is a `toggle` against the state as it stands
 * this render, so the trail moves and clears without any bookkeeping of its
 * own, and a family close mid-dwell needs no special case.
 */
function applyTrail(entries: HTMLElement[], inTab: HTMLElement[], onPage: Set<HTMLElement>) {
    // Any re-render re-arms the dwell from scratch: flipping a page before it
    // fires must not credit the page being left.
    if (dwellTimer !== undefined) {
        clearTimeout(dwellTimer);
        dwellTimer = undefined;
    }

    // Self-healing against ids that no longer have a row (a reroll can do it),
    // but ⚑ NEVER against an empty list: updateSpellbook clears #spellbookList
    // before it refills it, and a prune in that window would wipe the whole set
    // for reasons that have nothing to do with what the player has read.
    if (unseen.size > 0 && entries.length > 0) {
        const present = new Set(entries.map((entry) => entry.dataset.skillId));
        for (const id of unseen) {
            if (!present.has(id)) {
                unseen.delete(id);
            }
        }
    }

    const trailing = unseen.size > 0;

    // Both open buttons plus the ☰ toggle, which is the phone's extra hop: the
    // sheet's Spellbook row is invisible until the sheet itself is open (D3).
    for (const button of document.querySelectorAll('.spellbookOpenButton')) {
        button.classList.toggle('breadcrumb', trailing && !open);
    }
    const menuButton = document.getElementById('mobileMenuButton');
    if (menuButton) {
        menuButton.classList.toggle('breadcrumb', trailing && !open);
    }

    const unseenCategories = new Set(entries
        .filter((entry) => unseen.has(entry.dataset.skillId))
        .map((entry) => entry.dataset.category));
    for (const element of tabElements) {
        // The active tab never pulses - the trail continues inside it instead.
        element.classList.toggle('breadcrumb', open
            && element.dataset.category !== tab
            && unseenCategories.has(element.dataset.category));
    }

    // Which way to walk, from the page the reader is on. Both steps can pulse
    // at once, and the index is taken within the TAB's list - `entries` would
    // count the other categories' rows into the page arithmetic.
    let back = false;
    let forward = false;
    for (let i = 0; i < inTab.length; i++) {
        if (!unseen.has(inTab[i].dataset.skillId)) {
            continue;
        }
        const where = Math.floor(i / PAGE_SIZE);
        if (where < page) {
            back = true;
        } else if (where > page) {
            forward = true;
        }
    }
    for (const step of panelElement.querySelectorAll('.spellbookPageStep')) {
        const delta = Number((step as HTMLElement).dataset.step);
        step.classList.toggle('breadcrumb', open && (delta < 0 ? back : forward));
    }

    const arrived: string[] = [];
    for (const row of entries) {
        const lit = open && onPage.has(row) && unseen.has(row.dataset.skillId);
        if (lit) {
            arrived.push(row.dataset.skillId);
            // The row's own GLOW, the one-shot that says "here it is": PLAYED
            // when an unseen row comes on screen, never stamped (feedback
            // 2026-09-06). A stamped class carrying a CSS animation replays
            // on every display toggle - tab, page, reopen - for as long as it
            // sits on the row, seen or not, and HUD's tick diff only ever
            // stamped the LATEST unlock. playCssAnimation strips the class at
            // the animation's end, or at its cancel when hiding the row ends
            // it early, so nothing outlives the display; the dwell marking
            // the row seen makes `lit` false, so nothing replays. ⚑ The
            // guard is what makes it once-per-display: a re-render while the
            // row stays on screen must not restart a glow in flight.
            if (!row.classList.contains('unlocked')) {
                playCssAnimation(row, 'unlocked');
            }
        }
        // ⚑ AFTER the glow, not before: `li.unlocked.breadcrumb::after` runs no
        // animation (C6 D4, the glow alone), and the helper forces a style
        // recalc - toggling `breadcrumb` first would give the trail one frame
        // in which to be created and then cancelled under `unlocked`.
        row.classList.toggle('breadcrumb', lit);
    }
    if (arrived.length > 0) {
        // One timer for everything unseen on the displayed page: they are all
        // in front of the same pair of eyes for the same length of time.
        dwellTimer = setTimeout(() => {
            dwellTimer = undefined;
            for (const id of arrived) {
                unseen.delete(id);
            }
            render();
        }, SEEN_DWELL_MS);
    }
}
