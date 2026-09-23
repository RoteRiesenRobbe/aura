/**
 * The browser half of the icon pack (PackIcons.ts is the pure half): fetches
 * the packer's lookup, loads the atlas images, and hands out portrait textures.
 *
 * Imported for its side effect by Game.ts, which also registers `packIconsReady`
 * as a preload so the HUD never builds a token before the lookup is known.
 *
 * ⚑ NEVER rejects. Preloading waits on a Promise.all, so one rejected promise
 * would hang the start screen forever; a missing lookup (no pack on this
 * machine, a 404, a build that skipped the packer) simply leaves the lookup
 * empty and every consumer on its fallback.
 *
 * ⚑ Fetched with `cache: 'no-store'`: the atlas file names are content hashes,
 * so a stale lookup after a redeploy would name atlases that no longer exist.
 *
 * ⚑ No Pixi renderer involved: the portrait clip is a 2D canvas, so it works
 * during preload, before the renderer exists, and costs nothing per frame.
 */
import * as PIXI from 'pixi.js';
import {PACK_LOOKUP_URL, PackLookup, atlasUrl, packIconRegion, packLookup, setPackLookup} from './PackIcons';

const atlasImages = new Map<string, HTMLImageElement>();
const portraitTextures = new Map<string, PIXI.Texture>();

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`failed to load ${src}`));
        image.src = src;
    });
}

async function load(): Promise<void> {
    const response = await fetch(PACK_LOOKUP_URL, {cache: 'no-store'});
    if (!response.ok) {
        throw new Error(`${PACK_LOOKUP_URL}: HTTP ${response.status}`);
    }
    const lookup = await response.json() as PackLookup;
    if (!lookup || typeof lookup.icons !== 'object' || !Array.isArray(lookup.atlases)) {
        throw new Error(`${PACK_LOOKUP_URL}: not a pack lookup`);
    }
    const images = await Promise.all(lookup.atlases.map((file) => loadImage(atlasUrl(file))));
    lookup.atlases.forEach((file, i) => atlasImages.set(file, images[i]));
    setPackLookup(lookup);
    const count = Object.keys(lookup.icons).length;
    if (count > 0) {
        console.info(`[icons] pack: ${count} icon(s) in ${lookup.atlases.length} atlas(es)`);
    }
}

/** Always resolves; the lookup is set only when everything loaded. */
export const packIconsReady: Promise<void> = load().catch((error: unknown) => {
    setPackLookup(null);
    atlasImages.clear();
    console.info('[icons] no pack icons in this build:', (error as Error)?.message ?? error);
});

/**
 * How much of the portrait canvas the clipped disc spans. The frame rings
 * (assets/border/*.png) run from 73-75 % to 97-98 % of the radius, so a disc
 * at 100 % poked out past the ring and a bust filling it read as zoomed in
 * (PO 2026-09-24). 0.86 [PLACEHOLDER] parks the disc's edge under the ring
 * and leaves the same transparent margin the old SVG template had (pipeline.md
 * §4: 82 % of the canvas), so an entity keeps its on-screen size.
 */
const PORTRAIT_FILL = 0.86;

/**
 * A packed icon as a ROUND portrait texture (the medallion frame is round and
 * the pack's icons are square, PO 2026-09-23), or null when the pack has no
 * such icon. The square art is scaled down to PORTRAIT_FILL of the canvas and
 * clipped to that disc, once per name on a 2D canvas, shared by every sprite
 * that draws it. Call after `packIconsReady`.
 */
export function packIconTexture(name: string | null | undefined): PIXI.Texture | null {
    if (!name) {
        return null;
    }
    const cached = portraitTextures.get(name);
    if (cached) {
        return cached;
    }
    const region = packIconRegion(name);
    const image = region ? atlasImages.get(region.atlas) : undefined;
    if (!region || !image) {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }
    const drawn = Math.round(Math.min(region.w, region.h) * PORTRAIT_FILL);
    const offset = (region.w - drawn) / 2;
    ctx.beginPath();
    ctx.arc(region.w / 2, region.h / 2, drawn / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, region.x, region.y, region.w, region.h, offset, offset, drawn, drawn);
    const texture = PIXI.Texture.from(canvas);
    portraitTextures.set(name, texture);
    return texture;
}

/** For the dev console and the harness: what this build loaded. */
export function packIconsLoaded(): { icons: number, atlases: number } {
    const lookup = packLookup();
    return {icons: lookup ? Object.keys(lookup.icons).length : 0, atlases: atlasImages.size};
}
