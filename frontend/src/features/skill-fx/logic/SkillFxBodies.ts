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

/** Bone and its outline: pale and dark together read on fur, grass and dirt alike. */
const TOOTH = 0xf4f0e4;
const TOOTH_OUTLINE = 0x2a2320;
const JAW_TEETH = 8;
const JAW_SEGMENTS = 10;
const JAW_HALF_WIDTH_FACTOR = 1.15;

/**
 * `impact` / `snap`: ONE jaw, a lens-shaped gum with a row of teeth, long fangs
 * in the middle and short ones at the corners (PO 2026-09-20: "should read more
 * like actual jaws"). `side` -1 is the upper jaw (−y is up), +1 the lower one.
 *
 * The bite line is the body's own y = 0, so the Fx draws each jaw ONCE and
 * closes the pair by MOVING them together: the teeth keep their size and
 * nothing is rebuilt per frame. The skill's colour is the gum line, so a poison
 * bite still reads as poison.
 */
export function drawImpactJawPlaceholder(
    g: Graphics, color: number, sizePx: number, side: -1 | 1,
): Graphics {
    const r = Math.max(10, sizePx);
    const halfWidth = r * JAW_HALF_WIDTH_FACTOR;
    const outline = Math.max(1.5, r * 0.07);
    const toothLen = (x: number) => r * 0.5 * (0.3 + 0.7 * (1 - Math.abs(x) / halfWidth));
    const gum = (x: number) => r * 0.22 * (1 - (x / halfWidth) ** 2);
    const outer = () => {
        g.moveTo(-halfWidth, 0);
        for (let i = 1; i <= JAW_SEGMENTS; i++) {
            const x = -halfWidth + (2 * halfWidth * i) / JAW_SEGMENTS;
            g.lineTo(x, side * (toothLen(x) + gum(x)));
        }
    };
    g.clear();
    outer();
    // Back along the teeth: root, tip, root... every tip on the bite line.
    for (let i = JAW_TEETH * 2 - 1; i >= 1; i--) {
        const x = -halfWidth + (2 * halfWidth * i) / (JAW_TEETH * 2);
        g.lineTo(x, i % 2 === 1 ? 0 : side * toothLen(x));
    }
    g.closePath()
        .fill({color: TOOTH, alpha: 0.97})
        .stroke({color: TOOTH_OUTLINE, width: outline, alpha: 0.95});
    // The gum line, in the skill's colour.
    outer();
    return g.stroke({color, width: outline * 1.6, alpha: 0.9});
}

/** How far each jaw sits from the bite line when wide open, in victim radii. */
export const JAW_OPEN_GAP_FACTOR = 0.75;

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

/**
 * `strike` / `overhead`: a shaft with a HAMMER HEAD at the far end - a heavy
 * block set ACROSS the shaft, clearly wider than the handle (PO 2026-09-20:
 * "reads like an actual hammer head"). The head is sized off the weapon's
 * length, not its thickness, so it stays a hammer at any reach.
 */
export function drawHammerPlaceholder(
    g: Graphics, accent: number, lengthPx: number, thicknessPx: number,
): Graphics {
    const shaft = Math.max(3, thicknessPx * 0.8);
    // Along the shaft, and across it: a maul is broader than it is deep.
    const headLen = Math.max(16, lengthPx * 0.2);
    const headHalf = Math.max(14, lengthPx * 0.19);
    const base = lengthPx - headLen;
    const face = headHalf * 0.3;
    return g.clear()
        .rect(0, -shaft / 2, base + headLen * 0.5, shaft)
        .fill({color: WOOD, alpha: 0.95})
        .rect(base, -headHalf, headLen, headHalf * 2)
        .fill({color: STEEL, alpha: 0.97})
        // The two striking faces take the accent: in an arc it is a SIDE of
        // the head that lands, whichever way the hammer was raised.
        .rect(base, -headHalf, headLen, face)
        .fill({color: accent, alpha: 0.9})
        .rect(base, headHalf - face, headLen, face)
        .fill({color: accent, alpha: 0.9})
        .rect(base, -headHalf, headLen, headHalf * 2)
        .stroke({color: TOOTH_OUTLINE, width: Math.max(1.5, headLen * 0.08), alpha: 0.9});
}

// --- the C2b placeholders ---------------------------------------------------
//
// Ugly on purpose (§12d.4). All three are drawn around the ORIGIN so the kind
// only has to position, rotate, scale and fade them.

/**
 * `cast-pose`: a small bow, drawn as an arc with its string, opening along +X.
 *
 * Drawn opening along +X; the kind rotates it. On `hit` it aims at the victim
 * (PO 2026-09-20). On `fired` there is nothing to aim at (a Character keeps a
 * fixed portrait rotation and the wire heading is discarded client-side,
 * `Character.ts:88`), so it stays facing +X.
 */
export function drawCastPoseBowPlaceholder(g: Graphics, color: number, sizePx: number): Graphics {
    const r = Math.max(10, sizePx);
    const span = Math.PI * 0.6;
    const from = -span / 2;
    const to = span / 2;
    return g.clear()
        .moveTo(Math.cos(from) * r, Math.sin(from) * r)
        .arc(0, 0, r, from, to)
        .stroke({color: WOOD, width: Math.max(2.5, r * 0.16), alpha: 0.95})
        // The string, and the accent nock that says whose spell this is.
        .moveTo(Math.cos(from) * r, Math.sin(from) * r)
        .lineTo(Math.cos(to) * r, Math.sin(to) * r)
        .stroke({color: PALE_WOOD, width: Math.max(1, r * 0.06), alpha: 0.8})
        .circle(r * 0.35, 0, Math.max(2, r * 0.13))
        .fill({color, alpha: 0.9});
}

/**
 * `orbit`: the §4.1 placeholder wedge - an axe head on a short haft, pointing
 * outward along +X so a ring of them reads as blades rather than as dots.
 */
export function drawOrbitWedgePlaceholder(g: Graphics, color: number, sizePx: number): Graphics {
    const r = Math.max(7, sizePx);
    return g.clear()
        .rect(-r * 0.9, -r * 0.12, r * 1.2, r * 0.24)
        .fill({color: WOOD, alpha: 0.95})
        .poly([r * 0.25, -r * 0.55, r, 0, r * 0.25, r * 0.55])
        .fill({color: STEEL, alpha: 0.95})
        .poly([r * 0.25, -r * 0.55, r, 0, r * 0.25, r * 0.55])
        .stroke({color, width: Math.max(1.5, r * 0.18), alpha: 0.95});
}

/**
 * A cast's `orbit` at the skill's reach: a HELD axe, its haft starting at the
 * wielder and its head sweeping along the inside of the range ring (PO
 * 2026-09-20: the effect starts at the player and shows where someone could be
 * hit). Drawn along +X from 0 to `lengthPx`, the bit on the +Y side, which is
 * the side that LEADS a clockwise orbit on screen.
 */
export function drawHeldAxePlaceholder(g: Graphics, color: number, lengthPx: number): Graphics {
    const length = Math.max(30, lengthPx);
    const haft = Math.max(4, length * 0.035);
    const head = Math.max(18, length * 0.2);
    const bit = [
        length - head, 0,
        length - head * 1.15, head * 0.95,
        length * 0.995, head * 0.8,
        length, 0,
    ];
    return g.clear()
        .rect(0, -haft / 2, length, haft)
        .fill({color: WOOD, alpha: 0.95})
        .poly(bit)
        .fill({color: STEEL, alpha: 0.95})
        .poly(bit)
        .stroke({color, width: Math.max(2, head * 0.1), alpha: 0.95});
}

/**
 * `emitter`: one particle, a filled dot with a soft halo, drawn at unit size so
 * the Fx can scale it per frame without a redraw.
 *
 * ⚑ A Graphics, not a `Particle` in a `ParticleContainer`: pixi.js 8.4.1 (the
 * installed version) ships neither, and the manager holds no renderer to
 * `generateTexture` a sprite from. At these counts (≤ 12 a layer) the pooled
 * Graphics the other kinds already use is the simpler answer.
 */
export function drawParticlePlaceholder(g: Graphics, color: number, radiusPx: number): Graphics {
    const r = Math.max(1.5, radiusPx);
    return g.clear()
        .circle(0, 0, r * 1.8)
        .fill({color, alpha: 0.22})
        .circle(0, 0, r)
        .fill({color, alpha: 0.9});
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
