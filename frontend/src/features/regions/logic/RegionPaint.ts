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
} from 'pixi.js';
import {neededTextures, Region, regionBlend, RegionPoint, regionPaintSpec} from './Regions';
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
export function loadZoneTextures(regions: Region[]): Promise<boolean> {
    const wanted = neededTextures(regions).filter(name => loaded[name] === undefined);
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
export function regionPaint(region: Region): { texture: Texture, matrix: Matrix } | { color: number } | null {
    const spec = regionPaintSpec(region, isTextureUsable);
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
function buildBlendMask(renderer: Renderer, region: Region, blend: number): BlendMask | null {
    const bandPx = meter2px(blend);
    // Half a band of actual outward bleed, plus the BlurFilter's own padding - 
    // `updatePadding()` reserves 2 × strength texels, and strength is half the
    // band, so that padding is one full band. 1.5 covers both with the rounding
    // slack that keeps the ramp from touching the texture edge.
    const footprint = footprintOf(region.points, bandPx * 1.5);
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
    holder.addChild(new Graphics().poly(region.points).fill(0xffffff));
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
 * ⚑ RETURNS THE MASK TEXTURES, AND THE CALLER OWNS THEM. Unlike the ground
 * tiles - shared by every region on that profile and by the map's bake, which
 * is why the callers destroy their Graphics without touching textures - a mask
 * texture belongs to exactly one region of exactly one paint pass. Nothing else
 * will ever free it, and this function runs again every time the world
 * repaints, so a caller that drops the array leaks GPU memory per repaint.
 */
export function paintRegions(
    container: Container,
    regions: Region[],
    renderer: Renderer,
): RenderTexture[] {
    const masks: RenderTexture[] = [];
    regions.forEach((region) => {
        const paint = regionPaint(region);
        if (paint === null) { return; }

        const blend = regionBlend(region);
        const mask = blend > 0 ? buildBlendMask(renderer, region, blend) : null;
        if (mask === null) {
            // blend 0, or a band too narrow to matter: EXACTLY the C4 path. No
            // render texture, no mask, no per-frame filter pass - the feature
            // costs nothing at all until a profile authors it.
            container.addChild(new Graphics().poly(region.points).fill(paint));
            return;
        }

        // ⚑ The paint is a RECT over the mask's footprint, not the polygon.
        // A masked polygon would be wrong in a way that looks almost right:
        // masked alpha is content × mask, the content is 0 outside the polygon,
        // so the outward half of the symmetric ramp multiplies nothing and the
        // edge ends in a 50 %-opacity STEP. The shape has to come from the mask
        // alone, so the fill has to reach past the line. The tile matrix is
        // texture→local and both shapes sit at the container origin, so the
        // tile phase is identical either way.
        const shape = new Graphics()
            .rect(mask.footprint.x, mask.footprint.y, mask.footprint.width, mask.footprint.height)
            .fill(paint);
        container.addChild(shape);
        // ⚑ The mask sprite must be IN the scene graph to have a world
        // transform - a detached mask silently masks NOTHING, and the region
        // would paint as a full opaque rectangle. MiniMap.setupTerrain carries
        // the same note for the fog.
        container.addChild(mask.sprite);
        shape.mask = mask.sprite;
        masks.push(mask.texture);
    });
    return masks;
}
