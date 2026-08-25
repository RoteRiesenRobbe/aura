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
import {Assets, Container, Graphics, Matrix, Texture} from 'pixi.js';
import {neededTextures, Region, regionPaintSpec} from './Regions';

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
 * Draws every region into `container`, in AUTHORED ORDER — the same order the
 * resolution rule reads (D0), so what you see on top is what a lookup at that
 * point answers.
 *
 * ⚑ ONE function for both draw sites, because the world and the full-screen
 * map are two drawings of the same world and the map falling behind is not a
 * graceful degrade — it is a map that is a WRONG DRAWING of the world (§4.7,
 * L2). Map parity is structural here rather than remembered.
 *
 * Adds, never clears: the map bakes regions into a scratch container that
 * already holds its land fill. A caller that repaints (the world, once the
 * tiles land) empties its own layer first.
 */
export function paintRegions(container: Container, regions: Region[]): void {
    regions.forEach((region) => {
        const paint = regionPaint(region);
        if (paint === null) { return; }
        container.addChild(new Graphics().poly(region.points).fill(paint));
    });
}
