import {describe, expect, it} from 'vitest';
import {renderLookPicker} from './LookPicker';
import {AppearanceCatalog, isWearable, setAppearanceCatalog, setOwnedAppearance} from '../../../../client-data/Appearance';

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

    // plan-appearance.md C5: the in-game mount offers starters plus owned items.
    it('offers what the mount says, an owned locked item among them', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        setOwnedAppearance([]);
        renderLookPicker(root, catalog, {portrait: 'default', ring: 'ring-plain'}, () => undefined, {shown: isWearable});
        expect(tiles(root, 'portrait').map(t => t.dataset.item)).toEqual(['default', 'green-hood']);

        setOwnedAppearance([1, 2]); // flat: default 0, green-hood 1, crown 2
        renderLookPicker(root, catalog, {portrait: 'default', ring: 'ring-plain'}, () => undefined, {shown: isWearable});
        expect(tiles(root, 'portrait').map(t => t.dataset.item)).toEqual(['default', 'green-hood', 'crown']);
        setOwnedAppearance([]);
    });

    // plan-appearance.md C5c: the panel shows a locked item greyed, its
    // conditions in the game's own tooltip (D8, D25), and a press on it
    // picks nothing.
    it('greys a locked item, names its conditions in the game tooltip, and a press picks nothing', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        const picks = [];
        renderLookPicker(root, catalog, {portrait: 'default', ring: 'ring-plain'}, look => picks.push(look), {
            shown: () => true,
            locked: item => item.starter ? undefined : 'Locked: level 3 (1/3)',
        });

        const crown = tiles(root, 'portrait')[2];
        expect(crown.dataset.item).toBe('crown');
        expect(crown.classList.contains('locked')).toBe(true);
        expect(crown.getAttribute('aria-disabled')).toBe('true');
        expect(tiles(root, 'portrait')[0].classList.contains('locked')).toBe(false);

        crown.dispatchEvent(new Event('pointerdown'));
        expect(picks).toEqual([]);
    });

    // The game's tooltip, never the browser's: no title attribute anywhere.
    it('shows the game tooltip on hover: name, slot, and the lock line', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        document.body.appendChild(root);
        renderLookPicker(root, catalog, {portrait: 'default', ring: 'ring-plain'}, () => undefined, {
            shown: () => true,
            locked: item => item.starter ? undefined : 'Locked: level 3 (1/3)',
        });
        expect(root.querySelectorAll('[title]').length).toBe(0);

        const tooltip = () => document.getElementById('skillTooltip');
        const text = (sel: string) => [...tooltip().querySelectorAll(sel)].map(e => e.textContent);
        tiles(root, 'portrait')[2].dispatchEvent(new Event('pointerover', {bubbles: true}));
        expect(tooltip().classList.contains('hidden')).toBe(false);
        expect(text('.tooltipTitle')).toEqual(['Crown']);
        expect(text('.tooltipSubtitle')).toEqual(['Portrait']);
        expect(text('.tooltipLine')).toEqual(['Locked: level 3 (1/3)']);

        tiles(root, 'ring')[0].dispatchEvent(new Event('pointerover', {bubbles: true}));
        expect(text('.tooltipTitle')).toEqual(['Leather Ring']);
        expect(text('.tooltipSubtitle')).toEqual(['Ring']);
        expect(text('.tooltipLine')).toEqual([]);
        root.remove();
    });

    // D13: an item earned and not yet seen glows in the picker.
    it('marks a fresh item', () => {
        setAppearanceCatalog(catalog);
        const root = fixture();
        renderLookPicker(root, catalog, {portrait: 'default', ring: 'ring-plain'}, () => undefined, {
            shown: () => true,
            fresh: item => item.id === 'crown',
        });
        expect(tiles(root, 'portrait').filter(t => t.classList.contains('fresh')).map(t => t.dataset.item))
            .toEqual(['crown']);
    });
});
