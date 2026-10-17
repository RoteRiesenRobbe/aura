/**
 * The shape every light draws with (plan-lightmap.md D10): three numbers
 * along the radius, one global set for every light, static and wire alike.
 *
 *   heart  the WHITE heart sprite's radius, as a fraction of its light's
 *          (0 = no heart, today's look); the colour shows outside it
 *   core   the fraction of the radius that is fully lit before the fade
 *   curve  the fade's shape: 0 = linear (today), 1 = smoothstep, blended
 *
 * Kept free of PixiJS and the DOM so the maths is unit-testable.
 */
export interface LightShape {
    heart: number;
    core: number;
    curve: number;
}

/** One colour stop of a light's radial gradient: `offset` 0 = where the fade
 *  starts (the core's edge), 1 = the rim. */
export interface FadeStop {
    offset: number;
    alpha: number;
}

// Enough stops that a canvas gradient, which interpolates LINEARLY between
// them, reads as the curve: a 256 px texture's fade is ~58 px wide, so 16
// segments are under 4 px each.
const CURVE_SEGMENTS = 16;

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

/**
 * The fade from fully lit (alpha 1) to nothing (alpha 0).
 *
 * ⭐ `curve` 0 is EXACTLY today's two stops, not a sampled straight line: the
 * pixel legs' parity rests on the defaults drawing the same texture as the
 * build they were recorded on, and 17 stops along a line could round
 * differently.
 */
export function fadeStops(curve: number): FadeStop[] {
    if (curve <= 0) {
        return [{offset: 0, alpha: 1}, {offset: 1, alpha: 0}];
    }
    const stops: FadeStop[] = [];
    for (let i = 0; i <= CURVE_SEGMENTS; i++) {
        const t = i / CURVE_SEGMENTS;
        stops.push({offset: t, alpha: 1 - ((1 - curve) * t + curve * smoothstep(t))});
    }
    return stops;
}

function clamp01(v: number): number {
    return Math.min(1, Math.max(0, v));
}

/**
 * A shape the console may hand in, merged over `current` and clamped. A knob
 * that is missing or not a number keeps its current value.
 */
export function normalizeShape(next: Partial<LightShape>, current: LightShape = {heart: 0, core: 0, curve: 0}): LightShape {
    const pick = (key: keyof LightShape) => (typeof next[key] === 'number' && !Number.isNaN(next[key]))
        ? clamp01(next[key])
        : current[key];
    return {heart: pick('heart'), core: pick('core'), curve: pick('curve')};
}
