import {describe, expect, it} from 'vitest';

import {AuraApi} from '../../backend/logic/AuraApi';
import {SKILL_GLYPHS} from '../../../client-data/icons/SkillIcons.generated';
import {UTILITY_CAST_SECONDS, UTILITY_ICONS, UTILITY_NAMES} from './Utilities';

// The twin-table pin (plan-code-health.md C2 item 2). utilityTooltip builds
// its cast line by indexing UTILITY_CAST_SECONDS guarded only by
// UTILITY_NAMES, so a kind present in one table and missing from the other is
// a latent TypeError at hover time - exactly what Ascend opened when it
// joined the names table without a cast entry. Identical key sets make the
// next utility unable to reopen the gap.
describe('utility tables', () => {
    it('UTILITY_NAMES and UTILITY_CAST_SECONDS cover the same kinds', () => {
        expect(Object.keys(UTILITY_CAST_SECONDS).sort())
            .toEqual(Object.keys(UTILITY_NAMES).sort());
    });

    // UTILITY_ICONS is the ONE table here that is deliberately not key-equal to
    // the others (UI pass C4): Ascend has no button, so it has no glyph. Pinned
    // as an exact set so the exception stays a decision - a third utility that
    // does render a button and forgets its icon fails here.
    it('UTILITY_ICONS covers exactly the utilities that render a button', () => {
        expect(Object.keys(UTILITY_ICONS).map(Number).sort())
            .toEqual([AuraApi.UtilityKind.Recall, AuraApi.UtilityKind.Camp].sort());
    });

    it('every utility icon is a bundled glyph', () => {
        for (const [kind, path] of Object.entries(UTILITY_ICONS)) {
            expect(SKILL_GLYPHS[path], `${UTILITY_NAMES[Number(kind)]} -> ${path}`).toBeDefined();
        }
    });
});
