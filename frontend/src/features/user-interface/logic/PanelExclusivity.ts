/**
 * The panel exclusivity registry (plan-ui-pass.md C2, ruling D1).
 *
 * Journal, help, conversation, settings, the spellbook and the mobile ☰ sheet
 * are ONE exclusive family: at most one is open, and opening any of them closes
 * the rest. The spellbook joined at C3, when it stopped being always-on.
 *
 * Each panel registers its own close function once, at setup, and calls
 * notifyOpened() on every path that puts it on screen. The indirection is the
 * whole point: the matrix lives here, in one place, instead of every panel
 * importing the panels it has to push out of the way.
 *
 * ⚑ A registered close function must be a no-op when its panel is already
 * shut. It is called on EVERY family open, not only when its own panel happens
 * to be showing.
 */

/** The family. */
export type PanelId = 'journal' | 'help' | 'conversation' | 'settings' | 'spellbook' | 'appearance' | 'mobileMenu';

const closers = new Map<PanelId, () => void>();

/** Join the family. Called once, from the panel's own setup. */
export function register(id: PanelId, close: () => void) {
    closers.set(id, close);
}

/**
 * A family member opened or shut. `replaced` marks a close the sweep in
 * notifyOpened caused: another panel took the screen, the player did not close
 * this one. The UI sounds (audio/logic/UiSounds.ts) stay silent on it.
 */
export interface PanelChange {
    id: PanelId;
    open: boolean;
    replaced: boolean;
}

const listeners: ((change: PanelChange) => void)[] = [];
let sweeping = false;

/** Hear every open and close of the family. Called once, at import. */
export function onChange(listener: (change: PanelChange) => void) {
    listeners.push(listener);
}

function emit(change: PanelChange) {
    for (const listener of listeners) {
        listener(change);
    }
}

/** `id` just went on screen: shut every other member of the family. */
export function notifyOpened(id: PanelId) {
    emit({id, open: true, replaced: false});
    // Snapshotted rather than iterated live: a close function is ordinary panel
    // code and is free to touch the registry, and a sweep that broke on that
    // would be invisible from the panel module doing it.
    sweeping = true;
    try {
        for (const [other, close] of [...closers]) {
            if (other !== id) {
                close();
            }
        }
    } finally {
        sweeping = false;
    }
}

/**
 * `id` just left the screen. Optional for a member: only a panel that wants
 * to be heard calls it, and only when it really was open (a registered close
 * runs on every family open, shut or not).
 */
export function notifyClosed(id: PanelId) {
    emit({id, open: false, replaced: sweeping});
}
