/**
 * Skill VFX bodies (plan-skill-vfx.md C2a, §6): a layer's `body` names an
 * entry in the art atlas, and every kind ships a procedural placeholder so a
 * skill is authorable before any art exists.
 *
 * ⚑ NO ATLAS EXISTS YET, so every lookup is the placeholder. A named `body`
 * logs once per name in dev and still draws it: authoring a body ahead of the
 * art is a content mistake this makes visible without breaking the draw.
 *
 * The placeholders are deliberately plain Graphics - a ring, a dot, a kinked
 * line, a ribbon, three blocky weapons - tinted by SkillFxPalette. They are
 * read as "this is where the art goes", never as art. Every size below is
 * [PLACEHOLDER].
 */
import {Graphics} from 'pixi.js';
import {jaggedPolyline, JAG_AMPLITUDE_PX, JAG_SEGMENTS} from './SkillFxMath';

/** Named bodies already warned about, so the log is once per name, not per hit. */
const warnedBodies = new Set<string>();

/**
 * Whether a named body resolves to atlas art. Always false today; the one
 * place C2b's atlas has to change.
 */
export function resolveBody(body: string | undefined): null {
    if (body && !warnedBodies.has(body)) {
        warnedBodies.add(body);
        console.warn(`[skill-fx] body "${body}" has no atlas entry yet - drawing the placeholder`);
    }
    return null;
}

// --- the placeholders -------------------------------------------------------

/**
 * `impact` / `burst`: a ring with short radial ticks, centred on the victim and
 * NEVER rotated by the caster's direction (§12c.1: an impact is a small round
 * mark, the swing is what points). `sizePx` is the victim's own radius, so a
 * burst on a boar reads at the same weight as one on a wolf; the Fx scales the
 * whole thing outward as it fades.
 */
export const BURST_TICKS = 7;

export function drawImpactBurstPlaceholder(g: Graphics, color: number, sizePx: number): Graphics {
    const r = Math.max(9, sizePx);
    const width = Math.max(2, r * 0.14);
    g.clear().circle(0, 0, r).stroke({color, width, alpha: 0.95});
    for (let i = 0; i < BURST_TICKS; i++) {
        const a = (i / BURST_TICKS) * Math.PI * 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        g.moveTo(cos * r * 1.05, sin * r * 1.05)
            .lineTo(cos * r * 1.45, sin * r * 1.45);
    }
    return g.stroke({color, width: width * 0.8, alpha: 0.8});
}

/**
 * `impact` / `snap`: two opposing jaw arcs above and below the victim's centre.
 * The Fx closes them by scaling the whole body down, so the bite reads as teeth
 * meeting rather than as a mark appearing.
 */
export function drawImpactSnapPlaceholder(g: Graphics, color: number, sizePx: number): Graphics {
    const r = Math.max(9, sizePx);
    const width = Math.max(2.5, r * 0.2);
    const span = Math.PI * 0.55;
    g.clear();
    // Upper jaw, then the lower one. Each arc is moved to explicitly: an arc
    // continued from an open path draws the line into it as well.
    for (const centre of [-Math.PI / 2, Math.PI / 2]) {
        const from = centre - span / 2;
        g.moveTo(Math.cos(from) * r, Math.sin(from) * r)
            .arc(0, 0, r, from, centre + span / 2)
            .stroke({color, width, alpha: 0.95});
    }
    return g;
}

/** `projectile`: a filled dot with a short trail behind it (−X). */
export function drawProjectilePlaceholder(g: Graphics, color: number, sizePx: number): Graphics {
    const r = Math.max(5, sizePx * 0.32);
    return g.clear()
        .moveTo(-r * 4, 0)
        .lineTo(-r, 0)
        .stroke({color, width: r * 0.9, alpha: 0.35})
        .circle(0, 0, r)
        .fill({color, alpha: 0.9})
        .circle(0, 0, r * 0.45)
        .fill({color: 0xffffff, alpha: 0.8});
}

/**
 * `beam` / `flash`: a kinked line from the caster to the victim. Redrawn each
 * frame because the endpoints follow both entities and the width follows the
 * envelope - the one placeholder that is not a static shape.
 */
export function drawBeamFlashPlaceholder(
    g: Graphics, color: number,
    fromX: number, fromY: number, toX: number, toY: number,
    widthPx: number, alpha: number, seed: number,
): Graphics {
    const points = jaggedPolyline(fromX, fromY, toX, toY, JAG_SEGMENTS, JAG_AMPLITUDE_PX, seed);
    g.clear().moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i].x, points[i].y);
    }
    // A wide soft pass under a thin white core: the cheapest thing that reads
    // as a bolt rather than as a line.
    g.stroke({color, width: widthPx * 2.6, alpha: alpha * 0.4});
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        g.lineTo(points[i].x, points[i].y);
    }
    return g.stroke({color: 0xffffff, width: widthPx, alpha});
}

// --- the strike weapons -----------------------------------------------------
//
// One placeholder per style (PO 2026-09-19, §12c.1): a spear thrusts, a blade
// swings, a hammer comes down. All three are drawn along +X from the origin,
// which is the attacker's hand, so the Fx only has to position, rotate and
// scale them. Steel and wood are neutral; the skill's damage-type colour (or
// the layer's `tint`) is the EDGE, so a fire hammer still reads as fire.

const STEEL = 0xc9d1da;
const WOOD = 0x8a5a2b;
const PALE_WOOD = 0xd9b98a;
const OUTLINE = 0x2a1c10;

/** `strike` / `thrust`: a thin shaft with a small triangular head. */
export function drawSpearPlaceholder(
    g: Graphics, accent: number, lengthPx: number, thicknessPx: number,
): Graphics {
    // ⚑ A 2 px brown shaft vanished against ground and fur in the first look
    // (only the head read, as a stray triangle): the shaft is pale, outlined
    // dark and about as thick as the blade, so the whole weapon reads at once.
    const shaft = Math.max(3.5, thicknessPx * 0.9);
    const headLen = Math.min(lengthPx * 0.3, thicknessPx * 7);
    const headHalf = thicknessPx * 1.8;
    const base = lengthPx - headLen;
    return g.clear()
        .rect(0, -shaft / 2, base, shaft)
        .fill({color: PALE_WOOD, alpha: 0.95})
        .rect(0, -shaft / 2, base, shaft)
        .stroke({color: OUTLINE, width: 1.2, alpha: 0.9})
        .poly([base, -headHalf, lengthPx, 0, base, headHalf])
        .fill({color: STEEL, alpha: 0.95})
        .poly([base, -headHalf, lengthPx, 0, base, headHalf])
        .stroke({color: accent, width: Math.max(1.5, thicknessPx * 0.4), alpha: 0.95});
}

/** `strike` / `swing`: the prototype's tapered blade, crossguard and grip. */
export function drawBladePlaceholder(
    g: Graphics, accent: number, lengthPx: number, thicknessPx: number,
): Graphics {
    const w = thicknessPx;
    const gripEnd = Math.min(14, lengthPx * 0.12);
    const tip = lengthPx;
    return g.clear()
        .poly([gripEnd, -w, tip - w * 2.2, -w * 0.8, tip, 0, tip - w * 2.2, w * 0.8, gripEnd, w])
        .fill({color: STEEL, alpha: 0.95})
        .moveTo(gripEnd + 2, 0)
        .lineTo(tip - 2, 0)
        .stroke({color: accent, width: Math.max(1.5, w * 0.45), alpha: 0.95})
        // Crossguard at the hand, then the grip behind it.
        .rect(gripEnd - 4, -w * 2.4, 5, w * 4.8)
        .fill({color: WOOD})
        .rect(-w, -w * 0.9, gripEnd, w * 1.8)
        .fill({color: WOOD});
}

/** `strike` / `overhead`: a long shaft with a blocky head at the far end. */
export function drawHammerPlaceholder(
    g: Graphics, accent: number, lengthPx: number, thicknessPx: number,
): Graphics {
    const shaft = Math.max(2, thicknessPx * 0.7);
    const headLen = Math.min(lengthPx * 0.26, thicknessPx * 6);
    const headHalf = thicknessPx * 1.9;
    const base = lengthPx - headLen;
    return g.clear()
        .rect(0, -shaft / 2, lengthPx - headLen * 0.4, shaft)
        .fill({color: WOOD, alpha: 0.95})
        .rect(base, -headHalf, headLen, headHalf * 2)
        .fill({color: STEEL, alpha: 0.95})
        // The striking face takes the accent: it is the end that lands.
        .rect(lengthPx - headLen * 0.3, -headHalf, headLen * 0.3, headHalf * 2)
        .fill({color: accent, alpha: 0.9});
}

/** `beam` / `extend`: a soft ribbon, tapering toward its far end. */
export function drawBeamExtendPlaceholder(
    g: Graphics, color: number,
    fromX: number, fromY: number, toX: number, toY: number,
    widthPx: number, alpha: number,
): Graphics {
    return g.clear()
        .moveTo(fromX, fromY)
        .lineTo(toX, toY)
        .stroke({color, width: widthPx * 2.2, alpha: alpha * 0.3})
        .moveTo(fromX, fromY)
        .lineTo(toX, toY)
        .stroke({color, width: widthPx, alpha: alpha * 0.85});
}
