/**
 * The name a door's panel shows (plan-passages.md D6, the header column): the
 * exit's own title, else the place its destination stands in, else nothing
 * (the door's catalog name stands). Pure over the bundled zones, so vitest can
 * import it.
 *
 * ⭐ Resolved HERE rather than on the server because the place lookup already
 * exists exactly once, for the crossing card (RegionNames.placeInZone); a Go
 * twin would be a second "last containing region with an id wins" rule that
 * has to agree with this one forever.
 *
 * ⚑ The bundle, not the loaded regions (L8): the destination is usually in a
 * zone that is not loaded yet.
 */
import {PlaceName, placeInZone, PlaceZone} from '../../regions/logic/RegionNames';
import {RegionPoint} from '../../regions/logic/Regions';
import {contentText, REGIONS_ENGLISH} from '../../../client-data/LangBundle';
import {meter2px} from '../../../client-data/BasicConfig';

/** An exit with no id names itself by its anchor: "@" + the anchor name. */
export const ANCHOR_EXIT_PREFIX = '@';

export const exitTitleKey = (id: string) => `exit.${id}.title`;

/** The parts of a bundled zone the header reads. */
export interface HeaderZone extends PlaceZone {
    anchors?: {name: string, x: number, y: number}[];
    exits?: {id?: string, anchor: string}[];
    // Touch exits (P5) are named by the same rule, for their floating name.
    exitAreas?: {id?: string, anchor: string}[];
}

/** The exit's own title in the player's language, '' when none is authored. */
export function exitTitle(id: string): string {
    const key = exitTitleKey(id);
    return contentText(key, REGIONS_ENGLISH[key] || '');
}

/**
 * The header for the door of `exitId` (Conversation.exit_id), or null when
 * neither the exit nor its destination names anything.
 */
export function exitHeader(
    exitId: string,
    zones: Readonly<Record<string, HeaderZone>>,
    title: (id: string) => string = exitTitle,
    place: (stem: string, zone: PlaceZone, point: RegionPoint) => PlaceName | null = placeInZone,
): string | null {
    let anchor: string | undefined;
    if (exitId.startsWith(ANCHOR_EXIT_PREFIX)) {
        anchor = exitId.slice(ANCHOR_EXIT_PREFIX.length);
    } else {
        const own = title(exitId);
        if (own) {
            return own;
        }
        for (const zone of Object.values(zones)) {
            anchor = [...(zone.exits || []), ...(zone.exitAreas || [])].find(e => e.id === exitId)?.anchor;
            if (anchor !== undefined) {
                break;
            }
        }
    }
    if (anchor === undefined) {
        return null;
    }
    for (const stem of Object.keys(zones)) {
        const zone = zones[stem];
        const at = (zone.anchors || []).find(a => a.name === anchor);
        if (at) {
            const origin = zone.origin || {x: 0, y: 0};
            const point = {x: meter2px(at.x + origin.x), y: meter2px(at.y + origin.y)};
            return place(stem, zone, point)?.title || null;
        }
    }
    return null;
}
