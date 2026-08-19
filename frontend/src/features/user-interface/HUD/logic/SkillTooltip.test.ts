import {describe, expect, it} from 'vitest';

import {SkillDefinition, SkillEffect, roundHP} from '../../../../client-data/Skills';
import {loadMobCatalog} from '../../../../client-data/Mobs';
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
        costFractionOfMax: 0, costFractionOfMaxPerLevel: 0,
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

function lines(def: SkillDefinition, skillLevel: number, powerScale: number,
               maxHealth: number = 0, costFactor: number = 1,
               damageFactor: number = 1): string[] {
    return formatSkillTooltip(def, skillLevel, powerScale, maxHealth, costFactor, true, damageFactor)
        .lines.map(line => line.text);
}

// Rejuvenation as authored (api/skills/rejuvenation.json) — the skill the PO
// reported: healHP 4 (+2/level), 6 ticks every 60, re-applied every 60.
const rejuvenation = skill({
    displayName: 'Rejuvenation',
    effects: [effect({
        type: 'hot_aura',
        radius: 2.5, radiusPerLevel: 0.2,
        tickInterval: 60,
        hot: {hp: 4, hpPerLevel: 2, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0, tickCount: 6, interval: 60, targetsSelf: false},
    })],
});

describe('character power scale', () => {
    it('leaves every line at the authored value on a level-1 character', () => {
        expect(lines(rejuvenation, 1, 1)).toEqual([
            'Heal over time: 4 → 6 × 6 over 12s, refreshed every 2s',
            'Radius: 2.5 → 2.7',
            'Targets: all allies in range',
        ]);
    });

    it('renders what a level-30 character actually heals for', () => {
        // 4 × 1.12²⁹ ≈ 107 — the reported bug read "4" here.
        expect(lines(rejuvenation, 1, SCALE_AT_30)).toEqual([
            'Heal over time: 107 → 160 × 6 over 12s, refreshed every 2s',
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
                effect({type: 'heal_aura', costFractionOfMax: 0.012, heal: {hp: 4, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
                effect({type: 'self_heal', selfHeal: {healHp: 8.4, healHpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
            ],
        });

        // Even unscaled, HP lines now read as whole points: an authored 6.3
        // shield grants vitals.HP(6.3) = 6, so 6 is what the player sees.
        // (Cost lines close the tooltip body since N2 — they group by charge
        // trigger at the skill level rather than closing each effect's block.)
        expect(lines(all, 1, 1)).toEqual([
            'Damage: 10',
            'Damage over time: 12 × 3 hits over 3s',
            'Shield: 6 Focus for 3s',
            'Heal: 4 per tick',
            'Heal self: 8 Focus',
            'Targets: all allies in range',
            'Costs you: 1.2% of max Focus per tick',
        ]);
        expect(lines(all, 1, SCALE_AT_30)).toEqual([
            'Damage: 267',
            'Damage over time: 321 × 3 hits over 3s',
            'Shield: 169 Focus for 3s',
            'Heal: 107 per tick',
            'Heal self: 225 Focus',
            'Targets: all allies in range',
            'Costs you: 1.2% of max Focus per tick',
        ]);
    });

    it('multiplies damage and dot lines through the damage factor, and nothing else', () => {
        // Round-7 item 5 (Strong): the server applies casterDamageFactor at
        // the damage base-composition sites — direct hits and dots, never
        // heals, shields or CC. The tooltip must draw the same line, or
        // equipping Strong either stays invisible (the reported bug) or
        // advertises bigger heals it does not deliver (a new one).
        const all = skill({
            maxLevel: 1,
            effects: [
                effect({type: 'instant_damage', damage: damageParams(10)}),
                effect({type: 'instant_dot', dot: {hp: 12, hpPerLevel: 0, tags: ['physical'], variance: 0, tickCount: 3, interval: 30}}),
                effect({type: 'instant_shield', shield: {hp: 6.3, hpPerLevel: 0, durationTicks: 90, targetsSelf: false}}),
                effect({type: 'heal_aura', heal: {hp: 4, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
                effect({type: 'self_heal', selfHeal: {healHp: 8.4, healHpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
            ],
        });

        expect(lines(all, 1, 1, 0, 1, 1.2)).toEqual([
            'Damage: 12',
            'Damage over time: 14 × 3 hits over 3s',
            'Shield: 6 Focus for 3s',
            'Heal: 4 per tick',
            'Heal self: 8 Focus',
            'Targets: all allies in range',
        ]);
    });

    it('composes the damage factor with the character power scale', () => {
        const direct = skill({maxLevel: 1, effects: [effect({type: 'instant_damage', damage: damageParams(10)})]});
        // 10 × 1.12²⁹ × 1.1 ≈ 294 — the same order the server multiplies in.
        expect(lines(direct, 1, SCALE_AT_30, 0, 1, 1.1)).toEqual(['Damage: 294']);
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
                effect({type: 'resist_passive', resist: {tags: ['fire'], factor: 0.8, factorPerLevel: -0.05, targetsSelf: true, durationTicks: 0, buffLifetimeMatchesInterval: false}}),
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
                effect({type: 'heal_aura', heal: {hp: 0, hpPerLevel: 0, fractionOfMax: 0.05, fractionOfMaxPerLevel: 0, variance: 0}}),
                effect({type: 'self_heal', selfHeal: {healHp: 0, healHpPerLevel: 0, fractionOfMax: 0.3, fractionOfMaxPerLevel: 0, variance: 0}}),
            ],
        });

        expect(lines(fractional, 1, SCALE_AT_30)).toEqual(lines(fractional, 1, 1));
        expect(lines(fractional, 1, SCALE_AT_30)).toEqual([
            'Heal: 5% of max Focus per tick',
            'Heal self: 30% of max Focus',
            'Targets: all allies in range',
        ]);
    });

    // A cooldown pays the SUM of its effects once on cast (D8), so the line
    // belongs to the skill, not to each effect. CallForAid's three summons at
    // 2 % each cost 6 % per cast — printing "2 %" three times would understate
    // it by a factor of three and read as if the player could pick one.
    it('sums a cooldown cost across its effects and prints it once', () => {
        const squad = skill({
            category: 'cooldown', maxLevel: 5, cooldownTicks: 2400,
            effects: [
                effect({type: 'spawn', costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.003, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.003, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.003, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
            ],
        });

        const rendered = lines(squad, 1, 1);
        expect(rendered.filter(l => l.startsWith('Costs you'))).toEqual([
            'Costs you: 6% → 6.9% of max Focus per cast',
        ]);
        // ...and it is a percentage, so it does not move with the power scale.
        expect(lines(squad, 1, SCALE_AT_30)).toEqual(rendered);
    });

    // D14 / Recover: HotParams gained fractionOfMax in C1 and NO content used it
    // until C2c, so this branch shipped unrendered — a fractional HoT read
    // "Heal over time: 0 × 9 over 18s", taking the flat-hp path against hp: 0.
    it('renders a fractional heal-over-time as a percentage, unscaled', () => {
        const recover = skill({
            maxLevel: 1, category: 'cooldown', cooldownTicks: 1200,
            effects: [effect({
                type: 'instant_hot', radius: 2,
                hot: {hp: 0, hpPerLevel: 0, fractionOfMax: 0.03, fractionOfMaxPerLevel: 0, variance: 0, tickCount: 9, interval: 60, targetsSelf: true},
            })],
        });

        const at1 = lines(recover, 1, 1);
        expect(at1).toContain('Heal over time: 3% of max Focus × 9 over 18s');
        expect(lines(recover, 1, SCALE_AT_30)).toEqual(at1);
    });

    // D4's split at the tooltip. ⚑ The gated branch must not read `tags`: a
    // gated payload carries none, so Go marshals the nil slice as JSON null and
    // `tags.length` would throw — inside the tooltip for Harvest, which every
    // new player is taught.
    it('renders a gate key as a verb and never reads tags on that branch', () => {
        const harvest = skill({
            maxLevel: 1,
            effects: [effect({
                type: 'damage_aura', radius: 1, tickInterval: 40,
                damage: {...damageParams(14), tags: null as any, gateKey: 'harvest'},
            })],
        });

        expect(lines(harvest, 1, 1)).toContain('Harvests plants and brambles — nothing else');
        expect(lines(harvest, 1, 1).some(l => l.startsWith('Damage type'))).toBe(false);
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

function damageParams(hp: number, hpPerLevel: number = 0) {
    return {
        hp, hpPerLevel, tags: ['physical'], gateKey: '', variance: 0,
        hitStyle: 'all', structureDamageFraction: 0,
        executeBelowFraction: 0, executeBonusFactor: 0, berserkerMaxBonusFactor: 0,
        critChance: 0, critChancePerLevel: 0, critFactor: 0, lifestealFraction: 0,
    };
}

// Calm (plan-faction-flips chunk 2). The tooltip has a default-case warn for
// unknown effect types, so a missing case is a console warning and a literal
// "(calm)" in the panel rather than a build error — which is exactly the kind
// of thing that ships unnoticed.
describe('passive stat labels (round-7 item 10)', () => {
    it('renders every authored validStat with a player-facing label', () => {
        // The audit's one real bug: costReduction had no STAT_LABELS entry, so
        // Discipline's stat line fell back to the raw JSON key
        // ("costReduction: +6%"). The table must cover every stat the server
        // dispatches in recomputeDerived, or the next passive ships with its
        // internal name on screen.
        const statLine = (name: string, bonus: number) => lines(skill({
            maxLevel: 5, category: 'passive',
            effects: [effect({type: 'stat_multiplier', stat: {name, bonus, bonusPerLevel: 0.03}})],
        }), 1, 1)[0];

        // The two REDUCTION stats phrase as what the player pays/takes, with
        // the −X% shape the resist lines already use (PO 2026-08-02, item 10:
        // one reduction vocabulary). The four bonus stats keep their +.
        expect(statLine('costReduction', 0.06)).toBe('All costs: −6% → 9%');
        expect(statLine('damageReduction', 0.1)).toBe('Damage taken: −10% → 13%');
        expect(statLine('maxHealth', 0.08)).toBe('Max Focus: +8% → 11%');
        expect(statLine('critChance', 0.02)).toBe('Crit chance: +2% → 5%');
        expect(statLine('damageDealt', 0.04)).toBe('All damage: +4% → 7%');
        expect(statLine('movementSpeed', 0.1)).toBe('Movement speed: +10% → 13%');
    });
});

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
        expect(out).toContain('Calms enemies in range for 10s → 12s');
        expect(out).toContain('Any damage breaks it — including your own aura');
        expect(out.join('\n')).not.toContain('(calm)');
    });

    it('scales the duration with skill level', () => {
        // At max level there is no next-level preview: 300 + 2 × 60 = 420.
        expect(lines(calm, 3, 1)).toContain('Calms enemies in range for 14s');
    });

    it('does not scale the duration with character power', () => {
        // casterPowerScale touches HP values only. A duration that moved with
        // it would be the over-application the round-4 fix warns about.
        expect(lines(calm, 1, SCALE_AT_30)).toContain('Calms enemies in range for 10s → 12s');
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
        expect(out).toContain('Charms the nearest enemy to fight for you for 60s → 70s');
        expect(out).toContain('It keeps its own level, and turns on you when the charm ends');
        expect(out.join('\n')).not.toContain('(charm)');
    });

    it('scales the duration with skill level', () => {
        // At max level there is no next-level preview: 1800 + 2 × 300 = 2400.
        expect(lines(charm, 3, 1)).toContain('Charms the nearest enemy to fight for you for 80s');
    });

    it('does not scale the duration with character power', () => {
        expect(lines(charm, 1, SCALE_AT_30)).toContain('Charms the nearest enemy to fight for you for 60s → 70s');
    });
});

// Swift as a cooldown (PO ruling 2026-07-29). Both halves of the payload scale
// with skill level, which is what separates it from the tick_rate case above.
describe('speed burst', () => {
    const swift = skill({
        displayName: 'Swift', category: 'cooldown', maxLevel: 3, cooldownTicks: 600,
        effects: [effect({
            type: 'speed_burst',
            speed: {factor: 1.5, factorPerLevel: 0.1, durationTicks: 150, durationTicksPerLevel: 30, targetsSelf: true},
        })],
    });

    it('names the pace and the window, both with a next-level preview', () => {
        // 150 ticks at 33 ms = 4.95 s; the next level is 180 → 5.94 s.
        const out = lines(swift, 1, 1);
        expect(out).toContain('Move 1.5× → 1.6× as fast for 5s → 6s');
        expect(out.join('\n')).not.toContain('(speed_burst)');
    });

    it('drops the preview at max level', () => {
        // 1.5 + 2 × 0.1 = 1.7; 150 + 2 × 30 = 210 ticks = 6.93 s.
        expect(lines(swift, 3, 1)).toContain('Move 1.7× as fast for 7s');
    });

    it('does not scale with character power', () => {
        // Movement speed is not a damage number — the power curve must not
        // touch it, or the tooltip would promise a sprint that grows on level-up.
        expect(lines(swift, 1, SCALE_AT_30)).toContain('Move 1.5× → 1.6× as fast for 5s → 6s');
    });
});

// plan-effect-types.md C4. speed_burst learned who it reaches, so the line that
// only ever described a self-sprint would now LIE for an ally-facing cast: the
// caster of Onward does not move faster at all.
describe('speed burst, ally form', () => {
    const onward = skill({
        displayName: 'Onward', category: 'cooldown', maxLevel: 3, cooldownTicks: 900,
        effects: [effect({
            type: 'speed_burst',
            radius: 3, targetsAllies: true,
            speed: {factor: 1.4, factorPerLevel: 0.05, durationTicks: 150, durationTicksPerLevel: 15, targetsSelf: false},
        })],
    });

    it('says the ALLIES move, not the caster', () => {
        // 150 ticks = 5s, the next level 165 = 5.5s (ticksToSecs does not round
        // to whole seconds — Swift's "5s → 6s" is 150 → 180, exact by accident).
        expect(lines(onward, 1, 1)).toContain('Allies in range move 1.4× → 1.45× as fast for 5s → 5.5s');
    });

    it('names both when a burst carries the caster too', () => {
        const both = skill({
            displayName: 'Both', category: 'cooldown', maxLevel: 3, cooldownTicks: 900,
            effects: [effect({
                type: 'speed_burst',
                radius: 3, targetsAllies: true,
                speed: {factor: 1.4, factorPerLevel: 0, durationTicks: 150, durationTicksPerLevel: 0, targetsSelf: true},
            })],
        });
        expect(lines(both, 1, 1)).toContain('You and allies in range move 1.4× as fast for 5s');
    });
});

// plan-effect-types.md C4 / D8: Fly, You Fools!, the field form. Rendered on the
// slow_aura pattern (label, value, refresh cadence) rather than the burst's
// sentence, because an aura has no lifetime of its own to name.
describe('speed aura', () => {
    const flyYouFools = skill({
        displayName: 'Fly, You Fools!', category: 'aura', maxLevel: 5,
        effects: [effect({
            type: 'speed_aura',
            radius: 2.5, tickInterval: 30, targetsAllies: true,
            costFractionOfMax: 0.03, costFractionOfMaxPerLevel: 0.004,
            speed: {factor: 1.3, factorPerLevel: 0.05, durationTicks: 0, durationTicksPerLevel: 0, targetsSelf: false},
        })],
    });

    it('names the pace with a next-level preview and the re-apply cadence', () => {
        const out = lines(flyYouFools, 1, 1);
        expect(out).toContain('Speed: 1.3× → 1.35×, refreshed every 1s');
        expect(out.join('\n')).not.toContain('(speed_aura)');
    });

    it('drops the preview at max level', () => {
        expect(lines(flyYouFools, 5, 1)).toContain('Speed: 1.5×, refreshed every 1s');
    });

    it('does not scale with character power', () => {
        // Movement speed is not a damage number, the Swift rule.
        expect(lines(flyYouFools, 1, SCALE_AT_30)).toContain('Speed: 1.3× → 1.35×, refreshed every 1s');
    });

    it('prices it as work-gated, not on the tick cadence', () => {
        // §5.2 / R2: a haste field pays when it reaches somebody new, not every
        // time it re-applies. The wording is the resist_aura one byte for byte,
        // and COST_TRIGGER_TEXT is pinned exhaustively against the shared
        // fixture, so the two cannot drift apart.
        const cost = formatSkillTooltip(flyYouFools, 1, 1, 100, 1, true, 1)
            .lines.map(line => line.text).join('\n');
        expect(cost).toContain('when it reaches someone new');
        expect(cost).not.toContain('Costs you: 3 Focus every 1s');
    });
});

// Bloodthirst (R3 / §5.6), the rider Reaper dropped. The speed_burst twin with
// one deliberate difference: the WINDOW is fixed, so only the leech previews.
describe('lifesteal burst', () => {
    const bloodthirst = skill({
        displayName: 'Bloodthirst', category: 'cooldown', maxLevel: 5, cooldownTicks: 900,
        effects: [effect({
            type: 'lifesteal_burst',
            lifesteal: {fraction: 0.3, fractionPerLevel: 0.05, durationTicks: 180, durationTicksPerLevel: 0},
        })],
    });

    it('names the leech and the window, and says it rides any aura', () => {
        // 180 ticks at 33 ms = 5.94 s. The window does not scale, so it shows
        // one figure while the leech shows two.
        const out = lines(bloodthirst, 1, 1);
        expect(out).toContain('Heals you for 30% → 35% of the damage you deal, for 6s');
        expect(out).toContain('Works with whichever aura you have on');
        expect(out.join('\n')).not.toContain('(lifesteal_burst)');
    });

    it('drops the preview at max level', () => {
        expect(lines(bloodthirst, 5, 1)).toContain('Heals you for 50% of the damage you deal, for 6s');
    });

    it('does not scale with character power', () => {
        // A share of damage dealt is already relative to the damage — applying
        // the power curve to it would promise a leech that grows twice.
        expect(lines(bloodthirst, 1, SCALE_AT_30)).toContain('Heals you for 30% → 35% of the damage you deal, for 6s');
    });
});

// stun (Paralyze, plan-cc-and-retaliation.md C3). The tooltip has one job the
// mechanic makes non-optional: say that the target cannot ACT, not just that it
// cannot move. "Stuns for 3s" would leave a reader assuming a root — which is
// exactly the effect this replaced in the design.
describe('stun', () => {
    const paralyze = skill({
        displayName: 'Paralyze', category: 'cooldown', maxLevel: 5, cooldownTicks: 900,
        effects: [effect({
            type: 'stun',
            stun: {durationTicks: 90, durationTicksPerLevel: 6},
        })],
    });

    it('says the target cannot act, not merely that it cannot move', () => {
        // 90 ticks at 33 ms = 2.97 s; 96 at rank 2.
        const out = lines(paralyze, 1, 1);
        expect(out).toContain('Holds one enemy for 3s → 3.2s — it cannot move, attack or use abilities');
        expect(out).toContain('Damage does not break it');
        expect(out.join('\n')).not.toContain('(stun)');
    });

    it('drops the preview at max level', () => {
        expect(lines(paralyze, 5, 1)).toContain('Holds one enemy for 3.8s — it cannot move, attack or use abilities');
    });
});

// retaliate_slow (FrostShield, plan-cc-and-retaliation.md C2) — the mirror of
// the lifesteal case, and the tooltip has to say something lifesteal's does
// not: the effect lands on somebody ELSE. A player reading "Slow: 10%" on a
// passive would reasonably assume they are the one being slowed.
describe('retaliate slow', () => {
    const frostShield = skill({
        displayName: 'Frost Shield', category: 'passive', maxLevel: 5,
        effects: [effect({
            type: 'retaliate_slow',
            retaliate: {fraction: 0.1, fractionPerLevel: 0.05, durationTicks: 150, durationTicksPerLevel: 0},
        })],
    });

    it('names the slow, its target and the window', () => {
        // 150 ticks at 33 ms = 4.95 s. The window is authored flat, so it shows
        // one figure while the fraction previews the next rank.
        const out = lines(frostShield, 1, 1);
        expect(out).toContain('Slows anything that damages you by 10% → 15% for 5s');
        expect(out).toContain('Being hit is enough — it fires even when the hit is fully absorbed');
        expect(out.join('\n')).not.toContain('(retaliate_slow)');
    });

    it('drops the preview at max level', () => {
        expect(lines(frostShield, 5, 1)).toContain('Slows anything that damages you by 30% for 5s');
    });

    it('does not scale with character power', () => {
        // A slow fraction is not an amount — the power curve has nothing to
        // multiply here, and applying it would promise a slow that grows twice.
        expect(lines(frostShield, 1, SCALE_AT_30)).toContain('Slows anything that damages you by 10% → 15% for 5s');
    });
});

// retaliate_damage (FireShield, plan-effect-types.md C2) — the retaliate_slow
// twin, and it needs the same wording care for the same reason: the effect
// lands on somebody ELSE. It also has to say the damage type, because that is
// what decides whether the attacker resists the whole thing.
describe('retaliate damage', () => {
    const fireShield = skill({
        displayName: 'Fire Shield', category: 'passive', maxLevel: 5,
        effects: [effect({
            type: 'retaliate_damage',
            retaliateDamage: {hp: 3, hpPerLevel: 1, tags: ['fire']},
        })],
    });

    it('names the reflect, its target and its damage type', () => {
        const out = lines(fireShield, 1, 1);
        expect(out).toContain('Reflects 3 → 4 damage onto anything that damages you');
        expect(out).toContain('Damage type: fire');
        expect(out).toContain('Being hit is enough — it fires even when the hit is fully absorbed');
        expect(out.join('\n')).not.toContain('(retaliate_damage)');
    });

    it('drops the preview at max level', () => {
        expect(lines(fireShield, 5, 1)).toContain('Reflects 7 damage onto anything that damages you');
    });

    // The physical default is the silent case, exactly as on damage_aura: an
    // untagged reflect is physical and saying so would be noise on every
    // ordinary skill.
    it('says nothing about the type when the reflect is plain physical', () => {
        const plain = skill({
            displayName: 'Thorns', category: 'passive', maxLevel: 3,
            effects: [effect({type: 'retaliate_damage', retaliateDamage: {hp: 2, hpPerLevel: 0, tags: ['physical']}})],
        });
        expect(lines(plain, 1, 1)).toEqual(['Reflects 2 damage onto anything that damages you',
            'Being hit is enough — it fires even when the hit is fully absorbed']);
    });

    // ⚑ The reflect is RAW AUTHORED DAMAGE server-side: it leaves through
    // model.Damage without passing the damage base-composition sites, so it
    // rides neither casterPowerScale nor the damage factor. Printing it scaled
    // would promise a number the server never deals.
    it('does not scale with character power', () => {
        expect(lines(fireShield, 1, SCALE_AT_30, 0, 1, 2))
            .toContain('Reflects 3 → 4 damage onto anything that damages you');
    });
});

// retaliate_burst (Retribution, PO 2026-08-17) — the percentage reflect. Its
// tooltip has to carry three things the flat FireShield line does not: a window,
// a share rather than an amount, and the fact that the share is of the hit as
// thrown rather than of the damage that got through.
describe('retaliate burst', () => {
    const retribution = skill({
        displayName: 'Retribution', category: 'cooldown', maxLevel: 5,
        cooldownTicks: 900, cooldownTicksPerLevel: -60,
        effects: [effect({
            type: 'retaliate_burst',
            retaliateBurst: {fraction: 0.2, fractionPerLevel: 0.05, durationTicks: 300, durationTicksPerLevel: 0, tags: ['fire']},
        })],
    });

    it('names the window, the share and the damage type', () => {
        // 300 ticks at 1000/30 ms = 10 s. The window is authored flat, so it shows
        // one figure while the share previews the next rank.
        const out = lines(retribution, 1, 1);
        expect(out).toContain('For 10s, reflects 20% → 25% of damage taken');
        expect(out).toContain('Damage type: fire');
        expect(out).toContain('The share is of the hit as thrown, before your own mitigation');
        expect(out.join('\n')).not.toContain('(retaliate_burst)');
    });

    it('drops the preview at max level', () => {
        expect(lines(retribution, 5, 1)).toContain('For 10s, reflects 40% of damage taken');
    });

    // A share is not an amount: the character power curve has nothing to
    // multiply, and the server never scales it either.
    it('does not scale with character power', () => {
        expect(lines(retribution, 1, SCALE_AT_30, 0, 1, 2))
            .toContain('For 10s, reflects 20% → 25% of damage taken');
    });
});

// The summon line's mob name (§35 C4a). The client used to re-derive the
// display name with its own CamelCase-splitting rule — a copy of the server's
// skills.DeriveDisplayName, and the exact drift class §35 exists to retire.
// Now the /mobs catalog's served displayName is the source of truth, with the
// raw authored name as the degrade path (matching the stubbed-fetch design:
// the game never blocks on the catalog).
describe('spawn mob name', () => {
    const summon = skill({
        displayName: 'Summon Soldier', category: 'cooldown', maxLevel: 1, cooldownTicks: 600,
        effects: [effect({
            type: 'spawn',
            spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0},
        })],
    });

    // Drives the module-level catalog into a known state — the same
    // loadMobCatalog the app calls, against a locally resolving fetch, so the
    // test exercises the real load path rather than a test-only backdoor.
    async function loadCatalog(entries: object[]) {
        const stubbedFetch = globalThis.fetch;
        globalThis.fetch = () => Promise.resolve({ok: true, json: () => Promise.resolve(entries)} as Response);
        try {
            await loadMobCatalog();
        } finally {
            globalThis.fetch = stubbedFetch;
        }
    }

    it('falls back to the raw authored name while the catalog is unavailable', async () => {
        await loadCatalog([]); // pin the empty state; import-time fetch is stubbed to reject
        expect(lines(summon, 1, 1)).toContain('Summons SoldierCompanion for 10s');
    });

    it('renders the served displayName once the catalog is loaded', async () => {
        await loadCatalog([{id: 5, name: 'SoldierCompanion', displayName: 'Soldier Companion', curveLevel: 1, tier: 0, combatTarget: false, conversant: false}]);
        try {
            expect(lines(summon, 1, 1)).toContain('Summons Soldier Companion for 10s');
        } finally {
            await loadCatalog([]); // other tests expect the degraded state
        }
    });
});

// spawn_at_anchor is spawn's remote twin (plan-portal-spells.md D4/D11): the
// same payload, placed at the caster's bound campfire instead of beside them.
// The tooltip's whole job is to say that ONE difference, because everything
// else about the line (the mob name, the TTL, the level preview) is shared.
//
// ⚑ The type is on TICKING_TYPES' opposite side and stays off it: a spawn has
// no cadence to advertise, so there is nothing to add there.
describe('spawn_at_anchor', () => {
    const pullThrough = skill({
        displayName: 'Pull Through', category: 'cooldown', maxLevel: 1, cooldownTicks: 1200,
        castTicks: 75, castInterruptedByDamage: true,
        effects: [effect({
            type: 'spawn_at_anchor', costFractionOfMax: 0.1,
            spawn: {mobName: 'PortalSummon', ttlTicks: 900, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0},
        })],
    });

    it('says where the summon lands', () => {
        expect(lines(pullThrough, 1, 1)).toContain('Summons PortalSummon at your campfire for 30s');
    });

    it('leaves the plain spawn line alone', () => {
        const openPortal = skill({
            displayName: 'Open Portal', category: 'cooldown', maxLevel: 1, cooldownTicks: 1200,
            effects: [effect({
                type: 'spawn', costFractionOfMax: 0.1,
                spawn: {mobName: 'PortalHome', ttlTicks: 900, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0},
            })],
        });
        expect(lines(openPortal, 1, 1)).toContain('Summons PortalHome for 30s');
    });

    // The unknown-type degrade is what a missing case looks like, so pin that
    // the case exists rather than only that the string is right.
    it('is not rendered as an unhandled effect type', () => {
        expect(lines(pullThrough, 1, 1).join('\n')).not.toContain('spawn_at_anchor');
    });
});

// projectile is spawn's THROWN twin (plan-prototype-projectile.md D2/P1): the
// same payload, placed a few units ahead of the caster along their last walking
// direction, with a fuse. The tooltip says the two things the placement adds -
// how far it goes and how long before it goes off - because everything else
// about the line is the shared spawn payload.
describe('projectile', () => {
    const throwMine = skill({
        displayName: 'Throw Mine', category: 'cooldown', maxLevel: 1, cooldownTicks: 300,
        effects: [effect({
            type: 'projectile',
            spawn: {
                mobName: 'ProjectileBomb', ttlTicks: 900, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0,
                forwardUnits: 3, armTicks: 45,
            },
        })],
    });

    it('says how far it is thrown and how long it lasts', () => {
        expect(lines(throwMine, 1, 1)).toContain('Throws ProjectileBomb 3u ahead for 30s');
    });

    it('says how long the fuse is', () => {
        expect(lines(throwMine, 1, 1)).toContain('Arms after 1.5s');
    });

    // The unknown-type degrade is what a missing case looks like, so pin that
    // the case exists rather than only that the string is right.
    it('is not rendered as an unhandled effect type', () => {
        expect(lines(throwMine, 1, 1).join('\n')).not.toContain('projectile');
    });
});

// The faction scope line (plan-faction-flips D8). It renders from the SKILL's
// data in the shared section, never from a per-effect case — so these tests use
// invented faction names and an invented effect type on purpose: if either had
// to be known to the formatter, the mechanism would be hardcoded.
describe('faction scope', () => {
    it('names every faction the skill is scoped to', () => {
        const calm = skill({
            displayName: 'Calm', category: 'cooldown', maxLevel: 3, cooldownTicks: 600,
            targetFactions: ['Prey', 'Predators'],
            effects: [effect({
                type: 'calm', radius: 4, targetsEnemies: true,
                calm: {durationTicks: 300, durationTicksPerLevel: 60},
            })],
        });
        expect(lines(calm, 1, 1)).toContain('Affects: Prey, Predators');
    });

    it('renders nothing for an unscoped skill', () => {
        // Every skill authored before the allowlist existed: the server omits
        // targetFactions entirely, so the line must not appear at all.
        const unscoped = skill({
            displayName: 'Hush', category: 'cooldown', maxLevel: 1, cooldownTicks: 300,
            effects: [effect({type: 'calm', radius: 2, targetsEnemies: true,
                calm: {durationTicks: 60, durationTicksPerLevel: 0}})],
        });
        expect(lines(unscoped, 1, 1).some(l => l.startsWith('Affects:'))).toBe(false);
    });

    it('is data, not code: an unknown skill scoped to unknown factions still renders', () => {
        // The acceptance test, one layer up from the server's L-L pin: a third
        // faction-scoped skill must need no frontend change. Nothing here is
        // known to the formatter — not the skill, not the factions.
        const invented = skill({
            displayName: 'Rebuke', category: 'cooldown', maxLevel: 1, cooldownTicks: 300,
            targetFactions: ['Cultists'],
            effects: [effect({type: 'calm', radius: 2, targetsEnemies: true,
                calm: {durationTicks: 60, durationTicksPerLevel: 0}})],
        });
        expect(lines(invented, 1, 1)).toContain('Affects: Cultists');
    });

    it('collapses two factions that share one display name', () => {
        const both = skill({
            displayName: 'Hunt', category: 'cooldown', maxLevel: 1, cooldownTicks: 300,
            targetFactions: ['Predators', 'Predators'],
            effects: [effect({type: 'calm', radius: 2, targetsEnemies: true,
                calm: {durationTicks: 60, durationTicksPerLevel: 0}})],
        });
        expect(lines(both, 1, 1)).toContain('Affects: Predators');
    });
});

// The cost the tooltip prints must be the one the server will charge (R1/F6,
// superseding the 2026-07-29 "percentage alone" ruling). It is authored as a
// fraction of the max pool, but what is deducted is that fraction of THIS
// player's pool, rounded through vitals.HP and scaled by the cost-reduction
// passive — so the authored percentage was neither of the two corrections the
// player experiences.
//
// Neither is a corner: 12 of the 20 costed aura effects are floored somewhere in
// character levels 1–12, which is exactly where a player reads tooltips hardest,
// and the reduction passive was invisible in the client entirely.
describe('resource cost in absolute Focus', () => {
    // Immolate as authored (api/skills/immolate.json).
    const immolate = skill({
        displayName: 'Immolate', maxLevel: 10,
        effects: [effect({
            type: 'dot_aura', radius: 2, tickInterval: 20,
            costFractionOfMax: 0.0026, costFractionOfMaxPerLevel: 0.00065,
            targetsEnemies: true,
            dot: {hp: 3, hpPerLevel: 1, tags: ['fire'], variance: 0, tickCount: 3, interval: 60},
        })],
    });

    it('prints what a small pool actually pays, floor included', () => {
        // 0.26 % of 100 is 0.26, charged as 1 — the min-1 rule.
        //
        // The missing "→ 2" is prog() collapsing two endpoints that render
        // alike, and it is the truth: level 2 costs 0.325 of the pool, still
        // under a point, so on this pool levelling Immolate does not change what
        // it takes out of you. That is a fact the percentage could not state.
        expect(lines(immolate, 1, 1, 100)).toContain(
            'Costs you: 1 Focus when it sets something alight');
    });

    it('resolves the level curve once the pool outgrows the floor', () => {
        // 0.26 % of 2600 is 6.76 → 7; level 2 is 8.45 → 8.
        expect(lines(immolate, 1, 1, 2600)).toContain(
            'Costs you: 7 → 8 Focus when it sets something alight');
    });

    // F2: the PO reported the cost reduction working but invisible. It is
    // folded into the number, so there is no second line to read — and nothing
    // to reconcile when the floor and the reduction both bind.
    it('folds the cost-reduction passive into the number', () => {
        expect(lines(immolate, 1, 1, 2600, 0.8)).toContain(
            'Costs you: 5 → 7 Focus when it sets something alight');
    });

    it('never prints a free cost for a priced effect', () => {
        // Rounding alone would say 0; vitals.HP says 1, and 1 is what is taken.
        const trivial = skill({
            maxLevel: 1,
            effects: [effect({type: 'slow_aura', tickInterval: 40, costFractionOfMax: 0.0001,
                targetsEnemies: true, slow: {fraction: 0.3, fractionPerLevel: 0}})],
        });
        expect(lines(trivial, 1, 1, 100)).toContain('Costs you: 1 Focus when it catches someone new');
    });

    // The R1/R2 discrepancy this pair exists to keep closed. R2 changed WHEN
    // five of the seven chargeable types are charged; R1's wording predated it
    // and kept printing the effect's tick cadence, so a shield billed per refill
    // advertised itself as "every 1.33s". Damage and heal still pay on every
    // application and must keep the cadence — that half is what makes this a
    // fix rather than a blanket rewording.
    //
    // N2/D5 added the grouping on top: effects charged at the SAME trigger
    // merge into one line, so Warbanner's damage + heal print one beat-charged
    // amount and the shield keeps its own trigger line.
    it('groups cost lines by charge trigger', () => {
        const warbanner = skill({
            displayName: 'Warbanner', maxLevel: 10,
            effects: [
                effect({type: 'damage_aura', radius: 1.2, tickInterval: 40, targetsEnemies: true,
                    costFractionOfMax: 0.0184, damage: damageParams(15)}),
                effect({type: 'heal_aura', radius: 1.2, tickInterval: 40,
                    costFractionOfMax: 0.0106,
                    heal: {hp: 4.3333, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
                effect({type: 'shield_aura', radius: 1.2, tickInterval: 40, targetsAllies: true,
                    costFractionOfMax: 0.0049,
                    shield: {hp: 8, hpPerLevel: 0, durationTicks: 0, targetsSelf: true}}),
            ],
        });

        // 0.0184 × 2600 = 47.84 → 48, 0.0106 × 2600 = 27.56 → 28; one line, 76.
        const costs = lines(warbanner, 1, 1, 2600).filter(l => l.startsWith('Costs you'));
        expect(costs).toEqual([
            'Costs you: 76 Focus every 1.33s',
            'Costs you: 13 Focus when a shield goes up or is refilled',
        ]);
    });

    // The cadence is not lost when the cost line stops claiming it — it still
    // rides the effect's own line. Without this, "fixing" the cost line could
    // quietly remove the only place a player learns how often a shield lands.
    it('keeps the cadence on the effect line it belongs to', () => {
        const shieldOnly = skill({
            maxLevel: 1,
            effects: [effect({type: 'shield_aura', radius: 1.2, tickInterval: 40, targetsAllies: true,
                costFractionOfMax: 0.0049,
                shield: {hp: 8, hpPerLevel: 0, durationTicks: 0, targetsSelf: true}})],
        });
        expect(lines(shieldOnly, 1, 1, 2600)).toContain('Shield: 8 Focus, refreshed every 1.33s');
    });

    it('falls back to the authored percentage when the pool is unknown', () => {
        // No snapshot yet (maxHealth 0). Imprecise beats invented — and the
        // shape changes with it, so the number is never read as points.
        expect(lines(immolate, 1, 1, 0)).toContain(
            'Costs you: 0.26% → 0.33% of max Focus when it sets something alight');
    });

    // ⚑ The conversion happens on the SUM for a cooldown, not per effect:
    // cooldownCostHP totals the raw fractions and rounds once, because a
    // cooldown pays all its effects in a single deduction. Rounding per effect
    // would print 3 here — three times the truth, and the same class of
    // overstatement the per-cast line exists to avoid.
    it('rounds a cooldown cost once, on the sum', () => {
        const squad = skill({
            category: 'cooldown', maxLevel: 1, cooldownTicks: 2400,
            effects: [
                effect({type: 'spawn', costFractionOfMax: 0.002, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.002, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.002, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
            ],
        });

        expect(lines(squad, 1, 1, 100).filter(l => l.startsWith('Costs you'))).toEqual([
            'Costs you: 1 Focus per cast',
        ]);
    });

    it('marks the cost line in the Focus color, and only the cost line', () => {
        // F7's other half: the line that talks about the player's pool points at
        // the bar it drains, rather than wearing the effect's own category color.
        const content = formatSkillTooltip(immolate, 1, 1, 100);
        const cost = content.lines.filter(l => l.text.startsWith('Costs you'));
        expect(cost).toHaveLength(1);
        expect(cost[0].labelColor).toBe('crimson');
        expect(content.lines.filter(l => l.labelColor === 'crimson')).toEqual(cost);
    });
});

// N2 (plan-feel-pass-2.md §5, D5): one cadence line, cost lines grouped by
// charge trigger. Warbanner printed "every 1.33s" five times and four separate
// Focus costs; a tooltip should say the beat once and price each trigger once.
describe('N2: grouped costs and the shared cadence', () => {
    // Warbanner as authored post-R3 (api/skills/warbanner.json): four effects
    // on one 40-tick beat, slow free, the other three costed.
    const warbanner = skill({
        displayName: 'Warbanner', maxLevel: 10,
        effects: [
            effect({type: 'damage_aura', radius: 1.2, tickInterval: 40, targetsEnemies: true,
                selector: 'nearest', maxTargets: 2,
                costFractionOfMax: 0.0184, damage: damageParams(15)}),
            effect({type: 'heal_aura', radius: 1.2, tickInterval: 40,
                selector: 'lowest_health', maxTargets: 1,
                costFractionOfMax: 0.003533,
                heal: {hp: 4.3333, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
            effect({type: 'shield_aura', radius: 1.2, tickInterval: 40, targetsAllies: true,
                costFractionOfMax: 0.006533,
                shield: {hp: 8, hpPerLevel: 0, durationTicks: 0, targetsSelf: true}}),
            effect({type: 'slow_aura', radius: 1.2, tickInterval: 40, targetsEnemies: true,
                slow: {fraction: 0.1, fractionPerLevel: 0.0133}}),
        ],
    });

    // ⚑ The plan's worked example, and the trap it names: the server bills each
    // effect separately through vitals.HP's 1-point floor, so on a level-1 pool
    // Warbanner's damage (1.84 → 2) and heal (0.35 → 1) really cost 3 — while
    // rounding the summed fraction (2.19 → 2) would print 2. This is the
    // INVERSE of the cooldown path, which deducts once and rounds once; the
    // two must not be unified.
    it('sums the rounded per-effect amounts, never the rounded sum', () => {
        expect(lines(warbanner, 1, 1, 100)).toContain('Costs you: 3 Focus every 1.33s');
    });

    it('collapses a shared beat to one cadence line', () => {
        const rendered = lines(warbanner, 1, 1, 100);
        // The beat prints once at the bottom...
        expect(rendered).toContain('Ticks every 1.33s');
        // ...and comes OFF the effect lines: the only other line allowed to
        // carry it is the beat-charged cost line, where it is the charge
        // trigger tied to the amount.
        const carrying = rendered.filter(l => l.includes('every 1.33s'));
        expect(carrying).toEqual(['Ticks every 1.33s', 'Costs you: 3 Focus every 1.33s']);
        expect(rendered).toContain('Slow: 10% → 11.33%');
        expect(rendered).toContain('Shield: 8 Focus');
    });

    it('keeps the cadence inline when effects tick on different beats', () => {
        const mixed = skill({
            maxLevel: 1,
            effects: [
                effect({type: 'damage_aura', tickInterval: 40, targetsEnemies: true, damage: damageParams(10)}),
                effect({type: 'dot_aura', tickInterval: 20, targetsEnemies: true,
                    dot: {hp: 3, hpPerLevel: 0, tags: ['fire'], variance: 0, tickCount: 3, interval: 60}}),
            ],
        });
        const rendered = lines(mixed, 1, 1);
        expect(rendered).toContain('Damage: 10 every 1.33s');
        expect(rendered.some(l => l.startsWith('Ticks every'))).toBe(false);
    });

    it('previews a grouped cost across the level curve', () => {
        // Both beat-charged fractions scale; the preview sums the rounded
        // amounts at each endpoint. 2600-pool: L1 48 + 9 = 57, L2 53 + 11 = 64.
        const scaling = skill({
            maxLevel: 10,
            effects: [
                effect({type: 'damage_aura', tickInterval: 40, targetsEnemies: true,
                    costFractionOfMax: 0.0184, costFractionOfMaxPerLevel: 0.001856,
                    damage: damageParams(15)}),
                effect({type: 'heal_aura', tickInterval: 40,
                    costFractionOfMax: 0.003533, costFractionOfMaxPerLevel: 0.000789,
                    heal: {hp: 4.3333, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
            ],
        });
        expect(lines(scaling, 1, 1, 2600)).toContain('Costs you: 57 → 64 Focus every 1.33s');
    });

    it('sums the percentage fallback when the pool is unknown', () => {
        expect(lines(warbanner, 1, 1, 0)).toContain('Costs you: 2.19% of max Focus every 1.33s');
    });
});

// F10: "Also heals you" was emitted whenever the effect targets its caster,
// which is wrong for the case that has no other target at all — Recover heals
// you and nobody else. The word promises a second effect that does not exist.
describe('self-targeting lines', () => {
    function selfHot(targetsAllies: boolean) {
        return skill({
            maxLevel: 1,
            effects: [effect({
                type: 'instant_hot', radius: 2, targetsAllies,
                hot: {hp: 2, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0, tickCount: 3, interval: 60, targetsSelf: true},
            })],
        });
    }

    it('says "Heals you" when the caster is the only target', () => {
        expect(lines(selfHot(false), 1, 1)).toContain('Heals you');
    });

    it('says "Also heals you" alongside ally targeting', () => {
        expect(lines(selfHot(true), 1, 1)).toContain('Also heals you');
    });

    // Same shape, same helper: no live content trips these today, which is
    // exactly why they are worth pinning — the wrong word would ship unseen.
    it('applies the same rule to shields and resists', () => {
        const ward = skill({
            maxLevel: 1,
            effects: [
                effect({type: 'shield_aura', tickInterval: 90,
                    shield: {hp: 10, hpPerLevel: 0, durationTicks: 120, targetsSelf: true}}),
                effect({type: 'resist_aura', tickInterval: 90,
                    resist: {tags: ['fire'], factor: 0.8, factorPerLevel: 0, targetsSelf: true, durationTicks: 0, buffLifetimeMatchesInterval: false}}),
            ],
        });
        expect(lines(ward, 1, 1)).toContain('Shields you');
        expect(lines(ward, 1, 1)).toContain('Applies to you');
    });
});

// The next-level preview answers ONE question — "what do I get for the point
// I am about to spend?" — so it only belongs on screen while there is a point
// to spend. With no point available it is noise at best, and at worst reads as
// a promise about numbers the player cannot reach yet. Every "→" in the
// tooltip funnels through prog(), so the whole feature is one preview cap.
describe('next-level preview gating', () => {
    const scaling = skill({
        maxLevel: 5,
        cooldownTicks: 300, cooldownTicksPerLevel: -30,
        castTicks: 60, castTicksPerLevel: -6,
        effects: [effect({
            type: 'damage_aura', radius: 3, radiusPerLevel: 0.5,
            tickInterval: 20, tickIntervalPerLevel: -2,
            costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.01,
            selector: 'nearest', maxTargets: 1, maxTargetsPerLevel: 1,
            targetsEnemies: true,
            damage: damageParams(6, 2),
        })],
    });

    function gated(showNext: boolean): string[] {
        return formatSkillTooltip(scaling, 2, 1, 100, 1, showNext).lines.map(l => l.text);
    }

    it('previews every scaling line while a point can be spent', () => {
        expect(gated(true)).toEqual([
            'Damage: 8 → 10 every 0.6s → 0.53s',
            'Radius: 3.5 → 4',
            'Targets: nearest 2 → 3 enemies',
            'Costs you: 3 → 4 Focus every 0.6s → 0.53s',
            'Cooldown: 9s → 8s',
            'Cast time: 1.8s → 1.6s',
        ]);
    });

    it('shows the current values alone when no point can be spent', () => {
        expect(gated(false)).toEqual([
            'Damage: 8 every 0.6s',
            'Radius: 3.5',
            'Targets: nearest 2 enemies',
            'Costs you: 3 Focus every 0.6s',
            'Cooldown: 9s',
            'Cast time: 1.8s',
        ]);
    });

    it('keeps the subtitle showing the real cap either way', () => {
        // previewMax is a rendering cap, not the skill's max level — the
        // player must still see how far the skill can go.
        for (const showNext of [true, false]) {
            expect(formatSkillTooltip(scaling, 2, 1, 100, 1, showNext).subtitle)
                .toBe('Aura · Lv 2/5');
        }
    });

    it('gates a cooldown skill\'s summed per-cast cost too', () => {
        const squad = skill({
            category: 'cooldown', maxLevel: 5, cooldownTicks: 600,
            effects: [
                effect({type: 'spawn', costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.01,
                    spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.01,
                    spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
            ],
        });
        const cost = (showNext: boolean) => formatSkillTooltip(squad, 2, 1, 100, 1, showNext)
            .lines.map(l => l.text).filter(t => t.startsWith('Costs you'));
        expect(cost(true)).toEqual(['Costs you: 6 → 8 Focus per cast']);
        expect(cost(false)).toEqual(['Costs you: 6 Focus per cast']);
    });
});

// Round-7 item 3 (third raise): "Summons Totem for 10s" said WHO comes and
// never WHAT it does. The spawn payload now carries the summon's loadout as
// catalog references (skills.SpawnParams.SummonLoadout, attached at boot when
// the mob registry resolves), and the tooltip renders each loadout skill's
// effects beneath the Summons line — through the SAME per-effect renderer
// every ability uses, so a retune of the totem's aura re-renders here for
// free. The resolver is injected so the formatter stays pure; the app passes
// the live catalog lookup.
describe('summon loadout', () => {
    const totemAura = skill({
        id: 61, name: 'TotemAura', displayName: 'Totem Aura', maxLevel: 5,
        effects: [effect({
            type: 'damage_aura', radius: 3, tickInterval: 30, targetsEnemies: true,
            selector: 'nearest', maxTargets: 1,
            damage: damageParams(4, 2),
        })],
    });
    const resolve = (id: number) => (id === 61 ? totemAura : undefined);

    const summon = skill({
        displayName: 'Summon Totem', category: 'cooldown', maxLevel: 5, cooldownTicks: 450,
        effects: [effect({
            type: 'spawn',
            spawn: {
                mobName: 'Totem', ttlTicks: 300, ttlTicksPerLevel: 30, powerPerOwnerLevel: 0.05,
                summonLoadout: [{skillId: 61, level: 1}],
            },
        })],
    });

    function tooltipLines(def: SkillDefinition, skillLevel: number, powerScale: number,
                          playerLevel: number): string[] {
        return formatSkillTooltip(def, skillLevel, powerScale, 0, 1, true, 1, playerLevel, resolve)
            .lines.map(line => line.text);
    }

    it('renders the summon\'s effects beneath the Summons line, at the raised loadout level', () => {
        // The spawn site raises the loadout to the summon skill's level
        // (RaiseLoadoutLevels): authored 1, skill 3 → the aura renders at 3.
        expect(tooltipLines(summon, 3, 1, 1)).toEqual(expect.arrayContaining([
            '↳ Damage: 8 every 1s',
            '↳ Radius: 3',
            '↳ Targets: nearest 1 enemies',
        ]));
    });

    it('suppresses next-level previews inside the loadout block', () => {
        // A "→" inside the block would claim the totem's aura levels when the
        // player spends a point — it does, but only through the summon skill,
        // whose own TTL line keeps its preview.
        const rendered = tooltipLines(summon, 3, 1, 1);
        for (const line of rendered.filter(l => l.startsWith('↳'))) {
            expect(line).not.toContain('→');
        }
        expect(rendered).toContain('Summons Totem for 12s → 13s');
    });

    it('composes f(character level) and the summon power into the numbers', () => {
        // The server's composition (casterPowerScale): a summon's HP output is
        // f(owner level) × (1 + powerPerOwnerLevel × (L − 1)).
        const expected = roundHP(4 * SCALE_AT_30 * (1 + 0.05 * 29));
        expect(tooltipLines(summon, 1, SCALE_AT_30, 30))
            .toContain(`↳ Damage: ${expected} every 1s`);
    });

    it('degrades to the bare Summons line when the loadout skill is not in the catalog', () => {
        const unresolved = formatSkillTooltip(summon, 1, 1, 0, 1, true, 1, 1, () => undefined)
            .lines.map(l => l.text);
        expect(unresolved.filter(l => l.startsWith('↳'))).toEqual([]);
        expect(unresolved).toContain('Summons Totem for 10s → 11s');
    });
});

// Call for Aid authors three identical spawn effects — one per soldier — and
// rendered "Summons Soldier Companion …" three times: technically true, not
// pretty (PO 2026-07-30). Identical spawn effects collapse into one counted
// line; the cost machinery keeps reading def.effects, so the per-cast sum
// still counts every summon.
describe('identical spawn dedupe', () => {
    const squadSpawn = () => effect({
        type: 'spawn', costFractionOfMax: 0.02, costFractionOfMaxPerLevel: 0.003,
        spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0},
    });

    it('collapses identical spawn effects into one counted line', () => {
        const squad = skill({
            category: 'cooldown', maxLevel: 5, cooldownTicks: 2400,
            effects: [squadSpawn(), squadSpawn(), squadSpawn()],
        });
        const rendered = lines(squad, 1, 1);
        expect(rendered.filter(l => l.startsWith('Summons'))).toEqual([
            'Summons 3× SoldierCompanion for 10s',
        ]);
        expect(rendered.filter(l => l.startsWith('Costs you'))).toEqual([
            'Costs you: 6% → 6.9% of max Focus per cast',
        ]);
    });

    it('keeps distinct spawns separate', () => {
        const mixed = skill({
            category: 'cooldown', maxLevel: 1, cooldownTicks: 600,
            effects: [
                effect({type: 'spawn', spawn: {mobName: 'Totem', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', spawn: {mobName: 'FireTotem', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
            ],
        });
        expect(lines(mixed, 1, 1).filter(l => l.startsWith('Summons'))).toEqual([
            'Summons Totem for 10s',
            'Summons FireTotem for 10s',
        ]);
    });
});

// The tick length (plan-code-health.md C2 item 1). The server ticks every
// 1000/30 = 33.333 ms; the tooltip's private TICK_MS = 33 made every duration
// read ~1% short (300 authored ticks rendered "10s" for a cast the server
// runs for 10 s). Values below are hand-computed from the true tick length,
// NOT copied from the code's output; that is the red-first guard. Authored
// tick counts are multiples of 30, so most durations come out round; 40 shows
// the non-round case still lands on the exact 2-decimal value.
describe('tick length', () => {
    it('renders a 300-tick cooldown as the 10s the server runs it for', () => {
        const one = skill({
            category: 'cooldown', maxLevel: 1, cooldownTicks: 300,
            effects: [effect({type: 'self_heal', selfHeal: {healHp: 1, healHpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}})],
        });
        expect(lines(one, 1, 1)).toContain('Cooldown: 10s');
    });

    it('renders a 90-tick shield duration as 3s', () => {
        const shielded = skill({
            maxLevel: 1,
            effects: [effect({type: 'instant_shield', shield: {hp: 6, hpPerLevel: 0, durationTicks: 90, targetsSelf: false}})],
        });
        expect(lines(shielded, 1, 1)).toContain('Shield: 6 Focus for 3s');
    });

    it('renders a non-multiple-of-30 count exactly: 40 ticks = 1.33s', () => {
        const quick = skill({
            category: 'cooldown', maxLevel: 1, cooldownTicks: 40,
            effects: [effect({type: 'self_heal', selfHeal: {healHp: 1, healHpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}})],
        });
        expect(lines(quick, 1, 1)).toContain('Cooldown: 1.33s');
    });
});

describe('vulnerability rendering (plan-effect-types C1)', () => {
    // FireVulnerability as authored (api/skills/fire-vulnerability.json): a
    // resist_aura with factor > 1 aimed at enemies. The reduction formatter
    // predates vulnerabilities and rendered it "Resist fire: −-20%".
    const fireVulnerability = skill({
        displayName: 'Fire Vulnerability', maxLevel: 5,
        effects: [effect({
            type: 'resist_aura',
            radius: 1.5, tickInterval: 30, targetsEnemies: true,
            resist: {tags: ['fire'], factor: 1.2, factorPerLevel: 0.05, targetsSelf: false, durationTicks: 0, buffLifetimeMatchesInterval: false},
        })],
    });

    it('reads as a vulnerability, not a double-negative resist', () => {
        expect(lines(fireVulnerability, 1, 1)).toEqual([
            'Vulnerable to fire: +20% → 25% damage taken, refreshed every 1s',
            'Radius: 1.5',
            'Targets: all enemies in range',
        ]);
    });

    it('keeps the ward rendering byte-identical', () => {
        // FireWard as authored: 0.6 with −0.05 per level. The shipped shape
        // puts the − on the first value only; byte-identical means keeping
        // that, not beautifying it.
        const fireWard = skill({
            displayName: 'FireWard', maxLevel: 5,
            effects: [effect({
                type: 'resist_aura',
                radius: 1.5, tickInterval: 30, targetsAllies: true,
                resist: {tags: ['fire'], factor: 0.6, factorPerLevel: -0.05, targetsSelf: true, durationTicks: 0, buffLifetimeMatchesInterval: false},
            })],
        });
        expect(lines(fireWard, 1, 1)).toContain('Resist fire: −40% → 45% damage taken, refreshed every 1s');
    });
});

describe('invulnerability rendering (plan-effect-types C3)', () => {
    // Aegis as authored (api/skills/aegis.json): the wildcard resist tag at
    // factor 0. Rendered through the ordinary reduction formatter it would read
    // "Resist *: −100% damage taken". The tag list is a reserved symbol, not a
    // damage type, and −100% is not how a player thinks about being immune.
    const aegis = skill({
        displayName: 'Aegis', maxLevel: 3,
        effects: [effect({
            type: 'resist_aura',
            radius: 1.5, tickInterval: 90, targetsAllies: true,
            maxTargets: 1, maxTargetsPerLevel: 1, selector: 'nearest',
            resist: {tags: ['*'], factor: 0, factorPerLevel: 0, targetsSelf: false, durationTicks: 0, buffLifetimeMatchesInterval: false},
        })],
    });

    it('reads as immunity, not as a −100% resist of a tag called *', () => {
        expect(lines(aegis, 1, 1)).toEqual([
            'Immune to all damage, refreshed every 3s',
            'Radius: 1.5',
            'Targets: nearest 1 → 2 allies',
        ]);
    });

    it('renders a partial wildcard ward as all damage, not as a tag', () => {
        // The type is generic: a wildcard above 0 is an ordinary ward against
        // everything, and it must not print the reserved symbol either.
        const blanket = skill({
            displayName: 'Blanket', maxLevel: 3,
            effects: [effect({
                type: 'resist_aura',
                radius: 1.5, tickInterval: 30, targetsAllies: true,
                resist: {tags: ['*'], factor: 0.5, factorPerLevel: -0.1, targetsSelf: false, durationTicks: 0, buffLifetimeMatchesInterval: false},
            })],
        });
        expect(lines(blanket, 1, 1)).toContain('Resist all damage: −50% → 60% damage taken, refreshed every 1s');
    });

    it('renders the instant_resist cooldown with its duration', () => {
        // Sanctuary as authored (api/skills/sanctuary.json), the instant_shield
        // shape: the grant plus how long it lasts.
        const sanctuary = skill({
            displayName: 'Sanctuary', category: 'cooldown', maxLevel: 3,
            cooldownTicks: 900,
            effects: [effect({
                type: 'instant_resist',
                radius: 1.5, targetsAllies: true,
                maxTargets: 1, maxTargetsPerLevel: 1, selector: 'nearest',
                resist: {tags: ['*'], factor: 0, factorPerLevel: 0, targetsSelf: false, durationTicks: 150, buffLifetimeMatchesInterval: false},
            })],
        });
        expect(lines(sanctuary, 1, 1)).toEqual([
            'Immune to all damage for 5s',
            'Radius: 1.5',
            'Targets: nearest 1 → 2 allies',
            'Cooldown: 30s',
        ]);
    });
});

describe('the D7 cost trigger (plan-effect-types C3, PO follow-up)', () => {
    // The cost-trigger wording is per effect TYPE, and for resist_aura it says
    // "when it reaches someone new": true of every ward, and false of the one
    // authoring shape that drops its buff lifetime to the cadence. Aegis is
    // charged once per cycle for as long as it protects anybody, so the shipped
    // line promised a price the server does not charge.
    //
    // ⚑ Detected from the SERVED payload, never from a skill id: the flag rides
    // the catalog for free, so any future D7 skill gets the right line with no
    // second edit.
    const resistEffect = (extra: object) => effect({
        type: 'resist_aura',
        radius: 1.5, tickInterval: 90, targetsAllies: true,
        costFractionOfMax: 0.08, costFractionOfMaxPerLevel: 0,
        resist: {tags: ['*'], factor: 0, factorPerLevel: 0, targetsSelf: false, durationTicks: 0, buffLifetimeMatchesInterval: false, ...extra},
    });

    it('says the D7 economy when the aura re-buys its buff every cycle', () => {
        const aegis = skill({displayName: 'Aegis', maxLevel: 3, effects: [resistEffect({buffLifetimeMatchesInterval: true})]});
        expect(lines(aegis, 1, 1, 100)).toContain('Costs you: 8 Focus every time it re-applies');
    });

    it('leaves an ordinary ward on the reach-someone-new line', () => {
        const ward = skill({displayName: 'Ward', maxLevel: 3, effects: [resistEffect({buffLifetimeMatchesInterval: false})]});
        expect(lines(ward, 1, 1, 100)).toContain('Costs you: 8 Focus when it reaches someone new');
    });
});
