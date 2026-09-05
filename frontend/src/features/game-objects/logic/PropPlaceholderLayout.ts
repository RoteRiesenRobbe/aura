/**
 * The pure geometry behind the prop placeholder (plan-prop-placeholders.md
 * §4.2 / §4.3): what shape to draw, and how big the name can be inside it.
 *
 * ⚑ It lives in its own module rather than inside Props.ts for one concrete
 * reason: Props.ts reaches `require.context` at import time, which only webpack
 * provides. Anything importing it is untestable under vitest. Keeping the math
 * here — no PixiJS, no build-time magic, plain numbers in and out — is what
 * lets the auto-fit rule, which is the part most likely to be tuned, have
 * tests at all.
 */

/** The authored `body` block of an api/props/*.json definition. */
export interface PropBodyJSON {
    radius?: number;
    width?: number;
    height?: number;
}

/**
 * The footprint to draw, in the SAME units as the streamed size — i.e. px.
 * Half-extents rather than width/height because everything downstream (the
 * Graphics call, the inscribed-rectangle fit) wants them from the centre.
 */
export interface PropFootprint {
    isRect: boolean;
    halfWidth: number;
    halfHeight: number;
}

/**
 * Resolve the drawn footprint from the authored body and the streamed size.
 *
 * ⭐ `size` is the wire `Resource.radius`: PropBody.VisualRadius() in px, which
 * for a rect is its MAX half-extent and for a circle is the radius — and which
 * already carries the placement's per-placement `scale` (world/zone.go
 * VisualBody). So the aspect comes from the definition and the absolute size
 * comes from the wire, and a scaled placement is right for free.
 *
 * This is the same reconstruction SimpleProp.initShape does for a sprite
 * (`size * 2 * (aspect.width / max)`), stated once in half-extent form.
 */
export function propFootprint(body: PropBodyJSON, size: number): PropFootprint {
    const isRect = body.width !== undefined && body.height !== undefined;
    if (!isRect) {
        return {isRect: false, halfWidth: size, halfHeight: size};
    }
    const max = Math.max(body.width, body.height);
    // max > 0 is guaranteed by the server's parse (both dimensions positive),
    // but a hand-edited def reaching the client mid-edit should not divide by
    // zero into a NaN-sized Graphics that renders nothing and logs nothing.
    if (!(max > 0)) {
        return {isRect: true, halfWidth: size, halfHeight: size};
    }
    return {
        isRect: true,
        halfWidth: size * (body.width / max),
        halfHeight: size * (body.height / max),
    };
}

// Label auto-fit rails (D3: the name scales within the bounds, never outside
// them). All [PLACEHOLDER] — the in-game pass is what settles them.
//
// The reference size is what the caller measures the text at; the fit is a
// pure ratio from that measurement, so the number itself only has to be large
// enough that rounding in the measurement does not matter.
export const LABEL_REFERENCE_FONT_SIZE = 32;
// Below this the name is DROPPED rather than drawn illegibly or allowed to
// spill — a 0.4-unit tombstone is 96 px across and most names do not fit.
export const LABEL_MIN_FONT_SIZE = 7;
// And above this a house-sized prop gets a name, not a billboard.
export const LABEL_MAX_FONT_SIZE = 26;
// Fraction of the footprint the label may occupy, so it never touches the
// outline it is meant to sit inside.
export const LABEL_INSET = 0.84;

/**
 * The font size the name should render at inside `footprint`, or `null` when
 * it cannot be drawn legibly and should be dropped.
 *
 * `textWidth`/`textHeight` are the measured extents at LABEL_REFERENCE_FONT_SIZE.
 *
 * ⭐ A circle is fitted against the largest inscribed rectangle OF THE TEXT'S
 * OWN ASPECT, not against its bounding square. For a chord of aspect
 * a = w/h inside radius r that rectangle is 2ra/√(a²+1) by 2r/√(a²+1) — and
 * since names are far wider than they are tall, the square would have thrown
 * away most of the usable width and dropped labels that fit comfortably.
 */
export function propLabelFontSize(
    footprint: PropFootprint,
    textWidth: number,
    textHeight: number,
    referenceFontSize: number = LABEL_REFERENCE_FONT_SIZE,
): number | null {
    if (!(textWidth > 0) || !(textHeight > 0)) {
        return null;
    }

    let scale: number;
    if (footprint.isRect) {
        const boxW = footprint.halfWidth * 2 * LABEL_INSET;
        const boxH = footprint.halfHeight * 2 * LABEL_INSET;
        scale = Math.min(boxW / textWidth, boxH / textHeight);
    } else {
        const r = footprint.halfWidth * LABEL_INSET;
        const aspect = textWidth / textHeight;
        scale = (2 * r) / (textHeight * Math.sqrt(aspect * aspect + 1));
    }

    const fitted = referenceFontSize * scale;
    if (fitted < LABEL_MIN_FONT_SIZE) {
        return null;
    }
    return Math.min(fitted, LABEL_MAX_FONT_SIZE);
}
