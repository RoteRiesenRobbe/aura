// Mobile detection (2026-08-02): decided ONCE at boot and expressed as a
// single `mobile` class on <body>. Everything else — the whole compact layout
// — hangs off that class in HUD.mobile.less, so the desktop arrangement is
// untouched by construction and there is no second layout code path.
//
// The rule is TOUCH-PRIMARY, not viewport width (PO ruling 2026-08-02): a
// narrow desktop window keeps the desktop HUD, and a large tablet gets the
// mobile one, because what breaks the desktop layout is fingers, not pixels.
// `?mobile` / `?desktop` force either way — that is what makes this testable
// in a normal browser and drivable by the headless harness.

import {QueryParameters} from '../../internal-tools/logic/QueryParameters';

let mobile: boolean = null;

export function isMobile(): boolean {
    if (mobile === null) {
        mobile = detect();
    }
    return mobile;
}

function detect(): boolean {
    const params = QueryParameters.get();
    // ?desktop wins over ?mobile — the escape hatch has to be unambiguous.
    if (params.has('desktop')) {
        return false;
    }
    if (params.has('mobile')) {
        return true;
    }

    // `pointer: coarse` = the primary pointing device is imprecise, i.e. a
    // finger. Guarded because matchMedia is absent in the vitest jsdom env.
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
}

// apply stamps the class. Called once, as soon as the HUD markup is in the
// document — before #gameUI is un-hidden, so no desktop layout ever flashes.
//
// ⚑ On <html>, not <body>. The mobile layout scales through the ROOT font
// size, and rem is root-relative — reaching the root from a body class would
// need `html:has(body.mobile)`, a :has() on the root element evaluated against
// the whole document. Stamping the root directly makes every mobile rule a
// plain class match, so a desktop page carries no :has() bookkeeping it did
// not already have.
export function apply() {
    document.documentElement.classList.toggle('mobile', isMobile());
}
