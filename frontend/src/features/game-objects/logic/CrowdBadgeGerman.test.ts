import {beforeAll, describe, expect, it} from 'vitest';

// plan-playtest-versions.md D9 (PV2b): German sets the percent sign apart.
// The locale is resolved once at module load, so it is pinned BEFORE the
// badge is imported (SkillTooltipGerman.test.ts's pattern).
window.localStorage.setItem('aura.locale', 'de');

beforeAll(async () => {
    const {loadCatalog} = await import('../../localization/logic/Locale');
    await loadCatalog();
});

describe('the crowd badge text in German', () => {
    it('reads the percent with a space', async () => {
        const {crowdBadgeText} = await import('./CrowdBadge');
        expect(crowdBadgeText(20)).toBe('20 %');
    });
});
