import {describe, expect, it} from 'vitest';
import {PlaceAnnouncer, placeAt, REPEAT_COOLDOWN_MS, SETTLE_MS} from './RegionNames';
import {Region} from './Regions';

const square = (x: number, y: number, size: number, extra: Partial<Region> = {}): Region => ({
    profile: 'Fields',
    points: [{x, y}, {x: x + size, y}, {x: x + size, y: y + size}, {x, y: y + size}],
    ...extra,
});

describe('placeAt', () => {
    it('names the last containing titled region', () => {
        const regions = [
            square(0, 0, 100, {title: 'Outer', subtitle: 'The wide land'}),
            square(10, 10, 20, {title: 'Inner'}),
        ];
        expect(placeAt(regions, {x: 15, y: 15})).toEqual({title: 'Inner'});
        expect(placeAt(regions, {x: 50, y: 50})).toEqual({title: 'Outer', subtitle: 'The wide land'});
    });

    it('sees through an untitled region, like D0 sees through an undeclared property', () => {
        const regions = [square(0, 0, 100, {title: 'Ashen Fields'}), square(10, 10, 20)];
        expect(placeAt(regions, {x: 15, y: 15})).toEqual({title: 'Ashen Fields'});
    });

    it('is null outside every titled region', () => {
        expect(placeAt([square(0, 0, 10)], {x: 5, y: 5})).toBeNull();
        expect(placeAt([square(0, 0, 10, {title: 'A'})], {x: 50, y: 50})).toBeNull();
        expect(placeAt([], {x: 0, y: 0})).toBeNull();
    });
});

describe('PlaceAnnouncer', () => {
    const A = {title: 'Farmlands', subtitle: 'Where it began'};
    const B = {title: 'Dark Forest'};

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

    it('treats two regions with the same title and subtitle as one place', () => {
        const a = new PlaceAnnouncer();
        a.update(A, 0);
        a.update(A, SETTLE_MS);
        expect(a.update({...A}, SETTLE_MS * 3)).toBeNull();
        // A different subtitle is a different place.
        a.update({title: A.title, subtitle: 'Elsewhere'}, SETTLE_MS * 4);
        expect(a.update({title: A.title, subtitle: 'Elsewhere'}, SETTLE_MS * 5)).toEqual(
            {title: A.title, subtitle: 'Elsewhere'});
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
