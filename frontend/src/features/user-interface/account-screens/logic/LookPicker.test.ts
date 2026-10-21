import {describe, expect, it} from 'vitest';
import {renderLookPicker} from './LookPicker';
import {AppearanceCatalog, setAppearanceCatalog} from '../../../../client-data/Appearance';

// plan-appearance.md C4, D9: creation and the in-game panel draw the same
// picker, the chosen medallion and one tile per item the character may wear.
const catalog: AppearanceCatalog = {
    portraits: [
        {id: 'default', name: 'Morion Helm', starter: true, default: true},
        {id: 'green-hood', name: 'Green Hood', starter: true},
        {id: 'crown', name: 'Crown', starter: false},
    ],
    rings: [
        {id: 'ring-leather', name: 'Leather Ring', family: 'leather', starter: true},
        {id: 'ring-plain', name: 'Plain Ring', family: 'grey', starter: true, default: true},
    ],
};

function fixture(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = `<div class="lookPreview"></div>
        <div class="lookOptions" data-slot="portrait"></div>
        <div class="lookOptions" data-slot="ring"></div>`;
    return root;
}

const tiles = (root: HTMLElement, slot: string) =>
    [...root.querySelectorAll<HTMLElement>(`.lookOptions[data-slot="${slot}"] .lookOption`)];

describe('renderLookPicker', () => {
    it('offers the starter items only, the worn ones selected', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        renderLookPicker(root, catalog, {portrait: 'green-hood', ring: 'ring-plain'}, () => undefined);

        expect(tiles(root, 'portrait').map(t => t.dataset.item)).toEqual(['default', 'green-hood']);
        expect(tiles(root, 'ring').map(t => t.dataset.item)).toEqual(['ring-leather', 'ring-plain']);
        const selected = [...root.querySelectorAll<HTMLElement>('.lookOption.selected')].map(t => t.dataset.item);
        expect(selected).toEqual(['green-hood', 'ring-plain']);
        expect(root.querySelector<HTMLElement>('.lookOption.selected').getAttribute('aria-pressed')).toBe('true');
    });

    it('previews the worn look, each tile with the other slot as worn', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        renderLookPicker(root, catalog, {portrait: 'green-hood', ring: 'ring-leather'}, () => undefined);

        const preview = root.querySelector<HTMLElement>('.lookPreview .medallion');
        expect([preview.dataset.portrait, preview.dataset.ring]).toEqual(['green-hood', 'ring-leather']);
        const ringTile = tiles(root, 'ring')[1].querySelector<HTMLElement>('.medallion');
        expect([ringTile.dataset.portrait, ringTile.dataset.ring]).toEqual(['green-hood', 'ring-plain']);
    });

    it('a press hands over the look with that slot replaced', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        const picks = [];
        renderLookPicker(root, catalog, {portrait: 'default', ring: 'ring-plain'}, look => picks.push(look));

        tiles(root, 'ring')[0].dispatchEvent(new Event('pointerdown'));
        expect(picks).toEqual([{portrait: 'default', ring: 'ring-leather'}]);
    });
});
