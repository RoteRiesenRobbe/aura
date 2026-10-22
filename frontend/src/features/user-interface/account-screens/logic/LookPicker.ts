import {AppearanceCatalog, AppearanceItem, AppearanceSlot} from '../../../../client-data/Appearance';
import {medallionElement} from './MedallionElement';

/** A look as appearance item ids. */
export interface Look {
    portrait: string;
    ring: string;
}

/**
 * The look picker (plan-appearance.md D9): one picker, two mounts, character
 * creation and the in-game Appearance panel. It draws the given look into
 * root's `.lookPreview`, then each starter item into its slot's `.lookOptions`
 * as the medallion it would make with the other slot as given. A press hands
 * the look with that slot replaced to onPick; the mount decides what the
 * picked look means (creation keeps it, the panel asks the server).
 * `offered` says which items the mount offers: the panel the starters plus
 * what the character owns (C5), creation the starters until C5c brings it
 * the account's and the bloodline's.
 */
export function renderLookPicker(root: ParentNode, catalog: AppearanceCatalog, look: Look,
                                 onPick: (look: Look) => void,
                                 offered: (item: AppearanceItem) => boolean = item => item.starter): void {
    root.querySelector('.lookPreview').replaceChildren(medallionElement(look.portrait, look.ring));

    const option = (slot: AppearanceSlot, item: AppearanceItem) => {
        const tile = document.createElement('div');
        tile.className = 'lookOption';
        tile.title = item.name;
        tile.setAttribute('role', 'button');
        tile.setAttribute('aria-label', item.name);
        const selected = look[slot] === item.id;
        tile.classList.toggle('selected', selected);
        tile.setAttribute('aria-pressed', String(selected));
        tile.dataset.item = item.id;
        tile.appendChild(slot === 'portrait'
            ? medallionElement(item.id, look.ring)
            : medallionElement(look.portrait, item.id));
        // pointerdown, not click: MouseManager preventDefault()s mousedown on
        // documentElement, which suppresses the synthetic click entirely.
        tile.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            onPick({...look, [slot]: item.id});
        });
        return tile;
    };
    for (const slot of ['portrait', 'ring'] as AppearanceSlot[]) {
        const items = slot === 'portrait' ? catalog.portraits : catalog.rings;
        root.querySelector(`.lookOptions[data-slot="${slot}"]`)
            .replaceChildren(...items.filter(offered).map(item => option(slot, item)));
    }
}
