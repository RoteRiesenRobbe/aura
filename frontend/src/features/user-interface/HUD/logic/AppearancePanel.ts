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
 */

import * as PanelExclusivity from '../../logic/PanelExclusivity';
import {
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

let panelElement: HTMLElement;
let open = false;
let portraitWire = 0;
let ringWire = 0;
// What the picker shows: re-rendered only when the panel opens or the worn
// look changes, never per snapshot.
let renderedKey = '';

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
    open = !open;
    if (open) {
        PanelExclusivity.notifyOpened('appearance');
    }
    render();
}

/** ✕, Escape, a second C, and any other family member opening. */
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

/** The own token's worn look as wire values, from every snapshot. */
export function setOwnLook(portrait: number, ring: number) {
    portraitWire = portrait;
    ringWire = ring;
    render();
}

/** The own character's owned set, from the owner block (C5). */
export function setOwned(flats: number[]) {
    setOwnedAppearance(flats);
    render();
}

function render() {
    if (!panelElement) {
        return;
    }
    panelElement.classList.toggle('hidden', !open);
    const catalog = appearanceCatalog();
    const key = `${open}:${portraitWire}:${ringWire}:${catalog !== null}:${ownedAppearance().join(',')}`;
    if (!open || !catalog || key === renderedKey) {
        return;
    }
    renderedKey = key;
    // portraitAt/ringAt resolve 0 and unknown values to the slot's default.
    const look = {portrait: portraitAt(portraitWire)?.id ?? '', ring: ringAt(ringWire)?.id ?? ''};
    renderLookPicker(panelElement, catalog, look, pick =>
        new SelectAppearanceMessage(wireOf('portrait', pick.portrait), wireOf('ring', pick.ring)).send(), isWearable);
}
