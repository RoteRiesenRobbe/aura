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
