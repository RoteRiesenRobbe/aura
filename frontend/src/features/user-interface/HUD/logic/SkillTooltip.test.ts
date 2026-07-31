import {describe, expect, it} from 'vitest';

import {SkillDefinition, SkillEffect} from '../../../../client-data/Skills';
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
               maxHealth: number = 0): string[] {
    return formatSkillTooltip(def, skillLevel, powerScale, maxHealth).lines.map(line => line.text);
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
                effect({type: 'heal_aura', costFractionOfMax: 0.012, heal: {hp: 4, hpPerLevel: 0, fractionOfMax: 0, fractionOfMaxPerLevel: 0, variance: 0}}),
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
            'Costs you: 1.2% of max HP per tick',
            'Heal self: 8 HP',
            'Targets: all allies in range',
        ]);
        expect(lines(all, 1, SCALE_AT_30)).toEqual([
            'Damage: 267',
            'Damage over time: 321 × 3 hits over 2.97s',
            'Shield: 169 HP for 2.97s',
            'Heal: 107 per tick',
            'Costs you: 1.2% of max HP per tick',
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
                effect({type: 'heal_aura', heal: {hp: 0, hpPerLevel: 0, fractionOfMax: 0.05, fractionOfMaxPerLevel: 0, variance: 0}}),
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
            'Costs you: 6% → 6.9% of max HP per cast',
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
        expect(at1).toContain('Heal over time: 3% of max HP × 9 over 17.82s');
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

function damageParams(hp: number) {
    return {
        hp, hpPerLevel: 0, tags: ['physical'], gateKey: '', variance: 0,
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

// Swift as a cooldown (PO ruling 2026-07-29). Both halves of the payload scale
// with skill level, which is what separates it from the tick_rate case above.
describe('speed burst', () => {
    const swift = skill({
        displayName: 'Swift', category: 'cooldown', maxLevel: 3, cooldownTicks: 600,
        effects: [effect({
            type: 'speed_burst',
            speed: {factor: 1.5, factorPerLevel: 0.1, durationTicks: 150, durationTicksPerLevel: 30},
        })],
    });

    it('names the pace and the window, both with a next-level preview', () => {
        // 150 ticks at 33 ms = 4.95 s; the next level is 180 → 5.94 s.
        const out = lines(swift, 1, 1);
        expect(out).toContain('Move 1.5× → 1.6× as fast for 4.95s → 5.94s');
        expect(out.join('\n')).not.toContain('(speed_burst)');
    });

    it('drops the preview at max level', () => {
        // 1.5 + 2 × 0.1 = 1.7; 150 + 2 × 30 = 210 ticks = 6.93 s.
        expect(lines(swift, 3, 1)).toContain('Move 1.7× as fast for 6.93s');
    });

    it('does not scale with character power', () => {
        // Movement speed is not a damage number — the power curve must not
        // touch it, or the tooltip would promise a sprint that grows on level-up.
        expect(lines(swift, 1, SCALE_AT_30)).toContain('Move 1.5× → 1.6× as fast for 4.95s → 5.94s');
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
        expect(lines(summon, 1, 1)).toContain('Summons SoldierCompanion for 9.9s');
    });

    it('renders the served displayName once the catalog is loaded', async () => {
        await loadCatalog([{id: 5, name: 'SoldierCompanion', displayName: 'Soldier Companion', curveLevel: 1, tier: 0, combatTarget: false}]);
        try {
            expect(lines(summon, 1, 1)).toContain('Summons Soldier Companion for 9.9s');
        } finally {
            await loadCatalog([]); // other tests expect the degraded state
        }
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

// The resource cost the tooltip prints must be the one the server will charge.
// It prices a cost as a fraction of max HP but deducts it through vitals.HP,
// which floors any positive amount at 1 HP — so while the pool is smaller than
// 1/fraction the real charge is a flat 1 HP and the authored fraction
// understates it. Immolate authors 0.26 % and takes 1 % of a 100 HP pool.
//
// This is not a corner: 12 of the 20 costed aura effects are floored somewhere
// in character levels 1–12, which is exactly where a player reads tooltips.
describe('resource cost and the 1-HP floor', () => {
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

    it('raises the printed cost to what a small pool actually pays', () => {
        // 0.26 % of 100 HP is 0.26 HP, charged as 1 HP — 1 % of the pool.
        //
        // The missing "→ 1%" is prog() collapsing two endpoints that render
        // alike, and it is the truth: level 2 costs 0.325 % of the pool, which
        // is still under 1 HP, so on this pool levelling Immolate does not
        // change what it takes out of you.
        expect(lines(immolate, 1, 1, 100)).toContain(
            'Costs you: 1% of max HP every 0.66s');
    });

    it('prints the authored fraction once the pool outgrows the floor', () => {
        // 0.26 % of 2600 HP is 6.8 HP: above the floor, so nothing is corrected
        // and the authored number is what shows.
        expect(lines(immolate, 1, 1, 2600)).toContain(
            'Costs you: 0.26% → 0.33% of max HP every 0.66s');
    });

    it('leaves the authored fraction alone when the pool is unknown', () => {
        // No snapshot yet (maxHealth 0). Imprecise beats invented: this is the
        // pre-fix rendering, unchanged.
        expect(lines(immolate, 1, 1, 0)).toContain(
            'Costs you: 0.26% → 0.33% of max HP every 0.66s');
    });

    // ⚑ The floor applies to the SUM for a cooldown, not to each effect:
    // cooldownCostHP totals the raw fractions and converts once, because a
    // cooldown pays all its effects in a single deduction. Flooring per effect
    // would print 3 % here — three times the truth, and the same class of
    // overstatement the per-cast line exists to avoid.
    it('floors a cooldown cost once, on the sum', () => {
        const squad = skill({
            category: 'cooldown', maxLevel: 1, cooldownTicks: 2400,
            effects: [
                effect({type: 'spawn', costFractionOfMax: 0.002, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.002, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
                effect({type: 'spawn', costFractionOfMax: 0.002, spawn: {mobName: 'SoldierCompanion', ttlTicks: 300, ttlTicksPerLevel: 0, powerPerOwnerLevel: 0}}),
            ],
        });

        expect(lines(squad, 1, 1, 100).filter(l => l.startsWith('Costs you'))).toEqual([
            'Costs you: 1% of max HP per cast',
        ]);
    });
});
