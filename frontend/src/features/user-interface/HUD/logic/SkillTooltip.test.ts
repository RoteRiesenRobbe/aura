import {describe, expect, it} from 'vitest';

import {SkillDefinition, SkillEffect} from '../../../../client-data/Skills';
import {formatSkillTooltip} from './SkillTooltip';

// Round-4 tooltip fix. The tooltip modelled only the SKILL-level axis; the
// server multiplies every HP-valued output by f(character level) as well
// (casterPowerScale, GDD §5), so Rejuvenation read "4" on a level-30
// character who was actually being healed for ~107.
//
// The pair of assertions that matter: HP lines move with the power scale, and
// every other line is byte-identical across it. The second is the real guard
// — casterPowerScale deliberately touches HP values ONLY, and over-applying
// it (to radius, crit %, a fraction-of-max heal) would be a new bug that
// looks like a fix.

// f(30) on the working-lock curve (growth 1.12 × maxLevel 30).
const SCALE_AT_30 = Math.pow(1.12, 29);

function effect(partial: Partial<SkillEffect> & { type: string }): SkillEffect {
    return {
        radius: 0, radiusPerLevel: 0,
        tickInterval: 0, tickIntervalPerLevel: 0,
        selector: 'all', maxTargets: 0, maxTargetsPerLevel: 0,
        targetsEnemies: false, targetsAllies: false, targetsStructures: false,
        ...partial,
    };
}

function skill(partial: Partial<SkillDefinition> & { effects: SkillEffect[] }): SkillDefinition {
    return {
        id: 1, name: 'Test', displayName: 'Test', category: 'aura', maxLevel: 3,
        legacy: false,
        cooldownTicks: 0, cooldownTicksPerLevel: 0,
        castTicks: 0, castTicksPerLevel: 0, castInterruptedByDamage: false,
        ...partial,
    };
}

function lines(def: SkillDefinition, skillLevel: number, powerScale: number): string[] {
    return formatSkillTooltip(def, skillLevel, powerScale).lines.map(line => line.text);
}

// Rejuvenation as authored (api/skills/rejuvenation.json) — the skill the PO
// reported: healHP 4 (+2/level), 6 ticks every 60, re-applied every 60.
const rejuvenation = skill({
    displayName: 'Rejuvenation',
    effects: [effect({
        type: 'hot_aura',
        radius: 2.5, radiusPerLevel: 0.2,
        tickInterval: 60,
        hot: {hp: 4, hpPerLevel: 2, variance: 0, tickCount: 6, interval: 60, targetsSelf: false},
    })],
});

describe('character power scale', () => {
    it('leaves every line at the authored value on a level-1 character', () => {
        expect(lines(rejuvenation, 1, 1)).toEqual([
            'Heal over time: 4 → 6 × 6 over 11.88s, refreshed every 1.98s',
            'Radius: 2.5 → 2.7',
            'Targets: all allies in range',
        ]);
    });

    it('renders what a level-30 character actually heals for', () => {
        // 4 × 1.12²⁹ ≈ 107 — the reported bug read "4" here.
        expect(lines(rejuvenation, 1, SCALE_AT_30)).toEqual([
            'Heal over time: 107 → 160 × 6 over 11.88s, refreshed every 1.98s',
            'Radius: 2.5 → 2.7',
            'Targets: all allies in range',
        ]);
    });

    it('scales damage, dot, shield, heal and self-heal HP', () => {
        const all = skill({
            maxLevel: 1,
            effects: [
                effect({type: 'instant_damage', damage: damageParams(10)}),
                effect({type: 'instant_dot', dot: {hp: 12, hpPerLevel: 0, tags: ['physical'], variance: 0, tickCount: 3, interval: 30}}),
                effect({type: 'instant_shield', shield: {hp: 6.3, hpPerLevel: 0, durationTicks: 90, targetsSelf: false}}),
                effect({type: 'heal_aura', heal: {hp: 4, hpPerLevel: 0, selfDamageHp: 1.2, selfDamageHpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
                effect({type: 'self_heal', selfHeal: {healHp: 8.4, healHpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
            ],
        });

        // Even unscaled, HP lines now read as whole points: an authored 6.3
        // shield grants vitals.HP(6.3) = 6, so 6 is what the player sees.
        expect(lines(all, 1, 1)).toEqual([
            'Damage: 10',
            'Damage over time: 12 × 3 hits over 2.97s',
            'Shield: 6 HP for 2.97s',
            'Heal: 4 per tick',
            'Costs you: 1 HP per tick',
            'Heal self: 8 HP',
            'Targets: all allies in range',
        ]);
        expect(lines(all, 1, SCALE_AT_30)).toEqual([
            'Damage: 267',
            'Damage over time: 321 × 3 hits over 2.97s',
            'Shield: 169 HP for 2.97s',
            'Heal: 107 per tick',
            'Costs you: 32 HP per tick',
            'Heal self: 225 HP',
            'Targets: all allies in range',
        ]);
    });

    it('leaves every non-HP line byte-identical across the scale', () => {
        // Radius, crit %, variance, slow %, resist %, stat bonus, target
        // counts, cadence, cooldown — casterPowerScale touches none of them.
        const nonHP = skill({
            maxLevel: 3,
            cooldownTicks: 300, cooldownTicksPerLevel: -30,
            effects: [
                effect({
                    type: 'damage_aura',
                    radius: 3, radiusPerLevel: 0.5,
                    tickInterval: 30, tickIntervalPerLevel: -2,
                    selector: 'nearest', maxTargets: 2, maxTargetsPerLevel: 1,
                    targetsEnemies: true,
                    damage: {...damageParams(10), variance: 0.2, critChance: 0.05, critChancePerLevel: 0.02, critFactor: 2},
                }),
                effect({type: 'slow_aura', tickInterval: 20, slow: {fraction: 0.3, fractionPerLevel: 0.05}}),
                effect({type: 'resist_passive', resist: {tags: ['fire'], factor: 0.8, factorPerLevel: -0.05, targetsSelf: true}}),
                effect({type: 'stat_multiplier', stat: {name: 'maxHealth', bonus: 0.08, bonusPerLevel: 0.08}}),
            ],
        });

        const unscaled = lines(nonHP, 2, 1);
        const scaled = lines(nonHP, 2, SCALE_AT_30);
        // The one damage line is expected to move; everything else must not.
        expect(unscaled.filter(l => !l.startsWith('Damage:')))
            .toEqual(scaled.filter(l => !l.startsWith('Damage:')));
        expect(unscaled).toContain('Radius: 3.5 → 4');
        expect(unscaled).toContain('Crit: 7% → 9% (×2)');
        expect(unscaled).toContain('Variance: ±20%');
    });

    it('never scales the fraction-of-max heal branches', () => {
        // Max HP already carries f(L) — which is exactly why the server skips
        // powerScale on these branches too. Scaling here would double-count.
        const fractional = skill({
            maxLevel: 1,
            effects: [
                effect({type: 'heal_aura', heal: {hp: 0, hpPerLevel: 0, selfDamageHp: 0, selfDamageHpPerLevel: 0, fractionOfMax: 0.05, fractionOfMaxPerLevel: 0, variance: 0}}),
                effect({type: 'self_heal', selfHeal: {healHp: 0, healHpPerLevel: 0, fractionOfMax: 0.3, fractionOfMaxPerLevel: 0, variance: 0}}),
            ],
        });

        expect(lines(fractional, 1, SCALE_AT_30)).toEqual(lines(fractional, 1, 1));
        expect(lines(fractional, 1, SCALE_AT_30)).toEqual([
            'Heal: 5% of max HP per tick',
            'Heal self: 30% of max HP',
            'Targets: all allies in range',
        ]);
    });

    it('rounds HP the way the server does (vitals.HP: half up, min 1)', () => {
        const tiny = skill({
            maxLevel: 1,
            effects: [effect({type: 'instant_damage', damage: damageParams(0.4)})],
        });
        // 0.4 rounds down to 0 HP dealt — but a real hit never rounds away to
        // nothing, so vitals.HP floors it at 1.
        expect(lines(tiny, 1, 1)).toEqual(['Damage: 1']);
    });
});

function damageParams(hp: number) {
    return {
        hp, hpPerLevel: 0, tags: ['physical'], gated: false, variance: 0,
        hitStyle: 'all', structureDamageFraction: 0,
        executeBelowFraction: 0, executeBonusFactor: 0, berserkerMaxBonusFactor: 0,
        critChance: 0, critChancePerLevel: 0, critFactor: 0, lifestealFraction: 0,
    };
}

// Calm (plan-faction-flips chunk 2). The tooltip has a default-case warn for
// unknown effect types, so a missing case is a console warning and a literal
// "(calm)" in the panel rather than a build error — which is exactly the kind
// of thing that ships unnoticed.
describe('calm', () => {
    const calm = skill({
        displayName: 'Calm', category: 'cooldown', maxLevel: 3, cooldownTicks: 600,
        effects: [effect({
            type: 'calm', radius: 4, targetsEnemies: true,
            calm: {durationTicks: 300, durationTicksPerLevel: 60},
        })],
    });

    it('states the duration and the break condition', () => {
        const out = lines(calm, 1, 1);
        // 300 ticks at 33 ms = 9.9 s, with the next-level preview the other
        // progression lines already use.
        expect(out).toContain('Calms enemies in range for 9.9s → 11.88s');
        expect(out).toContain('Any damage breaks it — including your own aura');
        expect(out.join('\n')).not.toContain('(calm)');
    });

    it('scales the duration with skill level', () => {
        // At max level there is no next-level preview: 300 + 2 × 60 = 420.
        expect(lines(calm, 3, 1)).toContain('Calms enemies in range for 13.86s');
    });

    it('does not scale the duration with character power', () => {
        // casterPowerScale touches HP values only. A duration that moved with
        // it would be the over-application the round-4 fix warns about.
        expect(lines(calm, 1, SCALE_AT_30)).toContain('Calms enemies in range for 9.9s → 11.88s');
    });
});

// Charm (plan-faction-flips chunk 3, D3/D6). Same tripwire as calm: a missing
// case is a console warning and a literal "(charm)" in the panel, not a build
// error.
describe('charm', () => {
    const charm = skill({
        displayName: 'Charm Beast', category: 'cooldown', maxLevel: 3, cooldownTicks: 3600,
        effects: [effect({
            type: 'charm', radius: 4, targetsEnemies: true, maxTargets: 1,
            charm: {durationTicks: 1800, durationTicksPerLevel: 300},
        })],
    });

    it('says what it does and for how long', () => {
        const out = lines(charm, 1, 1);
        // 1800 ticks at 33 ms = 59.4 s, with the next-level preview.
        expect(out).toContain('Charms the nearest enemy to fight for you for 59.4s → 69.3s');
        expect(out).toContain('It keeps its own level, and turns on you when the charm ends');
        expect(out.join('\n')).not.toContain('(charm)');
    });

    it('scales the duration with skill level', () => {
        // At max level there is no next-level preview: 1800 + 2 × 300 = 2400.
        expect(lines(charm, 3, 1)).toContain('Charms the nearest enemy to fight for you for 79.2s');
    });

    it('does not scale the duration with character power', () => {
        expect(lines(charm, 1, SCALE_AT_30)).toContain('Charms the nearest enemy to fight for you for 59.4s → 69.3s');
    });
});
