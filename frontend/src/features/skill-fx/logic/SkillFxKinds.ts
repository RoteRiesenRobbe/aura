/**
 * The seven AUTHORABLE motion kinds (plan-skill-vfx.md §4.1) and the registry
 * that IS the closed vocabulary. A kind is ENGINE code: a new one is a plan
 * amendment, not content, which is why SkillFxKinds.test.ts pins this
 * registry's key set against api/skill-vocabulary.json's `visualKinds` in BOTH
 * directions.
 *
 * ⭐ The C3a amendment (§12g) moved the count seven → six → seven. `impact`
 * LEFT the authoring vocabulary: the round hit mark is the ENGINE'S own and no
 * skill file names it, so {@link ImpactFx} is still here but is kept OUT of
 * the registry, under {@link HIT_MARK_KIND}, and {@link kindHandler} answers
 * for it by name. `wave` joined in its place (the mammoth's stomp), and the
 * wolf's bite became a `strike` curve drawn from the BITER.
 *
 * Kinds know nothing about entities: the manager hands them anchors that
 * answer "where is this now" and "is it still on the stage", which is what
 * makes both entity rules the manager's and not seven copies of one:
 *
 * - a `projectile` or a `beam` FINISHES toward the last known position (a bolt
 *   in flight does not vanish when its target dies), and
 * - a `cast-pose`, an `orbit` or an `emitter` STOPS with its owner (§7.1).
 *
 * ⭐ Since C3a every authorable kind but one draws TWO ways (§12f.4 D): a
 * pooled `Sprite` when the layer's `body` resolves to a PNG, the procedural
 * Graphics when it does not. The fork is at CONSTRUCTION only - anchors, one
 * scale factor and the tint - plus the single per-frame redraw a beam needs.
 * Everything that decides where a body is, how it turns and how visible it is
 * stays one code path, because two copies of a motion curve would drift the
 * moment one is tuned. The exception is the `wave`, code-drawn for good like
 * the hit mark (§12g.2): `body` is legal on it by the common keys and ignored.
 */
import {Container, Graphics, Sprite, Texture} from 'pixi.js';
import {VisualLayer} from '../../../client-data/Skills';
import type {VfxDensity} from '../../game-settings/logic/GameSettings';
import {parseTint} from './SkillFxPalette';
import {
    BEAM_CURVE_MS,
    BeamCurve,
    beamExtend,
    beamFlash,
    beamSpriteScale,
    BITE_MIN_LENGTH_PX,
    biteHingePoint,
    biteJawScale,
    biteLengthPx,
    pincerHingePoints,
    PROJECTILE_SIZE_FACTOR,
    landsOnVictim,
    STRIKE_MIN_LENGTH_PX,
    spriteScaleToExtent,
    CAST_POSE_DEFAULT_MS,
    castPoseAlpha,
    clamp01,
    densityCount,
    EMITTER_DEFAULT_COUNT,
    EMITTER_DEFAULT_MS,
    EmitterMotion,
    emitterMotionOf,
    emitterParticle,
    flightMs,
    HIT_MARK_KIND,
    HIT_MARK_MS,
    impactPhase,
    waveCountOf,
    waveRing,
    waveTotalMsOf,
    ORBIT_DEFAULT_COUNT,
    ORBIT_DEFAULT_MS,
    ORBIT_RADIUS_PAD_PX,
    orbitAlpha,
    orbitPoint,
    overheadSide,
    projectilePoint,
    StrikeCurve,
    strikeCurveOf,
    strikeTotalMsOf,
    strikePhase,
    swingDirection,
} from './SkillFxMath';
import {
    drawBeamExtendPlaceholder,
    drawBeamFlashPlaceholder,
    drawBladePlaceholder,
    drawCastPoseBowPlaceholder,
    drawHammerPlaceholder,
    drawHitMarkPlaceholder,
    drawHeldAxePlaceholder,
    drawStrikeJawPlaceholder,
    drawOrbitWedgePlaceholder,
    drawParticlePlaceholder,
    drawProjectilePlaceholder,
    drawSpearPlaceholder,
    drawWaveRing,
    resolveBody,
} from './SkillFxBodies';

/** The seven AUTHORABLE names, in the fixture's order. */
export const VISUAL_KINDS = [
    'strike', 'projectile', 'beam', 'cast-pose', 'orbit', 'emitter', 'wave',
] as const;

export type VisualKind = typeof VISUAL_KINDS[number];

/**
 * The engine's own hit mark (§12g.1 call 2). It is NOT an authorable kind - no
 * skill file may name it and the fixture does not list it - but it keeps the
 * name `impact` because it is the same Fx, and because every harness counter
 * and every C4 number reads `spawnedByKind.impact`. Defined in SkillFxMath, the
 * planner's side of the seam; re-exported here for the manager.
 */
export {HIT_MARK_KIND};

/**
 * Where one end of an Fx is right now. The manager keeps these pointed at live
 * game objects and freezes them at the last known position when an entity
 * despawns, so nothing here has to know what a GameObject is.
 */
export interface FxAnchor {
    point(): { x: number, y: number };
    /**
     * Whether the anchored entity is still on the stage. The three
     * owner-anchored kinds end when it is not - a bolt is the one that carries
     * on to the last known position (§7.1).
     */
    alive(): boolean;
    /** the anchored entity's own radius in px, for sizing a placeholder */
    readonly radiusPx: number;
}

export interface FxSpawnContext {
    layer: Container;
    source: FxAnchor;
    victim: FxAnchor;
    color: number;
    def: VisualLayer;
    /** when this layer's first frame draws (performance.now() ms) */
    startAtMs: number;
    /** deterministic per-spawn seed, so a bolt's kinks are reproducible */
    seed: number;
    /** the live slider: only an emitter's particle COUNT reads it (§12d.1) */
    density: VfxDensity;
    /** the skill's reach in px, 0 for none: a cast's `orbit` circles at it */
    reachPx: number;
}

export interface Fx {
    /** @returns false once it has finished and may be released */
    update(nowMs: number): boolean;
    dispose(): void;
}

export interface KindHandler {
    spawn(ctx: FxSpawnContext): Fx | null;
}

// --- Graphics pools ---------------------------------------------------------
//
// Pooled per kind and capped: a burst of 40 impacts allocates once and every
// tick after that reuses. The cap keeps a one-off fight from retaining a
// screenful of Graphics for the rest of the session.

const POOL_CAP_PER_KIND = 32;
const pools: { [kind: string]: Graphics[] } = {};

function acquire(kind: string): Graphics {
    const pooled = pools[kind]?.pop();
    if (pooled && !pooled.destroyed) {
        pooled.clear();
        pooled.visible = true;
        pooled.alpha = 1;
        pooled.rotation = 0;
        pooled.scale.set(1);
        pooled.position.set(0, 0);
        return pooled;
    }
    return new Graphics();
}

function release(kind: string, g: Graphics): void {
    g.parent?.removeChild(g);
    if (g.destroyed) {
        return;
    }
    g.clear();
    const pool = pools[kind] ?? (pools[kind] = []);
    if (pool.length >= POOL_CAP_PER_KIND) {
        g.destroy();
        return;
    }
    pool.push(g);
}

// --- Sprite pools (C3a, §12f.4 D) -------------------------------------------
//
// Their own pools beside the Graphics ones, same cap, same discipline. Separate
// because the two are not interchangeable: a kind asks for one or the other at
// construction and keeps it for the life of the Fx.

const spritePools: { [kind: string]: Sprite[] } = {};

/**
 * A pooled Sprite showing `texture`, reset to a known state.
 *
 * ⚑ EVERY property any kind sets is reset here, not just the ones this kind
 * will set: pools are shared across an Fx's whole kind, so a `strike` reusing
 * the sprite an `impact` jaw left behind would inherit its (0.5, 1) anchor and
 * its mirrored negative scale, and draw upside down from the wrong grip.
 */
function acquireSprite(kind: string, texture: Texture): Sprite {
    const pooled = spritePools[kind]?.pop();
    const sprite = pooled && !pooled.destroyed ? pooled : new Sprite();
    sprite.texture = texture;
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.set(1);
    sprite.rotation = 0;
    sprite.position.set(0, 0);
    sprite.alpha = 1;
    // §12f.2: white is "as drawn". Only an authored `tint` moves it.
    sprite.tint = 0xffffff;
    sprite.visible = true;
    return sprite;
}

function releaseSprite(kind: string, sprite: Sprite): void {
    sprite.parent?.removeChild(sprite);
    if (sprite.destroyed) {
        return;
    }
    // Let go of the body, so a pooled sprite never pins a texture.
    sprite.texture = Texture.EMPTY;
    const pool = spritePools[kind] ?? (spritePools[kind] = []);
    if (pool.length >= POOL_CAP_PER_KIND) {
        // ⛔ No options: Pixi's default leaves the texture alone, and
        // `{texture: true}` would destroy the body EVERY other Fx of every
        // other kind is drawing from.
        sprite.destroy();
        return;
    }
    pool.push(sprite);
}

/** Hands a display object back to whichever pool it came from. */
function releaseBody(kind: string, body: Container): void {
    if (body instanceof Sprite) {
        releaseSprite(kind, body);
        return;
    }
    release(kind, body as Graphics);
}

/** Drops every pooled display object (reset(): the own player left the world). */
export function clearPools(): void {
    for (const kind of Object.keys(pools)) {
        pools[kind].forEach(g => g.destroy());
        pools[kind] = [];
    }
    for (const kind of Object.keys(spritePools)) {
        spritePools[kind].forEach(s => s.destroy());
        spritePools[kind] = [];
    }
}

// --- resolving a body -------------------------------------------------------

/** Spawns that took the sprite branch, for the harness (`window.game.skillFx()`). */
let spriteSpawnCount = 0;

/**
 * The texture a layer's `body` draws with, or null for "draw the placeholder",
 * counting the spawn if it is a sprite one.
 *
 * ⚑ The counter lives HERE rather than at each of the seven sites: one call per
 * Fx, so an `orbit` with eight bodies counts once (a SPAWN took the sprite
 * branch, not eight of them), and no site can forget it.
 */
function bodyTextureFor(def: VisualLayer): Texture | null {
    const texture = resolveBody(def.body);
    if (texture !== null) {
        spriteSpawnCount++;
    }
    return texture;
}

export function spriteSpawns(): number {
    return spriteSpawnCount;
}

/**
 * A sprite body's tint. ⭐ §12f.2: art is drawn in FULL COLOUR and shown AS
 * DRAWN, so `ctx.color` - the damage-type palette, which colours placeholders -
 * is NOT applied to a sprite. An authored `tint` still multiplies, which is how
 * one white drawing becomes a fire sword and a frost sword.
 */
function spriteTint(def: VisualLayer): number {
    return parseTint(def.tint) ?? 0xffffff;
}

// --- shared layer parameters ------------------------------------------------

function scaleOf(def: VisualLayer): number {
    return def.scale && def.scale > 0 ? def.scale : 1;
}

function beamCurveOf(def: VisualLayer): BeamCurve {
    // Absent = flash (PO 2026-09-19).
    return def.curve === 'extend' ? 'extend' : 'flash';
}

function angle(from: { x: number, y: number }, to: { x: number, y: number }): number {
    return Math.atan2(to.y - from.y, to.x - from.x);
}

// --- the hit mark -----------------------------------------------------------

/**
 * ⭐ THE ENGINE'S OWN MARK (§12g.1 call 2), and the one Fx no content authors:
 * a small ROUND ring bursting outward on the VICTIM of every landed damage hit,
 * in the skill's damage-type colour. The plan spawns exactly one per qualifying
 * hit event, whether or not the skill authors any `visual` at all.
 *
 * It is never rotated by the caster's direction and it is never a picture: the
 * attacker's half of the beat is the `strike`, `projectile` or `beam` the
 * content draws from the ATTACKER, and this mark is CODE-DRAWN FOR GOOD, so it
 * has no sprite branch and the artist never draws one (§12g.1 call 2). The
 * victim's position is re-read per frame, so the mark stays on a mob that is
 * walking away from the hit that landed on it.
 */
class ImpactFx implements Fx {
    private readonly g: Graphics;
    private readonly totalMs: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : HIT_MARK_MS;
        this.g = drawHitMarkPlaceholder(
            acquire(HIT_MARK_KIND), ctx.color, ctx.victim.radiusPx * scaleOf(ctx.def));
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const phase = impactPhase(elapsed, this.totalMs);
        if (phase.done) {
            return false;
        }
        const to = this.ctx.victim.point();
        this.g.visible = true;
        this.g.position.set(to.x, to.y);
        this.g.scale.set(phase.scale);
        this.g.alpha = phase.alpha;
        return true;
    }

    dispose(): void {
        release(HIT_MARK_KIND, this.g);
    }
}

// --- strike -----------------------------------------------------------------

/**
 * The weapon's length when the skill authors no reach (a fallback only), as a
 * share of the attacker's radius. [PLACEHOLDER]
 */
const STRIKE_FALLBACK_LENGTH_FACTOR = 1.5;
/** Weapon thickness as a share of its length, and its floor in px. */
const STRIKE_THICKNESS_RATIO = 0.055;
const STRIKE_MIN_THICKNESS_PX = 4;
/** Where the hand is: this share of the attacker's radius out along the aim. */
const STRIKE_HAND_OFFSET = 0.6;

/**
 * A weapon HELD by the attacker and aimed at the victim (§12c): the spear
 * stabs, the blade sweeps, the hammer winds up and falls.
 *
 * ⚑ The hilt never leaves the hand, and the weapon spans from the hand to the
 * SKILL'S MAX RANGE, not to the victim (PO 2026-09-20, two rulings in one day:
 * a weapon sized to the gap "reads as strange", and a fixed weapon carried to
 * the victim left its hilt "in thin air, where the character could not have it
 * in hand"). So it has one size per skill, shows the reach it threatens, and
 * passes THROUGH a victim standing closer than that reach, by ruling.
 *
 * The attacker's end is re-read per frame and the aim follows the victim, so
 * the weapon tracks both and finishes toward the last known position of
 * whichever of them despawns first. The body is drawn once.
 *
 * ⭐ The `bite` is the exception (§12h call 3, the RIM BITE): not a weapon in
 * a hand but a pair of jaws at the VICTIM's rim, on the point nearest the
 * attacker, sized to the victim (`biteLengthPx`), never to the reach.
 */
class StrikeFx implements Fx {
    private readonly g: Container;
    private readonly curve: StrikeCurve;
    private readonly totalMs: number;
    private readonly lengthPx: number;
    /** scales an art body to the reach; 1 for a placeholder, drawn to length */
    private readonly bodyScale: number;
    /** the swing's alternating side; an overhead latches its own at first draw */
    private sweepDirection: number;
    private sideLatched = false;
    /**
     * A `bite`'s second jaw: the SAME body mirrored in y (§12g.2). Null for
     * every other curve, which is how `update` knows which geometry it is in.
     */
    private lowerJaw: Container | null = null;

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = strikeCurveOf(ctx.def.curve);
        this.totalMs = strikeTotalMsOf(ctx.def.curve, ctx.def.ms);
        const handPx = ctx.source.radiusPx * STRIKE_HAND_OFFSET;
        this.lengthPx = this.curve === 'bite' || this.curve === 'pincer'
            ? biteLengthPx(ctx.victim.radiusPx, BITE_MIN_LENGTH_PX)
            : Math.max(
                STRIKE_MIN_LENGTH_PX,
                ctx.reachPx > 0
                    ? ctx.reachPx - handPx
                    : ctx.source.radiusPx * STRIKE_FALLBACK_LENGTH_FACTOR);
        this.sweepDirection = swingDirection(ctx.seed);
        const texture = bodyTextureFor(ctx.def);
        if (this.curve === 'bite' || this.curve === 'pincer') {
            // ONE jaw body drawn TWICE, the second mirrored through the bite
            // line, both hinged on the victim's rim (§12h). The scale
            // carries the mirror, so it is set ONCE here and `update` never
            // touches it - the generic path below would wipe the negative y.
            this.g = this.jaw(texture, false);
            this.lowerJaw = this.jaw(texture, true);
            this.bodyScale = 1;
            this.lowerJaw.visible = false;
            ctx.layer.addChild(this.lowerJaw);
        } else if (texture !== null) {
            const sprite = acquireSprite('strike', texture);
            // The GRIP is the hand: left edge, vertically centred (§12f.4 A).
            sprite.anchor.set(0, 0.5);
            sprite.tint = spriteTint(ctx.def);
            // ⭐ UNIFORM (§12f.2): the drawing's LENGTH becomes the reach and
            // its aspect is kept. Stretching a sword to 3 u makes a plank.
            this.bodyScale = spriteScaleToExtent(texture.width, this.lengthPx);
            this.g = sprite;
        } else {
            this.g = this.draw(acquire('strike'));
            this.bodyScale = 1;
        }
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const phase = strikePhase(this.curve, elapsed, this.totalMs);
        if (phase.done) {
            return false;
        }
        const from = this.ctx.source.point();
        const to = this.ctx.victim.point();
        const aim = angle(from, to);
        const handPx = this.ctx.source.radiusPx * STRIKE_HAND_OFFSET;
        if (this.lowerJaw !== null) {
            if (this.curve === 'pincer') {
                // The pincer (PO look 2026-09-23): a fang on EACH side of the
                // victim, hinged on the rim perpendicular to the attack line,
                // pointing inward; both gape back toward the attacker by the
                // open angle and swing in to meet at the centre.
                const p = pincerHingePoints(from, to, this.ctx.victim.radiusPx);
                this.g.position.set(p.left.x, p.left.y);
                this.lowerJaw.position.set(p.right.x, p.right.y);
                this.g.rotation = p.leftInward + phase.angleOffset;
                this.lowerJaw.rotation = p.rightInward - phase.angleOffset;
            } else {
                // The rim bite (§12h call 3): both jaws hinge on the SAME point,
                // the victim's rim nearest the attacker, re-read per frame because
                // the victim moves, and gape symmetrically about the attack line
                // toward the victim's centre. `angleOffset` is the open angle
                // rather than a sweep, so `sweepDirection` stays out of it.
                const hinge = biteHingePoint(from, to, this.ctx.victim.radiusPx);
                this.g.position.set(hinge.x, hinge.y);
                this.lowerJaw.position.set(hinge.x, hinge.y);
                this.g.rotation = aim - phase.angleOffset;
                this.lowerJaw.rotation = aim + phase.angleOffset;
            }
            this.g.alpha = phase.alpha;
            this.lowerJaw.alpha = phase.alpha;
            this.g.visible = true;
            this.lowerJaw.visible = true;
            return true;
        }
        // An overhead is raised toward the top of the screen. Latched once: a
        // victim crossing the vertical mid-swing must not flip the hammer.
        if (this.curve === 'overhead' && !this.sideLatched) {
            this.sweepDirection = overheadSide(aim);
            this.sideLatched = true;
        }
        // `offset` moves the hand itself (the overhead's draw-back); `extend`
        // is the stab growing out of the hand. Both in units of the weapon.
        const along = handPx + this.lengthPx * phase.offset;
        this.g.position.set(from.x + Math.cos(aim) * along, from.y + Math.sin(aim) * along);
        this.g.rotation = aim + phase.angleOffset * this.sweepDirection;
        this.g.scale.set(
            this.bodyScale * phase.extend * phase.scale, this.bodyScale * phase.scale);
        this.g.alpha = phase.alpha;
        this.g.visible = true;
        return true;
    }

    /**
     * One jaw of a `bite`, already the right size and the right way up.
     *
     * With art: the artist's UPPER jaw, hinge on the left edge and bite line on
     * the bottom one, so the anchor is (0, 1) and the lower jaw is the same
     * texture with a negated y scale (§12g.2). Without: two tapered wedges of
     * teeth, palette-tinted, drawn to the same geometry so the motion tuned on
     * one reads the same on the other.
     */
    private jaw(texture: Texture | null, lower: boolean): Container {
        if (texture !== null) {
            const sprite = acquireSprite('strike', texture);
            sprite.anchor.set(0, 1);
            const scale = biteJawScale(texture.width, this.lengthPx, lower);
            sprite.scale.set(scale.x, scale.y);
            sprite.tint = spriteTint(this.ctx.def);
            return sprite;
        }
        const g = drawStrikeJawPlaceholder(
            acquire('strike'), this.ctx.color, this.lengthPx * scaleOf(this.ctx.def));
        if (lower) {
            g.scale.set(1, -1);
        }
        return g;
    }

    private draw(g: Graphics): Graphics {
        const thickness = Math.max(
            STRIKE_MIN_THICKNESS_PX, this.lengthPx * STRIKE_THICKNESS_RATIO) * scaleOf(this.ctx.def);
        switch (this.curve) {
            case 'swing':
                return drawBladePlaceholder(g, this.ctx.color, this.lengthPx, thickness);
            case 'overhead':
                return drawHammerPlaceholder(g, this.ctx.color, this.lengthPx, thickness);
            default:
                return drawSpearPlaceholder(g, this.ctx.color, this.lengthPx, thickness);
        }
    }

    dispose(): void {
        releaseBody('strike', this.g);
        if (this.lowerJaw !== null) {
            releaseBody('strike', this.lowerJaw);
            this.lowerJaw = null;
        }
    }
}

// --- projectile -------------------------------------------------------------

/**
 * A body flying caster→victim at the authored speed. The launch point is fixed
 * at spawn (the caster has already released it); the target is tracked while
 * the victim lives and frozen at its last known position afterwards.
 */
class ProjectileFx implements Fx {
    private readonly g: Container;
    private readonly from: { x: number, y: number };
    private readonly flightMsTotal: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.from = ctx.source.point();
        const to = ctx.victim.point();
        this.flightMsTotal = flightMs(
            Math.hypot(to.x - this.from.x, to.y - this.from.y), ctx.def.speed ?? 0);
        const texture = bodyTextureFor(ctx.def);
        if (texture !== null) {
            // Centred, pointing +X, rotated to the travel direction per frame.
            // ⚑ Drawn at the PNG's OWN size times the layer's `scale`, not
            // sized to anything in the world: an arrow is an arrow whoever it
            // is aimed at, and the briefing's canvas sizes are what set it.
            const sprite = acquireSprite('projectile', texture);
            sprite.scale.set(scaleOf(ctx.def) * PROJECTILE_SIZE_FACTOR);
            sprite.tint = spriteTint(ctx.def);
            this.g = sprite;
        } else {
            this.g = drawProjectilePlaceholder(
                acquire('projectile'), ctx.color,
                ctx.victim.radiusPx * scaleOf(ctx.def) * PROJECTILE_SIZE_FACTOR);
        }
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const t = elapsed / this.flightMsTotal;
        if (t >= 1) {
            return false;
        }
        const to = this.ctx.victim.point();
        const p = projectilePoint(this.from.x, this.from.y, to.x, to.y, t);
        this.g.visible = true;
        this.g.position.set(p.x, p.y);
        this.g.rotation = angle(this.from, to);
        this.g.alpha = 1;
        return true;
    }

    dispose(): void {
        releaseBody('projectile', this.g);
    }
}

// --- beam -------------------------------------------------------------------

/** Default stroke width when a `beam` layer authors none. [PLACEHOLDER] */
const BEAM_DEFAULT_WIDTH_PX = 4;

/**
 * A body stretched caster→victim. `flash` (lightning) runs a jagged bolt
 * through an attack/peak/fade envelope; `extend` (flame pillars) grows a
 * ribbon out of the caster end and pulls it home.
 */
class BeamFx implements Fx {
    /** the display object, whichever branch built it */
    private readonly body: Container;
    /** exactly one of these two is set: a beam is the kind that REPAINTS */
    private readonly g: Graphics | null;
    private readonly sprite: Sprite | null;
    private readonly curve: BeamCurve;
    private readonly totalMs: number;
    private readonly widthPx: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.curve = beamCurveOf(ctx.def);
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : BEAM_CURVE_MS[this.curve];
        this.widthPx = (ctx.def.width && ctx.def.width > 0 ? ctx.def.width : BEAM_DEFAULT_WIDTH_PX)
            * scaleOf(ctx.def);
        const texture = bodyTextureFor(ctx.def);
        if (texture !== null) {
            // The caster's end is the origin: anchored at the left edge, mid
            // height, so the body grows out of the hand along +X (§12f.4 A).
            const sprite = acquireSprite('beam', texture);
            sprite.anchor.set(0, 0.5);
            sprite.tint = spriteTint(ctx.def);
            this.sprite = sprite;
            this.g = null;
            this.body = sprite;
        } else {
            this.g = acquire('beam');
            this.sprite = null;
            this.body = this.g;
        }
        this.body.visible = false;
        ctx.layer.addChild(this.body);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        const from = this.ctx.source.point();
        const to = this.ctx.victim.point();
        if (this.curve === 'extend') {
            const phase = beamExtend(elapsed, this.totalMs);
            if (phase.done) {
                return false;
            }
            const e = clamp01(phase.extent);
            this.paint(
                from.x, from.y,
                from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e,
                this.widthPx, phase.alpha);
        } else {
            const phase = beamFlash(elapsed, this.totalMs);
            if (phase.done) {
                return false;
            }
            this.paint(
                from.x, from.y, to.x, to.y,
                this.widthPx * phase.width, phase.intensity);
        }
        this.body.visible = true;
        return true;
    }

    /**
     * The one per-frame fork in the whole file (§12f.4 D). Both envelopes above
     * hand it the same six numbers; only what it does with them differs.
     *
     * ⚑ With a body the `flash`'s JAGGED POLYLINE IS NOT DRAWN. That is not an
     * omission: a bolt's kinks are re-derived per frame from a seed so every
     * bolt differs and any distance fits, which no single PNG can do (§12f.2
     * calls the procedural look tuned, not a placeholder). A layer that authors
     * a `body` on a `flash` has asked for a stretched picture instead.
     */
    private paint(
        fromX: number, fromY: number, toX: number, toY: number,
        widthPx: number, alpha: number,
    ): void {
        if (this.sprite !== null) {
            const scale = beamSpriteScale(
                this.sprite.texture.width, this.sprite.texture.height,
                Math.hypot(toX - fromX, toY - fromY), widthPx);
            this.sprite.position.set(fromX, fromY);
            this.sprite.rotation = Math.atan2(toY - fromY, toX - fromX);
            this.sprite.scale.set(scale.x, scale.y);
            this.sprite.alpha = alpha;
            return;
        }
        if (this.curve === 'extend') {
            drawBeamExtendPlaceholder(
                this.g, this.ctx.color, fromX, fromY, toX, toY, widthPx, alpha);
            return;
        }
        drawBeamFlashPlaceholder(
            this.g, this.ctx.color, fromX, fromY, toX, toY, widthPx, alpha, this.ctx.seed);
    }

    dispose(): void {
        releaseBody('beam', this.body);
    }
}

// --- cast-pose --------------------------------------------------------------

/**
 * Where the pose's centre sits: this share of the caster's radius out along the
 * aim. Small on purpose: the bow's arc has its own radius, so its limb clears
 * the avatar while the string crosses the body like a drawn bow.
 */
const CAST_POSE_HAND_OFFSET = 0.2;
/** Body size as a share of the caster's radius. [PLACEHOLDER] */
const CAST_POSE_SIZE_FACTOR = 1.1;

/**
 * A body shown ON the caster for a beat after a cast went off (§4.1, the bow).
 *
 * ⚑ It appears at RELEASE, not before it (§12d.4): FIRED is emitted when a
 * cast is consumed, so the bow is drawn as the arrow leaves. It is an
 * owner-anchored kind, so it ends with its caster rather than finishing.
 */
class CastPoseFx implements Fx {
    private readonly g: Container;
    private readonly totalMs: number;
    private readonly offsetPx: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.totalMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : CAST_POSE_DEFAULT_MS;
        this.offsetPx = ctx.source.radiusPx * CAST_POSE_HAND_OFFSET;
        const texture = bodyTextureFor(ctx.def);
        if (texture !== null) {
            // Centred on the hand, pointing +X, turned toward the victim per
            // frame. Own size times `scale`, like the projectile and for the
            // same reason: a bow is a prop the artist sizes, not the caster's.
            const sprite = acquireSprite('cast-pose', texture);
            sprite.scale.set(scaleOf(ctx.def));
            sprite.tint = spriteTint(ctx.def);
            this.g = sprite;
        } else {
            this.g = drawCastPoseBowPlaceholder(
                acquire('cast-pose'), ctx.color,
                ctx.source.radiusPx * CAST_POSE_SIZE_FACTOR * scaleOf(ctx.def));
        }
        this.g.visible = false;
        ctx.layer.addChild(this.g);
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.ctx.source.alive()) {
            return false;
        }
        const alpha = castPoseAlpha(elapsed, this.totalMs);
        if (alpha <= 0) {
            return false;
        }
        const at = this.ctx.source.point();
        // On `hit` and `applied` the pose AIMS at its victim (PO 2026-09-20); on `fired`
        // source and victim are one anchor, the angle is 0 and it faces +X.
        const to = this.ctx.victim.point();
        const angle = Math.atan2(to.y - at.y, to.x - at.x);
        this.g.visible = true;
        this.g.position.set(
            at.x + Math.cos(angle) * this.offsetPx, at.y + Math.sin(angle) * this.offsetPx);
        this.g.rotation = angle;
        this.g.alpha = alpha;
        return true;
    }

    dispose(): void {
        releaseBody('cast-pose', this.g);
    }
}

// --- orbit ------------------------------------------------------------------

/** Body size as a share of the caster's radius. [PLACEHOLDER] */
const ORBIT_SIZE_FACTOR = 0.5;
/** A HELD orbit body starts this share of the wielder's radius out from the centre. */
const ORBIT_HAND_OFFSET = 0.6;

/**
 * N bodies circling the caster (§4.1: the two spinning axes). One Graphics per
 * body, pooled like every other kind.
 *
 * Its two triggers differ only in how long it lives (§12d.3): a `fired` orbit
 * runs for its `ms` and fades in and out inside it, an `ambient` one lives
 * exactly as long as the reconciler holds it. Density never thins an orbit -
 * `low` is about particles (PO, §12d.1).
 */
class OrbitFx implements Fx {
    private readonly bodies: Container[] = [];
    private readonly anchor: FxAnchor;
    private readonly count: number;
    private readonly radiusPx: number;
    /** a cast's orbit at the skill's reach: held axes, not free-floating wedges */
    private readonly held: boolean;
    /** 0 = ambient: no duration of its own. */
    private readonly totalMs: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.anchor = ctx.source;
        this.count = Math.max(1, Math.round(ctx.def.count ?? ORBIT_DEFAULT_COUNT));
        // A cast's orbit IS the ability's reach (PO 2026-09-20): the weapon
        // starts at the player and its head reaches the range, showing where
        // someone could be hit. An ambient one hugs its owner, whose ring
        // already draws the range.
        const atReach = ctx.def.on !== 'ambient' && ctx.reachPx > 0;
        this.radiusPx = atReach ? ctx.reachPx : this.anchor.radiusPx + ORBIT_RADIUS_PAD_PX;
        this.totalMs = ctx.def.on === 'ambient'
            ? 0
            : (ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : ORBIT_DEFAULT_MS);
        const texture = bodyTextureFor(ctx.def);
        this.held = atReach;
        const sizePx = this.anchor.radiusPx * ORBIT_SIZE_FACTOR * scaleOf(ctx.def);
        const heldLengthPx = this.radiusPx - this.anchor.radiusPx * ORBIT_HAND_OFFSET;
        for (let i = 0; i < this.count; i++) {
            let body: Container;
            if (texture !== null) {
                const sprite = acquireSprite('orbit', texture);
                // HELD is a strike that circles (§12f.4 A): grip at the left
                // edge, scaled so the weapon's length is the haft it needs to
                // put its head on the range ring. A free-floating one is a
                // centred prop sized to its owner.
                sprite.anchor.set(atReach ? 0 : 0.5, 0.5);
                sprite.scale.set(spriteScaleToExtent(
                    texture.width, atReach ? heldLengthPx : sizePx * 2));
                sprite.tint = spriteTint(ctx.def);
                body = sprite;
            } else if (atReach) {
                body = drawHeldAxePlaceholder(acquire('orbit'), ctx.color, heldLengthPx);
            } else {
                body = drawOrbitWedgePlaceholder(acquire('orbit'), ctx.color, sizePx);
            }
            body.visible = false;
            ctx.layer.addChild(body);
            this.bodies.push(body);
        }
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.anchor.alive()) {
            return false;
        }
        const alpha = orbitAlpha(elapsed, this.totalMs);
        if (alpha <= 0 && elapsed > 0) {
            return false;
        }
        const at = this.anchor.point();
        for (let i = 0; i < this.bodies.length; i++) {
            const p = orbitPoint(i, this.count, elapsed, this.radiusPx);
            const g = this.bodies[i];
            g.visible = alpha > 0;
            const heading = Math.atan2(p.y, p.x);
            if (this.held) {
                // Held: the haft starts at the wielder's hand and the head
                // rides the inside of the range ring.
                const hand = this.anchor.radiusPx * ORBIT_HAND_OFFSET;
                g.position.set(at.x + Math.cos(heading) * hand, at.y + Math.sin(heading) * hand);
            } else {
                g.position.set(at.x + p.x, at.y + p.y);
            }
            // Both bodies point outward along +X.
            g.rotation = heading;
            g.alpha = alpha;
        }
        return true;
    }

    dispose(): void {
        this.bodies.forEach(body => releaseBody('orbit', body));
        this.bodies.length = 0;
    }
}

// --- emitter ----------------------------------------------------------------

/** One particle's body radius, as a share of the anchor's radius. [PLACEHOLDER] */
const PARTICLE_SIZE_FACTOR = 0.16;
/**
 * ...and its ceiling, before `scale`: a campfire is a big anchor, and motes
 * sized to IT read as boulders next to an avatar (PO 2026-09-20).
 */
const PARTICLE_MAX_RADIUS_PX = 6;

/**
 * Particles from the anchor's disc, with a motion and a per-particle lifetime
 * (§12d.3). `ambient` LOOPS - `count` particles alive at once as a steady
 * stream, phase-offset so they never arrive together - while `fired` and `hit`
 * are one burst that is over after `ms`.
 *
 * The anchor is the caster for `ambient` / `fired` and the victim for `hit` and `applied`
 * (§12d.3), and like the other two owner-anchored kinds it stops with it.
 */
class EmitterFx implements Fx {
    private readonly bodies: Container[] = [];
    private readonly anchor: FxAnchor;
    private readonly motion: EmitterMotion;
    private readonly loop: boolean;
    private readonly count: number;
    private readonly lifeMs: number;
    /** sizes an art particle; 1 for a placeholder, which is drawn to size */
    private readonly bodyScale: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.anchor = landsOnVictim(ctx.def.on) ? ctx.victim : ctx.source;
        this.motion = emitterMotionOf(ctx.def.motion);
        this.loop = ctx.def.on === 'ambient';
        // ⚑ The ONE place the slider touches a body count (§12d.1).
        this.count = densityCount(
            Math.round(ctx.def.count ?? EMITTER_DEFAULT_COUNT), ctx.density);
        this.lifeMs = ctx.def.ms && ctx.def.ms > 0 ? ctx.def.ms : EMITTER_DEFAULT_MS;
        const texture = bodyTextureFor(ctx.def);
        const radiusPx = scaleOf(ctx.def) * Math.min(
            PARTICLE_MAX_RADIUS_PX, Math.max(3, this.anchor.radiusPx * PARTICLE_SIZE_FACTOR));
        // ONE particle texture drawn many times, SMALL: the same radius the
        // placeholder dot takes, so a motion tuned on dots reads the same with
        // art (§12f.4 A, "reads at 8 to 16 px").
        this.bodyScale = texture !== null
            ? spriteScaleToExtent(texture.width, radiusPx * 2)
            : 1;
        for (let i = 0; i < this.count; i++) {
            let body: Container;
            if (texture !== null) {
                const sprite = acquireSprite('emitter', texture);
                sprite.tint = spriteTint(ctx.def);
                body = sprite;
            } else {
                body = drawParticlePlaceholder(acquire('emitter'), ctx.color, radiusPx);
            }
            body.visible = false;
            ctx.layer.addChild(body);
            this.bodies.push(body);
        }
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.anchor.alive() || this.count === 0) {
            return false;
        }
        if (!this.loop && elapsed >= this.lifeMs) {
            return false;
        }
        const at = this.anchor.point();
        for (let i = 0; i < this.bodies.length; i++) {
            const p = emitterParticle(
                this.motion, i, this.count, elapsed, this.lifeMs,
                this.anchor.radiusPx, this.loop);
            const g = this.bodies[i];
            g.visible = p.alpha > 0;
            g.position.set(at.x + p.x, at.y + p.y);
            g.alpha = p.alpha;
            g.scale.set(this.bodyScale * p.scale);
        }
        return true;
    }

    dispose(): void {
        this.bodies.forEach(body => releaseBody('emitter', body));
        this.bodies.length = 0;
    }
}

// --- wave -------------------------------------------------------------------

/**
 * How far a wave runs when the skill authors no reach (a fallback only), in
 * caster radii. [PLACEHOLDER]
 */
const WAVE_FALLBACK_REACH_FACTOR = 2.5;

/**
 * `count` rings expanding from the CASTER to the skill's reach and fading
 * (§12g.2, the mammoth's stomp): `fired` only, so once per cast and never per
 * victim. Each ring is redrawn per frame, because a ring's radius AND its
 * stroke both move every frame (the beam precedent).
 *
 * ⭐ Code-drawn for good: no sprite branch, `body` is ignored, and the density
 * slider leaves it alone (`off` never plans it at all). It follows the caster
 * while it lives and stops with it, like every other caster-anchored kind - a
 * stomp whose mammoth despawned mid-ring has nothing to expand from.
 */
class WaveFx implements Fx {
    private readonly rings: Graphics[] = [];
    private readonly count: number;
    private readonly totalMs: number;
    private readonly reachPx: number;

    constructor(private readonly ctx: FxSpawnContext) {
        this.count = waveCountOf(ctx.def.count);
        this.totalMs = waveTotalMsOf(ctx.def.ms);
        this.reachPx = scaleOf(ctx.def) * (ctx.reachPx > 0
            ? ctx.reachPx
            : ctx.source.radiusPx * WAVE_FALLBACK_REACH_FACTOR);
        for (let i = 0; i < this.count; i++) {
            const g = acquire('wave');
            g.visible = false;
            ctx.layer.addChild(g);
            this.rings.push(g);
        }
    }

    update(nowMs: number): boolean {
        const elapsed = nowMs - this.ctx.startAtMs;
        if (elapsed < 0) {
            return true;
        }
        if (!this.ctx.source.alive() || elapsed >= this.totalMs) {
            return false;
        }
        const at = this.ctx.source.point();
        for (let i = 0; i < this.rings.length; i++) {
            const ring = waveRing(i, this.count, elapsed, this.totalMs);
            const g = this.rings[i];
            g.visible = ring.visible;
            if (!ring.visible) {
                continue;
            }
            drawWaveRing(g, this.ctx.color, ring.radius * this.reachPx, ring.width);
            g.position.set(at.x, at.y);
            g.alpha = ring.alpha;
        }
        return true;
    }

    dispose(): void {
        this.rings.forEach(g => release('wave', g));
        this.rings.length = 0;
    }
}

// --- the registry -----------------------------------------------------------

/**
 * The AUTHORABLE kinds, and nothing else: SkillFxKinds.test.ts pins this key
 * set against `visualKinds` in the fixture, both ways.
 */
export const KIND_REGISTRY: { [kind: string]: KindHandler } = {
    'strike': {spawn: ctx => new StrikeFx(ctx)},
    'projectile': {spawn: ctx => new ProjectileFx(ctx)},
    'beam': {spawn: ctx => new BeamFx(ctx)},
    'cast-pose': {spawn: ctx => new CastPoseFx(ctx)},
    'orbit': {spawn: ctx => new OrbitFx(ctx)},
    'emitter': {spawn: ctx => new EmitterFx(ctx)},
    'wave': {spawn: ctx => new WaveFx(ctx)},
};

const HIT_MARK_HANDLER: KindHandler = {spawn: ctx => new ImpactFx(ctx)};

/**
 * The handler for a planned layer: an authorable kind, or the engine's own hit
 * mark, which lives OUTSIDE the registry so the vocabulary pin cannot see it
 * (§12g.1 call 2). The planner is the only thing that ever emits the mark's
 * kind; content naming it is refused at load on the server.
 */
export function kindHandler(kind: string): KindHandler | undefined {
    return kind === HIT_MARK_KIND ? HIT_MARK_HANDLER : KIND_REGISTRY[kind];
}
