// The four tiles under the minimap (VS-P F12, docs/plan-vertical-slice.md
// §5.3 PF3): map, spellbook, journal and appearance as a 2×2 of hotkey + PONETI
// icon, the name in the game tooltip on hover, never a native `title` (PO
// 2026-08-03, 2026-10-23). The ? in the zoom row gets the same hover.
//
// Only the look lives here. What a press does stays with each panel's own
// module (MiniMap, Spellbook, QuestTracker, AppearancePanel wire the ids), and
// the layout is HUD.less's, desktop only: on the phone the icon spans are
// hidden and #mapButton keeps its label.
//
// ⚑ The atlases are gitignored (THIRD_PARTY.md), so a clone without them gets
// an empty lookup: createIconToken then draws the label's initial, the same
// fallback every skill token has.

import {t} from '../../../localization/logic/Locale';
import {packIconsReady} from '../../../../client-data/icons/PackIconFiles';
import {createIconToken} from './IconToken';
import {attachTooltips, showTooltip} from './SkillTooltip';

/**
 * A tile: its element id, the pack icon it shows, its label (the no-pack
 * letter) and its hover title. Functions, not keys: the catalog scan wants
 * every t() key written out (no computed keys), and they read the locale at
 * hover time.
 */
export interface HudTile {
    id: string;
    packIcon: string;
    label: () => string;
    tooltip: () => string;
}

/** M B / J C (PO 2026-11-24); the DOM order in HUD.html is the grid order. */
export const HUD_TILES: HudTile[] = [
    {id: 'mapButton', packIcon: 'winding-road', label: () => t('map.label'), tooltip: () => t('hud.map-button.title')},
    {id: 'spellbookButton', packIcon: 'glowing-tome', label: () => t('spellbook.label'), tooltip: () => t('hud.spellbook-button.title')},
    {id: 'questTrackerJournal', packIcon: 'rolled-scroll', label: () => t('journal.label'), tooltip: () => t('hud.quest-tracker.journal.title')},
    {id: 'appearanceButton', packIcon: 'theatre-mask', label: () => t('appearance.label'), tooltip: () => t('hud.appearance-button.title')},
];

export function setup() {
    for (const tile of HUD_TILES) {
        const element = document.getElementById(tile.id);
        if (!element) {
            continue;
        }
        hoverTitle(element, tile.tooltip);
        const slot = element.querySelector('.hudTileIcon');
        if (slot) {
            // After the lookup settles: before it, every token would be the letter.
            packIconsReady.then(() => {
                slot.replaceChildren(createIconToken(null, tile.label(), tile.packIcon));
            });
        }
    }
    const help = document.getElementById('helpButton');
    if (help) {
        hoverTitle(help, () => t('hud.help-button.title'));
    }
}

function hoverTitle(element: HTMLElement, title: () => string) {
    attachTooltips(element, '#' + element.id, (entry) => showTooltip(entry, {
        title: title(),
        subtitle: '',
        lines: [],
    }));
}
