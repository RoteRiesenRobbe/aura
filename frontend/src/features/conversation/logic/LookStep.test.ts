import {describe, expect, it} from 'vitest';
import {AppearanceCatalog, setAppearanceCatalog} from '../../../client-data/Appearance';
import {ConversationRow, NO_GRANT, TravelDirection} from './ConversationModel';
import {lookStepItems, lookStepRows} from './LookStep';

// plan-ascension-ceremony.md D8: a look step draws the look picker with only
// the step's items; a tile only selects, and the take row sends the selected
// item's own row, the skip row its own.
const catalog: AppearanceCatalog = {
    portraits: [
        {id: 'crowned-heir', name: 'Crowned Heir', starter: false},
        {id: 'default', name: 'Morion Helm', starter: true, default: true},
        {id: 'elder-sage', name: 'Elder Sage', starter: false},
        {id: 'green-hood', name: 'Green Hood', starter: true},
    ],
    rings: [
        {id: 'ring-plain', name: 'Plain Ring', family: 'grey', starter: true, default: true},
    ],
};

function row(optionIndex: number, appearance: number, text = ''): ConversationRow {
    return {
        optionIndex, grantIndex: 0, text, next: 'ring', locked: false, requiredLevel: 0, reply: '',
        confirmSeconds: 0, skillId: 0, travel: TravelDirection.None, questLevel: 0, questMarker: 0, appearance,
    };
}

// The server's rows for a portrait step offering both busts: flat + 1.
const stepRows = [row(0, 1), row(1, 3), row(254, 0, 'No new look.')];
const worn = {portrait: 'green-hood', ring: 'ring-plain'};

function press(element: Element) {
    const e = new Event('pointerdown', {bubbles: true, cancelable: true}) as any;
    e.pointerType = 'mouse';
    element.dispatchEvent(e);
}

function mount(selected: string, taken: ConversationRow[] = [], selections: string[] = []) {
    const ul = document.createElement('ul');
    ul.replaceChildren(...lookStepItems(stepRows, worn, selected, id => selections.push(id), r => taken.push(r)));
    return ul;
}

const tiles = (root: Element) => [...root.querySelectorAll<HTMLElement>('.lookOption')];

describe('the look step', () => {
    it('splits the rows into the offered items and the skip', () => {
        setAppearanceCatalog(catalog);
        const step = lookStepRows(stepRows);
        expect(step.slot).toBe('portrait');
        expect([...step.looks.keys()]).toEqual(['crowned-heir', 'elder-sage']);
        expect(step.skip.optionIndex).toBe(254);
    });

    it('shows exactly the step\'s items, one slot, previewing the worn look', () => {
        setAppearanceCatalog(catalog);
        const root = mount('');
        expect(tiles(root).map(t => t.dataset.item)).toEqual(['crowned-heir', 'elder-sage']);
        expect(root.querySelector('.lookOptions[data-slot="ring"]')).toBeNull();
        const preview = root.querySelector<HTMLElement>('.lookPreview .medallion');
        expect(preview.dataset.portrait).toBe('green-hood');
        expect(root.querySelectorAll('.lookOption.selected')).toHaveLength(0);
    });

    it('a tile only selects: nothing is taken', () => {
        setAppearanceCatalog(catalog);
        const taken: ConversationRow[] = [];
        const selections: string[] = [];
        const root = mount('', taken, selections);
        press(tiles(root)[1]);
        expect(selections).toEqual(['elder-sage']);
        expect(taken).toEqual([]);
    });

    it('with nothing selected the take row is inert', () => {
        setAppearanceCatalog(catalog);
        const taken: ConversationRow[] = [];
        const root = mount('', taken);
        const take = root.querySelector('.conversationLookTake');
        expect(take.classList.contains('locked')).toBe(true);
        press(take);
        expect(taken).toEqual([]);
    });

    it('take sends the selected item\'s own row; the preview wears it', () => {
        setAppearanceCatalog(catalog);
        const taken: ConversationRow[] = [];
        const root = mount('elder-sage', taken);
        expect(root.querySelector<HTMLElement>('.lookPreview .medallion').dataset.portrait).toBe('elder-sage');
        expect(root.querySelector<HTMLElement>('.lookOption.selected').dataset.item).toBe('elder-sage');
        press(root.querySelector('.conversationLookTake'));
        expect(taken.map(r => r.optionIndex)).toEqual([1]);
        expect(taken[0].grantIndex).not.toBe(NO_GRANT);
    });

    it('the skip row sends the skip', () => {
        setAppearanceCatalog(catalog);
        const taken: ConversationRow[] = [];
        const root = mount('', taken);
        const skip = root.querySelector('.conversationLookSkip');
        expect(skip.textContent).toBe('No new look.');
        press(skip);
        expect(taken.map(r => r.optionIndex)).toEqual([254]);
    });
});
