import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// The spellbook's structure (plan-ui-pass.md C3): the paging arithmetic, the
// tab derivation and the filter that hides everything off the current
// tab/page. The module is DOM-driven but catalog-free - HUD.ts stamps each row
// with its category - so a plain jsdom fixture is enough to drive all of it.
//
// ⚑ The load-bearing property under test is that filtering HIDES rows and
// never removes them: 32 verify scripts query #spellbookList directly.

let spellbook: typeof import('./Spellbook');

// The markup HUD.html ships, minus everything the filter does not read.
function fixture(rows: { id: number, category: string }[]) {
    document.body.innerHTML = `
        <div id="mobileMenuButton"></div>
        <div id="spellbookButton" class="spellbookOpenButton"></div>
        <div id="spellbookSheetButton" class="spellbookOpenButton"></div>
        <div id="spellbook" class="hidden">
            <ul id="spellbookTabs">
                <li class="spellbookTab" data-category="aura">Auras</li>
                <li class="spellbookTab" data-category="passive">Passives</li>
                <li class="spellbookTab" data-category="cooldown">Cooldowns</li>
            </ul>
            <div id="spellbookScroll"><ul id="spellbookList"></ul></div>
            <div id="spellbookPager">
                <span class="spellbookPageStep" data-step="-1">&lsaquo;</span>
                <span id="spellbookPageLabel"></span>
                <span class="spellbookPageStep" data-step="1">&rsaquo;</span>
            </div>
        </div>`;
    setRows(rows);
}

// The per-tick rebuild: updateSpellbook throws the list away and re-creates it.
function setRows(rows: { id: number, category: string }[]) {
    const list = document.getElementById('spellbookList');
    list.innerHTML = '';
    let category = '';
    for (const row of rows) {
        if (row.category !== category) {
            category = row.category;
            const header = document.createElement('li');
            header.className = 'sectionHeader';
            header.textContent = category;
            list.appendChild(header);
        }
        const li = document.createElement('li');
        li.dataset.skillId = String(row.id);
        li.dataset.category = row.category;
        list.appendChild(li);
    }
}

function many(category: string, count: number, from = 1) {
    return Array.from({length: count}, (_, i) => ({id: from + i, category}));
}

const shown = () => [...document.querySelectorAll('#spellbookList > li')]
    .filter((li) => !li.classList.contains('offPage'))
    .map((li) => (li as HTMLElement).dataset.skillId);

const tabState = () => [...document.querySelectorAll('.spellbookTab')]
    .map((t) => `${(t as HTMLElement).dataset.category}:${t.classList.contains('hidden') ? 'off' : 'on'}` +
        (t.classList.contains('active') ? '*' : ''));

const press = (selector: string) =>
    document.querySelector(selector).dispatchEvent(new Event('pointerdown', {bubbles: true}));

beforeEach(async () => {
    // Module-level state (open/tab/page), so every test gets a fresh copy:
    // the PanelExclusivity.test.ts discipline, for the same reason.
    vi.resetModules();
    spellbook = await import('./Spellbook');
});

describe('page arithmetic', () => {
    it('fills one page per PAGE_SIZE entries, and never reports zero pages', () => {
        expect(spellbook.pageCount(0)).toBe(1);
        expect(spellbook.pageCount(1)).toBe(1);
        expect(spellbook.pageCount(spellbook.PAGE_SIZE)).toBe(1);
        expect(spellbook.pageCount(spellbook.PAGE_SIZE + 1)).toBe(2);
        expect(spellbook.pageCount(2 * spellbook.PAGE_SIZE)).toBe(2);
    });

    it('clamps a page index into the list it indexes', () => {
        expect(spellbook.clampPage(-3, 40)).toBe(0);
        expect(spellbook.clampPage(1, 40)).toBe(1);
        // The list shrank under the reader: the last page is all there is.
        expect(spellbook.clampPage(4, 9)).toBe(1);
        expect(spellbook.clampPage(2, 0)).toBe(0);
    });
});

describe('opening and closing', () => {
    beforeEach(() => fixture(many('aura', 2)));

    it('is closed until something opens it', () => {
        spellbook.setup();
        expect(spellbook.isOpen()).toBe(false);
        expect(document.getElementById('spellbook').classList.contains('hidden')).toBe(true);
    });

    it('toggles open and shut, and the open button opens it too', () => {
        spellbook.setup();
        spellbook.toggle();
        expect(spellbook.isOpen()).toBe(true);
        expect(document.getElementById('spellbook').classList.contains('hidden')).toBe(false);

        spellbook.toggle();
        expect(spellbook.isOpen()).toBe(false);

        press('#spellbookButton');
        expect(spellbook.isOpen()).toBe(true);
    });

    it('close is a no-op when the panel is already shut (the registry rule)', () => {
        spellbook.setup();
        expect(() => spellbook.close()).not.toThrow();
        expect(spellbook.isOpen()).toBe(false);

        spellbook.toggle();
        spellbook.close();
        expect(spellbook.isOpen()).toBe(false);
    });

    it('leaves every row in the DOM while shut - only the class moves', () => {
        spellbook.setup();
        expect(document.querySelectorAll('#spellbookList li[data-skill-id]').length).toBe(2);
    });
});

describe('tabs', () => {
    it('hides a category that has discovered nothing, and marks the active one', () => {
        fixture([...many('aura', 2), ...many('cooldown', 1, 50)]);
        spellbook.setup();
        expect(tabState()).toEqual(['aura:on*', 'passive:off', 'cooldown:on']);
    });

    it('shows only the active tab\'s rows, headers included in the hiding', () => {
        fixture([...many('aura', 2), ...many('cooldown', 1, 50)]);
        spellbook.setup();
        expect(shown()).toEqual(['1', '2']);

        press('.spellbookTab[data-category="cooldown"]');
        expect(shown()).toEqual(['50']);
        expect(tabState()).toEqual(['aura:on', 'passive:off', 'cooldown:on*']);
    });

    it('falls back to a category that still has entries when its own empties', () => {
        fixture([...many('aura', 2), ...many('cooldown', 1, 50)]);
        spellbook.setup();
        press('.spellbookTab[data-category="cooldown"]');
        expect(shown()).toEqual(['50']);

        // A respec cannot do this, but an ascension reroll can: the tab's
        // content is gone on the next tick.
        setRows(many('aura', 2));
        spellbook.refresh();
        expect(shown()).toEqual(['1', '2']);
        expect(tabState()).toEqual(['aura:on*', 'passive:off', 'cooldown:off']);
    });

    it('survives an empty spellbook - every tab hidden, nothing to show', () => {
        fixture([]);
        spellbook.setup();
        // The remembered tab keeps its marker while it is invisible: there is
        // no category to fall back to, and the first skill a peasant learns
        // then lands on a tab that is already the right one.
        expect(tabState()).toEqual(['aura:off*', 'passive:off', 'cooldown:off']);
        expect(shown()).toEqual([]);
    });
});

describe('pages', () => {
    it('shows one page of a long category and pages through the rest', () => {
        fixture(many('aura', spellbook.PAGE_SIZE + 3));
        spellbook.setup();
        expect(shown().length).toBe(spellbook.PAGE_SIZE);
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 2');

        press('.spellbookPageStep[data-step="1"]');
        expect(shown().length).toBe(3);
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('2 / 2');

        // The last page is the last page - a further step changes nothing.
        press('.spellbookPageStep[data-step="1"]');
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('2 / 2');

        press('.spellbookPageStep[data-step="-1"]');
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 2');
    });

    it('hides the pager when a single page holds the category', () => {
        fixture(many('aura', 3));
        spellbook.setup();
        expect(document.getElementById('spellbookPager').classList.contains('hidden')).toBe(true);
    });

    it('page count derives from DISCOVERED entries only', () => {
        fixture(many('aura', spellbook.PAGE_SIZE + 1));
        spellbook.setup();
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 2');

        setRows(many('aura', spellbook.PAGE_SIZE));
        spellbook.refresh();
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 1');
    });

    it('holds tab and page across a rebuild, and clamps when the list shrinks', () => {
        fixture([...many('aura', 2), ...many('cooldown', spellbook.PAGE_SIZE + 2, 50)]);
        spellbook.setup();
        press('.spellbookTab[data-category="cooldown"]');
        press('.spellbookPageStep[data-step="1"]');
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('2 / 2');

        // A per-tick rebuild with the same contents must not move the reader.
        setRows([...many('aura', 2), ...many('cooldown', spellbook.PAGE_SIZE + 2, 50)]);
        spellbook.refresh();
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('2 / 2');
        expect(shown().length).toBe(2);

        // ...but a shorter list pulls the page index back to what exists.
        setRows([...many('aura', 2), ...many('cooldown', 3, 50)]);
        spellbook.refresh();
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 1');
        expect(shown().length).toBe(3);
    });

    it('starts a freshly picked tab on its first page', () => {
        fixture([...many('aura', spellbook.PAGE_SIZE + 1), ...many('cooldown', 2, 50)]);
        spellbook.setup();
        press('.spellbookPageStep[data-step="1"]');
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('2 / 2');

        press('.spellbookTab[data-category="cooldown"]');
        press('.spellbookTab[data-category="aura"]');
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 2');
    });

    it('binds its controls once even if setup runs twice', () => {
        // Three pages, so a double-bound pager is visible: one click would flip
        // to 3 instead of 2. HUD.setup() runs once per load today, but the
        // listeners are closures the DOM cannot de-duplicate.
        fixture(many('aura', 2 * spellbook.PAGE_SIZE + 1));
        spellbook.setup();
        spellbook.setup();

        press('.spellbookPageStep[data-step="1"]');
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('2 / 3');
    });

    it('does not flip the page when a new skill is unlocked', () => {
        fixture(many('aura', spellbook.PAGE_SIZE + 1));
        spellbook.setup();
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 2');

        setRows(many('aura', spellbook.PAGE_SIZE + 2));
        spellbook.refresh();
        expect(document.getElementById('spellbookPageLabel').textContent).toBe('1 / 2');
    });
});

// The unlock breadcrumb trail (plan-ui-pass.md C4b): a lingering pulse that
// leads from wherever the reader is to a spell discovered THIS SESSION and not
// yet looked at. The trail is entirely derived in render(), so every one of
// these drives it the way the game does - noteUnlocked, then a refresh/open/
// tab/page change - and reads the classes back off the DOM.
//
// ⚑ The dwell is a wall-clock setTimeout (D2), never rAF, so fake timers can
// drive it. They are installed per test rather than globally: an armed timer
// surviving vi.resetModules() would fire into a dead module instance.
describe('the unlock breadcrumb trail', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    const marked = (selector: string) => [...document.querySelectorAll(selector)]
        .filter((element) => element.classList.contains('breadcrumb'));

    const buttonsPulse = () => marked('.spellbookOpenButton').length === 2
        && marked('#mobileMenuButton').length === 1;
    const anyPulse = () => marked('.breadcrumb, .spellbookOpenButton, #mobileMenuButton, ' +
        '.spellbookTab, .spellbookPageStep, #spellbookList > li').length;
    const pulsingTabs = () => marked('.spellbookTab')
        .map((t) => (t as HTMLElement).dataset.category);
    const pulsingSteps = () => marked('.spellbookPageStep')
        .map((s) => (s as HTMLElement).dataset.step);
    const pulsingRows = () => marked('#spellbookList > li')
        .map((r) => (r as HTMLElement).dataset.skillId);

    it('never pulses for the join baseline - nothing is unseen until noteUnlocked says so', () => {
        fixture([...many('aura', 2), ...many('passive', 2, 50)]);
        spellbook.setup();
        expect(anyPulse()).toBe(0);

        // A per-tick rebuild, an open and a tab change: still nothing (D4).
        spellbook.refresh();
        spellbook.toggle();
        press('.spellbookTab[data-category="passive"]');
        expect(anyPulse()).toBe(0);
    });

    it('pulses both open buttons and the ☰ toggle while the book is shut', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.setup();
        spellbook.noteUnlocked([50]);
        spellbook.refresh();

        expect(buttonsPulse()).toBe(true);
        // Nothing inside the shut book pulses - there is nobody to read it.
        expect(pulsingTabs()).toEqual([]);
        expect(pulsingRows()).toEqual([]);
    });

    it('noteUnlocked alone renders nothing - the refresh after it does', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.setup();
        spellbook.noteUnlocked([50]);
        expect(buttonsPulse()).toBe(false);
    });

    it('moves the pulse from the buttons to the unseen skill\'s tab when the book opens', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.setup();
        spellbook.noteUnlocked([50]);
        spellbook.refresh();

        spellbook.toggle();
        expect(buttonsPulse()).toBe(false);
        expect(pulsingTabs()).toEqual(['passive']);
        // The active tab holds nothing unseen, so no row and no pager pulse.
        expect(pulsingRows()).toEqual([]);
        expect(pulsingSteps()).toEqual([]);
    });

    it('pulses the pager step that points at the unseen page, and not the active tab', () => {
        fixture(many('aura', spellbook.PAGE_SIZE + 1));
        spellbook.setup();
        // The last entry sits alone on page 2.
        spellbook.noteUnlocked([spellbook.PAGE_SIZE + 1]);
        spellbook.refresh();
        spellbook.toggle();

        expect(pulsingSteps()).toEqual(['1']);
        expect(pulsingTabs()).toEqual([]);
        expect(pulsingRows()).toEqual([]);

        // ...and backwards from the far side.
        press('.spellbookPageStep[data-step="1"]');
        expect(pulsingRows()).toEqual([String(spellbook.PAGE_SIZE + 1)]);
        expect(pulsingSteps()).toEqual([]);
    });

    it('pulses both pager steps when unseen entries sit on either side', () => {
        fixture(many('aura', 3 * spellbook.PAGE_SIZE));
        spellbook.setup();
        spellbook.noteUnlocked([1, 3 * spellbook.PAGE_SIZE]);
        spellbook.refresh();
        spellbook.toggle();

        press('.spellbookPageStep[data-step="1"]');
        expect(pulsingSteps().sort()).toEqual(['-1', '1']);
    });

    it('marks a displayed row seen after the dwell, and every pulse stops with it', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.setup();
        spellbook.noteUnlocked([50]);
        spellbook.refresh();
        spellbook.toggle();
        press('.spellbookTab[data-category="passive"]');

        expect(pulsingRows()).toEqual(['50']);
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS - 1);
        expect(pulsingRows()).toEqual(['50']);

        vi.advanceTimersByTime(2);
        expect(anyPulse()).toBe(0);
        spellbook.close();
        expect(buttonsPulse()).toBe(false);
    });

    it('does not mark a row seen when the reader flips past it before the dwell', () => {
        fixture(many('aura', spellbook.PAGE_SIZE + 1));
        spellbook.setup();
        const late = spellbook.PAGE_SIZE + 1;
        spellbook.noteUnlocked([late]);
        spellbook.refresh();
        spellbook.toggle();
        press('.spellbookPageStep[data-step="1"]');
        expect(pulsingRows()).toEqual([String(late)]);

        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS / 2);
        press('.spellbookPageStep[data-step="-1"]');
        // The old timer must be dead: letting the rest of it run must not mark.
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS);
        expect(pulsingSteps()).toEqual(['1']);

        // ...and the trail is still there to be followed a second time.
        press('.spellbookPageStep[data-step="1"]');
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS + 1);
        expect(anyPulse()).toBe(0);
    });

    it('closing the book mid-dwell keeps the unseen entry and resumes the buttons', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.setup();
        spellbook.noteUnlocked([50]);
        spellbook.refresh();
        spellbook.toggle();
        press('.spellbookTab[data-category="passive"]');
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS / 2);

        spellbook.close();
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS * 2);
        expect(buttonsPulse()).toBe(true);
    });

    it('stops only once ALL unseen entries are seen, tab by tab', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50), ...many('cooldown', 1, 90)]);
        spellbook.setup();
        spellbook.noteUnlocked([50, 90]);
        spellbook.refresh();
        spellbook.toggle();
        expect(pulsingTabs().sort()).toEqual(['cooldown', 'passive']);

        press('.spellbookTab[data-category="passive"]');
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS + 1);
        expect(pulsingTabs()).toEqual(['cooldown']);

        press('.spellbookTab[data-category="cooldown"]');
        vi.advanceTimersByTime(spellbook.SEEN_DWELL_MS + 1);
        expect(anyPulse()).toBe(0);
        spellbook.close();
        expect(buttonsPulse()).toBe(false);
    });

    it('forgets an unseen id whose row is gone, but never against an empty list', () => {
        fixture([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.setup();
        spellbook.noteUnlocked([50]);
        spellbook.refresh();
        expect(buttonsPulse()).toBe(true);

        // updateSpellbook clears the list before it rebuilds it; a prune there
        // would wipe the whole set for reasons that have nothing to do with
        // what the player has read.
        setRows([]);
        spellbook.refresh();
        expect(buttonsPulse()).toBe(true);

        setRows([...many('aura', 2), ...many('passive', 1, 50)]);
        spellbook.refresh();
        expect(buttonsPulse()).toBe(true);

        // A rebuild that really no longer holds the skill retires it.
        setRows(many('aura', 2));
        spellbook.refresh();
        expect(anyPulse()).toBe(0);
    });
});
