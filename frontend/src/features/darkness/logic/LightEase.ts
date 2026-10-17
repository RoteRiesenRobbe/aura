import {advanceRamp, ramp, Ramp, rampTo} from '../../regions/logic/Ramp';

/**
 * One wire light's drawn state, easing instead of snapping
 * (plan-lightmap.md D11): its radius, its colour and its fade in and out.
 *
 * ⚑ Only what is DRAWN. `isHidden` reads the wire's target radius, never these
 * values, so a nameplate in the dark changes on exactly the frame it always
 * did. Kept free of PixiJS so the state machine is unit-testable.
 */
export interface LightEase {
    /** Drawn radius in px, easing toward the wire's. */
    radius: Ramp;
    /** Opacity: 0 → 1 on arrival, 1 → 0 on {@link leave}. */
    fade: Ramp;
    /** The colour lerps `colorFrom` → `colorTo` by `color.value` (0..1). */
    colorFrom: number;
    colorTo: number;
    color: Ramp;
    /** Fading out, to be destroyed once {@link gone}. */
    leaving: boolean;
}

/** A light that has just appeared: at its full radius, fading in. */
export function newEase(radiusPx: number, color: number): LightEase {
    const fade = ramp(0);
    rampTo(fade, 1);
    return {radius: ramp(radiusPx), fade, colorFrom: color, colorTo: color, color: ramp(1), leaving: false};
}

export function aimRadius(e: LightEase, radiusPx: number) {
    rampTo(e.radius, radiusPx);
}

/** Heads for a new colour from wherever the drawn one is now. Re-aiming the
 *  colour already targeted changes nothing (called every frame). */
export function aimColor(e: LightEase, color: number) {
    if (color === e.colorTo) {
        return;
    }
    e.colorFrom = drawnColor(e);
    e.colorTo = color;
    e.color = ramp(0);
    rampTo(e.color, 1);
}

/** Starts fading out, where the light stands. */
export function leave(e: LightEase) {
    e.leaving = true;
    rampTo(e.fade, 0);
}

/** Its entity came back mid-fade: fade back in from where it got to. */
export function revive(e: LightEase) {
    e.leaving = false;
    rampTo(e.fade, 1);
}

export function advanceEase(e: LightEase, deltaMS: number, durationMS: number) {
    advanceRamp(e.radius, deltaMS, durationMS);
    advanceRamp(e.fade, deltaMS, durationMS);
    advanceRamp(e.color, deltaMS, durationMS);
}

export function drawnColor(e: LightEase): number {
    return lerpRgb(e.colorFrom, e.colorTo, e.color.value);
}

/** Faded all the way out: destroy it. */
export function gone(e: LightEase): boolean {
    return e.leaving && e.fade.value === 0;
}

/** Per-channel lerp of two 0xRRGGBB colours. */
export function lerpRgb(a: number, b: number, t: number): number {
    const ch = (shift: number) => {
        const x = (a >> shift) & 0xff;
        const y = (b >> shift) & 0xff;
        return Math.round(x + (y - x) * t) << shift;
    };
    return ch(16) | ch(8) | ch(0);
}
