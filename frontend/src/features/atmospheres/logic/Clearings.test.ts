import {describe, it, expect} from 'vitest';
import {
    clearsAt, clearsDarkness, clearsHaze, Clearing,
    loadClearings, loadedClearings, toClearings,
} from './Clearings';
import {buildProfiles, resolveIn} from '../../regions/logic/Regions';

// 1 unit = 120 px, the conversion every surface primitive applies.
const PX = 120;

/** A square from (x0,y0) to (x1,y1) in WORLD PIXELS — what toClearings emits. */
function square(clears: 'darkness' | 'haze' | 'both',
    x0: number, y0: number, x1: number, y1: number): Clearing {
    return {
        profile: '',
        clears,
        points: [{x: x0, y: y0}, {x: x1, y: y0}, {x: x1, y: y1}, {x: x0, y: y1}],
    };
}

describe('toClearings', () => {
    it('converts server units to world pixels', () => {
        const [hole] = toClearings([
            {clears: 'both', points: [{x: -1, y: 0}, {x: 3, y: 2}, {x: 0, y: 5}]},
        ]);
        expect(hole.clears).toBe('both');
        expect(hole.points).toEqual([
            {x: -PX, y: 0}, {x: 3 * PX, y: 2 * PX}, {x: 0, y: 5 * PX},
        ]);
    });

    // Every zone shipped before A4 authors none — the primitive is inert until
    // content asks for it, the bar every surface before it was held to.
    it('an absent array is no clearings', () => {
        expect(toClearings(undefined)).toEqual([]);
        expect(toClearings([])).toEqual([]);
    });

    // ⛔ THE ORIGIN IS APPLIED HERE AND NOWHERE ELSE. A clearing is
    // client-visual, so the server leaves it zone-local (the atmospheres rule);
    // applying it on both sides would cut every hole twice as far from its bank
    // as it should be — invisible in `world` at {0,0} and 300 units off in the
    // underworld.
    it('applies the zone origin, once', () => {
        const [hole] = toClearings(
            [{clears: 'both', points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]}],
            {x: 10, y: 20},
        );
        expect(hole.points[0]).toEqual({x: 10 * PX, y: 20 * PX});
    });

    // A region's, a polygon's and an atmosphere's rule. The server refuses
    // fewer, so this is the client's degrade path for a hand-edited file — and
    // it drops ONE shape rather than the zone.
    it('drops a shape with fewer than three points, not the zone', () => {
        const out = toClearings([
            {clears: 'both', points: [{x: 0, y: 0}, {x: 1, y: 1}]},
            {clears: 'haze', points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]},
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].clears).toBe('haze');
    });

    // The server refuses an unrecognised value at boot, so anything arriving
    // here bypassed that — and a hole in the wrong layers still beats a hole
    // that silently is not there.
    it('falls back to both on an unrecognised clears', () => {
        const [hole] = toClearings([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {clears: 'sight' as any, points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]},
        ]);
        expect(hole.clears).toBe('both');
    });
});

describe('loadClearings', () => {
    // ⚑ REPLACES, never appends — a zone swap must not leave the old zone's
    // holes cutting the new zone's fog.
    it('replaces the previous zone, never appends', () => {
        loadClearings([{clears: 'both', points: [{x: 0, y: 0}, {x: 1, y: 0}, {x: 1, y: 1}]}]);
        expect(loadedClearings()).toHaveLength(1);
        loadClearings([{clears: 'haze', points: [{x: 2, y: 2}, {x: 3, y: 2}, {x: 3, y: 3}]}]);
        expect(loadedClearings()).toHaveLength(1);
        expect(loadedClearings()[0].clears).toBe('haze');
        loadClearings(undefined);
        expect(loadedClearings()).toEqual([]);
    });
});

describe('which layers a clearing cuts', () => {
    it('reads the enum, per layer', () => {
        expect(clearsDarkness(square('darkness', 0, 0, 1, 1))).toBe(true);
        expect(clearsHaze(square('darkness', 0, 0, 1, 1))).toBe(false);

        expect(clearsHaze(square('haze', 0, 0, 1, 1))).toBe(true);
        expect(clearsDarkness(square('haze', 0, 0, 1, 1))).toBe(false);

        expect(clearsDarkness(square('both', 0, 0, 1, 1))).toBe(true);
        expect(clearsHaze(square('both', 0, 0, 1, 1))).toBe(true);
    });

    // ⚑ Per LAYER, so a hole can open one and not the other: a `darkness`
    // clearing in a smoky cave lights the pocket and leaves the fog hanging in
    // it, which is a real authoring case and not a degenerate one.
    it('a darkness clearing leaves the haze alone', () => {
        const hole = square('darkness', 0, 0, 10, 10);
        expect(clearsAt('darkness', {x: 5, y: 5}, [hole])).toBe(true);
        expect(clearsAt('haze', {x: 5, y: 5}, [hole])).toBe(false);
    });
});

describe('clearsAt — ⛔ THE A4 SEAM', () => {
    it('answers only inside the shape', () => {
        const hole = square('both', 0, 0, 10, 10);
        expect(clearsAt('darkness', {x: 5, y: 5}, [hole])).toBe(true);
        expect(clearsAt('darkness', {x: 50, y: 5}, [hole])).toBe(false);
    });

    it('no clearings is no holes', () => {
        expect(clearsAt('darkness', {x: 5, y: 5}, [])).toBe(false);
    });

    // ⭐ D17 IN A TEST: a clearing is applied AFTER every atmosphere no matter
    // where it was authored, so it can never be "overtaken" by a later bank.
    // Two separate arrays cannot express interleaving without inventing an
    // ordering key, and this is the reading that needs none.
    //
    // ⛔ It is also the property that makes the drawing and the lookup agree:
    // paintAtmospheres cuts its holes in one pass AFTER the paint loop, so a
    // clearing that answers true here is a hole that was actually cut.
    it('a clearing is not overtaken by anything — order carries no meaning', () => {
        const first = square('both', 0, 0, 10, 10);
        const second = square('both', 0, 0, 10, 10);
        expect(clearsAt('darkness', {x: 5, y: 5}, [first, second])).toBe(true);
        expect(clearsAt('darkness', {x: 5, y: 5}, [second, first])).toBe(true);
    });

    /**
     * ⛔⛔ THE DEFECT A4 IS BUILT TO AVOID, PINNED AS A TEST.
     *
     * Before A4 a clearing WAS an atmosphere and DID declare `darkness: 0`, so
     * `resolveIn` answered 0 at its points all by itself — the overlay's comment
     * called it "free". A4 took the profile away (L7), and a profile-less shape
     * is INVISIBLE to a walk that looks profiles up by name.
     *
     * This test is the proof that the walk alone is NOT enough any more: the
     * resolve still reports darkness inside the hole, and only the clearing
     * check corrects it. Delete the check in `DarknessOverlay.inDarkness` and
     * the picture stays perfect — the hole is painted, the mob is lit — while
     * every nameplate in the lit pocket is hidden, with nothing thrown.
     */
    it('a clearing is INVISIBLE to the profile walk — which is why the seam exists', () => {
        const profiles = buildProfiles({
            'Cave Air': {darkness: 1},
        });
        const bank = {
            profile: 'Cave Air',
            points: [{x: 0, y: 0}, {x: 100, y: 0}, {x: 100, y: 100}, {x: 0, y: 100}],
        };
        const hole = square('both', 20, 20, 60, 60);
        const inside = {x: 40, y: 40};

        // The resolve, on its own, still says DARK inside the hole. This is the
        // half that used to be enough and no longer is.
        expect(resolveIn('darkness', inside, [bank], profiles)).toBe(1);

        // The clearing is what corrects it — deliberately, not by falling out.
        expect(clearsAt('darkness', inside, [hole])).toBe(true);

        // And the control: just outside the hole, the bank still reads dark and
        // no clearing claims the point. Without this line the test above would
        // pass against a clearsAt that returned true everywhere.
        expect(clearsAt('darkness', {x: 80, y: 80}, [hole])).toBe(false);
        expect(resolveIn('darkness', {x: 80, y: 80}, [bank], profiles)).toBe(1);
    });
});
