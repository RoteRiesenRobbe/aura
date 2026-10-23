/**
 * The in-game Appearance panel (plan-appearance.md C4, D10, D11): the look
 * picker's second mount (LookPicker, D9). Opened by C, the desktop button and
 * the ☰ sheet's row (both `.appearanceOpenButton`); a member of the exclusive
 * panel family (PanelExclusivity), so it follows the spellbook's rules
 * (plan-ui-pass.md C3): `pointerdown`, never `click`, and `close()` is a no-op
 * when already shut.
 *
 * ⚑ What it shows as worn is the SERVER'S answer, the own token's wire values
 * (setOwnLook, fed by Player.ts every snapshot), never the press. A press only
 * sends SelectAppearance; the server refuses silently, so a highlight moved on
 * press could show a look nobody else sees.
 *
 * Since C5c it shows every item: one the character does not own is locked,
 * its tooltip the server's reasons with this character's progress (D8, D25).
 * An item earned after the join's baseline lights the way in (the buttons and
 * the ☰, the spellbook's breadcrumb) and glows in the picker for one visit
 * (D13); shutting the panel counts it as seen. No dwell timer, unlike the
 * spellbook's pages: the panel shows every item at once.
 */

import * as PanelExclusivity from '../../logic/PanelExclusivity';
import {
    AppearanceItem,
    appearanceCatalog,
    appearanceReady,
    isWearable,
    ownedAppearance,
    portraitAt,
    ringAt,
    setOwnedAppearance,
    wireOf,
} from '../../../../client-data/Appearance';
import {renderLookPicker} from '../../account-screens/logic/LookPicker';
import {SelectAppearanceMessage} from '../../../backend/logic/messages/outgoing/SelectAppearanceMessage';
import type {AppearanceLockData} from '../../../backend/logic/messages/incoming/GameStateMessage';
import {LockData, lockedReasonsLine} from '../../../localization/logic/WireText';
import {t} from '../../../localization/logic/Locale';
import {hideTooltip} from './SkillTooltip';
import {playCssAnimation} from '../../../common/logic/Utils';
import {setMenuBreadcrumb} from './MenuBreadcrumb';

let panelElement: HTMLElement;
let open = false;
let portraitWire = 0;
let ringWire = 0;
// What the picker shows: re-rendered only when the panel opens or what it
// shows changes, never per snapshot.
let renderedKey = '';
// Locked items' reasons by flat index, from the owner block (C5c), and the
// list they came from as text: the block's heartbeat resends an unchanged
// list, which must not rebuild the tiles under a press.
let locks = new Map<number, LockData[]>();
let locksText = '';
// The owned set the last diff saw; null until the first, the silent baseline.
let knownOwned: number[] | null = null;
// Flat indices earned this session and not yet seen (D13).
const unseen = new Set<number>();
// Bumped by every change the key cannot see (locks, unseen).
let revision = 0;

export function setup() {
    panelElement = document.getElementById('appearance');
    if (!panelElement) {
        return;
    }
    panelElement.querySelector('.appearanceClose')?.addEventListener('pointerdown', close);
    for (const button of document.querySelectorAll('.appearanceOpenButton')) {
        button.addEventListener('pointerdown', toggle);
    }
    PanelExclusivity.register('appearance', close);
    // The catalog usually lands before the panel opens; if not, it fills in.
    void appearanceReady.then(() => {
        renderedKey = '';
        render();
    });
}

/** C, and both open buttons. */
export function toggle() {
    if (open) {
        close();
        return;
    }
    open = true;
    PanelExclusivity.notifyOpened('appearance');
    render();
}

/** ✕, Escape, a second C, and any other family member opening. */
export function close() {
    if (!open) {
        return;
    }
    open = false;
    hideTooltip();
    // Everything was on show for this visit: it counts as seen.
    if (unseen.size > 0) {
        unseen.clear();
        revision++;
    }
    render();
}

export function isOpen(): boolean {
    return open;
}

/** The own token's worn look as wire values, from every snapshot. */
export function setOwnLook(portrait: number, ring: number) {
    portraitWire = portrait;
    ringWire = ring;
    render();
}

/**
 * The own character's owned set, from the owner block (C5). The first call
 * is the baseline; an item that joins it later is news (D13).
 */
export function setOwned(flats: number[]) {
    const earned = knownOwned === null ? [] : flats.filter(flat => !knownOwned.includes(flat));
    knownOwned = flats;
    setOwnedAppearance(flats);
    if (earned.length > 0) {
        earned.forEach(flat => unseen.add(flat));
        revision++;
        if (!open) {
            flashEntryPoints();
        }
    }
    render();
}

/** The locked items with their progress, from the owner block (C5c). */
export function setLocks(list: AppearanceLockData[]) {
    const text = JSON.stringify(list);
    if (text === locksText) {
        return;
    }
    locksText = text;
    locks = new Map(list.map(entry => [entry.item, entry.locks]));
    revision++;
    render();
}

/**
 * The spellbook's one-shot flash on the way in, on whichever entry points are
 * on screen (an animation on a hidden element fires no end event, so its
 * class would linger and flash whenever the element next showed).
 */
function flashEntryPoints() {
    const entries = [...document.querySelectorAll<HTMLElement>('.appearanceOpenButton'),
        document.getElementById('mobileMenuButton')];
    for (const element of entries) {
        if (element && element.getClientRects().length > 0) {
            playCssAnimation(element, 'unlockPulse');
        }
    }
}

/**
 * A locked item's tooltip line: the server's reasons with this character's
 * progress, or the bare word before they land.
 */
function lockedLine(item: AppearanceItem): string {
    const reasons = locks.get(flatOf(item));
    return reasons ? lockedReasonsLine(reasons, item.conditionsMode === 'any') : t('appearance.locked-bare');
}

function flatOf(item: AppearanceItem): number {
    const catalog = appearanceCatalog();
    const ring = catalog.rings.indexOf(item);
    return ring >= 0 ? catalog.portraits.length + ring : catalog.portraits.indexOf(item);
}

function render() {
    if (!panelElement) {
        return;
    }
    panelElement.classList.toggle('hidden', !open);
    // The way in pulses while something earned is unseen and the panel shut.
    const trailing = unseen.size > 0 && !open;
    for (const button of document.querySelectorAll('.appearanceOpenButton')) {
        button.classList.toggle('breadcrumb', trailing);
    }
    setMenuBreadcrumb('appearance', trailing);
    const catalog = appearanceCatalog();
    const key = `${open}:${portraitWire}:${ringWire}:${catalog !== null}:${ownedAppearance().join(',')}:${revision}`;
    if (!open || !catalog || key === renderedKey) {
        return;
    }
    renderedKey = key;
    // portraitAt/ringAt resolve 0 and unknown values to the slot's default.
    const look = {portrait: portraitAt(portraitWire)?.id ?? '', ring: ringAt(ringWire)?.id ?? ''};
    renderLookPicker(panelElement, catalog, look, pick =>
        new SelectAppearanceMessage(wireOf('portrait', pick.portrait), wireOf('ring', pick.ring)).send(), {
        shown: () => true,
        locked: item => isWearable(item) ? undefined : lockedLine(item),
        fresh: item => unseen.has(flatOf(item)),
    });
}
