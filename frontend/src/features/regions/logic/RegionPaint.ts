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
    Assets, BlurFilter, Container, Graphics, Matrix, Renderer, RenderTexture, Sprite, Texture,
    TilingSprite,
} from 'pixi.js';
import {Clearing, clearsDarkness, clearsHaze} from '../../atmospheres/logic/Clearings';
import {
    ATMOSPHERE_PROFILES, AtmosphereProfile, declaresDarkness, declaresHaze,
    neededTextures, Outlined, Region, regionBlend,
    regionDarkness, regionHaze, RegionPoint, regionPaintSpec, regionScroll,
    TERRAIN_PROFILES,
} from './Regions';
import {Path} from '../../paths/logic/Paths';
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
): { texture: Texture, matrix: Matrix } | { color: number } | null {
    const spec = regionPaintSpec(region, isTextureUsable, profiles);
    if (spec === null) {
        return null;
    }
    if ('texture' in spec) {
        return {texture: loaded[spec.texture], matrix: new Matrix().scale(spec.scale, spec.scale)};
    }
    return {color: spec.color};
}

/**
 * Texels per WORLD UNIT in a blend mask (C5).
 *
 * The mask holds nothing but a low-frequency alpha ramp, which is where the
 * cost of this feature goes away - `MapFog` states the same economy for the
 * same reason (1024 texels across a 144-unit world). At 6 per unit the shipped
 * 1.5-unit band is 9 texels wide, and one texel covers 20 screen px at native
 * zoom: enough segments that the bilinear upscale of a Gaussian ramp reads as a
 * ramp rather than as steps.
 *
 * Halved on mobile, exactly as `MapFog.fogWidth` and `MapTerrain.bakeWidth` are
 * halved and for the same reason: the phone is the platform already at its
 * render ceiling, and this is the axis that costs only VRAM.
 */
function maskTexelsPerUnit(): number {
    return isMobile() ? 3 : 6;
}

/**
 * Hard cap on either side of a mask texture. A region the size of the world
 * (144 units) asks for 882 texels at the density above, so nothing shipped is
 * near this - it is here so that an author who draws one enormous polygon gets
 * a coarser band instead of a texture no GL implementation will allocate.
 */
const MASK_MAX_TEXELS = 2048;

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

/** A built mask: the sprite to hang on the region, and the texture behind it. */
interface BlendMask {
    sprite: Sprite;
    /** ⚑ The CALLER's to free. Nothing else references it. */
    texture: RenderTexture;
    footprint: Footprint;
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
 * band past it. That is the ruling, not an oversight.
 */
function buildBlendMask(
    renderer: Renderer,
    points: RegionPoint[],
    blend: number,
    draw: (g: Graphics) => void,
    extraMargin: number = 0,
): BlendMask | null {
    const bandPx = meter2px(blend);
    // Half a band of actual outward bleed, plus the BlurFilter's own padding - 
    // `updatePadding()` reserves 2 × strength texels, and strength is half the
    // band, so that padding is one full band. 1.5 covers both with the rounding
    // slack that keeps the ramp from touching the texture edge.
    const footprint = footprintOf(points, bandPx * 1.5 + extraMargin);
    if (footprint === null) { return null; }

    // ⚑ ONE density variable feeds BOTH the texture size and the blur strength.
    // Splitting them is the bug this comment exists to prevent: a region large
    // enough to hit the cap gets a coarser texture, and a strength computed off
    // the uncapped density would then draw a band several times too wide.
    let texelsPerPx = maskTexelsPerUnit() / meter2px(1);
    const longestPx = Math.max(footprint.width, footprint.height);
    if (longestPx * texelsPerPx > MASK_MAX_TEXELS) {
        texelsPerPx = MASK_MAX_TEXELS / longestPx;
    }

    // Sub-texel band: the blur would round to nothing and we would pay a mask
    // and a filter pass for a hard edge. Take the hard edge honestly instead.
    const bandTexels = bandPx * texelsPerPx;
    if (bandTexels < 1) { return null; }

    const texture = RenderTexture.create({
        width: Math.max(1, Math.ceil(footprint.width * texelsPerPx)),
        height: Math.max(1, Math.ceil(footprint.height * texelsPerPx)),
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
    // Strength is HALF the band: a Gaussian of this strength spreads about that
    // far each way, which is what makes the full transition one band wide with
    // its midpoint on the authored line (D22).
    holder.filters = [new BlurFilter({strength: bandTexels / 2, quality: 4})];

    renderer.render({
        container: holder,
        target: texture,
        clear: true,
        clearColor: [0, 0, 0, 0],
    });
    holder.destroy({children: true});

    const sprite = new Sprite(texture);
    sprite.position.set(footprint.x, footprint.y);
    sprite.width = footprint.width;
    sprite.height = footprint.height;
    return {sprite, texture, footprint};
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
    paint: { texture: Texture, matrix: Matrix } | { color: number },
    scrollPx: { x: number, y: number },
): ScrollingSurface | null {
    if (!('texture' in paint)) { return null; }
    // ⚑ The scale is read back off the matrix `regionPaint` just built
    // (`new Matrix().scale(s, s)` → `a === d === s`) rather than resolved a
    // second time from the profile table. Two lookups is two chances to
    // disagree, and a mismatch here is a tile drawn at the wrong size ONLY
    // while it moves — the worst kind of bug to catch in a screenshot.
    const scale = paint.matrix.a;
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
    paint: { texture: Texture, matrix: Matrix } | { color: number },
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
): void {
    const paint = regionPaint(surface, profiles);
    if (paint === null) { return; }

    const authored = regionScroll(surface, profiles);
    const scrollPx = {x: meter2px(authored.x), y: meter2px(authored.y)};

    if (scrollPx.x !== 0 || scrollPx.y !== 0) {
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
 */
export function paintRegions(
    container: Container,
    regions: Region[],
    renderer: Renderer,
): PaintedSurfaces {
    const out: PaintedSurfaces = {masks: [], scrollers: []};
    regions.forEach((region) => {
        const draw: DrawSurface = (g, style) => g.poly(region.points).fill(style);
        const blend = regionBlend(region);
        const mask = blend > 0
            ? buildBlendMask(renderer, region.points, blend, g => draw(g, {color: 0xffffff}))
            : null;
        paintSurface(container, region, region.points, draw, mask, 0, out);
    });
    return out;
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
): PaintedSurfaces {
    const out: PaintedSurfaces = {masks: [], scrollers: []};
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
 *  number in atmosphere-profiles.json — and it wants judging beside the 2-unit
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
    out: PaintedSurfaces,
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

    const blend = regionBlend(atmosphere, ATMOSPHERE_PROFILES);
    const mask = blend > 0
        ? buildBlendMask(renderer, atmosphere.points, blend, g => draw(g, {color: 0xffffff}))
        : null;

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
): void {
    const width = surface.outlineWidth;
    if (!surface.outlineProfile || !width) { return; }
    // A surface of its own, so every profile lookup below reads the OUTLINE's
    // entry and not the body's.
    const rim: Region = {profile: surface.outlineProfile, points};
    const draw: DrawSurface = (g, style) => g
        .poly(points, closed)
        .stroke({...style, width, cap: PATH_CAP, join: PATH_JOIN});
    const blend = regionBlend(rim);
    const mask = blend > 0
        ? buildBlendMask(renderer, points, blend, g => draw(g, {color: 0xffffff}), width / 2)
        : null;
    paintSurface(container, rim, points, draw, mask, width / 2, out);
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
        // No second argument: `poly()` closes by construction, and a polygon is
        // closed by definition. An OPEN filled shape is not a thing this
        // primitive can express, deliberately — that shape is a path.
        const draw: DrawSurface = (g, style) => g.poly(polygon.points).fill(style);
        const blend = regionBlend(polygon);
        const mask = blend > 0
            ? buildBlendMask(renderer, polygon.points, blend, g => draw(g, {color: 0xffffff}))
            : null;
        paintSurface(container, polygon, polygon.points, draw, mask, 0, out);
        paintOutline(container, polygon, polygon.points, true, renderer, out);
    });
    return out;
}

/**
 * The stroke geometry every path is drawn with. Round on both counts (D10):
 * a butt cap reads as a river snipped off with scissors, and a mitre join
 * spikes outward at a sharp bend in a way no riverbank does.
 */
const PATH_CAP = 'round';
const PATH_JOIN = 'round';

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
        const draw: DrawSurface = (g, style) => g
            .poly(path.points, path.closed === true)
            .stroke({...style, width: path.width, cap: PATH_CAP, join: PATH_JOIN});

        const blend = regionBlend(path);
        // ⚑ The footprint has to grow by HALF THE STROKE on top of the blend
        // band: footprintOf measures the CENTRELINE's bounding box, and the
        // ribbon reaches half a width past it on every side. Without this the
        // mask clips the river's own banks — which looks like the blend being
        // wrong rather than the box being too small.
        const mask = blend > 0
            ? buildBlendMask(renderer, path.points, blend,
                g => draw(g, {color: 0xffffff}), path.width / 2)
            : null;
        paintSurface(container, path, path.points, draw, mask, path.width / 2, out);
        // ⚑ The outline follows the path's OWN closure: a ring road's rim has to
        // close with it, or the seam shows as a notch in the kerb.
        paintOutline(container, path, path.points, path.closed === true, renderer, out);
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
