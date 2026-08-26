/**
 * The panel exclusivity registry (plan-ui-pass.md C2, ruling D1).
 *
 * Journal, help, conversation, settings and the mobile ☰ sheet are ONE
 * exclusive family: at most one is open, and opening any of them closes the
 * rest. The spellbook joins the family at C3, once it is openable at all.
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

/** The family. Spellbook joins at C3. */
export type PanelId = 'journal' | 'help' | 'conversation' | 'settings' | 'mobileMenu';

const closers = new Map<PanelId, () => void>();

/** Join the family. Called once, from the panel's own setup. */
export function register(id: PanelId, close: () => void) {
    closers.set(id, close);
}

/** `id` just went on screen: shut every other member of the family. */
export function notifyOpened(id: PanelId) {
    // Snapshotted rather than iterated live: a close function is ordinary panel
    // code and is free to touch the registry, and a sweep that broke on that
    // would be invisible from the panel module doing it.
    for (const [other, close] of [...closers]) {
        if (other !== id) {
            close();
        }
    }
}
