import {describe, expect, it} from 'vitest';
import {readFileSync} from 'fs';

import {AppliedEffectBit} from '../features/game-objects/logic/EffectPips';
import {AuraCategoryBit} from '../features/game-objects/logic/AuraRings';
import {TierRank} from './Mobs';
import {BasicConfig, meter2px} from './BasicConfig';
import {SKILL_POINT_COST, roundHP, skillPointCost} from './Skills';
import {COST_TRIGGER_TEXT} from '../features/user-interface/HUD/logic/SkillTooltip';

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

    // L2 (plan-numbers-rewrite): the D10 point curve became a cross-language
    // mirror the moment the spellbook + button started showing what a level
    // costs. Both the table and the resulting curve are pinned — a threshold
    // could match while the formula that reads it drifted.
    // R3 follow-up: R2 changed WHEN five of the seven chargeable types are
    // charged, and R1's cost wording predated it — so the tooltip claimed a
    // cadence ("every 1.32s") for effects that actually pay per target-entry.
    // The two sides now restate one authored taxonomy, and both directions are
    // exhaustive: a work-gated type with no wording, or wording for a type the
    // fixture calls application-charged, fails here.
    it('gives every work-gated type its own cost wording, and only those', () => {
        const workGated = Object.entries(shared.costChargeTrigger)
            .filter(([, trigger]) => trigger === 'work')
            .map(([type]) => type);
        expect(Object.keys(COST_TRIGGER_TEXT).sort()).toEqual(workGated.sort());
    });

    it('leaves the application-charged types on the cadence they really pay at', () => {
        for (const [type, trigger] of Object.entries(shared.costChargeTrigger)) {
            if (trigger === 'application') {
                expect(COST_TRIGGER_TEXT[type]).toBeUndefined();
            }
        }
    });

    it('pins the skill-point cost table', () => {
        expect(SKILL_POINT_COST).toEqual(shared.skillPointCost);
    });

    it('pins the skill-point curve the table produces', () => {
        const c = shared.skillPointCost;
        for (const maxLevel of [1, 3, 5, 7, 10]) {
            for (let level = 0; level <= maxLevel + 1; level++) {
                let want: number;
                if (level <= 1 || level > maxLevel) {
                    want = 0;
                } else if (level <= Math.ceil(c.tier2AboveFraction * maxLevel)) {
                    want = c.tier1Points;
                } else if (level <= Math.ceil(c.tier3AboveFraction * maxLevel)) {
                    want = c.tier2Points;
                } else {
                    want = c.tier3Points;
                }
                expect(skillPointCost(maxLevel, level),
                    `cap ${maxLevel}, level ${level}`).toBe(want);
            }
        }
    });

    // §3.11 (plan-resource-costs-feedback): R1's absolute-Focus cost line makes
    // vitals.HP's rounding live arithmetic in TWO languages. If the client
    // rounds a fraction differently from the server, the tooltip promises a
    // price the health bar does not lose — so the same input/output pairs are
    // asserted here and by the Go twin against model/vitals.HP.
    it('pins the HP rounding rule the cost tooltip renders through', () => {
        expect(shared.hpRounding.length).toBeGreaterThan(0);
        for (const [amount, want] of shared.hpRounding) {
            expect(roundHP(amount), `roundHP(${amount})`).toBe(want);
        }
    });
});
