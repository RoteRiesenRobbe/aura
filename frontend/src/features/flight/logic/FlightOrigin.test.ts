import {describe, expect, it} from 'vitest';
import {CampfireLike, fireUnderPlayer, isOrigin, origin, setOrigin} from './FlightOrigin';

/**
 * The campfire-under-the-player test (plan-flight-paths.md C3, PO pass
 * 2026-08-05 — E at a fire is the way into flight).
 *
 * Everything is in wire px, the space the game objects already speak.
 */
function fire(id: number, x: number, y: number, dwellRadius: number): CampfireLike {
    return {id, getX: () => x, getY: () => y, dwellRadius: () => dwellRadius};
}

describe('fireUnderPlayer', () => {
    const FIRES = [
        fire(11, 0, 0, 100),
        fire(12, 500, 0, 100),
    ];

    it('finds the fire whose bind radius contains the player', () => {
        expect(fireUnderPlayer(FIRES, 60, 60)?.id).toBe(11);
        expect(fireUnderPlayer(FIRES, 460, 0)?.id).toBe(12);
    });

    it('is null between fires — standing near one is not standing at it', () => {
        // The gap is the whole point: the badge must not light where the
        // server's CampfireAt would answer "no fire" and refuse the flight.
        expect(fireUnderPlayer(FIRES, 250, 0)).toBeNull();
    });

    it('counts the radius itself, and nothing past it', () => {
        expect(fireUnderPlayer(FIRES, 100, 0)?.id).toBe(11);
        expect(fireUnderPlayer(FIRES, 100.5, 0)).toBeNull();
    });

    it('picks the NEAREST when two bind radii overlap', () => {
        // Nothing stops two authored fires from overlapping, and first-inside
        // would make the answer depend on entity iteration order — which
        // changes as entities enter and leave the viewport, so the badge could
        // hop between two fires while the player stands perfectly still.
        const overlapping = [fire(21, 0, 0, 200), fire(22, 150, 0, 200)];
        expect(fireUnderPlayer(overlapping, 120, 0)?.id).toBe(22);
        expect(fireUnderPlayer(overlapping, 40, 0)?.id).toBe(21);
    });

    it('ignores a fire that has published no radius yet', () => {
        // dwell_radius rides the snapshot, so a campfire that entered the
        // viewport this tick can be at 0. Treating that as "radius 0" would
        // make it match only at the exact centre — a prompt that flickers on
        // one pixel — so it is not a candidate at all.
        expect(fireUnderPlayer([fire(31, 0, 0, 0)], 0, 0)).toBeNull();
    });

    it('is null with nothing in view', () => {
        expect(fireUnderPlayer([], 0, 0)).toBeNull();
    });
});

describe('origin', () => {
    it('discriminates the campfire E acts on, and never entity 0', () => {
        setOrigin(77);
        expect(origin()).toBe(77);
        expect(isOrigin(77)).toBe(true);
        expect(isOrigin(78)).toBe(false);

        // 0 is "nobody offered" on both sides of the comparison — it must
        // never read as a match, or an interact press with no offer at all
        // would open the flight map.
        setOrigin(0);
        expect(isOrigin(0)).toBe(false);
        expect(origin()).toBe(0);
    });
});
