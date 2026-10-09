/**
 * Which named place you are in, and when to announce it (the region title
 * banner, 2026-09-28). Pure: no DOM, no Pixi, no clock of its own — the banner
 * (RegionBanner) feeds it positions and `now`.
 *
 * ⭐ A NAME IS PER PLACEMENT, not per profile. A region authors an optional
 * `id` naming its place (plan-region-identity.md R1); the title and subtitle
 * come from api/regions/regions.json (D2). A region without an id is
 * transparent to this lookup, exactly as a profile that omits a property is
 * transparent to `resolveIn` (D0). So a small unnamed blob inside "Ashen
 * Fields" leaves you in Ashen Fields, and the LAST containing region with an
 * id wins, as everywhere else (D4: the region above wins).
 */
import {pointInPolygon, Region, RegionPoint} from './Regions';
import regionListJson from '../../../../../api/regions/regions.json';
import {contentText, onLangBundle, regionSubtitleKey, regionTitleKey} from '../../../client-data/LangBundle';

/** Stay this long before a place is announced, so skimming a border (or a
 *  warp passing through one) says nothing. [PLACEHOLDER] */
export const SETTLE_MS = 1000;

/** The same place is not announced again for this long after its last banner:
 *  walking out and back in says nothing. [PLACEHOLDER] */
export const REPEAT_COOLDOWN_MS = 30_000;

export interface PlaceName {
    /** The place's id. Absent only on a card that names a ZONE (the crossing
     *  curtain's fallback), which never reaches the announcer. */
    id?: string;
    title: string;
    subtitle?: string;
}

/** One entry of api/regions/regions.json. */
export interface ListedPlace {
    id: string;
    title: string;
    subtitle?: string;
}

/** The place list, by id. The server refuses a boot on an unlisted id, so a
 *  miss here only happens against a hand-edited bundle; it reads as no name. */
export function placeTable(list: ListedPlace[]): Map<string, PlaceName> {
    return new Map(list.map(p => [p.id, p.subtitle
        ? {id: p.id, title: p.title, subtitle: p.subtitle}
        : {id: p.id, title: p.title}]));
}

/** The shipped list (D2), bundled like the zones themselves. */
const LISTED: ListedPlace[] = (regionListJson as {regions: ListedPlace[]}).regions;

export const PLACES: Map<string, PlaceName> = placeTable(LISTED);

/**
 * plan-localization.md C1: the banner text comes from the served /lang bundle
 * in the chosen locale; regions.json keeps the geometry ids and the English
 * fallback. Entries are updated in place, so every holder of PLACES sees it.
 */
export function localizePlaces(
    list: ListedPlace[], places: Map<string, PlaceName>,
    text: (key: string, fallback: string) => string = contentText,
) {
    for (const listed of list) {
        const place = places.get(listed.id);
        if (!place) {
            continue;
        }
        place.title = text(regionTitleKey(listed.id), listed.title);
        if (listed.subtitle) {
            place.subtitle = text(regionSubtitleKey(listed.id), listed.subtitle);
        }
    }
}

onLangBundle(() => localizePlaces(LISTED, PLACES));

/** The place at `point`: the last region in authored order that contains it and
 *  carries an id, or null. */
export function placeAt(
    regions: Region[], point: RegionPoint, places: Map<string, PlaceName> = PLACES,
): PlaceName | null {
    for (let i = regions.length - 1; i >= 0; i--) {
        const r = regions[i];
        if (r.id && pointInPolygon(point, r.points)) {
            return places.get(r.id) || null;
        }
    }
    return null;
}

/** Two polygons carrying one id are ONE place (D3): crossing from one polygon
 *  of "Ashen Fields" into the next announces nothing. */
function keyOf(place: PlaceName | null): string | null {
    return place ? (place.id || place.title) : null;
}

/**
 * Decides, frame by frame, whether to show a banner.
 *
 * One entry into a place gets at most ONE decision: shown, or suppressed by the
 * cooldown. Standing in a place whose entry was suppressed never announces it
 * later — you did not just arrive.
 */
export class PlaceAnnouncer {
    private current: string | null = null;
    private enteredAt = 0;
    private decided = false;
    private lastShown = new Map<string, number>();

    constructor(
        private readonly settleMs = SETTLE_MS,
        private readonly cooldownMs = REPEAT_COOLDOWN_MS,
    ) {
    }

    /** The place to announce now, or null. */
    update(place: PlaceName | null, now: number): PlaceName | null {
        const key = keyOf(place);
        if (key !== this.current) {
            this.current = key;
            this.enteredAt = now;
            this.decided = false;
        }
        if (key === null || this.decided || now - this.enteredAt < this.settleMs) {
            return null;
        }
        this.decided = true;
        const last = this.lastShown.get(key);
        if (last !== undefined && now - last < this.cooldownMs) {
            return null;
        }
        this.lastShown.set(key, now);
        return place;
    }

    /** Records a place announced by something else (the crossing curtain's
     *  title card), so entering it now does not announce it a second time. */
    noteShown(place: PlaceName, now: number) {
        this.lastShown.set(keyOf(place), now);
    }

    /** Forget where you are, NOT what was shown: the next place (a join, a
     *  respawn, a zone crossing) is a fresh entry, and the cooldown still holds. */
    reset() {
        this.current = null;
        this.decided = false;
    }
}
