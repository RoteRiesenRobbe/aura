/**
 * What a region actually paints, in PixiJS terms (plan-region-primitive.md C4).
 *
 * The split from {@link Regions}: that module is the pure lookup, deliberately
 * free of webpack and PixiJS so the resolution rule (D0) and the D14 fallback
 * can be unit-tested. THIS module is the half that cannot be — it reaches the
 * asset set through `require.context` and the GPU through `Assets` — and it is
 * kept as thin as that implies: a file table, a loader, and the two lines that
 * turn a paint spec into a fill.
 *
 * ⛔ Ground tiles are NOT registered in `GraphicsConfig.groundTextureTypes`.
 * That table preloads every entry at import through `Preloading`, which BLOCKS
 * BOOT until all of them resolve — right for 18 small terrain blobs, wrong for
 * a tile per profile across every zone (§4.9). The ACTIVE zone's set loads
 * here, at zone load, and the world paints its fallback colours until it
 * arrives (D14, and nothing about it is an error state).
 *
 * ⛔ And they are NOT loaded through `Preloading.registerGameObjectSVG`: its
 * `data:{width,height}` pair is a rasterisation size for vectors and a
 * TOP-LEFT CROP for rasters (Preloading.ts:63-75).
 */
import {
    Assets, BlurFilter, Container, Graphics, Matrix, Mesh, MeshGeometry, Renderer, RenderTexture,
    Sprite, Texture, TilingSprite,
} from 'pixi.js';
import {Clearing, clearsDarkness, clearsHaze} from '../../atmospheres/logic/Clearings';
import {
    ATMOSPHERE_PROFILES, AtmosphereProfile, declaresDarkness, declaresHaze,
    neededTextures, Outlined, paintedRegions, Region, regionBlend, REGION_BLEND_OUTWARD, regionBlendOutward,
    regionDarkness, regionHaze, regionMotes, regionOverlay, RegionPoint, regionPaintSpec, regionScroll,
    regionWobble,
    ResolvedOverlay, TERRAIN_PROFILES, Wobble,
} from './Regions';
import {
    applyMaskNoise, applyPatchNoise, maskBand, maskDensity, noiseShape, octaveMix, outwardGrow,
    overlayDensity, snapToTexels,
} from './MaskNoise';
import {Path, PathShape} from '../../paths/logic/Paths';
import {createSwarm, MoteSwarm} from '../../atmospheres/logic/Motes';
import {
    MITRE_LIMIT, ribbonGeometry, ribbonOutline, taperedCentreline,
} from '../../paths/logic/PathRibbon';
import {Polygon} from '../../polygons/logic/Polygons';
import {meter2px} from '../../../client-data/BasicConfig';
import {isMobile} from '../../user-interface/logic/Mobile';

/**
 * Tile files by stem — the name a profile's `texture` key holds.
 *
 * ⚑ Discovered, not hand-listed: a second list of the same names is the exact
 * drift D12 exists to prevent. Drop a file in `assets/ground` and the profile
 * table can name it; name a file that is not there and D14 paints the colour.
 *
 * ⛔ **JPG/PNG only, NEVER SVG.** `webpack.common.js:86` inlines every `.svg`
 * as a base64 data URI INTO THE JS BUNDLE; rasters go through `type: 'asset'`,
 * which emits a separate file and bundles only its URL.
 */
const filesContext = require.context('../assets/ground', false, /\.(jpg|png)$/);
const FILES: { [stem: string]: string } = {};
filesContext.keys().forEach((key: string) => {
    const stem = key.replace(/^\.\//, '').replace(/\.(jpg|png)$/, '');
    const asset = filesContext(key) as string | { default: string };
    FILES[stem] = typeof asset === 'string' ? asset : asset.default;
});

/** Tiles that finished loading, by stem. Nothing else counts as usable: a
 *  texture still in flight paints its colour and is repainted when it lands. */
const loaded: { [stem: string]: Texture } = {};

/** The predicate {@link regionPaintSpec} takes — "can this name be painted
 *  right now", which only this side of the split can answer. */
export function isTextureUsable(name: string): boolean {
    return loaded[name] !== undefined;
}

/**
 * Loads the tiles the given regions ask for, and resolves with whether any
 * NEW one landed — i.e. whether anything on screen would now paint differently.
 *
 * Never rejects. A missing file, a decode failure, a 404: each one warns once
 * and leaves that stem unusable, which is precisely D14's fallback and the
 * degrade path the whole chain is built on (D11). A zone whose profiles are
 * all flat colours loads nothing and resolves `false`, so the feature costs
 * exactly zero until a texture is authored.
 */
export function loadZoneTextures(
    regions: Region[],
    profiles: { [name: string]: AtmosphereProfile } = TERRAIN_PROFILES,
): Promise<boolean> {
    const wanted = neededTextures(regions, profiles).filter(name => loaded[name] === undefined);
    if (wanted.length === 0) {
        return Promise.resolve(false);
    }
    let landed = false;
    return Promise.all(wanted.map((name) => {
        const url = FILES[name];
        if (!url) {
            // A profile naming a tile that is not in the folder. Same posture
            // as an unknown terrain type (L4/D8): a content typo costs one
            // region's look, in the browser, never a boot failure.
            console.warn(`Region profile texture "${name}" has no file in `
                + `features/regions/assets/ground; painting its colour instead.`);
            return Promise.resolve();
        }
        return Assets.load(url).then((texture: Texture) => {
            // ⛔ REPEAT HAS TO BE SET BY HAND, and only a MESH reveals that.
            // Pixi flips `clamp-to-edge` to `repeat` itself inside
            // `convertFillInputToFillStyle`, so every Graphics fill and stroke
            // has always tiled for free — but a Mesh never goes through that
            // function. Without this line an aligned path's ribbon clamps, and
            // clamping does not look like a wrap-mode bug: it smears the tile's
            // last pixel column down the whole run, which reads as the texture
            // simply being wrong. Free and harmless for the Graphics callers,
            // which were already setting it on first use.
            texture.source.style.addressMode = 'repeat';
            texture.source.style.update();
            loaded[name] = texture;
            landed = true;
        }).catch((error: unknown) => {
            console.warn(`Region profile texture "${name}" failed to load; `
                + `painting its colour instead.`, error);
        });
    })).then(() => landed);
}

/**
 * The fill for one region, or `null` for "paint nothing here" (skip it).
 *
 * ⚑ A FRESH `Matrix` every call, deliberately: Pixi's
 * `convertFillInputToFillStyle` calls `matrix.invert()`, which mutates IN
 * PLACE. A cached matrix shared between two regions would be inverted twice
 * and the second tile would come out at 1/scale.
 *
 * The matrix is texture→world, so `scale(s, s)` draws the tile at `s` times
 * its own pixel size. No `tint` and no `color` is set beside the texture: D14
 * ruled colour is the fallback, never a tint.
 */
export function regionPaint(
    region: Region,
    profiles: { [name: string]: AtmosphereProfile } = TERRAIN_PROFILES,
    // Radians to turn the TILE by, for a path that asked to run its texture
    // along itself (Paths.textureAngle). 0 — every region, every polygon and
    // every path that did not ask — leaves the matrix exactly as it was.
    angle = 0,
    // A point the tile's MIDDLE ROW is slid onto, along the path's normal —
    // see `tileMatrix`. Null for everything that is not an aligned path.
    anchor: { x: number, y: number } | null = null,
): { texture: Texture, matrix: Matrix, scale: number } | { color: number } | null {
    const spec = regionPaintSpec(region, isTextureUsable, profiles);
    if (spec === null) {
        return null;
    }
    if ('texture' in spec) {
        const texture = loaded[spec.texture];
        return {
            texture,
            matrix: tileMatrix(spec.scale, angle, anchor, texture.height),
            scale: spec.scale,
        };
    }
    return {color: spec.color};
}

/**
 * The texture→local transform for one surface: scale, turn, and register.
 *
 * ⚑ Written out term by term rather than composed from `Matrix.scale().rotate()`
 * because the two methods do not compose in the order the name suggests, and a
 * silently transposed matrix here is a tile drawn at the right size in the
 * wrong direction — which looks like the ANGLE being wrong rather than the
 * multiplication. With no angle and no anchor it reduces to exactly
 * `new Matrix().scale(s, s)`, which is what every shipped surface had.
 *
 * ⭐ THE ANCHOR TERM IS WHAT LETS A DIRECTIONAL TILE HAVE STRUCTURE. Turning
 * the tile is only half of alignment: the tile still phases from the world
 * origin, so the window a stroke reveals lands at an arbitrary offset ACROSS
 * the ribbon, and a tile can therefore put nothing at a known height. The
 * first fence tile was built under that limit — macro pattern along the path
 * only — and came out a boardwalk, because a fence is mostly GAPS and a gap is
 * structure across the ribbon.
 *
 * The fix is a translation along the path's NORMAL, and only along it: slide
 * the tile until its middle row sits on the anchor. Sliding along the normal
 * cannot disturb the phase ALONG the path, so the posts do not move.
 *
 *   n = (−sin θ, cos θ)                     the unit normal
 *   we want  uv_y(anchor) = height / 2      the tile's middle row
 *   uv_y     = (P·n − t·n) / scale          with t = c·n
 *   ⟹  c    = P·n − scale · height / 2
 */
function tileMatrix(
    scale: number,
    angle: number,
    anchor: { x: number, y: number } | null,
    texHeight: number,
): Matrix {
    if (angle === 0 && anchor === null) { return new Matrix().scale(scale, scale); }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let tx = 0, ty = 0;
    if (anchor !== null) {
        const nx = -sin, ny = cos;
        const c = anchor.x * nx + anchor.y * ny - scale * texHeight / 2;
        tx = c * nx;
        ty = c * ny;
    }
    return new Matrix(scale * cos, scale * sin, -scale * sin, scale * cos, tx, ty);
}

/** A region's mask footprint in WORLD PX: its bounding box, grown outward. */
interface Footprint {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * The polygon's bounding box grown by `margin` on every side.
 *
 * ⚑ Growing it is not optional. D22's ramp is SYMMETRIC, so half the band lies
 * OUTSIDE the authored polygon, and a tight bbox would clip exactly the half
 * this chunk exists to draw - turning the soft edge back into a hard one, one
 * half-band further out, which looks like the feature working badly rather than
 * like a bug.
 */
function footprintOf(points: RegionPoint[], margin: number): Footprint | null {
    if (points.length === 0) { return null; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach((p) => {
        if (p.x < minX) { minX = p.x; }
        if (p.x > maxX) { maxX = p.x; }
        if (p.y < minY) { minY = p.y; }
        if (p.y > maxY) { maxY = p.y; }
    });
    if (!isFinite(minX) || !isFinite(minY)) { return null; }
    return {
        x: minX - margin,
        y: minY - margin,
        width: (maxX - minX) + 2 * margin,
        height: (maxY - minY) + 2 * margin,
    };
}

/** The box grown to a whole number of texels on both sides — see
 *  {@link snapToTexels} for the misregistration this exists to stop. */
function snapFootprint(footprint: Footprint, texelsPerPx: number): Footprint {
    return {
        x: footprint.x,
        y: footprint.y,
        width: snapToTexels(footprint.width, texelsPerPx),
        height: snapToTexels(footprint.height, texelsPerPx),
    };
}

/** A straight edge: what a mask gets when nothing names a profile (cutHole). */
const NO_WOBBLE: Wobble = {reach: 0, size: 0, roughness: 0};

/** A built mask: the sprite to hang on the region, and the texture behind it. */
interface BlendMask {
    sprite: Sprite;
    /** ⚑ The CALLER's to free. Nothing else references it. */
    texture: RenderTexture;
    footprint: Footprint;
    /** The band it was blurred to, world px. ⚑ Wider than the blend when the
     *  edge wobbles (D3), so a caller overdrawing to the ramp reads THIS. */
    bandPx: number;
    /** The density it was baked at — what an overlay reading it must not bake
     *  coarser than (ground-noise W2). */
    texelsPerPx: number;
}

/**
 * Builds one region's blurred-silhouette alpha mask (C5), or `null` if the band
 * would be too narrow to draw.
 *
 * The whole technique in four lines: rasterise the polygon white into a
 * low-resolution RenderTexture, blur it, and hang the result on the region as
 * an alpha mask. It needs no geometry maths and works on any concave blob,
 * which the two ramp techniques already in this client (DarknessOverlay's
 * radial gradients, MapFog's axis-aligned stamps) emphatically do not.
 *
 * ⚑ A FRESH RenderTexture's contents are UNDEFINED, not blank - MapFog.ts
 * carries the same note. The render below clears explicitly to transparent;
 * skipping that shows GPU garbage through the mask.
 *
 * ⚑ NO INSET (D22). The blur is symmetric about the authored line, so the 50 %
 * alpha sits ON the polygon someone drew in Tiled and the region spills half a
 * band past it. That is the ruling, not an oversight. ⚑ For a REGION the
 * silhouette handed in is already dilated (D23, {@link paintFilled}), so the
 * ramp this draws, centred on THAT edge, lies wholly outside the authored one.
 */
function buildBlendMask(
    renderer: Renderer,
    points: RegionPoint[],
    blend: number,
    draw: (g: Graphics) => void,
    extraMargin: number = 0,
    // The profile's wobble keys (plan-ground-noise.md W1b). A reach of 0 bakes
    // exactly the C5 mask: same band, same density, no extra pass.
    wobble: Wobble = NO_WOBBLE,
): BlendMask | null {
    // ⭐ D3: the blur makes room for BOTH the fade and the wander, and the
    // noise pass narrows the fade back to `blend`. A straight edge's band is
    // the blend exactly — unless it is finer than any mask can draw, when W1c
    // widens it to the finest one can.
    const mobile = isMobile();
    const band = maskBand(blend, wobble.reach, mobile);
    const bandPx = meter2px(band);
    // Half a band of actual outward bleed, plus the BlurFilter's own padding -
    // `updatePadding()` reserves 2 × strength texels, and strength is half the
    // band, so that padding is one full band. 1.5 covers both with the rounding
    // slack that keeps the ramp from touching the texture edge.
    const measured = footprintOf(points, bandPx * 1.5 + extraMargin);
    if (measured === null) { return null; }

    // ⚑ ONE density variable feeds the texture size, the blur strength AND the
    // noise grain. Splitting them is the bug this comment exists to prevent: a
    // region large enough to hit the cap gets a coarser texture, and a strength
    // computed off the uncapped density would then draw a band several times
    // too wide. `maskDensity` owns the rule; see MaskNoise.ts.
    const unitPx = meter2px(1);
    const density = maskDensity(band, wobble.reach,
        Math.max(measured.width, measured.height) / unitPx, mobile, wobble.size, blend, wobble.roughness);
    const texelsPerPx = density.texelsPerUnit / unitPx;
    const footprint = snapFootprint(measured, texelsPerPx);

    // Sub-texel band: the blur would round to nothing and we would pay a mask
    // and a filter pass for a hard edge. Take the hard edge honestly instead.
    // ⚑ Since W1c the density follows the band, so this is reachable only at
    // the MASK_MAX_TEXELS cap, on a shape a few hundred units long.
    const bandTexels = bandPx * texelsPerPx;
    if (bandTexels < 1) { return null; }

    // Strength is HALF the band: a Gaussian of this strength spreads about that
    // far each way, which is what makes the full transition one band wide with
    // its midpoint on the authored line (D22).
    // ⚑ The footprint is snapped to whole texels (snapToTexels), so this is an
    // exact fit; the epsilon only stops float noise rounding up a spare texel.
    const texture = RenderTexture.create({
        width: Math.max(1, Math.ceil(footprint.width * texelsPerPx - 1e-9)),
        height: Math.max(1, Math.ceil(footprint.height * texelsPerPx - 1e-9)),
        antialias: true,
    });

    // The silhouette, drawn in the polygon's own world-px coordinates and
    // mapped into the texture by the holder's transform - so the points need no
    // arithmetic and cannot drift from the shape the region actually paints.
    const holder = new Container();
    // ⚑ The silhouette is INJECTED rather than hardcoded as a filled polygon
    // (C1 of plan-world-paths.md). A region fills its polygon; a path strokes
    // its polyline. Everything below — the density, the cap, the one-variable
    // rule, the explicit clear — is identical for both, which is the whole
    // reason this is a callback and not a second copy of this function.
    const silhouette = new Graphics();
    draw(silhouette);
    holder.addChild(silhouette);
    holder.scale.set(texelsPerPx);
    holder.position.set(-footprint.x * texelsPerPx, -footprint.y * texelsPerPx);
    holder.filters = [new BlurFilter({strength: bandTexels / 2, quality: 4})];

    renderer.render({
        container: holder,
        target: texture,
        clear: true,
        clearColor: [0, 0, 0, 0],
    });
    holder.destroy({children: true});

    // ⭐ The wobble is a SECOND bake over the blurred ramp, never a change to
    // it: `null` back (no WebGL) leaves the clean mask standing. ⚑ That ramp is
    // the whole BAND wide, so off WebGL a wobbly edge degrades to a straight
    // one fading over the band rather than over `blend`. Both Applications are
    // WebGL, so this is the D11 floor, not a look anyone sees.
    let result = texture;
    if (wobble.reach > 0) {
        const shape = noiseShape(blend, band, wobble.reach, density.texelsPerUnit,
            density.grainUnits, wobble.roughness);
        const noisy = applyMaskNoise(renderer, texture, footprint, texelsPerPx,
            density.grainUnits * unitPx, shape);
        if (noisy !== null) {
            texture.destroy(true);
            result = noisy;
        }
    }

    const sprite = new Sprite(result);
    sprite.position.set(footprint.x, footprint.y);
    sprite.width = footprint.width;
    sprite.height = footprint.height;
    return {sprite, texture: result, footprint, bandPx, texelsPerPx};
}

/**
 * An overlay's patch mask (plan-ground-noise.md W2): the surface's OWN mask
 * times world-keyed noise patches, or `null` (no WebGL — the overlay is then
 * simply not drawn).
 *
 * ⭐ Built FROM the base's mask, not beside it, so the patches die out at the
 * edge the base actually draws — its fade and its wobble — and never spill
 * past it. ⭐ A surface with NO mask has a hard edge, and the patches then cover
 * the whole box: {@link paintOverlay} clips them with the shape's own geometry.
 * ⛔ Not a rasterised silhouette: at mask density its antialiased rim fades half
 * a texel INSIDE the crisp edge, and the first hard edge showed exactly that as
 * a strip of bare base where the patches stopped short.
 *
 * ⚑ Same footprint as the base mask, so a drifting overlay's TilingSprite and
 * an aligned overlay's ribbon line up with the body exactly; `bandPx` is the
 * base's for the same reason (the ribbon overdraws to it). ⚑ The sprite is sized
 * by its TEXTURE: baked at its own density over the base's box, the texture can
 * overhang it by a sliver, which is transparent.
 */
function buildOverlayMask(
    points: RegionPoint[],
    renderer: Renderer,
    extraMargin: number,
    base: BlendMask | null,
    overlay: ResolvedOverlay,
): BlendMask | null {
    const measured = base !== null ? base.footprint : footprintOf(points, extraMargin);
    if (measured === null) { return null; }
    const unitPx = meter2px(1);
    const density = overlayDensity(overlay.size, Math.max(measured.width, measured.height) / unitPx,
        isMobile(), base !== null ? base.texelsPerPx * unitPx : 0, overlay.roughness);
    const texelsPerPx = density.texelsPerUnit / unitPx;
    // The base's box is already whole texels at ITS density; ours is snapped here.
    const footprint = base !== null ? measured : snapFootprint(measured, texelsPerPx);

    const patches = applyPatchNoise(renderer, base !== null ? base.texture : null,
        footprint, texelsPerPx, density.grainUnits * unitPx,
        octaveMix(density.grainUnits * density.texelsPerUnit, overlay.roughness), overlay.coverage);
    if (patches === null) { return null; }

    const sprite = new Sprite(patches);
    sprite.position.set(footprint.x, footprint.y);
    sprite.width = patches.width / texelsPerPx;
    sprite.height = patches.height / texelsPerPx;
    return {sprite, texture: patches, footprint, bandPx: base !== null ? base.bandPx : 0, texelsPerPx};
}

/**
 * Paints this surface's OVERLAY — the second profile in patches — directly
 * over the body just drawn (plan-ground-noise.md W2). No overlay, no cost.
 *
 * ⭐ The patches are a SURFACE of their own profile run through the same two
 * painters the body uses, which is where D5 and D6 come from for free:
 *   - a still overlay is {@link addFeathered}'s masked rect;
 *   - a drifting one is {@link paintSurface}'s TilingSprite, moving by the
 *     OVERLAY profile's own `scroll` (D5) while the patch SHAPES stay put;
 *   - on an aligned path it is {@link paintRibbon}'s mesh, so the stones follow
 *     the bend in arc-length UVs like the road under them (D6). ⚑ A drifting
 *     overlay there falls back to world-aligned, as a drifting body does.
 *
 * ⛔ Drawn per surface right after its body, never in a pass over everything:
 * authored order governs overlap, so a later surface covers an earlier one's
 * stones exactly as it covers its ground.
 */
function paintOverlay(
    container: Container,
    surface: Region,
    points: RegionPoint[],
    draw: DrawSurface,
    baseMask: BlendMask | null,
    extraMargin: number,
    renderer: Renderer,
    out: PaintedSurfaces,
    // The body's ribbon, when it is a path or an outline; null for a filled shape.
    ribbon: RibbonSpec | null = null,
    angle = 0,
    anchor: { x: number, y: number } | null = null,
): void {
    const overlay = regionOverlay(surface);
    if (overlay === null) { return; }
    const layer: Region = {profile: overlay.profile, points};
    // An overlay profile authoring `color: null` paints nothing: decide that
    // BEFORE baking a mask nothing would then own and free.
    if (regionPaintSpec(layer, isTextureUsable) === null) { return; }
    const mask = buildOverlayMask(points, renderer, extraMargin, baseMask, overlay);
    if (mask === null) { return; }
    // A ribbon mesh IS the body's geometry, so it clips a hard edge by itself.
    if (ribbon !== null
        && paintRibbon(container, layer, points, ribbon, mask, out)) {
        return;
    }
    if (baseMask !== null) {
        paintSurface(container, layer, points, draw, mask, extraMargin, out, TERRAIN_PROFILES, angle, anchor);
        return;
    }
    // ⭐ A HARD edge: the patch mask covers the whole box (buildOverlayMask), and
    // the shape's own geometry clips it — the same stencil a drifting hard body
    // is cut by — so the patches reach the crisp edge exactly and stop there.
    const clip = new Container();
    container.addChild(clip);
    paintSurface(clip, layer, points, draw, mask, extraMargin, out, TERRAIN_PROFILES, angle, anchor);
    const stencil = draw(new Graphics(), {color: 0xffffff});
    container.addChild(stencil);
    clip.mask = stencil;
}

/**
 * The mask a PROFILED surface paints through, or `null` for a hard straight
 * edge — the one decision all six feathered call sites share.
 *
 * ⭐ `blend` OR `wobbleReach` (D3). A `blend: 0` edge that wanders is crisp
 * but not straight, and only a mask can draw that. Neither = the maskless C4
 * path, so the feature still costs exactly zero until authored.
 *
 * ⛔ `profiles` is WHICH TABLE names this surface's profile — ground unless the
 * caller is the air; see {@link paintSurface}.
 */
function surfaceMask(
    renderer: Renderer,
    surface: Region,
    points: RegionPoint[],
    draw: DrawSurface,
    extraMargin: number,
    profiles: { [name: string]: AtmosphereProfile } = TERRAIN_PROFILES,
): BlendMask | null {
    const blend = regionBlend(surface, profiles);
    const wobble = regionWobble(surface, profiles);
    if (blend <= 0 && wobble.reach <= 0) { return null; }
    return buildBlendMask(renderer, points, blend, g => draw(g, {color: 0xffffff}), extraMargin,
        wobble);
}

/** What one paint pass produced, and ALL OF IT IS THE CALLER'S TO OWN.
 *
 *  ⚑ Two lists rather than one because they are freed differently and on
 *  different schedules: a mask texture dies with the next repaint, a scroller
 *  dies with the container it was added to and only needs UNREGISTERING from
 *  the frame loop. A caller that keeps neither leaks GPU memory per repaint;
 *  a caller that keeps scrollers across a repaint animates destroyed sprites. */
export interface PaintedSurfaces {
    /** ⚑ One RenderTexture per feathered surface. Free with `destroy(true)`. */
    masks: RenderTexture[];
    /** ⚑ Hand to {@link advanceSurfaceScroll} every frame, and DROP on repaint.
     *  A draw site that bakes a still image (the map) simply ignores these. */
    scrollers: ScrollingSurface[];
}

/** What the AIR's paint pass adds: the mote swarms, which only atmospheres
 *  draw. ⚑ Hand to `Motes.advanceMotes` every frame and DROP on repaint, on
 *  exactly the schedule of `scrollers`. */
export interface PaintedAir extends PaintedSurfaces {
    swarms: MoteSwarm[];
}

/** One drifting tile surface: the sprite, and how fast its tile moves. */
export interface ScrollingSurface {
    sprite: TilingSprite;
    /** World PX per second — the profile authors world units. */
    vx: number;
    vy: number;
    /** One tile's size in world px: the period `tilePosition` wraps on. */
    tileW: number;
    tileH: number;
}

/** `x mod period`, always non-negative. `%` alone keeps the sign in JS. */
function wrap(value: number, period: number): number {
    return period > 0 ? ((value % period) + period) % period : value;
}

/**
 * Advances every scrolling surface by one frame (C3).
 *
 * ⭐ The whole animation, and this is the entire per-frame cost: two number
 * writes per drifting surface. Nothing is rebuilt, no geometry is touched, no
 * texture is re-uploaded — the tile offset is a uniform and the GPU does the
 * rest at sampling time. That is why this could not be built on the day/night
 * filter machinery (L7: ~25 per-layer filter passes at 30 Hz once made avatars
 * invisible).
 *
 * ⚑ `tilePosition` is WRAPPED to one tile. The tiling is exactly periodic, so
 * wrapping is invisible — and without it a long session walks the offset into
 * the range where a float32 uniform can no longer resolve a pixel, and the
 * water quietly starts stuttering and then stops.
 */
export function advanceSurfaceScroll(scrollers: ScrollingSurface[], deltaMS: number): void {
    if (scrollers.length === 0) { return; }
    const seconds = deltaMS / 1000;
    scrollers.forEach((s) => {
        const p = s.sprite.tilePosition;
        p.set(wrap(p.x + s.vx * seconds, s.tileW), wrap(p.y + s.vy * seconds, s.tileH));
    });
}

/**
 * The drifting twin of the static `Graphics.rect().fill(paint)` — a
 * TilingSprite over the same footprint, phased to the same world origin.
 *
 * ⚑ The PHASE MATTERS and is not cosmetic. A Graphics fill takes its tile phase
 * from the texture matrix, which is texture→LOCAL, and every surface sits at
 * the container origin — so two adjacent rivers share one continuous tiling. A
 * TilingSprite instead phases from its OWN top-left, so without the offset
 * below every river would start its tile afresh at its bounding box and two
 * touching ones would show a hard seam where the pattern jumps.
 *
 * `uv = (local - tilePosition) / tileScale`, and local 0 is world
 * `footprint.x`, so `tilePosition = -footprint` reproduces the fill exactly.
 *
 * Returns `null` when the paint is a flat colour: a colour has no phase, so
 * there is nothing to see move, and a TilingSprite over it would cost a draw
 * call and two writes per frame to animate nothing.
 */
function scrollingSurface(
    footprint: Footprint,
    paint: { texture: Texture, matrix: Matrix, scale: number } | { color: number },
    scrollPx: { x: number, y: number },
): ScrollingSurface | null {
    if (!('texture' in paint)) { return null; }
    // ⭐ The scale is CARRIED on the paint rather than read back off the
    // matrix, and that changed when `alignTexture` landed. It used to be
    // `paint.matrix.a`, which is only the scale while the matrix is a pure
    // `scale(s, s)`; the moment a rotation joins it `a` becomes `s·cos θ`, so
    // a turned tile would have drifted at the WRONG SIZE — and only while it
    // moved, which is the worst kind of bug to catch in a screenshot. Nothing
    // authors a drifting aligned surface today (see paintSurface), so this
    // was a trap armed for whoever did it next rather than a live defect.
    // One value, resolved once, is what makes it un-armable.
    const scale = paint.scale;
    const sprite = new TilingSprite({
        texture: paint.texture,
        width: footprint.width,
        height: footprint.height,
    });
    sprite.position.set(footprint.x, footprint.y);
    sprite.tileScale.set(scale);
    sprite.tilePosition.set(-footprint.x, -footprint.y);
    return {
        sprite,
        vx: scrollPx.x,
        vy: scrollPx.y,
        tileW: paint.texture.width * scale,
        tileH: paint.texture.height * scale,
    };
}

/** How one surface draws itself — filled for a region, stroked for a path.
 *  Takes the style so the SAME call draws the paint and the white silhouette,
 *  which is what keeps a mask from ever disagreeing with the shape it masks. */
type DrawSurface = (g: Graphics, style: object) => Graphics;

/** Case 2, extracted because case 3 falls back to it: a rect over the mask
 *  footprint, masked by the blurred silhouette.
 *
 *  ⚑ The paint must be a RECT and not the shape. Masked alpha is
 *  content × mask, so a masked shape would multiply the outward half of D22's
 *  symmetric ramp by nothing and end the edge in a 50 % STEP — almost right,
 *  which is the hard kind of wrong. */
function addFeathered(
    container: Container,
    paint: { texture: Texture, matrix: Matrix, scale: number } | { color: number },
    mask: BlendMask,
    out: PaintedSurfaces,
): void {
    const shape = new Graphics()
        .rect(mask.footprint.x, mask.footprint.y, mask.footprint.width, mask.footprint.height)
        .fill(paint);
    container.addChild(shape);
    // ⚑ The mask sprite must be IN the scene graph to have a world transform —
    // a detached mask silently masks NOTHING, and the surface would paint as a
    // full opaque rectangle. MiniMap.setupTerrain carries the same note for the
    // fog.
    container.addChild(mask.sprite);
    shape.mask = mask.sprite;
    out.masks.push(mask.texture);
}

/**
 * Paints ONE surface into `container` — the three cases every region and every
 * path goes through, in one place.
 *
 * 1. **Still, hard edge.** One Graphics. No render texture, no mask, no
 *    per-frame cost. The C4 world, and still the common case.
 * 2. **Still, feathered.** {@link addFeathered}.
 * 3. **Drifting** (C3). The same footprint, but a TilingSprite instead of a
 *    Graphics. It still needs a mask to have a shape at all, so a profile that
 *    scrolls with `blend: 0` gets a CHEAP one: the plain silhouette as a
 *    stencil, no RenderTexture and no blur pass. ⛔ Do not "simplify" that away
 *    by making scroll depend on blend — a `scroll` that silently did nothing
 *    because the profile authored a hard edge is exactly the class of quiet
 *    no-op this codebase keeps paying for.
 */
function paintSurface(
    container: Container,
    surface: Region,
    points: RegionPoint[],
    draw: DrawSurface,
    mask: BlendMask | null,
    extraMargin: number,
    out: PaintedSurfaces,
    // ⛔ WHICH TABLE names this surface's profile. Ground by default because
    // that is nearly every caller; the atmosphere path passes its own, and
    // getting it wrong costs fog its texture, blend and drift silently — the
    // two namespaces are disjoint, so a miss resolves to the DEFAULT profile
    // rather than throwing.
    profiles: { [name: string]: AtmosphereProfile } = TERRAIN_PROFILES,
    // A path that asked to run its texture along itself; 0 for everything else.
    angle = 0,
    // The anchor its angle came from, so the tile registers ACROSS the ribbon.
    anchor: { x: number, y: number } | null = null,
): void {
    const authored = regionScroll(surface, profiles);
    const scrollPx = {x: meter2px(authored.x), y: meter2px(authored.y)};
    const drifts = scrollPx.x !== 0 || scrollPx.y !== 0;

    // ⛔ A DRIFTING SURFACE IS NEVER TURNED, and this is a real limit rather
    // than an oversight. The drift wraps `tilePosition` at `texture.width *
    // scale` — the tile's period along the LOCAL x-axis — and once the tile is
    // rotated that is no longer its period, so the pattern would JUMP once per
    // wrap. Making the two work together means tracking the period along the
    // turned axes, which is a chunk and has no consumer: the only profiles
    // that scroll are Water, Bog and Lava, and none of them is directional.
    // ⚑ Refused loudly rather than silently, because "my fence does not line
    // up" would otherwise be a debugging session over a profile key nobody
    // looked at. Once per path at zone load, and paths are few.
    if (drifts && angle !== 0) {
        console.warn(`RegionPaint: path profile "${surface.profile}" both scrolls and asks for `
            + `alignTexture — the tile stays world-aligned (a drifting tile cannot be turned).`);
    }
    const paint = regionPaint(surface, profiles, drifts ? 0 : angle, drifts ? null : anchor);
    if (paint === null) {
        // ⚑ Nothing to paint (`color: null`), but the caller may have built a
        // mask — and an overlay may still read it (stones on bare land), so it
        // is handed over to be freed with the rest rather than leaked per repaint.
        if (mask !== null) { out.masks.push(mask.texture); }
        return;
    }

    if (drifts) {
        // ⚑ A feathered surface reuses the MASK's footprint rather than
        // measuring its own. They must be the same box: the sprite is masked by
        // that sprite, and a different one would slide the water half a band
        // out of its own banks.
        const footprint = mask !== null ? mask.footprint : footprintOf(points, extraMargin);
        const scroller = footprint === null
            ? null
            : scrollingSurface(footprint, paint, scrollPx);
        if (scroller !== null) {
            container.addChild(scroller.sprite);
            if (mask !== null) {
                container.addChild(mask.sprite);
                scroller.sprite.mask = mask.sprite;
                out.masks.push(mask.texture);
            } else {
                // The cheap mask: a stencil off the shape's own geometry. No
                // RenderTexture, so it is deliberately NOT pushed to
                // `out.masks` — the container's own teardown frees it with
                // every other child.
                const silhouette = draw(new Graphics(), {color: 0xffffff});
                container.addChild(silhouette);
                scroller.sprite.mask = silhouette;
            }
            out.scrollers.push(scroller);
            return;
        }
        // A flat colour cannot be seen to drift (D14's fallback is a colour and
        // a colour has no phase), and a degenerate footprint has nothing to
        // draw into. Fall through to the still look rather than to nothing.
    }

    if (mask === null) {
        container.addChild(draw(new Graphics(), paint));
        return;
    }
    addFeathered(container, paint, mask, out);
}

/**
 * Draws every region into `container`, in AUTHORED ORDER — the same order the
 * resolution rule reads (D0), so what you see on top is what a lookup at that
 * point answers.
 *
 * ⚑ ONE function for both draw sites, because the world and the full-screen
 * map are two drawings of the same world and the map falling behind is not a
 * graceful degrade — it is a map that is a WRONG DRAWING of the world (§4.7,
 * L2). Map parity is structural here rather than remembered. This is also why
 * it takes a `renderer`: the C5 masks are rasterised, and a draw site that
 * could not build them would silently be the hard-edged one.
 *
 * Adds, never clears: the map bakes regions into a scratch container that
 * already holds its land fill. A caller that repaints (the world, once the
 * tiles land) empties its own layer first.
 *
 * ⛔ A region WITHOUT a profile (an id-only place, plan-region-identity.md D1)
 * is skipped HERE, at the one function both draw sites share. Handed to
 * paintFilled it would resolve to the default profile and paint the base land
 * fill over whatever lies below (§2.4); skipping here guards the map as well.
 */
export function paintRegions(
    container: Container,
    regions: Region[],
    renderer: Renderer,
): PaintedSurfaces {
    const out: PaintedSurfaces = {masks: [], scrollers: []};
    paintedRegions(regions).forEach((region) => {
        paintFilled(container, region, region.points, REGION_BLEND_OUTWARD, renderer, out);
    });
    return out;
}

/**
 * One FILLED shape — a region or a polygon, which draw byte-for-byte alike —
 * body, then overlay.
 *
 * ⚑ `blendOutward` (D23): the MASK's silhouette is dilated by
 * a round-joined stroke, so the blur's 50 % line lands `grow` outside the
 * authored one and the ramp is solid up to it. Only the mask moves: a hard
 * edge (no mask) keeps drawing `draw`, and the footprint grows by the same
 * amount so the box never clips the wider spill. ⚑ A polygon's OUTLINE is not
 * moved with it: it stays centred on the authored line.
 */
function paintFilled(
    container: Container,
    surface: Region,
    points: RegionPoint[],
    // What a profile that says nothing gets: REGION_BLEND_OUTWARD for a
    // region, false for a polygon (D23).
    outwardByDefault: boolean,
    renderer: Renderer,
    out: PaintedSurfaces,
): void {
    const draw: DrawSurface = (g, style) => g.poly(points).fill(style);
    const grow = regionBlendOutward(surface, outwardByDefault)
        ? meter2px(outwardGrow(regionBlend(surface), regionWobble(surface).reach, isMobile()))
        : 0;
    const maskDraw: DrawSurface = grow > 0
        ? (g, style) => g.poly(points).fill(style).stroke({...style, width: 2 * grow, join: 'round'})
        : draw;
    const mask = surfaceMask(renderer, surface, points, maskDraw, grow);
    paintSurface(container, surface, points, draw, mask, grow, out);
    paintOverlay(container, surface, points, draw, mask, grow, renderer, out);
}

/**
 * Draws every ATMOSPHERE into `container`, in AUTHORED ORDER
 * (plan-region-atmosphere.md A1). The container is the DARKNESS layer, not a
 * terrain one — which is the whole reason this works: `paintSurface` takes its
 * container as an argument, so pointing it somewhere else is free.
 *
 * ⭐ THE REUSE IS THE DESIGN (D12). Everything fog needs already shipped for
 * ground:
 *   - `scroll` → the drift, so an animated fog bank is a profile edit
 *   - `texture` + `scale` → what the murk looks like, with `color` as D14's
 *     fallback, so flat pitch-black is the SAME code path with no texture
 *   - `blend` → the soft edge, via the same `buildBlendMask` a region uses
 * No new vocabulary, no second drawing system, and the feathering chunk this
 * plan had deferred (A1b) does not need to exist.
 *
 * ⭐ Only shapes whose profile DECLARES the dial for a layer are drawn into
 * it at all. One that says nothing is transparent, not a hole — see
 * {@link declaresDarkness}. ⭐ `darkness: 0` is now simply a DECLARATION of
 * zero (A4): it paints nothing and it STOPS the resolve there, which is what
 * lets a pure fog profile say "and it is not dark in here".
 *
 * ⛔ THE HOLES ARE A SEPARATE PASS AND IT RUNS LAST (A4/D17). A clearing is its
 * own class with its own array, so it cannot be interleaved with the air by
 * authoring order — and it should not be: "cuts a hole in whatever is already
 * there" is the reading two separate arrays support without inventing an
 * ordering key, and it is what an author means by drawing one. ⚑ Before A4 this
 * was a branch INSIDE the paint loop keyed on `opacity === 0`; that magic value
 * is exactly what the PO rejected on 2026-09-16.
 *
 * ⚑ Each shape gets its OWN Container carrying `alpha = <the dial>`, because the
 * paint may be SEVERAL children (a drifting sprite plus its mask) and the
 * opacity belongs to the group, not to whichever child happens to be first.
 */
export function paintAtmospheres(
    darknessContainer: Container,
    hazeContainer: Container,
    atmospheres: Region[],
    clearings: Clearing[],
    renderer: Renderer,
): PaintedAir {
    const out: PaintedAir = {masks: [], scrollers: [], swarms: []};
    atmospheres.forEach((atmosphere) => {
        // ⚑ BOTH, independently. A profile authoring both is the smoky cave:
        // the same polygon is painted into both layers, so a lantern cuts the
        // black and leaves the fog lit. Their opacities then COMPOUND rather
        // than max, which is the thing to remember when tuning.
        if (declaresDarkness(atmosphere)) {
            paintAir(darknessContainer, atmosphere, regionDarkness(atmosphere),
                renderer, out, true);
        }
        if (declaresHaze(atmosphere)) {
            paintAir(hazeContainer, atmosphere, regionHaze(atmosphere),
                renderer, out, false);
        }
    });
    // ⛔ AFTER the whole loop, never inside it (D17). Appending a hole while
    // banks are still to come would let a later bank fill it in, which is the
    // one thing an author who drew a clearing did not ask for — and
    // `Clearings.clearsAt` has no way to express "except the banks after it", so
    // the drawing and the sim would answer differently. They agree here by
    // construction, which is the property D3 had and A4 must not lose.
    clearings.forEach((clearing) => {
        if (clearsDarkness(clearing)) {
            cutHole(darknessContainer, clearing, renderer, out);
        }
        if (clearsHaze(clearing)) { cutHole(hazeContainer, clearing, renderer, out); }
    });
    return out;
}

/** How wide a clearing's edge ramps, in WORLD UNITS.
 *
 *  ⚑ A constant rather than a profile value, and that is FORCED rather than
 *  chosen: a clearing names NO profile (L7), so unlike every other soft edge in
 *  this file the band cannot come from the look table. [PLACEHOLDER], like every
 *  number in api/atmospheres/profiles.json — and it wants judging beside the 2-unit
 *  `EDGE_FADE` on DarknessOverlay's authored circles, which is the other
 *  hand-authored rim living in this same layer. */
const CLEARING_FADE = 2;

/**
 * One clearing's hole in one layer.
 *
 * ⭐ A stencil-shaped erase, exactly like a light hole — the same blend mode the
 * campfire glow and the player's own lantern already use, so nothing new
 * composites here and the three kinds of hole stack the way they always did.
 *
 * ⛔ NO texture, NO scroll, NO colour, and the shortness is still the ruling
 * (L7). A clearing names no profile because it paints nothing: there is no look
 * to author, so there is nothing to read. The soft EDGE is the one exception and
 * it comes from {@link CLEARING_FADE} rather than from a profile — a hard-rimmed
 * hole inside a soft-rimmed bank is the mismatch that would show.
 *
 * ⛔⛔ THE RAMP IS THE SPRITE, NOT A MASK ON A SHAPE — and that is MEASURED
 * rather than preferred (2026-09-17). The obvious build reused
 * {@link addFeathered} and set `blendMode = 'erase'` on the rect it returns; in
 * PixiJS a masked object is drawn through a filter pass and the BLEND MODE DOES
 * NOT SURVIVE IT, so the erase silently stopped erasing and the cave read SOLID
 * BLACK — with the mask correctly built, correctly attached, and a structural
 * "is it masked?" assertion passing on that very build. Only the pixels caught
 * it.
 *
 * ⭐ What works is what the LIGHT HOLES have always done: a sprite whose own
 * alpha ramps, erase-blended, with no mask anywhere. {@link buildBlendMask}
 * already rasterises exactly that — a white silhouette, blurred, on transparent
 * — so the hole IS that texture, drawn directly. It is also the cheaper of the
 * two: one sprite, and no filter pass.
 */
function cutHole(
    container: Container,
    clearing: Clearing,
    renderer: Renderer,
    out: PaintedSurfaces,
): void {
    const draw: DrawSurface = (g, style) => g.poly(clearing.points).fill(style);
    const ramp = buildBlendMask(renderer, clearing.points, CLEARING_FADE,
        g => draw(g, {color: 0xffffff}));
    if (ramp === null) {
        // Sub-texel band or a degenerate shape — take the hard edge honestly,
        // exactly as buildBlendMask's own bail-out intends.
        const hole = draw(new Graphics(), {color: 0xffffff});
        hole.blendMode = 'erase';
        container.addChild(hole);
        return;
    }
    ramp.sprite.blendMode = 'erase';
    container.addChild(ramp.sprite);
    // ⚑ Ours to free, on the same schedule as every other blend mask: the sprite
    // dies with its container, the RenderTexture behind it does not.
    out.masks.push(ramp.texture);
}

/**
 * One atmosphere layer's share of one shape.
 *
 * ⛔ `opacity === 0` NO LONGER ERASES HERE (A4). It draws nothing at all, which
 * is the honest reading of "this air declares zero darkness" — the ERASE is
 * {@link cutHole}, reachable only by an AuraClearing, and that split is the
 * whole of A4: one key had been doing two jobs, *how much* and *which
 * operation*. ⚑ The early return is KEPT rather than deleted, because a
 * zero-alpha Container full of children is a real cost for a shape nobody can
 * see.
 *
 * ⛔ `flat` is what keeps DARKNESS colour-only. Darkness has no texture in the
 * world and none here: honouring `texture`/`scroll` on both halves would draw
 * one profile's tile TWICE and compound it against itself. Haze owns the tile
 * and the drift; darkness owns a colour.
 *
 * ⚑ `blend` is the ONE look key BOTH halves read, which is why the mask is
 * built ABOVE the branch rather than inside it. It used to be haze's alone, and
 * that was the gap: a dark bank had no soft edge to author.
 *
 * ⚑ Each shape gets its OWN Container carrying `alpha`, because the paint may
 * be SEVERAL children (a drifting sprite plus its mask) and the opacity belongs
 * to the group, not to whichever child happens to be first.
 */
function paintAir(
    container: Container,
    atmosphere: Region,
    opacity: number,
    renderer: Renderer,
    out: PaintedAir,
    flat: boolean,
): void {
    const draw: DrawSurface = (g, style) => g.poly(atmosphere.points).fill(style);
    if (opacity <= 0) {
        // Declared zero: there is nothing to draw. ⛔ NOT an erase — that is
        // cutHole's job and an AuraClearing's alone (A4).
        return;
    }
    const group = new Container();
    group.alpha = opacity;
    container.addChild(group);

    const mask = surfaceMask(renderer, atmosphere, atmosphere.points, draw, 0, ATMOSPHERE_PROFILES);

    if (flat) {
        // Colour only — the profile's own colour if it authored one, else black,
        // which is what darkness IS.
        //
        // ⚑ `() => false` says NO TEXTURE IS EVER USABLE here, which walks the
        // same D14 fallback a missing tile file takes and hands back the colour.
        // Cheaper than a second accessor, and it makes the colour-only rule a
        // property of the CALL rather than a branch someone can forget.
        const spec = regionPaintSpec(atmosphere, () => false, ATMOSPHERE_PROFILES);
        const color = spec !== null && 'color' in spec ? spec.color : 0x000000;
        // ⛔ `addFeathered`, NOT `paintSurface`, however close the two look from
        // here: paintSurface would honour `texture` and `scroll`, which is the one
        // thing `flat` exists to prevent. Feather the COLOUR and borrow nothing
        // else.
        if (mask === null) {
            group.addChild(draw(new Graphics(), {color}));
            return;
        }
        addFeathered(group, {color}, mask, out);
        return;
    }

    // ⭐ A SWARM REPLACES THE TILE (backlog §62): `texture` and `scroll` are
    // not read, `color` tints the motes, and the mask feathers the swarm's edge
    // the way it would a fog bank's.
    const motes = regionMotes(atmosphere);
    if (motes !== null) {
        const profile = ATMOSPHERE_PROFILES[atmosphere.profile];
        const color = typeof profile.color === 'number' ? profile.color : 0xffffff;
        const swarm = createSwarm(atmosphere.points, motes, color);
        if (swarm !== null) {
            group.addChild(swarm.container);
            out.swarms.push(swarm);
        }
        if (mask !== null) {
            // ⚑ In the scene graph, or it masks nothing (see addFeathered) —
            // and pushed even with no swarm, so the RenderTexture is freed.
            if (swarm !== null) {
                group.addChild(mask.sprite);
                swarm.container.mask = mask.sprite;
            }
            out.masks.push(mask.texture);
        }
        return;
    }

    paintSurface(group, atmosphere, atmosphere.points, draw, mask, 0, out,
        ATMOSPHERE_PROFILES);
}

/**
 * Draws ONE surface's outline, if it authored one (plan-zone-polygons.md D3).
 *
 * ⭐ The outline is a SECOND SURFACE with a SECOND PROFILE, run through the same
 * `paintSurface` the body just used. That is what makes it carry its own blend:
 * a wall names an outline profile with `blend: 0` and gets a hard rim, a
 * riverbank names one with `blend: 0.3` and gets a soft one, and neither
 * constrains the surface underneath. ⭐ It also gets `scroll` for free, which is
 * how a lake's shoreline can drift with the lake.
 *
 * ⚑ THE FOOTPRINT MUST GROW BY HALF THE OUTLINE WIDTH. A stroke centred on the
 * boundary overhangs it by `outlineWidth / 2`, and a mask sized to the blend
 * alone CLIPS it — which reads in-game as the BLEND being broken, not the box
 * being too small. Identical trap to the one C1 hit and fixed for a path's own
 * stroke; the machinery was already there, it just needed the third term.
 *
 * ⛔ Drawn per object immediately after that object's body, never in a second
 * pass over everything: array order governs overlap exactly as it does for every
 * other surface, so a later object's body covers an earlier object's outline.
 */
function paintOutline(
    container: Container,
    surface: Outlined,
    points: RegionPoint[],
    closed: boolean,
    renderer: Renderer,
    out: PaintedSurfaces,
    // The body's tile angle, so a rim follows the shape its surface does.
    angle = 0,
    // The anchor its angle came from, so the tile registers ACROSS the ribbon.
    anchor: { x: number, y: number } | null = null,
    // ⭐ Whether the BODY was drawn as a ribbon mesh. The rim has to make the
    // same choice: a face that follows its bends beside a kerb that does not
    // would disagree with itself along the shape's whole length, which is more
    // obviously wrong than either alone — the same pairing the `angle` argument
    // was added for.
    aligned = false,
    // ⭐ The BODY's corners and ends, and the width its taper is measured from,
    // for the same reason: a sharp wall with a rounded kerb, or a cliff whose
    // lip runs on past the tip of its face, disagrees with itself.
    shape: PathShape = ROUND_SHAPE,
    taperWidth = 0,
): void {
    const width = surface.outlineWidth;
    if (!surface.outlineProfile || !width) { return; }
    // A surface of its own, so every profile lookup below reads the OUTLINE's
    // entry and not the body's.
    const rim: Region = {profile: surface.outlineProfile, points};
    const spec: RibbonSpec = {closed, width, aligned, shape, taperWidth: taperWidth || width};
    const draw = pathSilhouette(points, closed, width, shape, spec.taperWidth);
    // ⚑ ONE mask for both branches: the ribbon's silhouette IS this stroke.
    const mask = surfaceMask(renderer, rim, points, draw, width / 2);
    const rimRibbon = paintRibbon(container, rim, points, spec, mask, out);
    if (!rimRibbon) {
        paintSurface(container, rim, points, draw, mask, width / 2, out, TERRAIN_PROFILES, angle, anchor);
    }
    // A rim profile's overlay is honoured like any other: a profile is a
    // material wherever it is worn, and a key that silently did nothing on one
    // kind of shape is the quiet no-op this file keeps refusing. ⚑ It follows
    // whether the RIM went out as a ribbon, not the body: the rim can fall back
    // (a drifting or still-loading rim profile) while the body did not.
    paintOverlay(container, rim, points, draw, mask, width / 2, renderer, out,
        {...spec, aligned: rimRibbon}, angle, anchor);
}

/**
 * Draws every polygon into `container`, in AUTHORED ORDER (plan-zone-polygons.md
 * P2).
 *
 * ⭐ The draw is BYTE-FOR-BYTE a region's — same callback, same mask, same
 * helper — and that is the claim this primitive rests on. What differs is not
 * the drawing but the MEANING: a region is a material `Regions.resolve()`
 * answers with, a polygon is a thing. ⛔ Which is why this is a second function
 * over a second array and not a longer `regions` list: sharing the draw call is
 * free, sharing the lookup would put cave walls in the footstep table.
 */
export function paintPolygons(
    container: Container,
    polygons: Polygon[],
    renderer: Renderer,
): PaintedSurfaces {
    const out: PaintedSurfaces = {masks: [], scrollers: []};
    polygons.forEach((polygon) => {
        // `poly()` closes by construction, and a polygon is closed by
        // definition. An OPEN filled shape is not a thing this primitive can
        // express, deliberately — that shape is a path.
        paintFilled(container, polygon, polygon.points, false, renderer, out);
        paintOutline(container, polygon, polygon.points, true, renderer, out);
    });
    return out;
}

/**
 * Paints ONE aligned surface as a RIBBON MESH instead of a textured stroke, and
 * says whether it did. `false` means "not my case" and the caller falls back to
 * {@link paintSurface} unchanged.
 *
 * ⭐ WHY A MESH AT ALL — the full argument lives in `PathRibbon.ts`, but the
 * short of it: a stroke carries ONE matrix, so the tile is a world-space
 * pattern seen through the stroke's silhouette and it walks off the ribbon as
 * soon as the ribbon turns. Arc-length UVs follow the bend instead.
 *
 * ⛔ THE THREE CASES IT REFUSES, each for its own reason:
 *
 *  1. **A path that never asked to align.** A road wants its tile square to the
 *     world, which is exactly what the matrix already does, and cheaper: one
 *     Graphics against a geometry buffer.
 *  2. **A colour fallback** (D14, texture missing or still loading). A flat
 *     colour has no phase and no direction, so there is nothing for UVs to do.
 *  3. ⚑ **A DRIFTING profile.** Not because a mesh cannot scroll — a mesh is
 *     precisely what CAN, and the `tilePosition`-period argument recorded in
 *     {@link paintSurface} stops applying the moment `TilingSprite` is out of
 *     the picture. It refuses because the drifting branch has no mesh
 *     implementation yet, which is a different sentence from the one that is
 *     written there, and the only aligned-and-drifting path in the game (the
 *     river) is therefore unchanged by this chunk. ⭐ That is the follow-up
 *     this design opens, not a limit it inherits.
 *  4. ⚑ **A shape the mesh cannot draw yet**: `round` corners or `round` ends
 *     (plan-world-paths.md, the corners/ends rider, chunk B). The stroke +
 *     matrix draws them, straight legs exact, so the authored shape wins over
 *     the bends until the mesh learns them.
 */
function paintRibbon(
    container: Container,
    surface: Region,
    points: RegionPoint[],
    spec: RibbonSpec,
    // ⚑ Built by the CALLER, off the same centreline stroke the fallback draws,
    // so one mask serves either branch — and an overlay can be built from it
    // whichever branch ran. Pushed to `out.masks` only when this returns true.
    mask: BlendMask | null,
    out: PaintedSurfaces,
): boolean {
    const {closed, width, aligned, shape} = spec;
    if (!aligned) { return false; }
    if (shape.corners !== 'sharp' || (!closed && shape.ends === 'round')) { return false; }
    const authored = regionScroll(surface, TERRAIN_PROFILES);
    if (authored.x !== 0 || authored.y !== 0) { return false; }

    const paint = regionPaint(surface, TERRAIN_PROFILES);
    if (paint === null || !('texture' in paint)) { return false; }
    const {texture, scale} = paint;

    // ⚑ One tile spans `scale × its own pixel size` in world px — the same
    // reading `tileMatrix`'s `scale(s, s)` has, so a profile's `scale` means
    // the same thing on both sides of this branch and switching a path between
    // them does not resize its texture.
    const tileW = texture.width * scale;
    const tileH = texture.height * scale;

    // ⚑ The overdraw mirrors `buildBlendMask`'s own outward margin. Content has
    // to reach at least as far as the blur does, because masked alpha is
    // content × mask: a ribbon that stopped at its rim would multiply the
    // outward half of the ramp by nothing and end the edge in a 50 % step —
    // the same trap `addFeathered` exists to dodge for regions.
    const overdraw = mask !== null ? mask.bandPx * 1.5 : 0;
    // A pointed end narrows the mesh itself, so a HARD edge (no mask) tapers
    // too; the texture compresses into the tip rather than being cropped.
    const taper = !closed && shape.ends === 'point' ? taperedCentreline(points, spec.taperWidth) : null;
    const ribbon = taper !== null
        ? ribbonGeometry(taper.points, width, false, tileW, tileH, overdraw, taper.factors)
        : ribbonGeometry(points, width, closed, tileW, tileH, overdraw);
    if (ribbon === null) { return false; }

    const mesh = new Mesh({
        geometry: new MeshGeometry({
            positions: ribbon.positions,
            uvs: ribbon.uvs,
            indices: ribbon.indices,
        }),
        texture,
    });
    container.addChild(mesh);
    if (mask !== null) {
        // ⚑ The mask sprite must be IN the scene graph to have a world
        // transform — a detached mask silently masks NOTHING. Same note as
        // `addFeathered`.
        container.addChild(mask.sprite);
        mesh.mask = mask.sprite;
        out.masks.push(mask.texture);
    }
    return true;
}

/** A polygon's outline has no authored shape: round, as every stroke was (D10). */
const ROUND_SHAPE: PathShape = {corners: 'round', ends: 'round'};

/** Everything about a stroked surface a ribbon mesh needs beyond its points. */
interface RibbonSpec {
    closed: boolean;
    /** This stroke's width, world px. */
    width: number;
    /** Whether it asked to follow its own run (`alignTexture`). */
    aligned: boolean;
    shape: PathShape;
    /** The width a pointed end's taper LENGTH is measured from; see pathSilhouette. */
    taperWidth: number;
}

/**
 * THE silhouette of a path, or of a path's outline: the ONE draw callback the
 * body, its blend mask, its overlay and its hard-edge stencil are all cut
 * from, so an authored corner or end cannot hold in one and not another
 * (plan-world-paths.md, the corners/ends rider).
 *
 * ⭐ `corners` and `ends` are AUTHORED now. They used to follow from the render
 * branch — this function hardcoded round for both (D10: a butt cap reads as a
 * river snipped off with scissors) while the aligned mesh only knew sharp and
 * flat — so "follows the path" and "has corners" came as one package.
 *
 * ⚑ `point` is the one Pixi cannot stroke, because a stroke has ONE width. The
 * full-width middle is still a stroke (butt-capped where the tapers begin, so
 * the corners there are the authored ones); each taper is a FILLED outline
 * ({@link ribbonOutline}), whose bends are always mitred.
 *
 * @param width        this stroke's width, world px
 * @param taperWidth   the width the taper's LENGTH is measured from — the
 *                     path's own, even for its outline, so a rim and its body
 *                     come to the same tip.
 */
function pathSilhouette(
    points: RegionPoint[],
    closed: boolean,
    width: number,
    shape: PathShape,
    taperWidth: number,
): DrawSurface {
    const line = {
        width,
        join: shape.corners === 'sharp' ? 'miter' as const : 'round' as const,
        // ⚑ In half-widths on both sides of the branch, so a sharp corner
        // gives up at the same angle drawn as a stroke or as the mesh.
        miterLimit: MITRE_LIMIT,
    };
    const taper = !closed && shape.ends === 'point' ? taperedCentreline(points, taperWidth) : null;
    if (taper === null) {
        const cap = shape.ends === 'flat' || shape.ends === 'point' ? 'butt' as const : 'round' as const;
        return (g, style) => g.poly(points, closed).stroke({...style, ...line, cap});
    }
    const [a, b] = taper.full;
    const middle = taper.points.slice(a, b + 1);
    const tips = [
        ribbonOutline(taper.points.slice(0, a + 1), width, taper.factors.slice(0, a + 1)),
        ribbonOutline(taper.points.slice(b), width, taper.factors.slice(b)),
    ].filter((t): t is number[] => t !== null);
    return (g, style) => {
        if (middle.length >= 2) {
            g.poly(middle, false).stroke({...style, ...line, cap: 'butt'});
        }
        tips.forEach(t => g.poly(t).fill(style));
        return g;
    };
}

/**
 * Draws every path into `container`, in AUTHORED ORDER.
 *
 * The same three cases as {@link paintRegions}, through the same helper — the
 * only difference is the two lines below, and that is the whole claim this
 * primitive rests on.
 */
export function paintPaths(
    container: Container,
    paths: Path[],
    renderer: Renderer,
): PaintedSurfaces {
    const out: PaintedSurfaces = {masks: [], scrollers: []};
    paths.forEach((path) => {
        // The closePath flag is the whole difference from a region — and it is
        // still a STROKE either way, which is why a closed river is a moat and
        // not a lake. Pixi's own default here is `true`, so the argument is
        // never left off: an omitted one would silently close every road.
        const closed = path.closed === true;
        const draw = pathSilhouette(path.points, closed, path.width, path, path.width);

        // ⭐ `textureAngle` is present on exactly the paths that authored
        // `alignTexture`, so it doubles as the "this one wants to follow its own
        // ribbon" flag. ⚑ Its VALUE is no longer read for those: the mesh takes
        // the direction from the geometry, per vertex, which is the whole point.
        // It stays load-bearing for the drifting fallback below, which is still
        // a matrix.
        const aligned = path.textureAngle !== undefined;

        // ⚑ The footprint has to grow by HALF THE STROKE on top of the blend
        // band: footprintOf measures the CENTRELINE's bounding box, and the
        // ribbon reaches half a width past it on every side. Without this the
        // mask clips the river's own banks — which looks like the blend being
        // wrong rather than the box being too small. ⚑ ONE mask for both
        // branches: the ribbon's silhouette IS this stroke.
        const mask = surfaceMask(renderer, path, path.points, draw, path.width / 2);
        const spec: RibbonSpec = {closed, width: path.width, aligned, shape: path, taperWidth: path.width};
        const ribbon = paintRibbon(container, path, path.points, spec, mask, out);
        if (!ribbon) {
            // ⚑ `textureAngle` is 0/undefined for every path that did not author
            // `alignTexture`, so this argument changes nothing for a road or a
            // river — the whole feature is inert until a path asks.
            paintSurface(container, path, path.points, draw, mask, path.width / 2, out,
                TERRAIN_PROFILES, path.textureAngle || 0, path.textureAnchor || null);
        }
        paintOverlay(container, path, path.points, draw, mask, path.width / 2, renderer, out,
            {...spec, aligned: ribbon},
            path.textureAngle || 0, path.textureAnchor || null);
        // ⚑ The outline follows the path's OWN closure: a ring road's rim has to
        // close with it, or the seam shows as a notch in the kerb.
        // ⭐ ...and its ANGLE, for the same reason: a fence with an aligned rail
        // texture and a world-aligned kerb would disagree with itself along its
        // whole length, which is more obviously wrong than either alone.
        // ⭐ ...and whether the BODY went out as a ribbon mesh, so the rim
        // follows the same bends. ⭐ ...and its corners and ends, tapered over
        // the PATH's width so the rim comes to the same tip.
        paintOutline(container, path, path.points, closed, renderer, out,
            path.textureAngle || 0, path.textureAnchor || null, ribbon, path, path.width);
    });
    return out;
}

/**
 * ⭐ THE entry point both draw sites use — the world (Game.paintTerrainSurfaces)
 * and the full-screen map (MapTerrain.bakeTerrain).
 *
 * Regions, then polygons, then paths: material, then masses, then ribbons — so
 * a road still runs on top of everything. Taking all three arrays through ONE
 * function is not tidiness — plan-region-primitive.md L2 records that a draw
 * site left behind does not degrade, it produces a MAP THAT IS A WRONG DRAWING
 * OF THE WORLD, in a form no single screenshot catches. That lesson cost a
 * chunk once; ⭐ the third surface arrived at plan-zone-polygons.md P2 and cost
 * exactly one line per draw site, which is the whole point of this shape.
 *
 * Three containers so the world can keep its layers separate; the map passes
 * the same scratch container three times, and gets the same order either way.
 *
 * ⚑ EVERYTHING IT RETURNS IS THE CALLER'S — see {@link PaintedSurfaces}.
 *
 * ⚑ The map is the draw site that IGNORES `scrollers`, deliberately: it bakes
 * ONE still frame into a RenderTexture, so a drifting river is a still river on
 * the map. That is correct and not an L2 parity break — L2 is about the map
 * drawing the same WORLD, and an animated map would cost a full re-bake per
 * frame to animate something nobody is looking at while they read a map.
 */
export function paintTerrainSurfaces(
    regionContainer: Container,
    polygonContainer: Container,
    pathContainer: Container,
    regions: Region[],
    polygons: Polygon[],
    paths: Path[],
    renderer: Renderer,
): PaintedSurfaces {
    const painted = [
        paintRegions(regionContainer, regions, renderer),
        paintPolygons(polygonContainer, polygons, renderer),
        paintPaths(pathContainer, paths, renderer),
    ];
    return {
        masks: painted.flatMap(p => p.masks),
        scrollers: painted.flatMap(p => p.scrollers),
    };
}
