import {describe, expect, it} from 'vitest';
import {advanceEase, aimColor, aimRadius, drawnColor, gone, lerpRgb, leave, newEase, revive} from './LightEase';

const MS = 300;

describe('lerpRgb', () => {
    it('lerps each channel on its own', () => {
        expect(lerpRgb(0x000000, 0xffffff, 0.5)).toBe(0x808080);
        expect(lerpRgb(0xff0000, 0x0000ff, 0)).toBe(0xff0000);
        expect(lerpRgb(0xff0000, 0x0000ff, 1)).toBe(0x0000ff);
    });
});

describe('a light easing in (plan-lightmap.md D11)', () => {
    it('fades in from nothing at its full radius', () => {
        const e = newEase(240, 0xffb060);
        expect(e.fade.value).toBe(0);
        expect(e.radius.value).toBe(240);
        advanceEase(e, MS / 2, MS);
        expect(e.fade.value).toBeCloseTo(0.5);
        advanceEase(e, MS / 2, MS);
        expect(e.fade.value).toBe(1);
    });

    it('eases a radius change instead of snapping', () => {
        const e = newEase(240, 0xffffff);
        aimRadius(e, 480);
        expect(e.radius.value).toBe(240);
        advanceEase(e, MS / 2, MS);
        expect(e.radius.value).toBeCloseTo(360);
        advanceEase(e, MS, MS);
        expect(e.radius.value).toBe(480);
    });

    it('eases a colour change, even at an unchanged radius', () => {
        const e = newEase(240, 0x000000);
        aimColor(e, 0xffffff);
        expect(drawnColor(e)).toBe(0x000000);
        advanceEase(e, MS / 2, MS);
        expect(drawnColor(e)).toBe(0x808080);
        advanceEase(e, MS, MS);
        expect(drawnColor(e)).toBe(0xffffff);
    });

    it('turns a colour around from where it had got to', () => {
        const e = newEase(240, 0x000000);
        aimColor(e, 0xffffff);
        advanceEase(e, MS / 2, MS);
        aimColor(e, 0x000000);
        expect(drawnColor(e)).toBe(0x808080);
    });

    it('re-aiming the same colour is a no-op', () => {
        const e = newEase(240, 0x000000);
        aimColor(e, 0xffffff);
        advanceEase(e, MS / 2, MS);
        aimColor(e, 0xffffff);
        advanceEase(e, MS / 2, MS);
        expect(drawnColor(e)).toBe(0xffffff);
    });
});

describe('a light easing out', () => {
    it('fades out where it stands and is then gone', () => {
        const e = newEase(240, 0xffffff);
        advanceEase(e, MS, MS);
        leave(e);
        expect(gone(e)).toBe(false);
        advanceEase(e, MS / 2, MS);
        expect(e.fade.value).toBeCloseTo(0.5);
        expect(e.radius.value).toBe(240);
        advanceEase(e, MS, MS);
        expect(gone(e)).toBe(true);
    });

    it('comes back from where it had faded to when its entity returns', () => {
        const e = newEase(240, 0xffffff);
        advanceEase(e, MS, MS);
        leave(e);
        advanceEase(e, MS / 2, MS);
        revive(e);
        expect(e.leaving).toBe(false);
        expect(e.fade.value).toBeCloseTo(0.5);
        advanceEase(e, MS, MS);
        expect(e.fade.value).toBe(1);
        expect(gone(e)).toBe(false);
    });

    it('a light that is still fading in is never gone', () => {
        const e = newEase(240, 0xffffff);
        expect(gone(e)).toBe(false);
    });
});
