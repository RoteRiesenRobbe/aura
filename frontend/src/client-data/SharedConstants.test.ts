import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'fs';

import {AppliedEffectBit} from '../features/game-objects/logic/EffectPips';
import {AuraCategoryBit} from '../features/game-objects/logic/AuraRings';
import {TierRank} from './Mobs';
import {BasicConfig, meter2px} from './BasicConfig';
import {GraphicsConfig} from './Graphics';
import {
    SkillDefinition,
    SkillEffect,
    campChargeCap,
    SKILL_POINT_COST,
    roundHP,
    skillPointCost,
} from './Skills';
import {
    COST_TRIGGER_TEXT,
    EFFECT_COLOR_KEYS,
    GATE_KEY_LINES,
    NEUTRAL_EFFECT_TYPES,
    SELECTOR_LABELS,
    SELECTORS_PHRASED_ELSEWHERE,
    STAT_LABELS,
    TICKING_TYPES,
    formatSkillTooltip,
} from '../features/user-interface/HUD/logic/SkillTooltip';
import {UTILITY_CAST_SECONDS} from '../features/utilities/logic/Utilities';
import {AuraApi} from '../features/backend/logic/AuraApi';
import {
    DEACTIVATE_AURA_SLOT,
    NO_ACTIVE_AURA_CHANGE,
} from '../features/backend/logic/messages/outgoing/ActiveAuraSlot';
import {API_ERROR_CODES} from '../features/accounts/logic/AccountsApi';

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

// --- C8 render sweep: one payload-complete fixture per effect type ----------
//
// effectBlock()'s cases DEREFERENCE their payload (effect.calm.durationTicks,
// effect.damage.tags), so a bare {type} throws instead of falling to the
// warning branch - which is precisely why the sweep needs a table rather than
// a loop over the names. The values are arbitrary; only the SHAPE matters.
//
// The table's own key set is pinned == shared.effectTypes below, so a new
// effect type fails HERE first, with a message naming it, before it fails as a
// missing render.
const DAMAGE = {
    hp: 5, hpPerLevel: 1, tags: ['physical'], gateKey: '', variance: 0, hitStyle: '',
    structureDamageFraction: 0, executeBelowFraction: 0, executeBonusFactor: 0,
    berserkerMaxBonusFactor: 0, critChance: 0, critChancePerLevel: 0, critFactor: 0,
    lifestealFraction: 0,
};
const RESIST = {tags: ['fire'], factor: 0.5, factorPerLevel: 0, targetsSelf: false,
    durationTicks: 90, buffLifetimeMatchesInterval: false};
const DOT = {hp: 3, hpPerLevel: 1, tags: ['fire'], variance: 0, tickCount: 3, interval: 30};
const SPAWN = {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0,
    powerPerOwnerLevel: 0, forwardUnits: 3, armTicks: 30};
const SHIELD = {hp: 8, hpPerLevel: 2, durationTicks: 90, targetsSelf: false};
const HOT = {hp: 4, hpPerLevel: 1, fractionOfMax: 0, fractionOfMaxPerLevel: 0,
    variance: 0, tickCount: 6, interval: 60, targetsSelf: false};
const SPEED = {factor: 1.5, factorPerLevel: 0.1, durationTicks: 150,
    durationTicksPerLevel: 0, targetsSelf: true};
const HELD = {durationTicks: 300, durationTicksPerLevel: 60};

const EFFECT_FIXTURES: { [type: string]: Partial<SkillEffect> } = {
    damage_aura: {damage: DAMAGE, tickInterval: 30},
    instant_damage: {damage: DAMAGE},
    heal_aura: {heal: {hp: 4, hpPerLevel: 1, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}, tickInterval: 30},
    self_heal: {selfHeal: {healHp: 8, healHpPerLevel: 2, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}},
    stat_multiplier: {stat: {name: 'maxHealth', bonus: 0.08, bonusPerLevel: 0.03}},
    slow_aura: {slow: {fraction: 0.2, fractionPerLevel: 0.05}, tickInterval: 30},
    resist_aura: {resist: RESIST, tickInterval: 90},
    resist_passive: {resist: RESIST},
    instant_resist: {resist: RESIST},
    dot_aura: {dot: DOT, tickInterval: 60},
    instant_dot: {dot: DOT},
    spawn: {spawn: SPAWN},
    spawn_at_anchor: {spawn: SPAWN},
    projectile: {spawn: SPAWN},
    taunt: {threat: {margin: 10}, radius: 4},
    detaunt: {threat: {margin: 10}, radius: 4},
    light_aura: {radius: 6},
    shield_aura: {shield: SHIELD, tickInterval: 60},
    instant_shield: {shield: SHIELD},
    recall: {},
    hot_aura: {hot: HOT, tickInterval: 60},
    instant_hot: {hot: HOT},
    revive: {revive: {healthFraction: 0.3}},
    dash: {dash: {distance: 5, distancePerLevel: 1}},
    tick_rate: {tickRate: {factor: 0.5, durationTicks: 300}},
    calm: {calm: HELD, radius: 4, targetsEnemies: true},
    charm: {charm: HELD, radius: 4, targetsEnemies: true, maxTargets: 1},
    stun: {stun: HELD},
    speed_burst: {speed: SPEED},
    speed_aura: {speed: SPEED, tickInterval: 60, targetsAllies: true},
    lifesteal_burst: {lifesteal: {fraction: 0.3, fractionPerLevel: 0.05, durationTicks: 180, durationTicksPerLevel: 0}},
    retaliate_slow: {retaliate: {fraction: 0.1, fractionPerLevel: 0.05, durationTicks: 150, durationTicksPerLevel: 0}},
    retaliate_damage: {retaliateDamage: {hp: 3, hpPerLevel: 1, tags: ['fire']}},
    retaliate_burst: {retaliateBurst: {fraction: 0.2, fractionPerLevel: 0.05, durationTicks: 300, durationTicksPerLevel: 0, tags: ['fire']}},
};

function fixtureSkill(type: string): SkillDefinition {
    const effect: SkillEffect = {
        type,
        costFractionOfMax: 0, costFractionOfMaxPerLevel: 0,
        radius: 0, radiusPerLevel: 0,
        tickInterval: 0, tickIntervalPerLevel: 0,
        selector: 'all', maxTargets: 0, maxTargetsPerLevel: 0,
        targetsEnemies: false, targetsAllies: false, targetsStructures: false,
        ...EFFECT_FIXTURES[type],
    };
    return {
        id: 1, name: 'Fixture', displayName: 'Fixture', icon: '',
        category: 'aura', maxLevel: 3, legacy: false,
        cooldownTicks: 0, cooldownTicksPerLevel: 0,
        castTicks: 0, castTicksPerLevel: 0, castInterruptedByDamage: false,
        effects: [effect],
    };
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

    // plan-code-health.md C4: the pinning batch. Each of these values is
    // restated by hand on both sides of the wire; the fixture is the one
    // authored home and the Go twin asserts the server half.

    it('pins the world scale (points per meter)', () => {
        expect(meter2px(1)).toBe(shared.pointsPerMeter);
    });

    // Exhaustive both ways: a fixture kind with no seconds entry and a seconds
    // entry the fixture does not know both fail. The seconds table stays
    // authored (the fixture is a test file, never served); this pin is what
    // keeps it honest against skills/utility.go's CastTicks.
    it('pins the utility cast times (fixture in ticks, table in seconds)', () => {
        const fixtureKinds = Object.entries(shared.utilityCastTicks as {[name: string]: number});
        expect(fixtureKinds.length).toBeGreaterThan(0);
        for (const [name, ticks] of fixtureKinds) {
            const pascal = name.charAt(0).toUpperCase() + name.slice(1);
            const kind = AuraApi.UtilityKind[pascal as keyof typeof AuraApi.UtilityKind];
            expect(kind, `fixture utilityCastTicks names unknown utility "${name}"`).toBeDefined();
            expect(UTILITY_CAST_SECONDS[kind],
                `UTILITY_CAST_SECONDS[${pascal}] has drifted from api/shared-constants.json`)
                .toBe(ticks / shared.ticksPerSecond);
        }
        expect(Object.keys(UTILITY_CAST_SECONDS).length,
            'UTILITY_CAST_SECONDS carries an entry the fixture does not know')
            .toBe(fixtureKinds.length);
    });

    it('pins the active-aura-slot wire sentinels', () => {
        expect(NO_ACTIVE_AURA_CHANGE).toBe(shared.activeAuraSlot.noChange);
        expect(DEACTIVATE_AURA_SLOT).toBe(shared.activeAuraSlot.deactivate);
    });

    it('pins the player collider radius (and the sprite size derived from it)', () => {
        expect(GraphicsConfig.character.colliderRadiusMeters).toBe(shared.playerColliderRadius);
        expect(GraphicsConfig.character.size).toBe(meter2px(shared.playerColliderRadius));
    });

    // Set equality both ways: a fixture code the client does not know and a
    // client code the fixture does not know both fail. 'network' is deliberately
    // outside the pinned list (client-only, the request never got a reply).
    it('pins the accounts refusal codes', () => {
        expect([...API_ERROR_CODES].sort()).toEqual([...shared.apiErrorCodes].sort());
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

    // plan-code-health.md C4, PO call 2026-08-14: BASE_MOVEMENT_SPEED mirrors a
    // CONF value (game.player.walkingSpeedPerTick), not a code constant, so its
    // pin reads conf.default.json instead of the shared-constants fixture (the
    // model/mob conf-pin precedent, client-side this time). Limitation, accepted:
    // the live server's conf.json can still differ; this guards the default,
    // which is the realistic drift path (a retune that forgets the client; the
    // old 0.055 was exactly that class of stale copy).
    it('pins BASE_MOVEMENT_SPEED to the default walking speed (conf.default.json)', () => {
        const conf = JSON.parse(readFileSync('../backend/conf.default.json', 'utf-8'));
        const walkingSpeedPerTick = conf.game.player.walkingSpeedPerTick;
        expect(walkingSpeedPerTick).toBeGreaterThan(0);
        expect(BasicConfig.BASE_MOVEMENT_SPEED).toBe(meter2px(walkingSpeedPerTick));
    });

    // plan-downtime.md D9. The cap is the one Camp value NOT on the wire — the
    // server sends the live charge count and the client derives the cap from
    // the level it already has, so both sides own the curve and either can
    // drift alone. The Go twin asserts the same levels against
    // skills.CampChargeCap.
    it('pins the Camp charge cap curve', () => {
        const c = shared.campChargeCap;
        expect(c.base).toBeGreaterThan(0);
        expect(c.perLevels).toBeGreaterThan(0);
        for (const level of [0, 1, 2, 9, 10, 11, 20, 29, 30, 31]) {
            expect(campChargeCap(level), `level ${level}`)
                .toBe(c.base + Math.floor(level / c.perLevels));
        }
    });

    // --- UI pass C8: the skill-tooltip vocabularies -------------------------
    //
    // The tooltip restates four content-keyed vocabularies by hand - label
    // tables and `case` clauses - and each restatement used to fail SILENTLY:
    // a stat with no label printed its raw JSON key, a ticking type missing
    // from TICKING_TYPES simply stopped saying its cadence, and a whole new
    // effect type degraded to "(type)" plus a console warning nobody reads.
    // These pins turn every one of those into a red test, on the same
    // shared-constants contract the tables above use. The Go twin
    // (pkg/aura/skills/shared_constants_test.go) asserts the server's own maps
    // against the same lists.

    it('gives every server stat a tooltip label, and only those', () => {
        expect(Object.keys(STAT_LABELS).sort()).toEqual([...shared.statNames].sort());
    });

    it('gives every gate key its own sentence, and only those', () => {
        expect(Object.keys(GATE_KEY_LINES).sort()).toEqual([...shared.gateKeys].sort());
    });

    // A PARTITION, not a plain set: `all` is phrased by targetsLine's "all X in
    // range" branch rather than as a count's adjective, so it must stay OUT of
    // the label table while still being accounted for here.
    it('accounts for every selector, either labelled or phrased elsewhere', () => {
        const labelled = Object.keys(SELECTOR_LABELS);
        expect(labelled.filter(name => SELECTORS_PHRASED_ELSEWHERE.includes(name)),
            'a selector is both labelled and phrased elsewhere').toEqual([]);
        expect([...labelled, ...SELECTORS_PHRASED_ELSEWHERE].sort())
            .toEqual([...shared.selectors].sort());
    });

    // The aura-form types with a real cadence are exactly the chargeable ones
    // (both sets are "an aura that keeps doing work over time"), so the two
    // lists are pinned equal rather than each against its own fixture entry.
    it('knows a cadence for exactly the chargeable aura types', () => {
        expect([...TICKING_TYPES].sort()).toEqual(Object.keys(shared.costChargeTrigger).sort());
    });

    // The second PARTITION: EFFECT_COLOR_KEYS is partial by design, so the
    // deliberately-neutral types are named rather than left implicit. A new
    // effect type fails here until somebody has decided its tint - including
    // the decision to leave it neutral.
    it('accounts for every effect type, either tinted or deliberately neutral', () => {
        const tinted = Object.keys(EFFECT_COLOR_KEYS);
        expect(tinted.filter(type => NEUTRAL_EFFECT_TYPES.includes(type)),
            'an effect type is both tinted and listed as neutral').toEqual([]);
        expect([...tinted, ...NEUTRAL_EFFECT_TYPES].sort())
            .toEqual([...shared.effectTypes].sort());
    });

    // The table is the sweep's own precondition, asserted separately so a new
    // effect type fails with "the fixture table does not know X" rather than
    // with an opaque dereference throw inside effectBlock.
    it('carries one render fixture per effect type', () => {
        expect(Object.keys(EFFECT_FIXTURES).sort()).toEqual([...shared.effectTypes].sort());
    });

    // The tripwire the switch's `default:` branch was always meant to be, made
    // to fail a test instead of a console nobody is reading: every authored
    // effect type renders real lines, never "(type)".
    it('renders every effect type without falling to the unknown-type branch', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            for (const type of shared.effectTypes as string[]) {
                const content = formatSkillTooltip(fixtureSkill(type), 1, 1);
                const texts = content.lines.map(line => line.text);
                expect(texts, `${type} rendered no lines`).not.toHaveLength(0);
                expect(texts, `${type} fell through to the unknown-type branch`)
                    .not.toContain(`(${type})`);
            }
            const unknownTypeWarnings = warn.mock.calls
                .map(args => String(args[0]))
                .filter(message => message.includes('unknown effect type'));
            expect(unknownTypeWarnings).toEqual([]);
        } finally {
            warn.mockRestore();
        }
    });
});
