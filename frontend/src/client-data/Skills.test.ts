import {afterEach, describe, expect, it, vi} from 'vitest';

import {ActivationRejection} from '../../../api/schema/js/aura-api/activation-rejection';
import {
    ActivationRejectionMessages, activationRejectionMessage, loadSkillCatalog, skillDisplayNameFor,
} from './Skills';

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

/**
 * A bloodline unlock is stored and served as the skill's REGISTRY NAME
 * (plan-ascension.md D17) — one durable string rather than an id that only
 * means something next to a loaded catalog. The character-select slot card is
 * its first reader.
 */
describe('a skill named by its registry name', () => {
    afterEach(() => vi.unstubAllGlobals());

    /**
     * ⚑ THE FALLBACK MUST NOT BECOME A CamelCase SPLIT, however tempting.
     * `skills.DeriveDisplayName` computes that rule server-side "so the client
     * never re-implements the rule", and the skills that author an override —
     * "Call for Aid", "Damage-Burst", "Long-Range Strike", "Hold the Line" —
     * are exactly the ones a client-side copy renders wrong. Degrading to the
     * identifier is what skillDisplayName already does with `Skill #<id>`.
     */
    it('falls back to the raw key rather than guessing at the rule', () => {
        expect(skillDisplayNameFor('SomethingTheCatalogNeverHad'))
            .toBe('SomethingTheCatalogNeverHad');
    });

    it('uses the authored display name once the catalog has arrived', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({
                skills: [
                    {id: 7, name: 'CallForAid', displayName: 'Call for Aid', category: 'cooldown'},
                    {id: 9, name: 'FrostShield', displayName: 'Frost Shield', category: 'passive'},
                ],
            }),
        })));
        await loadSkillCatalog();

        // ⚑ The override case on purpose: a split of "CallForAid" says "Call For
        // Aid", which is the drift this lookup exists to avoid.
        expect(skillDisplayNameFor('CallForAid')).toBe('Call for Aid');
        expect(skillDisplayNameFor('FrostShield')).toBe('Frost Shield');
    });
});
