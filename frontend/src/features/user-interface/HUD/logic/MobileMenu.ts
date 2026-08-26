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
// journal and the help panel, and either of them opening closes the menu.
// Since plan-ui-pass.md C2 (ruling D1) both directions run through the shared
// PanelExclusivity registry rather than through direct calls between the
// panels - the sheet is simply one member of the exclusive family.
//
// ⚑ pointerdown, never click — MouseManager preventDefaults mousedown on the
// document element, which suppresses the synthetic click (the same rule the
// rest of the HUD follows).

import * as PanelExclusivity from '../../logic/PanelExclusivity';
import {isMobile} from '../../logic/Mobile';

let buttonElement: HTMLElement;
let open = false;

export function setup() {
    // Nothing to wire on a desktop page: the button is display:none there and
    // the sheet can never open, so it neither listens nor joins the exclusive
    // family rather than sitting in both to decide to do nothing.
    if (!isMobile()) {
        return;
    }

    buttonElement = document.getElementById('mobileMenuButton');
    if (!buttonElement) {
        return;
    }
    buttonElement.addEventListener('pointerdown', toggle);

    // The journal and help buttons live inside the sheet and each opens a
    // full-screen panel of its own, so the sheet has to get out of the way.
    // That used to be two extra pointerdown listeners here; the registry now
    // does it, because those panels announce their own opens.
    PanelExclusivity.register('mobileMenu', close);
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
        PanelExclusivity.notifyOpened('mobileMenu');
    }
}
