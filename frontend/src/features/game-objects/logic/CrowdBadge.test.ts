import {describe, expect, it} from 'vitest';
import {crowdBadgeText} from './CrowdBadge';

// plan-playtest-versions.md D9 (PV2b): the badge's text is the catalog's,
// the number an argument. English here; CrowdBadgeGerman.test.ts boots in de.
describe('the crowd badge text', () => {
    it('reads the percent in English', () => {
        expect(crowdBadgeText(20)).toBe('20%');
        expect(crowdBadgeText(5)).toBe('5%');
    });
});
