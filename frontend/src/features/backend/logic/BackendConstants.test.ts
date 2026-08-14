import {describe, expect, it} from 'vitest';

import {AuraApi} from './AuraApi';
import {setup, statusEffectLookupTable} from './BackendConstants';
import {StatusEffect, StatusEffectDefinition} from '../../game-objects/logic/StatusEffect';

// plan-code-health.md C4 (research-code-quality §11.3 F2): the wire StatusEffect
// enum is joined to the StatusEffect.ts visual classes by identifier SPELLING
// through a dynamic lookup TypeScript cannot see. A schema rename used to
// silently kill that visual (the entry maps to undefined, no error anywhere);
// this suite makes the join exhaustive in both directions instead.

// A numeric enum's entries include the value → name reverse mapping; keep the
// name → value direction only (the SharedConstants.test.ts convention).
const wireMembers = Object.entries(AuraApi.StatusEffect)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number');

// The class statics that are effect definitions (static fields are enumerable
// own properties; static methods are not).
const classMembers = Object.entries(StatusEffect)
    .filter((entry): entry is [string, StatusEffectDefinition] =>
        typeof entry[1] === 'object' && entry[1] !== null
        && 'id' in entry[1] && 'priority' in entry[1]);

describe('the StatusEffect wire↔visual join', () => {
    it('resolves every wire enum member to a visual definition', () => {
        setup();
        expect(wireMembers.length).toBeGreaterThan(0);
        for (const [name, value] of wireMembers) {
            expect(statusEffectLookupTable[value],
                `AuraApi.StatusEffect.${name} (= ${value}) resolves to no visual — ` +
                'a schema rename or a missing StatusEffect.ts static; the effect would silently not render')
                .toBeDefined();
        }
    });

    it('gives every visual definition a wire enum member (no orphans)', () => {
        expect(classMembers.length).toBeGreaterThan(0);
        for (const [name] of classMembers) {
            expect(AuraApi.StatusEffect[name as keyof typeof AuraApi.StatusEffect],
                `StatusEffect.${name} has no wire enum member — dead visual, ` +
                'or the schema side of a rename; delete it or fix the spelling')
                .toBeDefined();
        }
    });

    it('keeps the lookup table free of reverse-mapping junk', () => {
        setup();
        // The enum object also carries the value → name reverse mapping; the
        // production join must skip those keys or it also writes name-keyed
        // undefined entries into the table.
        expect(Object.keys(statusEffectLookupTable).length).toBe(wireMembers.length);
    });
});
