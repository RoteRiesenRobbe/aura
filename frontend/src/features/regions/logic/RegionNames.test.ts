import {describe, expect, it} from 'vitest';
import {PLACES, PlaceAnnouncer, placeAt, placeTable, REPEAT_COOLDOWN_MS, SETTLE_MS} from './RegionNames';
import {paintedRegions, Region} from './Regions';
import regionListJson from '../../../../../api/regions/regions.json';

const square = (x: number, y: number, size: number, extra: Partial<Region> = {}): Region => ({
    profile: 'Fields',
    points: [{x, y}, {x: x + size, y}, {x: x + size, y: y + size}, {x, y: y + size}],
    ...extra,
});

// plan-region-identity.md R1: a region names its place by an id; the text
// lives in a list (D2). A test table, so no content edit reddens these.
const TABLE = placeTable([
    {id: 'outer', title: 'Outer', subtitle: 'The wide land'},
    {id: 'inner', title: 'Inner'},
]);

describe('placeAt', () => {
    it('names the last containing region with an id, its text from the list', () => {
        const regions = [square(0, 0, 100, {id: 'outer'}), square(10, 10, 20, {id: 'inner'})];
        expect(placeAt(regions, {x: 15, y: 15}, TABLE)).toEqual({id: 'inner', title: 'Inner'});
        expect(placeAt(regions, {x: 50, y: 50}, TABLE))
            .toEqual({id: 'outer', title: 'Outer', subtitle: 'The wide land'});
    });

    it('sees through a region without an id, like D0 sees through an undeclared property', () => {
        const regions = [square(0, 0, 100, {id: 'outer'}), square(10, 10, 20)];
        expect(placeAt(regions, {x: 15, y: 15}, TABLE)?.id).toBe('outer');
    });

    // D1: an id-only region (no profile) names a place like any other, and the
    // region above wins for the name exactly as for the ground (D4).
    it('names an id-only sub-place inside a textured place, and the outer one around it', () => {
        const regions = [square(0, 0, 100, {id: 'outer'}), {...square(10, 10, 20), profile: undefined, id: 'inner'}];
        expect(placeAt(regions, {x: 15, y: 15}, TABLE)?.id).toBe('inner');
        expect(placeAt(regions, {x: 50, y: 50}, TABLE)?.id).toBe('outer');
    });

    it('is null outside every region with an id, and for an id the list lacks', () => {
        expect(placeAt([square(0, 0, 10)], {x: 5, y: 5}, TABLE)).toBeNull();
        expect(placeAt([square(0, 0, 10, {id: 'outer'})], {x: 50, y: 50}, TABLE)).toBeNull();
        expect(placeAt([], {x: 0, y: 0}, TABLE)).toBeNull();
        expect(placeAt([square(0, 0, 10, {id: 'unlisted'})], {x: 5, y: 5}, TABLE)).toBeNull();
    });

    it('reads the shipped list: every entry, with its subtitle only when authored', () => {
        const list = (regionListJson as {regions: {id: string, title: string, subtitle?: string}[]}).regions;
        expect(PLACES.size).toBe(list.length);
        for (const p of list) {
            expect(PLACES.get(p.id)).toEqual(p.subtitle ? p : {id: p.id, title: p.title});
        }
    });
});

// ⛔ plan §2.4: a region without a profile is never painted. Handed to the
// painter it would resolve to the default profile, the base land fill.
describe('paintedRegions', () => {
    it('keeps every region that paints ground and drops an id-only one', () => {
        const ground = square(0, 0, 10);
        const both = square(0, 0, 10, {id: 'outer'});
        const idOnly = {...square(0, 0, 10), profile: undefined, id: 'inner'};
        expect(paintedRegions([ground, idOnly, both])).toEqual([ground, both]);
    });
});

describe('PlaceAnnouncer', () => {
    const A = {id: 'home', title: 'Home', subtitle: 'Where it began'};
    const B = {id: 'woods', title: 'Dark Forest'};

    it('announces a place once you have stayed in it for the settle time', () => {
        const a = new PlaceAnnouncer();
        expect(a.update(A, 0)).toBeNull();
        expect(a.update(A, SETTLE_MS - 1)).toBeNull();
        expect(a.update(A, SETTLE_MS)).toEqual(A);
        // Once per entry, however long you stay.
        expect(a.update(A, SETTLE_MS + 1)).toBeNull();
        expect(a.update(A, SETTLE_MS * 50)).toBeNull();
    });

    it('says nothing for a place you only skimmed', () => {
        const a = new PlaceAnnouncer();
        a.update(A, 0);
        a.update(B, SETTLE_MS / 2);
        expect(a.update(A, SETTLE_MS)).toBeNull();
        expect(a.update(A, SETTLE_MS * 2 - 1)).toBeNull();
        expect(a.update(A, SETTLE_MS * 2)).toEqual(A);
    });

    it('does not repeat a place within the cooldown, however often you re-enter', () => {
        const a = new PlaceAnnouncer();
        a.update(A, 0);
        expect(a.update(A, SETTLE_MS)).toEqual(A);
        let t = SETTLE_MS;
        for (let i = 0; i < 5; i++) {
            a.update(null, t += 100);
            a.update(A, t += 100);
            expect(a.update(A, t += SETTLE_MS)).toBeNull();
        }
    });

    it('announces it again once the cooldown is over, on a fresh entry', () => {
        const a = new PlaceAnnouncer();
        a.update(A, 0);
        a.update(A, SETTLE_MS);
        a.update(null, 2 * SETTLE_MS);
        const back = SETTLE_MS + REPEAT_COOLDOWN_MS;
        a.update(A, back);
        expect(a.update(A, back + SETTLE_MS)).toEqual(A);
    });

    it('never announces late an entry the cooldown suppressed', () => {
        const a = new PlaceAnnouncer();
        a.update(A, 0);
        a.update(A, SETTLE_MS);
        a.update(null, 2 * SETTLE_MS);
        a.update(A, 3 * SETTLE_MS);
        expect(a.update(A, 4 * SETTLE_MS)).toBeNull();
        // Still standing there when the cooldown runs out: you did not arrive.
        expect(a.update(A, REPEAT_COOLDOWN_MS * 3)).toBeNull();
    });

    // D3: several polygons carrying one id are one place.
    it('treats two regions with the same id as one place, and another id as another', () => {
        const a = new PlaceAnnouncer();
        a.update(A, 0);
        a.update(A, SETTLE_MS);
        expect(a.update({...A}, SETTLE_MS * 3)).toBeNull();
        // A different id is a different place, even under the same title.
        const twin = {...A, id: 'home-two'};
        a.update(twin, SETTLE_MS * 4);
        expect(a.update(twin, SETTLE_MS * 5)).toEqual(twin);
    });

    it('reset makes the current place a fresh entry but keeps the cooldown', () => {
        const a = new PlaceAnnouncer();
        a.update(B, 0);
        expect(a.update(B, SETTLE_MS)).toEqual(B);
        a.reset();
        a.update(B, 2 * SETTLE_MS);
        expect(a.update(B, 3 * SETTLE_MS)).toBeNull();
        a.reset();
        const later = SETTLE_MS + REPEAT_COOLDOWN_MS;
        a.update(B, later);
        expect(a.update(B, later + SETTLE_MS)).toEqual(B);
    });

    // The crossing curtain's title card already named the place you arrived in;
    // the banner repeating it a second later would announce it twice.
    it('counts a place shown elsewhere against the cooldown', () => {
        const a = new PlaceAnnouncer();
        a.noteShown(B, 0);
        a.update(B, 100);
        expect(a.update(B, 100 + SETTLE_MS)).toBeNull();
        const later = REPEAT_COOLDOWN_MS + 200;
        a.update(null, later);
        a.update(B, later);
        expect(a.update(B, later + SETTLE_MS)).toEqual(B);
    });
});
