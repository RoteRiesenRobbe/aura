import {describe, expect, it} from 'vitest';

import {UTILITY_CAST_SECONDS, UTILITY_NAMES} from './Utilities';

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
});
