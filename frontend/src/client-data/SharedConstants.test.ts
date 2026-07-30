import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';

import {AppliedEffectBit} from '../features/game-objects/logic/EffectPips';
import {AuraCategoryBit} from '../features/game-objects/logic/AuraRings';
import {TierRank} from './Mobs';
import {BasicConfig, meter2px} from './BasicConfig';

// §35 C4c (plan-conf-duplication.md D3): the client half of the
// shared-constants contract. api/shared-constants.json is the one authored
// home for the wire-riding values this client restates by hand — the pip and
// ring bit tables, tier ranks, viewport and tickrate — and the Go twin
// (backend/cmd/aurad/shared_constants_test.go) asserts the server tables
// against the same file, so a renumber goes red on whichever side moved.
//
// Exhaustive in both directions: a fixture entry with no enum member and an
// enum member with no fixture entry both fail, so a NEW bit cannot land on
// one side only.

// vitest runs with cwd = frontend/ — the repo-relative read is the same
// convention the Go twin uses.
const shared = JSON.parse(readFileSync('../api/shared-constants.json', 'utf-8'));

// A numeric enum's entries include the value → name reverse mapping; keep the
// name → value direction only.
function numericMembers(enumObject: object): { [name: string]: number } {
    return Object.fromEntries(
        Object.entries(enumObject).filter(([, value]) => typeof value === 'number'));
}

// Fixture keys are lowerCamel ("tickRate"), enum members PascalCase ("TickRate").
function pascalKeyed(table: { [key: string]: number }): { [name: string]: number } {
    return Object.fromEntries(
        Object.entries(table).map(([key, value]) => [key.charAt(0).toUpperCase() + key.slice(1), value]));
}

describe('shared constants (api/shared-constants.json)', () => {
    it('pins the applied-effect pip bits', () => {
        expect(numericMembers(AppliedEffectBit)).toEqual(pascalKeyed(shared.appliedEffectBits));
    });

    it('pins the aura-ring category bits', () => {
        expect(numericMembers(AuraCategoryBit)).toEqual(pascalKeyed(shared.auraCategoryBits));
    });

    it('pins the tier ranks', () => {
        expect(numericMembers(TierRank)).toEqual(pascalKeyed(shared.tierRanks));
    });

    it('pins the viewport (fixture in meters, config in px)', () => {
        expect(BasicConfig.VIEWPORT.WIDTH).toBe(meter2px(shared.viewportMeters.width));
        expect(BasicConfig.VIEWPORT.HEIGHT).toBe(meter2px(shared.viewportMeters.height));
    });

    it('pins the tick rate (fixture in ticks/s, config as ms/tick)', () => {
        expect(BasicConfig.SERVER_TICKRATE).toBe(1000 / shared.ticksPerSecond);
    });
});
