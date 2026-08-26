import {beforeEach, describe, expect, it, vi} from 'vitest';

// The registry is module-level state, so every test gets a fresh copy of the
// module: registrants left over from an earlier test would still be closed by
// the next test's notifyOpened, and the counts would quietly stop meaning
// anything.
let registry: typeof import('./PanelExclusivity');

beforeEach(async () => {
    vi.resetModules();
    registry = await import('./PanelExclusivity');
});

// Fake registrants: a close function that only counts, which is all the
// registry promises to call.
function counter() {
    const calls = {n: 0};
    return {calls, close: () => { calls.n++; }};
}

describe('PanelExclusivity', () => {
    it('closes every other registrant when a panel opens', () => {
        const help = counter();
        const settings = counter();
        registry.register('journal', () => { throw new Error('unreachable'); });
        registry.register('help', help.close);
        registry.register('settings', settings.close);

        registry.notifyOpened('journal');

        expect(help.calls.n).toBe(1);
        expect(settings.calls.n).toBe(1);
    });

    it('never closes the panel that just opened', () => {
        const journal = counter();
        registry.register('journal', journal.close);

        registry.notifyOpened('journal');

        expect(journal.calls.n).toBe(0);
    });

    it('closes each other registrant exactly once per open', () => {
        const help = counter();
        registry.register('help', help.close);

        registry.notifyOpened('journal');
        registry.notifyOpened('conversation');

        expect(help.calls.n).toBe(2);
    });

    it('does nothing when the family is empty', () => {
        expect(() => registry.notifyOpened('journal')).not.toThrow();
    });

    it('replaces a close function when an id registers twice', () => {
        const first = counter();
        const second = counter();
        registry.register('help', first.close);
        registry.register('help', second.close);

        registry.notifyOpened('journal');

        expect(first.calls.n).toBe(0);
        expect(second.calls.n).toBe(1);
    });

    it('survives a close function that registers during the sweep', () => {
        const late = counter();
        const help = counter();
        registry.register('conversation', () => { registry.register('mobileMenu', late.close); });
        registry.register('help', help.close);

        expect(() => registry.notifyOpened('journal')).not.toThrow();

        // The sweep runs over the family as it stood when it started, so the
        // panel registered mid-pass is not closed by that same pass.
        expect(help.calls.n).toBe(1);
        expect(late.calls.n).toBe(0);
    });
});
