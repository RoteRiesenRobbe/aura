/**
 * PONETI icon-pack references, the pure half (THIRD_PARTY.md, README "Icons
 * (PONETI pack)").
 *
 * Two consumers name a packed icon, both through a `packIcon` field beside
 * the art they fall back to: a skill's `packIcon` beside its `icon` glyph
 * (IconToken draws it in the HUD from the atlas), and a Graphics.ts entry's
 * `packIcon` beside its `file` (Preloading swaps it in as the portrait).
 * `<name>` is a key of frontend/src/client-data/icons/pack-manifest.json, the
 * only raw-pack data in the repo; the atlases are packer output, committed
 * under frontend/icons-prebuilt/ and copied to dist/icons/, served beside the
 * page.
 *
 * This module holds the lookup and the arithmetic and touches no browser API,
 * so vitest can pin it. PackIconFiles.ts is the half that fetches and loads.
 *
 * ⚑ Without the atlases (a build that skipped the packer, a lookup that failed
 * to load) the lookup is empty and every accessor answers "no": the token
 * falls back to its glyph, the portrait to the committed file. Nothing else
 * changes.
 */

/** Served beside the page: the dev server and aurad both serve dist/ at /. */
export const PACK_LOOKUP_URL = 'icons/icons.json';

export interface PackRegion {
    atlas: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PackLookup {
    iconSize: number;
    atlasSize: number;
    atlases: string[];
    icons: { [name: string]: PackRegion };
}

let lookup: PackLookup | null = null;

export function setPackLookup(next: PackLookup | null): void {
    lookup = next;
}

export function packLookup(): PackLookup | null {
    return lookup;
}

/** The atlas region of a packed icon by manifest name, or null. */
export function packIconRegion(name: string | null | undefined): PackRegion | null {
    if (!name || !lookup) {
        return null;
    }
    return lookup.icons[name] ?? null;
}

/** True when the loaded lookup has an icon of that manifest name. */
export function hasPackIcon(name: string | null | undefined): boolean {
    return packIconRegion(name) !== null;
}

export function atlasUrl(atlasFile: string): string {
    return 'icons/' + atlasFile;
}

/**
 * CSS for drawing one region as a background sprite at ANY element size:
 * percentages scale with the element, pixels would not. With the sheet scaled
 * to atlasSize/w times the element, a percentage position p offsets by
 * p × (element − sheet), which lands on the region at p = x / (atlasSize − w).
 */
export function packIconStyle(region: PackRegion, atlasSize: number): {
    backgroundImage: string;
    backgroundSize: string;
    backgroundPosition: string;
} {
    const pct = (offset: number, extent: number) =>
        `${(offset / Math.max(1, atlasSize - extent)) * 100}%`;
    return {
        backgroundImage: `url("${atlasUrl(region.atlas)}")`,
        backgroundSize: `${(atlasSize / region.w) * 100}% ${(atlasSize / region.h) * 100}%`,
        backgroundPosition: `${pct(region.x, region.w)} ${pct(region.y, region.h)}`,
    };
}
