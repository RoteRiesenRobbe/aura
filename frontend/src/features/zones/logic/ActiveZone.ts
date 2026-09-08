import {getZoneData} from '../../ground-textures/logic/GroundTextureManager';

/**
 * Which zone the player is standing in, derived from position alone
 * (plan-underworld.md U2).
 *
 * ⭐ THE WHOLE TRANSITION MECHANIC LIVES HERE, AND IT IS NOT A PROTOCOL.
 * Zones are separated by DISTANCE in one shared coordinate space, so "which
 * zone am I in" is a point-in-rectangle test the client can answer for itself
 * from data it already bundles. There is no layer field on an entity, none on
 * the player, and no message announcing a zone change — the server warps the
 * player a few hundred units, the AOI moves with them, and the snapshot
 * replaces its whole contents on its own.
 *
 * The only thing the wire contributes is Welcome.zoneNames: which of the
 * bundled zone files are real this boot.
 *
 * ⚑ Units are SERVER units here, not pixels. Zone bounds and origins are
 * authored in server units and the entity positions this is asked about arrive
 * in the same, so nothing in this module multiplies by meter2px. A caller
 * holding pixels must divide first.
 */

export interface ZoneRect {
    /** The zone's file stem — its identity everywhere else in the client. */
    name: string;
    /** Rectangle centre in the shared space; absent in the file means {0,0}. */
    originX: number;
    originY: number;
    width: number;
    height: number;
}

/**
 * Builds the rectangles for the zones the server said it loaded.
 *
 * A stem with no bundled data is skipped rather than faked: the alternative is
 * inventing bounds, and a zone at the wrong size would put the camera clamp and
 * the map on a rectangle the server's border wall does not agree with.
 */
export function zoneRects(zoneNames: string[]): ZoneRect[] {
    const rects: ZoneRect[] = [];
    zoneNames.forEach(name => {
        const zone = getZoneData(name);
        if (!zone || !zone.bounds) {
            console.warn(`No bundled zone data for "${name}"; it will not be rendered or entered.`);
            return;
        }
        rects.push({
            name,
            originX: zone.origin ? zone.origin.x : 0,
            originY: zone.origin ? zone.origin.y : 0,
            width: zone.bounds.width,
            height: zone.bounds.height,
        });
    });
    return rects;
}

/** Whether a world position (server units) falls inside this zone. */
export function contains(rect: ZoneRect, x: number, y: number): boolean {
    return x >= rect.originX - rect.width / 2 && x <= rect.originX + rect.width / 2
        && y >= rect.originY - rect.height / 2 && y <= rect.originY + rect.height / 2;
}

/**
 * The zone containing a world position, or undefined.
 *
 * ⚑ Zones never overlap — the server refuses to place two whose border walls
 * could even share a broadphase cell — so the first hit is the only hit and
 * there is no precedence rule to get wrong. This mirrors cfg.ZoneIndexAt on the
 * server, deliberately: the two sides must agree about where a player is, and
 * the rule is small enough that restating it beats inventing a wire field to
 * carry the answer.
 *
 * undefined means the position is in the empty space BETWEEN zones, which each
 * zone's wall makes unreachable in play. Callers should hold their previous
 * answer rather than treat it as a zone change.
 */
export function zoneAt(rects: ZoneRect[], x: number, y: number): ZoneRect | undefined {
    for (const rect of rects) {
        if (contains(rect, x, y)) {
            return rect;
        }
    }
    return undefined;
}

/**
 * Tracks the zone the player is in and reports the moment it changes.
 *
 * ⚑ Deliberately sticky across an unknown position. A player who is briefly
 * nowhere — mid-warp, or in the gap that should not exist — keeps their last
 * zone instead of reporting a change to nothing and back, which would tear the
 * rendered world down twice for no reason.
 */
export class ActiveZoneTracker {
    private rects: ZoneRect[];
    private current: ZoneRect | undefined;

    constructor(zoneNames: string[], startingZone?: string) {
        this.rects = zoneRects(zoneNames);
        this.current = startingZone
            ? this.rects.find(r => r.name === startingZone)
            : this.rects[0];
    }

    /** The zone the player is currently in; undefined only before the first fix. */
    get active(): ZoneRect | undefined {
        return this.current;
    }

    get zones(): ZoneRect[] {
        return this.rects;
    }

    /**
     * Feeds a new player position. Returns the new zone when it CHANGED, else
     * undefined — so a caller can drive a transition off the return value
     * without tracking the previous zone itself.
     */
    update(x: number, y: number): ZoneRect | undefined {
        const found = zoneAt(this.rects, x, y);
        if (!found || found === this.current) {
            return undefined;
        }
        this.current = found;
        return found;
    }
}
