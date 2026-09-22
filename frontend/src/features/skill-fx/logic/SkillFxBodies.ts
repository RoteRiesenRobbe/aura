/**
 * Skill VFX bodies (plan-skill-vfx.md C3a, §6 + §12f): a layer's `body` names a
 * PNG in `features/skill-fx/assets/bodies/`, and every kind ships a procedural
 * placeholder so a skill is authorable before any art exists.
 *
 * ⭐ Since C3a the art is REAL: the file name IS the link ("body": "arrow"
 * draws `arrow.png`), and a resolved body draws as a pooled Sprite instead of
 * the Graphics below. There is no packer and no atlas - the FOLDER is the
 * contract (§12f.2), discovered by webpack, with `api/skill-fx/bodies.json` as
 * Go's copy of the same list. A name the folder lacks logs once and still draws
 * its placeholder: authoring a body ahead of the art stays visible without
 * breaking the draw.
 *
 * ⚑ THE SPLIT, and why it is here. This module holds no webpack and no
 * `Assets`: it is in the vitest graph (SkillFxKinds.test.ts reaches it through
 * SkillFxKinds), and vitest is not webpack, so a `require.context` at import
 * would redden the suite. The discovery half lives in {@link SkillFxBodyFiles},
 * which is imported for its side effect by Game.ts alone and feeds this one
 * through `declareBodies` + `setBodyTexture`. What stays here is pure: a name
 * table, a texture table, and the lookup the kinds call.
 *
 * ⚑ The bodies load through `Preloading`, which BLOCKS BOOT until they land -
 * the opposite of RegionPaint.ts, whose header explains why a tile per profile
 * across every zone must NOT. Three small PNGs are nothing, and a body that
 * arrived late would draw a placeholder for the first fight of the session.
 * ⭐ Named trigger for moving to lazy loading: the folder passing roughly the
 * ~16 bodies that also trigger the packer (§12f.2), or one body big enough to
 * be felt on the start screen.
 *
 * The placeholders are deliberately plain Graphics - a ring, a dot, a kinked
 * line, a ribbon, three blocky weapons - tinted by SkillFxPalette. They are
 * read as "this is where the art goes", never as art. Every size below is
 * [PLACEHOLDER].
 */
import {Graphics} from 'pixi.js';
import type {Texture} from 'pixi.js';
import {jaggedPolyline, JAG_AMPLITUDE_PX, JAG_SEGMENTS} from './SkillFxMath';

/** Every name the bodies folder holds, whether or not its texture has landed. */
const knownBodies = new Set<string>();
/** Bodies whose texture finished loading. Nothing else is drawable. */
const bodyTextures: { [name: string]: Texture } = {};

/** Named bodies already warned about, so the log is once per name, not per hit. */
const warnedBodies = new Set<string>();

/**
 * The body name a webpack `require.context` key stands for: `./wolf-jaw.png`
 * is the body `wolf-jaw`. Pure, and the one piece of the discovery half that
 * can be unit-tested - the context itself cannot.
 *
 * ⚑ LOWERCASE `.png` only, and deliberately so: the `require.context` regex in
 * {@link SkillFxBodyFiles} and `tools/make-skill-fx-manifest.mjs` both match
 * lowercase, so a file named `Arrow.PNG` is not a body anywhere - webpack never
 * hands it over and the manifest never lists it. Folding the case HERE alone
 * would invent a name the other two do not know.
 */
export function bodyNameOf(key: string): string {
    return key.replace(/^\.\//, '').replace(/\.png$/, '');
}

/**
 * What the folder holds, called once at import by {@link SkillFxBodyFiles}.
 * Separate from {@link setBodyTexture} on purpose: a name is known the moment
 * webpack has seen the file, while its texture is known only after it decodes,
 * and only the first of those two decides whether a `body` is a content typo.
 */
export function declareBodies(names: readonly string[]): void {
    names.forEach(name => knownBodies.add(name));
}

/** One decoded body texture. A file that failed to load never calls this. */
export function setBodyTexture(name: string, texture: Texture): void {
    bodyTextures[name] = texture;
}

/**
 * The texture a layer's `body` draws, or null for "draw the placeholder".
 *
 * Null covers three cases and only one of them is a mistake: no `body` authored
 * at all (most layers, and the procedural look is the intended one for `flash`
 * and particles by ruling), a body still decoding, and a body the folder does
 * not hold - which warns, once per name.
 */
export function resolveBody(body: string | undefined): Texture | null {
    if (!body) {
        return null;
    }
    const texture = bodyTextures[body];
    if (texture) {
        return texture;
    }
    if (!knownBodies.has(body) && !warnedBodies.has(body)) {
        warnedBodies.add(body);
        console.warn(`[skill-fx] body "${body}" is not a PNG in features/skill-fx/assets/bodies `
            + `- drawing the placeholder`);
    }
    return null;
}

// --- the placeholders -------------------------------------------------------

/**
 * The engine's hit mark (§12g.1 call 2): a ring with short radial ticks,
 * centred on the victim and NEVER rotated by the caster's direction (§12c.1: a
 * hit is a small round mark, the attack is what points). `sizePx` is the
 * victim's own radius, so a mark on a boar reads at the same weight as one on
 * a wolf; the Fx scales the whole thing outward as it fades.
 *
 * ⚑ Not a placeholder in the sense of the others: no artist replaces it, the
 * mark is code-drawn for good. It keeps the suffix because the SHAPE is still
 * [PLACEHOLDER] until the PO has looked at it on a phone.
 */
export const BURST_TICKS = 7;

export function drawHitMarkPlaceholder(g: Graphics, color: number, sizePx: number): Graphics {
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
const JAW_TEETH = 6;
/** The jaw's height at the hinge, as a share of its length. */
const JAW_ROOT_HEIGHT_RATIO = 0.3;

/**
 * `strike` / `bite` (§12g.2): ONE upper jaw, hinged at the LEFT edge and
 * reaching right to `lengthPx`, a tapering snout with a row of teeth whose tips
 * all sit on the bite line y = 0 (PO 2026-09-20: "should read more like actual
 * jaws"). The lower jaw is this same body with its y scale negated, so the Fx
 * draws the pair once and closes it by rotating both about the hinge; nothing
 * is rebuilt per frame. The skill's colour is the gum line, so a poison bite
 * still reads as poison.
 *
 * Same frame as the `wolf-jaw.png` contract (`docs/art/skill-vfx-asset-spec.md`):
 * hinge at (0, 0), snout toward +x, the picture ABOVE the bite line (−y).
 */
export function drawStrikeJawPlaceholder(g: Graphics, color: number, lengthPx: number): Graphics {
    const len = Math.max(24, lengthPx);
    const root = len * JAW_ROOT_HEIGHT_RATIO;
    const outline = Math.max(1.5, len * 0.03);
    // The muzzle line, thick at the hinge and thinning to the snout.
    const gum = (x: number) => -root * (0.45 + 0.55 * (1 - x / len));
    const fang = (i: number) => (i === 1 || i === JAW_TEETH - 2) ? 1 : 0.6;
    g.clear().moveTo(0, gum(0)).lineTo(len, gum(len) * 0.35);
    // Back along the teeth toward the hinge: root, tip, root... every tip on
    // the bite line, the long fangs second from each end.
    for (let i = JAW_TEETH - 1; i >= 0; i--) {
        const x0 = (len * i) / JAW_TEETH;
        const x1 = (len * (i + 1)) / JAW_TEETH;
        const rootY = gum((x0 + x1) / 2) * (1 - fang(i) * 0.6);
        g.lineTo(x1, rootY).lineTo((x0 + x1) / 2, 0).lineTo(x0, rootY);
    }
    g.closePath()
        .fill({color: TOOTH, alpha: 0.97})
        .stroke({color: TOOTH_OUTLINE, width: outline, alpha: 0.95});
    // The gum line, in the skill's colour.
    return g.moveTo(0, gum(0)).lineTo(len, gum(len) * 0.35)
        .stroke({color, width: outline * 1.6, alpha: 0.9});
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

/** A `wave` ring's stroke at full strength; it thins as the ring runs out (§12g.2). */
export const WAVE_STROKE_PX = 6;

/**
 * `wave`: one ring of a shock front, REDRAWN per frame because both its radius
 * and its stroke change every frame (the beam precedent: a shape whose geometry
 * moves is cheaper to redraw than to fake with scale, and a scaled stroke would
 * thicken as the ring grew, the opposite of what a front does). Code-drawn for
 * good: the briefing lists the wave among the procedural looks, so this is
 * not a placeholder.
 */
export function drawWaveRing(
    g: Graphics, color: number, radiusPx: number, strokeShare: number,
): Graphics {
    const width = Math.max(1, WAVE_STROKE_PX * strokeShare);
    return g.clear()
        .circle(0, 0, Math.max(1, radiusPx))
        .stroke({color, width, alpha: 0.9});
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
