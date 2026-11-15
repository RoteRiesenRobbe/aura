import {afterEach, describe, expect, it, vi} from 'vitest';

import {ActivationRejection} from '../../../api/schema/js/aura-api/activation-rejection';
import {
    ActivationRejectionMessages, activationRejectionMessage, CATEGORY_MAP, loadSkillCatalog, skillDisplayNameFor,
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

// Campfire traits CT1 (plan-campfire-traits D2): the server serves "camp", and
// an unknown category falls back to 'aura', so without its own entry a bought
// trait would be listed among the player's auras.
describe('the camp category', () => {
    it('maps to its own client category, never the aura fallback', () => {
        expect(CATEGORY_MAP['camp']).toBe('camp');
    });
});

// Campfire traits CT2 (plan-campfire-traits D5, D8): the spellbook's campfire
// tab lists the traits FROM THE CATALOG, and the Camp button's cap carries the
// charges trait (L4), mirroring the Go player.CampChargeCap: the level cap plus
// Σ perLevel × level over every charges trait, truncated like Go's int().
describe('campfire traits from the catalog', () => {
    const trait = (id: number, kind: string, perLevel: number, stat?: string) => ({
        id, name: `Trait${id}`, displayName: `Trait ${id}`, icon: '', packIcon: '',
        category: 'camp' as const, maxLevel: 5, legacy: false,
        cooldownTicks: 0, cooldownTicksPerLevel: 0, castTicks: 0, castTicksPerLevel: 0,
        castInterruptedByDamage: false, effects: [],
        campTrait: {kind, perLevel, ...(stat ? {stat} : {})},
    });

    afterEach(() => vi.resetModules());

    it('lists exactly the camp-category skills, by id', async () => {
        const skills = await import('./Skills');
        skills.registerSkillDefinition(trait(902, 'heal', 1));
        skills.registerSkillDefinition({...trait(5, 'heal', 1), category: 'aura', campTrait: undefined});
        skills.registerSkillDefinition(trait(901, 'duration', 30));
        expect(skills.campTraits().map((def) => def.id)).toEqual([901, 902]);
    });

    it('sums perLevel × level over every trait of one kind, unbought traits at 0', async () => {
        const skills = await import('./Skills');
        skills.registerSkillDefinition(trait(901, 'charges', 2));
        skills.registerSkillDefinition(trait(902, 'charges', 1));
        skills.registerSkillDefinition(trait(903, 'duration', 30));
        const levels = new Map([[901, 3], [903, 4]]);
        // A perLevel of 2 tells "the level" apart from "perLevel × level".
        expect(skills.campTraitTotal('charges', (id) => levels.get(id) ?? 0)).toBe(6);
        expect(skills.campTraitTotal('duration', (id) => levels.get(id) ?? 0)).toBe(120);
        expect(skills.campTraitTotal('heal', (id) => levels.get(id) ?? 0)).toBe(0);
    });

    it('adds the charges total to the level cap, truncated', async () => {
        const skills = await import('./Skills');
        expect(skills.campChargeCap(14)).toBe(skills.campChargeCap(14, 0));
        expect(skills.campChargeCap(14, 3)).toBe(skills.campChargeCap(14) + 3);
        expect(skills.campChargeCap(1, 1.9)).toBe(skills.campChargeCap(1) + 1);
    });
});
