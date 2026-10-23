import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {AppearanceCatalog} from '../../../../client-data/Appearance';

// plan-appearance.md C4: the in-game picker. What it shows as worn comes from
// the server (the own token's wire values), never from the press: the server
// refuses silently, so a highlight on press could lie.
const sent: Array<[number, number]> = [];
vi.mock('../../../backend/logic/messages/outgoing/SelectAppearanceMessage', () => ({
    SelectAppearanceMessage: class {
        constructor(private portrait: number, private ring: number) {}
        send() { sent.push([this.portrait, this.ring]); }
    },
}));

const catalog: AppearanceCatalog = {
    portraits: [
        {id: 'default', name: 'Morion Helm', starter: true, default: true},
        {id: 'green-hood', name: 'Green Hood', starter: true},
        {id: 'crown', name: 'Crown', starter: false, scope: 'account', conditionsMode: 'any',
            locks: [{kind: 0, value: 3}, {kind: 1, value: 1}]},
    ],
    rings: [
        {id: 'ring-leather', name: 'Leather Ring', family: 'leather', starter: true},
        {id: 'ring-plain', name: 'Plain Ring', family: 'grey', starter: true, default: true},
    ],
};

let panel: typeof import('./AppearancePanel');
let exclusivity: typeof import('../../logic/PanelExclusivity');

beforeEach(async () => {
    vi.resetModules();
    sent.length = 0;
    document.body.innerHTML = `
        <div id="appearanceButton" class="appearanceOpenButton"></div>
        <div id="appearanceSheetButton" class="appearanceOpenButton"></div>
        <div id="mobileMenuButton"></div>
        <div id="appearance" class="hidden">
            <span class="appearanceClose"></span>
            <div class="lookPreview"></div>
            <div class="lookOptions" data-slot="portrait"></div>
            <div class="lookOptions" data-slot="ring"></div>
        </div>`;
    // After resetModules: the panel must see the same catalog module instance.
    (await import('../../../../client-data/Appearance')).setAppearanceCatalog(catalog);
    exclusivity = await import('../../logic/PanelExclusivity');
    panel = await import('./AppearancePanel');
    panel.setup();
});

const element = () => document.getElementById('appearance');
const selected = () => [...element().querySelectorAll<HTMLElement>('.lookOption.selected')].map(t => t.dataset.item);
const tile = (id: string) => element().querySelector<HTMLElement>(`.lookOption[data-item="${id}"]`);
// The game tooltip's lines for a hovered tile.
const hover = (id: string) => {
    tile(id).dispatchEvent(new Event('pointerover', {bubbles: true}));
    return [...document.querySelectorAll('#skillTooltip .tooltipLine')].map(e => e.textContent);
};

describe('AppearancePanel', () => {
    it('toggles, and opening it shuts the rest of the family', () => {
        let journalClosed = 0;
        exclusivity.register('journal', () => { journalClosed++; });

        panel.toggle();
        expect(panel.isOpen()).toBe(true);
        expect(element().classList.contains('hidden')).toBe(false);
        expect(journalClosed).toBe(1);

        panel.toggle();
        expect(panel.isOpen()).toBe(false);
        expect(element().classList.contains('hidden')).toBe(true);
    });

    it('joins the family: another panel opening closes it', () => {
        panel.toggle();
        exclusivity.notifyOpened('spellbook');
        expect(panel.isOpen()).toBe(false);
    });

    it('opens from every .appearanceOpenButton and closes from its ✕', () => {
        document.getElementById('appearanceSheetButton').dispatchEvent(new Event('pointerdown'));
        expect(panel.isOpen()).toBe(true);
        element().querySelector('.appearanceClose').dispatchEvent(new Event('pointerdown'));
        expect(panel.isOpen()).toBe(false);
        document.getElementById('appearanceButton').dispatchEvent(new Event('pointerdown'));
        expect(panel.isOpen()).toBe(true);
    });

    it('shows the look the server says is worn', () => {
        panel.setOwnLook(2, 1); // green-hood, ring-leather
        panel.toggle();
        expect(selected()).toEqual(['green-hood', 'ring-leather']);
    });

    it('a press sends the pick as wire values and waits for the server', () => {
        panel.setOwnLook(1, 2); // default, ring-plain
        panel.toggle();

        tile('green-hood').dispatchEvent(new Event('pointerdown'));
        expect(sent).toEqual([[2, 2]]);
        expect(selected()).toEqual(['default', 'ring-plain']);

        panel.setOwnLook(2, 2);
        expect(selected()).toEqual(['green-hood', 'ring-plain']);
    });

    it('wire 0 shows the defaults as worn', () => {
        panel.setOwnLook(0, 0);
        panel.toggle();
        expect(selected()).toEqual(['default', 'ring-plain']);
    });

    // plan-appearance.md C5c: every item shows; one not owned is locked, its
    // tooltip the server's reasons with this character's progress (D25),
    // joined by the item's mode.
    it('shows a locked item with the server\'s progress as its tooltip', () => {
        panel.setLocks([{item: 2, locks: [{kind: 0, value: 3, have: 1}, {kind: 1, value: 1, have: 0}]}]);
        panel.toggle();

        expect(tile('crown').classList.contains('locked')).toBe(true);
        expect(hover('crown')).toEqual(['Locked: level 3 (1/3) or 1 ascension in this line (0/1)']);
        tile('crown').dispatchEvent(new Event('pointerdown'));
        expect(sent).toEqual([]);
    });

    it('an owned item is not locked', () => {
        panel.setOwned([2]);
        panel.toggle();
        expect(tile('crown').classList.contains('locked')).toBe(false);
        tile('crown').dispatchEvent(new Event('pointerdown'));
        expect(sent).toEqual([[3, 2]]);
    });

    // D13: the first owned set is the baseline (nothing glows on a join); an
    // item earned after it lights the way in, then glows in the picker for
    // that visit, and is seen once the panel shuts.
    it('the first owned set is a silent baseline', () => {
        panel.setOwned([2]);
        const lit = [...document.querySelectorAll('.breadcrumb')];
        expect(lit).toEqual([]);
        panel.toggle();
        expect(tile('crown').classList.contains('fresh')).toBe(false);
    });

    it('an earned item lights the way in, glows for one visit, then is seen', () => {
        panel.setOwned([]);
        panel.setOwned([2]);
        for (const id of ['appearanceButton', 'appearanceSheetButton', 'mobileMenuButton']) {
            expect(document.getElementById(id).classList.contains('breadcrumb')).toBe(true);
        }

        panel.toggle();
        expect(tile('crown').classList.contains('fresh')).toBe(true);
        expect(document.getElementById('appearanceButton').classList.contains('breadcrumb')).toBe(false);

        panel.toggle();
        expect(document.querySelectorAll('.breadcrumb').length).toBe(0);
        panel.toggle();
        expect(tile('crown').classList.contains('fresh')).toBe(false);
    });

    // The owner block resends unchanged locks on its heartbeat: an open panel
    // must keep its tiles, or a press lands on a detached one.
    it('an unchanged lock list does not rebuild the tiles', () => {
        const list = [{item: 2, locks: [{kind: 0, value: 3, have: 1}]}];
        panel.setLocks(list);
        panel.toggle();
        const before = tile('green-hood');
        panel.setLocks([{item: 2, locks: [{kind: 0, value: 3, have: 1}]}]);
        expect(tile('green-hood')).toBe(before);

        panel.setLocks([{item: 2, locks: [{kind: 0, value: 3, have: 2}]}]);
        expect(hover('crown')).toEqual(['Locked: level 3 (2/3)']);
    });
});
