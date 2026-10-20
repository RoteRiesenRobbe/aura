// The look catalog (plan-appearance.md C3, §4.2): the portraits and rings a
// player character may wear, fetched once at startup from the aurad sidecar
// (GET /appearance), the same contract as the mob and quest catalogs. The
// wire carries only numbers (Character.portrait / Character.ring), so this is
// where they turn back into items; the art for each item is client-side
// (GraphicsConfig.playerPortraits, Medallions.RING_FAMILY_FILES).

import {contentCatalogUrl} from '../features/backend/logic/Urls';
import {FALLBACK_FAMILY, RING_FAMILY_FILES, RingFamily} from './Medallions';
import {GraphicsConfig} from './Graphics';

export type AppearanceSlot = 'portrait' | 'ring';

export interface AppearanceItem {
    id: string;
    /** In the served locale. */
    name: string;
    /** Rings only: the ring family it draws (Medallions.RING_FAMILY_FILES). */
    family?: string;
    starter: boolean;
    /** What wire value 0 draws; one per slot. */
    default?: boolean;
}

/** Each slot in wire order: wire value n is element n - 1. */
export interface AppearanceCatalog {
    portraits: AppearanceItem[];
    rings: AppearanceItem[];
}

let catalog: AppearanceCatalog | null = null;

/** Installs a catalog, or null for "not loaded" (the fetch, tests). */
export function setAppearanceCatalog(c: AppearanceCatalog | null) {
    catalog = c;
}

export function appearanceCatalog(): AppearanceCatalog | null {
    return catalog;
}

/** Always resolves; without the catalog every look draws its default art. */
export const appearanceReady: Promise<void> = fetch(contentCatalogUrl('appearance'))
    .then(response => {
        if (!response.ok) {
            throw new Error(`GET /appearance returned ${response.status}`);
        }
        return response.json();
    })
    .then((c: AppearanceCatalog) => setAppearanceCatalog(c))
    .catch(error => console.warn('Appearance catalog unavailable — every player wears the default look', error));

function itemAt(items: AppearanceItem[], wire: number): AppearanceItem | undefined {
    return items[wire - 1] ?? items.find(item => item.default);
}

/** The portrait a wire value names; the default for 0 or an unknown value. */
export function portraitAt(wire: number): AppearanceItem | undefined {
    return catalog ? itemAt(catalog.portraits, wire) : undefined;
}

/** The ring a wire value names; the default for 0 or an unknown value. */
export function ringAt(wire: number): AppearanceItem | undefined {
    return catalog ? itemAt(catalog.rings, wire) : undefined;
}

/** An item's wire value, 0 for an id the slot does not hold. */
export function wireOf(slot: AppearanceSlot, id: string): number {
    const items = slot === 'portrait' ? catalog?.portraits : catalog?.rings;
    return (items?.findIndex(item => item.id === id) ?? -1) + 1;
}

/** The ring family an item draws: grey for none or one this client lacks. */
export function ringFamilyOf(item: AppearanceItem | undefined): RingFamily {
    const family = item?.family;
    return family && family in RING_FAMILY_FILES ? family as RingFamily : FALLBACK_FAMILY;
}

/**
 * The art a worn look draws: the portrait's pack bust (undefined = the class
 * portrait) and the ring family. Before the catalog arrives that is the class
 * portrait in the grey ring, so a token is never bare.
 */
export function lookArt(portraitWire: number, ringWire: number): { packIcon: string | undefined, family: RingFamily } {
    const portrait = portraitAt(portraitWire);
    return {
        packIcon: portrait && GraphicsConfig.playerPortraits[portrait.id]?.packIcon,
        family: ringFamilyOf(ringAt(ringWire)),
    };
}

/** The look a new character starts on: each slot's default item id. */
export function defaultLook(c: AppearanceCatalog): { portrait: string, ring: string } {
    const id = (items: AppearanceItem[]) => (items.find(item => item.default) ?? items[0])?.id ?? '';
    return {portrait: id(c.portraits), ring: id(c.rings)};
}
