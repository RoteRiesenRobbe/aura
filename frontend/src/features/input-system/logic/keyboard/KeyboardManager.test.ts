import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {KeyboardManager} from './KeyboardManager';

/**
 * Rolling-filler fix: Ctrl +/− used to fall through to the browser's own zoom,
 * which fights the fixed field of view (camera/Zoom.ts) — the world keeps its
 * size and only the HUD rescales.
 *
 * `defaultPrevented` after dispatch is the honest assertion available here:
 * jsdom has no zoom to observe, and preventing the default IS the whole fix.
 * Real browsers only honour this from keydown, which is why every case below
 * dispatches keydown specifically.
 */
/**
 * Round-8 item 3 (bugfix half): a held key never receives its keyup when the
 * window loses focus mid-press, so movement kept streaming to the server
 * until the player refocused and re-pressed. Focus loss now sweeps every key
 * back to its up state. The sweep must also drop the unprocessed event queue —
 * a keydown queued just before the blur would otherwise resurrect the key on
 * the next update().
 *
 * Deliberately NOT covered here: Controls' stop-tail. Sweeping the keys (as
 * opposed to zeroing the movement vector) is what arms it, via the normal
 * released-keys path — that reasoning lives in the intake note and the
 * handler's comment.
 */
describe('KeyboardManager focus-loss key sweep', () => {
    let manager: KeyboardManager;

    beforeEach(() => {
        manager = new KeyboardManager();
        manager.boot();
    });

    afterEach(() => {
        manager.stopListeners();
    });

    const W = 87;

    function pressW() {
        window.dispatchEvent(new KeyboardEvent('keydown', {keyCode: W, cancelable: true, bubbles: true} as KeyboardEventInit));
    }

    function withHiddenDocument(hidden: boolean, fn: () => void) {
        Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden});
        try {
            fn();
        } finally {
            delete (document as any).hidden;
        }
    }

    it('window blur releases a held key', () => {
        const key = manager.addKey(W);
        pressW();
        manager.update();
        expect(key.isDown).toBe(true);

        window.dispatchEvent(new Event('blur'));
        expect(key.isDown).toBe(false);
        expect(key.isUp).toBe(true);
    });

    it('a keydown still queued at blur time cannot resurrect the key', () => {
        const key = manager.addKey(W);
        pressW();
        // No update() yet — the event is only queued.
        window.dispatchEvent(new Event('blur'));
        manager.update();
        expect(key.isDown).toBe(false);
    });

    it('visibilitychange sweeps only when the document is hidden', () => {
        const key = manager.addKey(W);
        pressW();
        manager.update();

        withHiddenDocument(false, () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(key.isDown).toBe(true);

        withHiddenDocument(true, () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });
        expect(key.isDown).toBe(false);
    });

    it('sweeping releases the key without flipping its capture config', () => {
        // Key.preventDefault defaults to true (it drives event.preventDefault
        // in ProcessKeyDown/Up); the inherited ResetKey forced it to false,
        // which would have let a swept movement key scroll the page on its
        // next press.
        const key = manager.addKey(W);
        pressW();
        manager.update();
        window.dispatchEvent(new Event('blur'));
        expect(key.preventDefault).toBe(true);
        expect(key.enabled).toBe(true);
    });

    it('a fresh press after refocus works normally', () => {
        const key = manager.addKey(W);
        pressW();
        manager.update();
        window.dispatchEvent(new Event('blur'));

        pressW();
        manager.update();
        expect(key.isDown).toBe(true);
    });
});

describe('KeyboardManager browser-zoom suppression', () => {
    let manager: KeyboardManager;

    beforeEach(() => {
        manager = new KeyboardManager();
        manager.boot();
    });

    afterEach(() => {
        manager.stopListeners();
    });

    function dispatch(init: KeyboardEventInit): boolean {
        const event = new KeyboardEvent('keydown', {...init, cancelable: true, bubbles: true});
        window.dispatchEvent(event);
        return event.defaultPrevented;
    }

    it.each([
        ['ctrl', '-', {ctrlKey: true, key: '-', keyCode: 189}],
        ['ctrl', '+', {ctrlKey: true, key: '+', keyCode: 187}],
        ['ctrl', '= (unshifted zoom-in on a US layout)', {ctrlKey: true, key: '=', keyCode: 187}],
        ['ctrl', '_ (shifted minus)', {ctrlKey: true, key: '_', keyCode: 189}],
        ['meta', '- (macOS Cmd)', {metaKey: true, key: '-', keyCode: 189}],
        ['meta', '+ (macOS Cmd)', {metaKey: true, key: '+', keyCode: 187}],
    ])('suppresses %s %s', (_modifier, _label, init) => {
        expect(dispatch(init)).toBe(true);
    });

    it('leaves Ctrl+0 alone so an already-zoomed page can still be reset', () => {
        expect(dispatch({ctrlKey: true, key: '0', keyCode: 48})).toBe(false);
    });

    it('leaves unmodified +/− alone — they are ordinary game keys', () => {
        expect(dispatch({key: '-', keyCode: 189})).toBe(false);
        expect(dispatch({key: '+', keyCode: 187})).toBe(false);
    });

    it('leaves other Ctrl combos alone (Ctrl+R must still reload)', () => {
        expect(dispatch({ctrlKey: true, key: 'r', keyCode: 82})).toBe(false);
    });
});
