import {describe, expect, it} from 'vitest';

import {ActivationRejection} from '../../../api/schema/js/aura-api/activation-rejection';
import {ActivationRejectionMessages, activationRejectionMessage} from './Skills';

// §35 C4b: the rejection-feedback map used to be keyed by bare numbers,
// hand-synced with a Go iota — a server-side renumber showed the WRONG
// message with nothing failing in either language. The enum now lives in
// server.fbs with explicitly pinned values (L8), the map keys by the
// generated names, and this test closes the remaining gap: a NEW enum
// member without a message would silently fall back to the generic text.
describe('activation rejection messages', () => {
    it('has a message for every wire enum member', () => {
        // A TS numeric enum's entries include the reverse mapping — keep the
        // name → number direction only.
        const members = Object.entries(ActivationRejection)
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
            .filter(([, value]) => value !== ActivationRejection.None);
        expect(members.length).toBeGreaterThan(0);
        for (const [name, value] of members) {
            expect(ActivationRejectionMessages[value],
                `ActivationRejection.${name} (= ${value}) has no feedback message — ` +
                'add one to ActivationRejectionMessages in Skills.ts').toBeDefined();
        }
    });

    it('falls back to a generic line for an unknown reason', () => {
        expect(activationRejectionMessage(255)).toBe('Cannot use that now');
    });
});
