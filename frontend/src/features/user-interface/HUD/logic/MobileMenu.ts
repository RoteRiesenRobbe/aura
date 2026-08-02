// The mobile menu button (2026-08-02): the ☰ that owns everything the phone
// layout takes off the screen — spellbook, passives, journal, help, minimap
// and zoom.
//
// There is no menu markup. The button toggles a `menuOpen` class on <body>
// and HUD.mobile.less turns the EXISTING #leftColumn into a full-screen
// sheet, pulling #zoomControl and #minimap into it by position. Nothing is
// re-parented, so the desktop DOM and every existing handler are untouched.
//
// One sheet at a time (PO ruling 2026-08-02): opening the menu closes the
// journal and the help panel, and the two buttons that live inside the sheet
// close the menu on their way to opening their own panel.
//
// ⚑ pointerdown, never click — MouseManager preventDefaults mousedown on the
// document element, which suppresses the synthetic click (the same rule the
// rest of the HUD follows).

import * as Journal from '../../../journal/logic/Journal';
import * as Help from '../../../help/logic/Help';
import {isMobile} from '../../logic/Mobile';

let buttonElement: HTMLElement;
let open = false;

export function setup() {
    // Nothing to wire on a desktop page: the button is display:none there and
    // the sheet can never open, so it registers no listeners at all rather
    // than three that would run on every HUD click to decide to do nothing.
    if (!isMobile()) {
        return;
    }

    buttonElement = document.getElementById('mobileMenuButton');
    if (!buttonElement) {
        return;
    }
    buttonElement.addEventListener('pointerdown', toggle);

    // Both live inside the sheet; each opens a full-screen panel of its own,
    // so the sheet has to get out of the way. Their own handlers still run —
    // these listeners only add the dismissal.
    document.getElementById('journalButton')?.addEventListener('pointerdown', close);
    document.getElementById('helpButton')?.addEventListener('pointerdown', close);
}

export function toggle() {
    setOpen(!open);
}

/** close is a no-op when the sheet is already shut, like Help.close(). */
export function close() {
    if (!open) {
        return;
    }
    setOpen(false);
}

export function isOpen(): boolean {
    return open;
}

function setOpen(next: boolean) {
    open = next;
    // On <html>, beside the `mobile` class it composes with — see Mobile.apply.
    document.documentElement.classList.toggle('menuOpen', open);
    if (open) {
        Journal.close();
        Help.close();
    }
}
