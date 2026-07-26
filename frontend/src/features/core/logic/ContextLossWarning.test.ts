import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {installContextLossWarning} from './ContextLossWarning';
import * as AlertBanner from '../../user-interface/alert-banner/logic/AlertBanner';

/**
 * backlog §29 option A. A lost WebGL context stops the render loop dead while
 * the HUD, the websocket and the server ticks all stay healthy — and PixiJS's
 * own error reporter crashes on the way to reporting it, so the three page
 * errors it leaves behind name the wrong thing entirely. This turns that into
 * one labelled log line plus a banner.
 *
 * The log is the load-bearing half (plan decision 2): the reproduced case is a
 * MID-BOOT loss, i.e. exactly when AlertBanner may not be set up yet — its
 * show() silently no-ops while bannerElement is null. Pinned below rather than
 * fixed.
 */
describe('installContextLossWarning', () => {
    let canvas: HTMLCanvasElement;
    let errorSpy: ReturnType<typeof vi.spyOn>;

    function dispatchLoss(): boolean {
        // Real browsers fire this cancelable — preventing it is what would
        // permit a later restore, which option A deliberately does not do.
        const event = new Event('webglcontextlost', {cancelable: true, bubbles: false});
        canvas.dispatchEvent(event);
        return event.defaultPrevented;
    }

    beforeEach(() => {
        canvas = document.createElement('canvas');
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        errorSpy.mockRestore();
        AlertBanner.clear();
        document.body.innerHTML = '';
        AlertBanner.setup(); // drop the reference to the removed element
    });

    describe('with the HUD banner set up', () => {
        let banner: HTMLElement;

        beforeEach(() => {
            banner = document.createElement('div');
            banner.id = 'alertBanner';
            document.body.appendChild(banner);
            AlertBanner.setup();
        });

        it('logs and raises a red warning banner on context loss', () => {
            installContextLossWarning(canvas);

            dispatchLoss();

            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(String(errorSpy.mock.calls[0][0])).toMatch(/context lost/i);
            expect(banner.className).toContain('warning');
            expect(banner.textContent).toMatch(/reload/i);
        });

        it('stays silent until the context is actually lost', () => {
            installContextLossWarning(canvas);

            expect(errorSpy).not.toHaveBeenCalled();
            expect(banner.className).not.toContain('visible');
        });

        it('does not react to webglcontextrestored — there is nothing to do in it', () => {
            installContextLossWarning(canvas);

            canvas.dispatchEvent(new Event('webglcontextrestored'));

            expect(errorSpy).not.toHaveBeenCalled();
            expect(banner.className).not.toContain('visible');
        });

        it('leaves the default alone (restoring is option B, not taken)', () => {
            installContextLossWarning(canvas);

            expect(dispatchLoss()).toBe(false);
        });

        it('warns about the canvas it was installed on, not any other', () => {
            const other = document.createElement('canvas');
            installContextLossWarning(canvas);

            other.dispatchEvent(new Event('webglcontextlost'));

            expect(errorSpy).not.toHaveBeenCalled();
        });
    });

    it('still logs when the banner does not exist yet (mid-boot loss)', () => {
        AlertBanner.setup(); // no #alertBanner in the document
        installContextLossWarning(canvas);

        expect(() => dispatchLoss()).not.toThrow();
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });
});
