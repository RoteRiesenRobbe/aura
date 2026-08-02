/**
 * The help panel — a placeholder tutorial until a real one exists.
 *
 * The content is static HTML in HUD.html (the game's mechanics as short design
 * statements, ordered by when a new player meets them); this file only wires
 * visibility: the ?-button beside the zoom control toggles, ✕ and Escape close.
 *
 * ⚑ `pointerdown`, never `click` — MouseManager preventDefaults `mousedown` on
 * the document element, which suppresses the synthetic click (see Journal.ts).
 */

let panelElement: HTMLElement;
let open = false;

export function setup() {
    panelElement = document.getElementById('help');
    if (!panelElement) {
        return;
    }
    panelElement.querySelector('.helpClose')
        .addEventListener('pointerdown', close);

    document.getElementById('helpButton')
        ?.addEventListener('pointerdown', toggle);
}

export function toggle() {
    if (!panelElement) {
        return;
    }
    open = !open;
    panelElement.classList.toggle('hidden', !open);
}

/** ✕ and Escape. A no-op when the panel is shut. */
export function close() {
    if (!open) {
        return;
    }
    open = false;
    panelElement.classList.add('hidden');
}
