import {describe, expect, it} from 'vitest';
import regionListJson from '../../../../../api/regions/regions.json';
import {exitHeader, exitTitle, HeaderZone} from './ExitHeader';
import {REGIONS_ENGLISH} from '../../../client-data/LangBundle';

// Any listed place and any named zone: derived, so a renamed place moves the
// test rather than breaking it.
const placeId = (regionListJson as {regions: {id: string}[]}).regions[0].id;
const placeTitle = REGIONS_ENGLISH[`region.${placeId}.title`];
const zoneKey = Object.keys(REGIONS_ENGLISH).find(k => /^zone\.[^.]+\.name$/.test(k))!;
const zoneStem = zoneKey.split('.')[1];

const square = (cx: number, cy: number, r: number) =>
    [{x: cx - r, y: cy - r}, {x: cx + r, y: cy - r}, {x: cx + r, y: cy + r}, {x: cx - r, y: cy + r}];

// A placed zone with one named place around `inside`, and a second zone whose
// anchor stands in no place at all.
const zones: Record<string, HeaderZone> = {
    under: {
        origin: {x: 0, y: 300},
        regions: [{id: placeId, points: square(0, 0, 5)}],
        anchors: [{name: 'inside', x: 1, y: 1}],
        exits: [{id: 'way-up', anchor: 'outside'}],
    },
    [zoneStem]: {
        anchors: [{name: 'outside', x: 0, y: 0}],
        exits: [{id: 'way-down', anchor: 'inside'}, {anchor: 'inside'}],
    },
};
const noTitle = () => '';

describe('ExitHeader (plan-passages.md D6, the header column)', () => {
    it('names an id-less exit by the place its anchor stands in, origin applied', () => {
        expect(placeTitle).toBeTruthy();
        expect(exitHeader('@inside', zones, noTitle)).toBe(placeTitle);
    });

    it('falls back to the zone\'s name where no place is drawn', () => {
        expect(exitHeader('@outside', zones, noTitle)).toBe(REGIONS_ENGLISH[zoneKey]);
    });

    it('reads an exit with an id through its own anchor', () => {
        expect(exitHeader('way-down', zones, noTitle)).toBe(placeTitle);
        expect(exitHeader('way-up', zones, noTitle)).toBe(REGIONS_ENGLISH[zoneKey]);
    });

    it('lets the exit\'s own title win (tier 1)', () => {
        expect(exitHeader('way-down', zones, id => (id === 'way-down' ? 'The Old Stairs' : '')))
            .toBe('The Old Stairs');
    });

    it('names nothing for an exit or anchor the bundle does not have', () => {
        expect(exitHeader('nowhere', zones, noTitle)).toBeNull();
        expect(exitHeader('@nowhere', zones, noTitle)).toBeNull();
    });

    it('reads a title from the bundled English, empty when none is authored', () => {
        expect(exitTitle('no-such-exit')).toBe('');
    });
});
