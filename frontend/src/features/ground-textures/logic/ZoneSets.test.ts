import {describe, expect, it} from 'vitest';
import {pickZoneSet} from './ZoneSets';

describe('pickZoneSet', () => {
    const main = {world: 1, underworld: 2};
    const debug = {world_debug: 3, underworld: 4};

    it('follows the server into the debug set when only it has the primary zone', () => {
        expect(pickZoneSet('world_debug', main, debug)).toBe(debug);
    });

    it('stays on the main set for a main-only primary', () => {
        expect(pickZoneSet('world', main, debug)).toBe(main);
    });

    it('lets the main set win a stem both sets carry', () => {
        expect(pickZoneSet('underworld', main, debug)).toBe(main);
    });

    it('falls back to the main set for a stem neither carries', () => {
        expect(pickZoneSet('nowhere', main, debug)).toBe(main);
    });
});
