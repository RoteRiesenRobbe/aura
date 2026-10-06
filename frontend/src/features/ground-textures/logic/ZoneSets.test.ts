import {describe, expect, it} from 'vitest';
import {isDebugZoneSet} from './ZoneSets';

describe('isDebugZoneSet', () => {
    const main = {world: 1, underworld: 2};
    const debug = {world_debug: 3, underworld: 4};

    it('follows the server into the debug set when only it has the primary zone', () => {
        expect(isDebugZoneSet('world_debug', main, debug)).toBe(true);
    });

    it('stays on the main set for a main-only primary', () => {
        expect(isDebugZoneSet('world', main, debug)).toBe(false);
    });

    it('lets the main set win a stem both sets carry', () => {
        expect(isDebugZoneSet('underworld', main, debug)).toBe(false);
    });

    it('falls back to the main set for a stem neither carries', () => {
        expect(isDebugZoneSet('nowhere', main, debug)).toBe(false);
    });
});
