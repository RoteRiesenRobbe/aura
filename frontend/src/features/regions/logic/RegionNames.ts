/**
 * Which named place you are in, and when to announce it (the region title
 * banner, 2026-09-28). Pure: no DOM, no Pixi, no clock of its own — the banner
 * (RegionBanner) feeds it positions and `now`.
 *
 * ⭐ A NAME IS PER PLACEMENT, not per profile. A region authors an optional
 * `title` and `subtitle` in the zone file; an untitled region is transparent to
 * this lookup, exactly as a profile that omits a property is transparent to
 * `resolveIn` (D0). So a small unnamed blob inside "Ashen Fields" leaves you in
 * Ashen Fields, and the LAST containing titled region wins, as everywhere else.
 */
import {pointInPolygon, Region, RegionPoint} from './Regions';

/** Stay this long before a place is announced, so skimming a border (or a
 *  warp passing through one) says nothing. [PLACEHOLDER] */
export const SETTLE_MS = 1000;

/** The same place is not announced again for this long after its last banner:
 *  walking out and back in says nothing. [PLACEHOLDER] */
export const REPEAT_COOLDOWN_MS = 30_000;

export interface PlaceName {
    title: string;
    subtitle?: string;
}

/** The place at `point`: the last region in authored order that contains it and
 *  carries a title, or null. */
export function placeAt(regions: Region[], point: RegionPoint): PlaceName | null {
    for (let i = regions.length - 1; i >= 0; i--) {
        const r = regions[i];
        if (r.title && pointInPolygon(point, r.points)) {
            return r.subtitle ? {title: r.title, subtitle: r.subtitle} : {title: r.title};
        }
    }
    return null;
}

/** Two regions carrying the same title and subtitle are ONE place: crossing
 *  from one polygon of "Ashen Fields" into the next announces nothing. */
function keyOf(place: PlaceName | null): string | null {
    return place ? place.title + '\n' + (place.subtitle || '') : null;
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

    /** Forget where you are, NOT what was shown: the next place (a join, a
     *  respawn, a zone crossing) is a fresh entry, and the cooldown still holds. */
    reset() {
        this.current = null;
        this.decided = false;
    }
}
