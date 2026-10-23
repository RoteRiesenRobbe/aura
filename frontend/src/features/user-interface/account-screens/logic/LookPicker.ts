import {AppearanceCatalog, AppearanceItem, AppearanceSlot} from '../../../../client-data/Appearance';
import {medallionElement} from './MedallionElement';
import {attachTooltips, hideTooltip, showTooltip, TooltipContent, tooltipAnchor} from '../../HUD/logic/SkillTooltip';
import {t} from '../../../localization/logic/Locale';

/** A look as appearance item ids. */
export interface Look {
    portrait: string;
    ring: string;
}

/**
 * What a mount says about each item (plan-appearance.md C5, C5c). Creation
 * shows what the new life may wear (the starters, the account's and the
 * slot's items, the C5c ruling); the in-game panel shows every item, the ones
 * not yet owned locked.
 */
export interface TileRules {
    /** Which items the mount shows at all; the starters when absent. */
    shown?: (item: AppearanceItem) => boolean;
    /** A shown item the character may not wear yet: its tooltip's lock line (D8, D25). */
    locked?: (item: AppearanceItem) => string | undefined;
    /** An item earned and not yet looked at: it glows (D13). */
    fresh?: (item: AppearanceItem) => boolean;
}

/**
 * The look picker (plan-appearance.md D9): one picker, two mounts, character
 * creation and the in-game Appearance panel. It draws the given look into
 * root's `.lookPreview`, then each shown item into its slot's `.lookOptions`
 * as the medallion it would make with the other slot as given. A press hands
 * the look with that slot replaced to onPick; the mount decides what the
 * picked look means (creation keeps it, the panel asks the server). A locked
 * tile is greyed, names its conditions in its tooltip and picks nothing.
 *
 * The hover is the game's tooltip (SkillTooltip.showTooltip), the one every
 * skill and utility uses, never the browser's `title` (PO 2026-10-23, the
 * 2026-08-03 ruling for the utilities): the name, the slot, and a locked
 * item's lock line.
 */
// Each tile's tooltip, built with the tile; and the roots already listening.
const tooltips = new WeakMap<Element, TooltipContent>();
const wired = new WeakSet<HTMLElement>();

/** One delegated hover per mount, reading the content of the tile under it. */
function wireTooltips(root: HTMLElement) {
    if (wired.has(root)) {
        return;
    }
    wired.add(root);
    attachTooltips(root, '.lookOption', tile => {
        const content = tooltips.get(tile);
        if (content) {
            showTooltip(tile, content);
        } else {
            hideTooltip();
        }
    });
}

export function renderLookPicker(root: HTMLElement, catalog: AppearanceCatalog, look: Look,
                                 onPick: (look: Look) => void, rules: TileRules = {}): void {
    const shown = rules.shown ?? (item => item.starter);
    wireTooltips(root);
    // The tiles are rebuilt below: a tooltip open on one would float on alone.
    if (tooltipAnchor() && root.contains(tooltipAnchor())) {
        hideTooltip();
    }
    root.querySelector('.lookPreview').replaceChildren(medallionElement(look.portrait, look.ring));

    const option = (slot: AppearanceSlot, item: AppearanceItem) => {
        const tile = document.createElement('div');
        tile.className = 'lookOption';
        const locked = rules.locked?.(item);
        tile.setAttribute('role', 'button');
        tile.setAttribute('aria-label', locked ? `${item.name}. ${locked}` : item.name);
        tooltips.set(tile, {
            title: item.name,
            subtitle: slot === 'portrait' ? t('account.create-character.portrait') : t('account.create-character.ring'),
            lines: locked ? [{text: locked}] : [],
        });
        const selected = look[slot] === item.id;
        tile.classList.toggle('selected', selected);
        tile.classList.toggle('locked', locked !== undefined);
        tile.classList.toggle('fresh', rules.fresh?.(item) ?? false);
        tile.setAttribute('aria-pressed', String(selected));
        if (locked !== undefined) {
            tile.setAttribute('aria-disabled', 'true');
        }
        tile.dataset.item = item.id;
        tile.appendChild(slot === 'portrait'
            ? medallionElement(item.id, look.ring)
            : medallionElement(look.portrait, item.id));
        // pointerdown, not click: MouseManager preventDefault()s mousedown on
        // documentElement, which suppresses the synthetic click entirely.
        tile.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            if (locked === undefined) {
                onPick({...look, [slot]: item.id});
            }
        });
        return tile;
    };
    for (const slot of ['portrait', 'ring'] as AppearanceSlot[]) {
        const items = slot === 'portrait' ? catalog.portraits : catalog.rings;
        root.querySelector(`.lookOptions[data-slot="${slot}"]`)
            .replaceChildren(...items.filter(shown).map(item => option(slot, item)));
    }
}
