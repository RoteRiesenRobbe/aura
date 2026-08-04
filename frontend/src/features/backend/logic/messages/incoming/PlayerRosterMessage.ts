import {AuraApi} from '../../AuraApi';
import {RosterPlayer} from '../../../../mini-map/logic/MapScale';

/**
 * The map's player roster (plan-world-map.md C3, D7): every live player
 * character in the zone, ~1×/s.
 *
 * ⚑ Decoded eagerly into plain objects, unlike GameState's entities, which are
 * read lazily off the buffer. Two reasons: the roster is a handful of entries
 * once a second rather than a per-frame stream, and the flatbuffer accessors
 * are only valid while the underlying ByteBuffer lives — the map holds this
 * list until the *next* publication, which is far longer than that.
 *
 * ⚑ Positions are already in the client's px space (the server marshals them
 * through the same f32ToPx as Character.pos), so nothing is converted here.
 */
export class PlayerRosterMessage {

    tick: number;
    players: RosterPlayer[] = [];

    constructor(roster: AuraApi.PlayerRoster) {
        this.tick = Number(roster.tick());

        const entry = new AuraApi.RosterEntry();
        for (let i = 0; i < roster.entriesLength(); i++) {
            if (!roster.entries(i, entry)) {
                continue;
            }
            // The Vec2f is a struct: valid only while the buffer is, which is
            // exactly why the numbers are copied out here and not later.
            const pos = entry.pos();
            if (!pos) {
                continue;
            }
            this.players.push({
                id: Number(entry.id()),
                x: pos.x(),
                y: pos.y(),
            });
        }
    }
}
