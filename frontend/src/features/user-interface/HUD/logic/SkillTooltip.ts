// Ability hover tooltips (plan-ui-polish chunk 1): stats-only condensed
// info, auto-generated from the skill catalog so it stays correct through
// every balance retune. PO rulings 2026-07-21: FULL detail — every authored
// mechanic gets a line, unauthored fields show nothing — and the tooltip is
// anchored to the hovered element (not cursor-following).
//
// Values scale along BOTH of the game's axes (round-4 tooltip fix):
//   · the SKILL level, rendered with a next-level preview ("14.7 → 16.8")
//     while the next level is below the cap AND affordable right now, so the
//     preview only appears when it answers a decision the player can act on;
//   · the CHARACTER level, via the caller-supplied power scale — the same
//     f(L) the server multiplies HP-valued output by (casterPowerScale).
// Modelling only the first is what made Rejuvenation read "4" on a level-30
// character it was actually healing for ~107. PO ruling 2026-07-25: show the
// absolute number the player will actually see.

import {
    DamageParams,
    SkillDefinition,
    SkillEffect,
    getLocalPlayerCostFactor,
    getLocalPlayerDamageFactor,
    getLocalPlayerMaxHealth,
    powerScaleAt,
    roundHP,
    skillDefinition,
    skillPointCost,
} from '../../../../client-data/Skills';
import {getLocalPlayerLevel, mobDisplayName} from '../../../../client-data/Mobs';
import {AURA_CATEGORY_COLORS} from '../../../game-objects/logic/AuraRings';
import {BasicConfig} from '../../../../client-data/BasicConfig';
import {cssHex, FOCUS_COLOR_CSS} from '../../../../client-data/Theme';

// One server tick in ms, derived from the pinned tick rate (1000/30 = 33.333;
// shared-constants.json ticksPerSecond). The private `33` this replaces made
// every duration in the tooltip read ~1% short (plan-code-health.md C2).
const TICK_MS = BasicConfig.SERVER_TICKRATE;

// --- pure formatting (unit-testable, no DOM) ---

// labelColor (CSS color) tints the line's leading "Label:" part — the PO pick
// 2026-07-21: effect main lines carry their aura-ring/pip category color so
// the tooltip vocabulary matches the in-world rings.
export interface TooltipLine {
    text: string;
    labelColor?: string;
}

export interface TooltipContent {
    title: string;
    subtitle: string;
    lines: TooltipLine[];
}

// Effect type → the shared ring/pip color table (AuraRings.ts). Types without
// an entry (spawn, taunt, recall, dash, …) stay in the neutral text color.
const EFFECT_COLOR_KEYS: { [type: string]: keyof typeof AURA_CATEGORY_COLORS } = {
    damage_aura: 'damage', instant_damage: 'damage',
    dot_aura: 'dot', instant_dot: 'dot',
    heal_aura: 'heal', self_heal: 'heal', hot_aura: 'heal', instant_hot: 'heal',
    shield_aura: 'shield', instant_shield: 'shield',
    slow_aura: 'slow', retaliate_slow: 'slow', stun: 'slow',
    // Coloured as damage, not as a passive's absence of colour: this table
    // tints the line by WHAT THE EFFECT DOES, so the tooltip vocabulary matches
    // the in-world rings and pips. (The server's aura_category map answers a
    // different question — what ring to draw — and a reflect draws none.)
    retaliate_damage: 'damage', retaliate_burst: 'damage',
    resist_aura: 'resist', resist_passive: 'resist', instant_resist: 'resist',
    light_aura: 'light',
    // Both speed forms, on the same green as the haste RING and the hastened
    // ally's PIP (C4). ⚑ speed_burst is coloured here for the first time: it had
    // no key while no `speed` colour existed, and leaving it out now would have
    // rendered the aura green and its own cooldown twin in neutral text.
    speed_aura: 'speed', speed_burst: 'speed',
};

// The Focus color (F7): the health bar's own fill (vitalSigns.less
// @focus-color), so a cost line points at the bar it drains. The resource has a
// name AND a color code now — that was the whole ask; a tooltip saying "Costs
// you" in neutral text made spending look like just another stat. Since C6 the
// keyword lives in Theme.ts, pinned against the LESS side.

function effectColor(type: string): string | undefined {
    const key = EFFECT_COLOR_KEYS[type];
    if (key === undefined) {
        return undefined;
    }
    return cssHex(AURA_CATEGORY_COLORS[key]);
}

function scaled(base: number, perLevel: number, level: number): number {
    return base + perLevel * (level - 1);
}

// Trims float noise: up to 2 decimals, no trailing zeros.
function fmt(n: number): string {
    return String(parseFloat(n.toFixed(2)));
}

// hpFmt renders an absolute Focus amount the way the server deals it —
// roundHP, the client's mirror of vitals.HP. Without it a scaled heal would
// read "106.99" for a 107-point tick: precise, and still not what lands.
function hpFmt(n: number): string {
    return String(roundHP(n));
}

function pct(fraction: number): string {
    return fmt(fraction * 100) + '%';
}

function ticksToSecs(ticks: number): string {
    return fmt(ticks * TICK_MS / 1000) + 's';
}

// prog renders a level-scaled value as "current → next" while a next level
// exists and actually changes it, else just the current value.
//
// ⚑ `maxLevel` here is the PREVIEW cap, not necessarily the skill's max level:
// formatSkillTooltip passes the current level when no point can be spent, which
// suppresses every "→" in the tooltip at once. See its previewMax.
//
// `scale` is the character-level power scale and defaults to neutral, so the
// decision "does this line ride f(character level)?" stays visible at every
// call site rather than hidden in here — casterPowerScale multiplies HP-side
// output ONLY, and this is the client-side mirror of that boundary.
function prog(base: number, perLevel: number, level: number, maxLevel: number,
              render: (n: number) => string = fmt, scale: number = 1): string {
    const current = render(scaled(base, perLevel, level) * scale);
    if (perLevel !== 0 && level < maxLevel) {
        const next = render(scaled(base, perLevel, level + 1) * scale);
        if (next !== current) {
            return `${current} → ${next}`;
        }
    }
    return current;
}

const CATEGORY_LABELS: { [category: string]: string } = {
    aura: 'Aura',
    passive: 'Passive',
    cooldown: 'Cooldown',
};

// One entry per stat the server dispatches in recomputeDerived — a stat
// missing here renders its raw JSON key on screen (how Discipline shipped
// reading "costReduction: +6%", round-7 item 10).
const STAT_LABELS: { [stat: string]: string } = {
    movementSpeed: 'Movement speed',
    maxHealth: 'Max Focus',
    damageReduction: 'Damage taken',
    critChance: 'Crit chance',
    damageDealt: 'All damage',
    costReduction: 'All costs',
};

// The subtractive stats (server: value × (1 − bonus)) phrase as what the
// player pays/takes with the −X% shape the resist lines already use — one
// reduction vocabulary across passives and resists (PO 2026-08-02, item 10).
const REDUCTION_STATS = new Set(['damageReduction', 'costReduction']);

const SELECTOR_LABELS: { [selector: string]: string } = {
    nearest: 'nearest',
    lowest_health: 'most wounded',
};

// A gate key (D4: the aura damages ONLY mobs that name the key) rendered as
// what the player DOES with it. Feedback pass B item 5: "Only affects targets
// vulnerable to: smash" left the playtester with no idea Pickaxe is the key to
// the tunnel's boulders. An unmapped key falls back to the passive phrasing
// rather than inventing a verb.
const GATE_KEY_LINES: { [key: string]: string } = {
    smash: 'Smashes boulders and rockfalls — nothing else',
    harvest: 'Harvests plants and brambles — nothing else',
};

function gatedLine(key: string): string {
    return GATE_KEY_LINES[key] ?? `Only affects targets vulnerable to: ${key}`;
}

// Aura-form effects with a real tick cadence; every other type's
// tickInterval is just the parse default and means nothing.
// ⚑ Hand-maintained, and nothing fails when it is short: an aura type missing
// here simply renders no cadence at all, so "refreshed every 1s" quietly stops
// being said. speed_aura joined it with the type itself (plan-effect-types.md
// C4) — the aura's line looked finished without it.
const TICKING_TYPES = new Set([
    'damage_aura', 'heal_aura', 'dot_aura', 'hot_aura',
    'slow_aura', 'resist_aura', 'shield_aura', 'speed_aura',
]);

// The rendered tick cadence of an aura-form effect, with its next-level
// preview; null when the effect has no real cadence (non-ticking type, or
// interval 1 = continuous). One function so the collapse decision in
// formatSkillTooltip and the suffixes in effectBlock can never disagree on
// what "the same cadence" means.
function effectIntervalString(effect: SkillEffect, level: number, maxLevel: number): string | null {
    if (!TICKING_TYPES.has(effect.type) || effect.tickInterval <= 1) {
        return null;
    }
    return prog(effect.tickInterval, effect.tickIntervalPerLevel, level, maxLevel,
        (ticks) => ticksToSecs(Math.max(1, ticks)));
}

// What a cost line says about WHEN it is taken, for the five types that do not
// pay on every application.
//
// ⚑ R2 (plan-resource-costs-feedback §5.2) made these charge only for work
// DONE — they report new-vs-refresh out of the buff store and are charged off
// that answer — while R1's cost wording was written before it and kept printing
// the effect's tick cadence. So Warbanner read "Costs you: 1 Focus every 1.32s"
// for a shield the server bills per refill, and Immolate "every 0.66s" for a dot
// it bills per ignition. The number was right and the sentence around it was a
// leftover from the previous pass.
//
// Phrased as WHEN, never as per-what: a cost is charged once per APPLICATION
// (§3.5), so an aura that ignites two enemies in one tick pays once, and "per
// enemy set alight" would be a different and wrong promise.
//
// The cadence is not lost — it still rides the effect's own line, which reads
// "refreshed every 1.32s" for all five. Only the COST line stops claiming it.
//
// Exhaustive against api/shared-constants.json in both directions
// (SharedConstants.test.ts), so a new chargeable type cannot land with the
// wrong sentence, and the Go content guard reads the same taxonomy.
export const COST_TRIGGER_TEXT: { [type: string]: string } = {
    dot_aura: 'when it sets something alight',
    hot_aura: 'when it reaches someone new',
    resist_aura: 'when it reaches someone new',
    slow_aura: 'when it catches someone new',
    shield_aura: 'when a shield goes up or is refilled',
    // Byte-identical to hot_aura/resist_aura's line, and deliberately so: the
    // three share one rule (a fresh buff on somebody is work, a refresh at the
    // same value is not), so they should share one sentence.
    speed_aura: 'when it reaches someone new',
};

// The cost trigger for ONE effect: the type's wording, unless the effect
// authors a variant that charges at a different moment than its type normally
// does.
//
// There is exactly one such variant (plan-effect-types.md D7): a resist_aura
// with `buffLifetimeMatchesInterval` drops the standard interval + 1 buff
// lifetime, so the buff lapses just before every re-application and each cycle
// is genuinely new work. The type's default line ("when it reaches someone
// new") is precisely the sentence that stops being true: such an aura keeps
// charging for the same target, forever, as long as it is held.
//
// ⚑ Read off the SERVED payload, never off a skill id or a name: the flag rides
// the catalog with the rest of the resist params, so the next skill authored
// this way gets the right line with no second edit here. And the branch lives
// here rather than in COST_TRIGGER_TEXT because that table is keyed by type and
// pinned exhaustively against api/shared-constants.json; this is an authoring
// variant WITHIN a type, which the shared taxonomy has no way to express.
function costTriggerText(effect: SkillEffect): string | undefined {
    if (effect.type === 'resist_aura' && effect.resist?.buffLifetimeMatchesInterval) {
        return 'every time it re-applies';
    }
    return COST_TRIGGER_TEXT[effect.type];
}

function targetsLine(effect: SkillEffect, level: number, maxLevel: number): string | null {
    const groups: string[] = [];
    if (effect.targetsEnemies) groups.push('enemies');
    if (effect.targetsAllies) groups.push('allies');
    // The heal/hot aura forms carry no flags — they are allies-implicit.
    if (groups.length === 0 && (effect.type === 'heal_aura' || effect.type === 'hot_aura')) {
        groups.push('allies');
    }
    if (effect.targetsStructures) groups.push('structures');
    if (groups.length === 0) {
        return null;
    }
    const who = groups.join(' + ');
    if (effect.maxTargets > 0 && effect.selector !== 'all') {
        const count = prog(effect.maxTargets, effect.maxTargetsPerLevel, level, maxLevel);
        const selector = SELECTOR_LABELS[effect.selector] ?? effect.selector;
        return `Targets: ${selector} ${count} ${who}`;
    }
    return `Targets: all ${who} in range`;
}

// The extras are all relative multipliers (crit %, variance, execute,
// berserker, lifesteal) or damage-type text — casterPowerScale touches none
// of them, so this whole function is power-scale-free on purpose.
function damageExtraLines(damage: DamageParams, level: number, maxLevel: number, lines: string[]) {
    // ⚑ The gate key is checked FIRST and `tags` is not touched on that branch.
    // A gated payload carries no damage types (D4), so Go marshals its nil Tags
    // slice as JSON `null` — reading .length on it throws, and it would throw
    // inside a tooltip for a skill every new player is taught.
    if (damage.gateKey) {
        lines.push(gatedLine(damage.gateKey));
    } else {
        const nonPhysical = damage.tags.length > 1 || damage.tags[0] !== 'physical';
        if (nonPhysical) {
            lines.push(`Damage type: ${damage.tags.join(', ')}`);
        }
    }
    if (damage.variance > 0) {
        lines.push(`Variance: ±${pct(damage.variance)}`);
    }
    if (damage.critChance > 0 || damage.critChancePerLevel > 0) {
        const factor = damage.critFactor > 0 ? ` (×${fmt(damage.critFactor)})` : '';
        lines.push(`Crit: ${prog(damage.critChance, damage.critChancePerLevel, level, maxLevel, pct)}${factor}`);
    }
    if (damage.executeBonusFactor > 0) {
        lines.push(`Execute: ×${fmt(damage.executeBonusFactor)} below ${pct(damage.executeBelowFraction)} Focus`);
    }
    if (damage.berserkerMaxBonusFactor > 0) {
        lines.push(`Berserker: up to +${pct(damage.berserkerMaxBonusFactor)} damage at low Focus`);
    }
    if (damage.lifestealFraction > 0) {
        lines.push(`Lifesteal: ${pct(damage.lifestealFraction)}`);
    }
    if (damage.structureDamageFraction > 0) {
        lines.push(`Structure damage: ${pct(damage.structureDamageFraction)}`);
    }
}

// One effect's rendered output: its main + extra lines (the first line
// carries the aura-category label color), and the generic geometry lines
// keyed by kind so formatSkillTooltip can dedupe identical ones across a
// multi-effect skill (Warbanner's four auras share one radius/cadence/
// targets — printing them four times was pure noise).
type GenericKind = 'radius' | 'targets';

// What a costed effect hands back instead of printing its own line (N2/D5):
// the rendered charge trigger IS the grouping key, so effects charged at the
// same moment merge into one "Costs you" line at the skill level.
interface EffectCostEntry {
    when: string;
    fraction: number;
    fractionPerLevel: number;
}

interface EffectBlock {
    lines: TooltipLine[];
    generics: Partial<Record<GenericKind, string>>;
    cost?: EffectCostEntry;
}

// How a cost renders (R1/F6, superseding the 2026-07-29 "percentage alone"
// ruling): the ABSOLUTE number of Focus points the server will take, computed
// from the live pool and the player's cost-reduction multiplier.
//
// ⚑ This is what makes both of the server's corrections legible instead of
// merely true. A cost is charged through vitals.HP, so it is floored at 1 point
// while the pool is small — Immolate authors 0.26 % and takes 1 % of a
// 100-point pool — and it is scaled by the cost-reduction passive, which the
// client could not see at all before R1. Neither needs explaining once the
// number shown is the number charged.
//
// The returned renderer takes the level-scaled fraction (what prog() hands it)
// and returns the number alone; its unit is the caller's suffix, so a
// next-level preview reads "1 → 2 Focus" rather than repeating the unit.
// A pool of 0 means "no snapshot yet" and falls back to the authored
// percentage: imprecise beats invented.
//
// ⚑ sum() adds the ROUNDED per-effect amounts, never rounding the summed
// fraction (N2): the server bills each effect separately through vitals.HP,
// which floors a positive cost at 1 — on a level-1 pool Warbanner's damage
// (0.0184 → 2) and heal (0.003533 → 1) really cost 3, while rounding the
// summed fraction would print 2. This is the INVERSE of the cooldown path
// below (cooldownCostHP deducts once and rounds once), so the two must not
// be "unified". The percentage fallback has no rounding, so there the sum of
// fractions is exact.
interface CostRenderer {
    render: (fraction: number) => string;
    sum: (fractions: number[]) => string;
    unit: string;
}

function costRenderer(maxHealth: number, costFactor: number): CostRenderer {
    if (maxHealth <= 0) {
        return {
            render: pct,
            sum: (fractions) => pct(fractions.reduce((total, f) => total + f, 0)),
            unit: ' of max Focus',
        };
    }
    const one = (fraction: number) => roundHP(fraction * maxHealth * costFactor);
    return {
        render: (fraction: number) => String(one(fraction)),
        sum: (fractions) => String(fractions.reduce((total, f) => total + one(f), 0)),
        unit: ' Focus',
    };
}

// "Also heals you" is only correct alongside ally targeting (F10). Recover
// targets the caster and nobody else, so "Also" promised a second effect that
// does not exist. The shield and resist lines carry the same word in the same
// shape — one helper, rather than three chances to get it wrong.
function selfTargetLine(effect: SkillEffect, verb: string): string {
    return effect.targetsAllies
        ? `Also ${verb} you`
        : verb.charAt(0).toUpperCase() + verb.slice(1) + ' you';
}

function effectBlock(effect: SkillEffect, level: number, maxLevel: number, powerScale: number,
                     isCosted: boolean, suppressCadence: boolean,
                     damageFactor: number = 1, spawnCount: number = 1): EffectBlock {
    const lines: string[] = [];

    // Cadence folds into the main line instead of its own "Ticks every" line
    // (PO text-size pass 2026-07-21): hit auras read "every Xs", state/
    // over-time auras "refreshed every Xs". Interval 1 (continuous) shows
    // nothing but the hit auras' "per tick".
    //
    // N2 exception: when every ticking effect of the skill shares one beat,
    // the caller suppresses these suffixes and the cadence prints once at the
    // bottom instead. The cost trigger below is computed BEFORE the
    // suppression — "when am I charged" stays tied to the amount either way.
    const interval = effectIntervalString(effect, level, maxLevel);
    const cadence = interval !== null ? ` every ${interval}`
        : (TICKING_TYPES.has(effect.type) ? ' per tick' : '');
    const trigger = costTriggerText(effect);
    const when = trigger ? ` ${trigger}` : cadence;
    const suppressed = suppressCadence && interval !== null;
    const perTick = suppressed ? '' : cadence;
    const refresh = interval !== null && !suppressed ? `, refreshed every ${interval}` : '';

    switch (effect.type) {
        case 'damage_aura':
        case 'instant_damage':
            // damageFactor rides only the damage lines (here and the dot case
            // below) — the server applies casterDamageFactor at the damage
            // base-composition sites, never to heals, shields or CC.
            lines.push(`Damage: ${prog(effect.damage.hp, effect.damage.hpPerLevel, level, maxLevel, hpFmt, powerScale * damageFactor)}${perTick}`);
            damageExtraLines(effect.damage, level, maxLevel, lines);
            break;
        case 'heal_aura': {
            const heal = effect.heal;
            if (heal.fractionOfMax > 0) {
                // Curve-free by construction: max HP already carries f(L),
                // which is why the server skips powerScale on this branch too.
                lines.push(`Heal: ${prog(heal.fractionOfMax, heal.fractionOfMaxPerLevel, level, maxLevel, pct)} of max Focus${perTick}`);
            } else {
                lines.push(`Heal: ${prog(heal.hp, heal.hpPerLevel, level, maxLevel, hpFmt, powerScale)}${perTick}`);
            }
            if (heal.variance > 0) lines.push(`Variance: ±${pct(heal.variance)}`);
            break;
        }
        case 'self_heal': {
            const selfHeal = effect.selfHeal;
            if (selfHeal.fractionOfMax > 0) {
                // Curve-free, as above.
                lines.push(`Heal self: ${prog(selfHeal.fractionOfMax, selfHeal.fractionOfMaxPerLevel, level, maxLevel, pct)} of max Focus`);
            } else {
                lines.push(`Heal self: ${prog(selfHeal.healHp, selfHeal.healHpPerLevel, level, maxLevel, hpFmt, powerScale)} Focus`);
            }
            if (selfHeal.variance > 0) lines.push(`Variance: ±${pct(selfHeal.variance)}`);
            break;
        }
        case 'slow_aura':
            lines.push(`Slow: ${prog(effect.slow.fraction, effect.slow.fractionPerLevel, level, maxLevel, pct)}${refresh}`);
            break;
        case 'resist_aura':
        case 'resist_passive':
        case 'instant_resist': {
            const resist = effect.resist;
            // "*" is the reserved wildcard tag (skills/resist.go), not a damage
            // type: it covers every tag there is, so it must never reach the
            // player as the literal symbol.
            const subject = resist.tags.length === 1 && resist.tags[0] === '*'
                ? 'all damage' : resist.tags.join(', ');
            // Only the instant form carries its own lifetime, the instant_shield
            // shape; the aura form's cadence rides `refresh` instead.
            const duration = effect.type === 'instant_resist' ? ` for ${ticksToSecs(resist.durationTicks)}` : '';
            // Factor is the incoming-damage multiplier (0.5 = takes half,
            // 0 = immune, 1.2 = takes a fifth more); render as the delta
            // players think in. A skill authors one side of 1 across its whole
            // level range (skills/resist.go semantics), so the current level's
            // factor picks the phrasing. Sign-on-first-value mirrors the ward
            // shape.
            const factor = scaled(resist.factor, resist.factorPerLevel, level);
            if (factor > 1) {
                const renderAmplification = (value: number) => pct(value - 1);
                lines.push(`Vulnerable to ${subject}: +${prog(resist.factor, resist.factorPerLevel, level, maxLevel, renderAmplification)} damage taken${duration}${refresh}`);
            } else if (factor <= 0) {
                // Immunity says what it is. "−100% damage taken" is arithmetic;
                // nothing landing is the thing the player is buying.
                lines.push(`Immune to ${subject}${duration}${refresh}`);
            } else {
                const renderReduction = (value: number) => pct(1 - Math.max(0, value));
                lines.push(`Resist ${subject}: −${prog(resist.factor, resist.factorPerLevel, level, maxLevel, renderReduction)} damage taken${duration}${refresh}`);
            }
            if (resist.targetsSelf) lines.push(selfTargetLine(effect, 'applies to'));
            break;
        }
        case 'stat_multiplier': {
            const stat = effect.stat;
            const label = STAT_LABELS[stat.name] ?? stat.name;
            const sign = REDUCTION_STATS.has(stat.name) ? '−' : '+';
            lines.push(`${label}: ${sign}${prog(stat.bonus, stat.bonusPerLevel, level, maxLevel, pct)}`);
            break;
        }
        case 'dot_aura':
        case 'instant_dot': {
            const dot = effect.dot;
            const duration = ticksToSecs(dot.tickCount * dot.interval);
            lines.push(`Damage over time: ${prog(dot.hp, dot.hpPerLevel, level, maxLevel, hpFmt, powerScale * damageFactor)} × ${dot.tickCount} hits over ${duration}${refresh}`);
            const nonPhysical = dot.tags.length > 1 || dot.tags[0] !== 'physical';
            if (nonPhysical) lines.push(`Damage type: ${dot.tags.join(', ')}`);
            if (dot.variance > 0) lines.push(`Variance: ±${pct(dot.variance)}`);
            break;
        }
        case 'spawn':
        case 'spawn_at_anchor': {
            const spawn = effect.spawn;
            // The mob catalog serves the display name (§35 C4a) — the client
            // does not re-derive it; before the catalog loads, the raw name.
            // spawnCount > 1 is the Call-for-Aid dedupe: three identical spawn
            // effects read "Summons 3× Soldier Companion", not three lines.
            const count = spawnCount > 1 ? `${spawnCount}× ` : '';
            // ⭐ The ONE thing the remote twin says differently
            // (plan-portal-spells.md D11): where it puts what it summons.
            // Everything else about the line is shared, because everything else
            // about the effect is: it is the same SpawnParams payload.
            const where = effect.type === 'spawn_at_anchor' ? ' at your campfire' : '';
            lines.push(`Summons ${count}${mobDisplayName(spawn.mobName)}${where} for ${prog(spawn.ttlTicks, spawn.ttlTicksPerLevel, level, maxLevel, ticksToSecs)}`);
            if (spawn.powerPerOwnerLevel > 0) {
                lines.push(`Summon power: +${pct(spawn.powerPerOwnerLevel)} per player level`);
            }
            break;
        }
        case 'projectile': {
            // The THROWN twin (plan-prototype-projectile.md D2). It says the
            // two things the placement adds and nothing else: everything about
            // WHAT lands is the shared spawn payload, rendered by the loadout
            // lines below the block exactly as a summon's are.
            const spawn = effect.spawn;
            lines.push(`Throws ${mobDisplayName(spawn.mobName)} ${spawn.forwardUnits ?? 0} m ahead for ${prog(spawn.ttlTicks, spawn.ttlTicksPerLevel, level, maxLevel, ticksToSecs)}`);
            // The fuse is the whole feel of the ability - "drop it and back
            // off" only reads if the player knows how long they have.
            lines.push(`Arms after ${ticksToSecs(spawn.armTicks ?? 0)}`);
            break;
        }
        case 'taunt':
            lines.push('Taunts enemies in range into attacking you');
            break;
        case 'detaunt':
            lines.push('Sheds your threat to an enemy in range');
            break;
        case 'light_aura':
            // Feedback pass B item 5: "Emits light" did not read as "this is
            // your light source in the dark" — say what it is for.
            lines.push('Lights up the darkness around you');
            break;
        case 'shield_aura':
        case 'instant_shield': {
            const shield = effect.shield;
            let line = `Shield: ${prog(shield.hp, shield.hpPerLevel, level, maxLevel, hpFmt, powerScale)} Focus`;
            if (effect.type === 'instant_shield') {
                line += ` for ${ticksToSecs(shield.durationTicks)}`;
            }
            lines.push(line + refresh);
            if (shield.targetsSelf) lines.push(selfTargetLine(effect, 'shields'));
            break;
        }
        case 'recall':
            lines.push('Returns you to your bound campfire');
            break;
        case 'hot_aura':
        case 'instant_hot': {
            const hot = effect.hot;
            const duration = ticksToSecs(hot.tickCount * hot.interval);
            if (hot.fractionOfMax > 0) {
                // Curve-free, as on the heal branches: max HP already carries
                // f(L), so the server skips powerScale here too. Recover is the
                // first content to take this branch (D14) — before it, a
                // fractional HoT would have rendered "Heal over time: 0".
                lines.push(`Heal over time: ${prog(hot.fractionOfMax, hot.fractionOfMaxPerLevel, level, maxLevel, pct)} of max Focus × ${hot.tickCount} over ${duration}${refresh}`);
            } else {
                lines.push(`Heal over time: ${prog(hot.hp, hot.hpPerLevel, level, maxLevel, hpFmt, powerScale)} × ${hot.tickCount} over ${duration}${refresh}`);
            }
            if (hot.targetsSelf) lines.push(selfTargetLine(effect, 'heals'));
            break;
        }
        case 'revive':
            lines.push(`Revives the nearest fallen player at ${pct(effect.revive.healthFraction)} Focus`);
            break;
        case 'dash':
            lines.push(`Dash ${prog(effect.dash.distance, effect.dash.distancePerLevel, level, maxLevel)} m in your movement direction`);
            break;
        case 'calm': {
            // Say what it is FOR, like light_aura: "calms enemies" reads as a
            // damage-free nothing, and the one thing a player must know is that
            // their own aura will break it (PO 2026-07-28 — calm is a disengage
            // tool, and any damage ends it).
            const calm = effect.calm;
            lines.push(`Calms enemies in range for ${prog(calm.durationTicks, calm.durationTicksPerLevel, level, maxLevel, ticksToSecs)}`);
            lines.push('Any damage breaks it — including your own aura');
            break;
        }
        case 'charm': {
            // Two things a player cannot see anywhere else: a charmed mob is a
            // pet at ITS OWN level (which is why charming an elite is worth a
            // two-minute cooldown), and it is temporary — it turns on you when
            // the timer runs out, with no way to extend it (D11/L-F).
            const charm = effect.charm;
            lines.push(`Charms the nearest enemy to fight for you for ${prog(charm.durationTicks, charm.durationTicksPerLevel, level, maxLevel, ticksToSecs)}`);
            lines.push('It keeps its own level, and turns on you when the charm ends');
            break;
        }
        case 'speed_burst': {
            // Both halves scale, so both go through prog() — the whole point of
            // the re-role is that the sprint gets longer AND faster with levels,
            // which the passive it replaced could not express.
            const speed = effect.speed;
            // The × rides the per-value renderer, not the joined string, or the
            // next-level preview reads "1.5 → 1.6×" with only one unit.
            const pace = prog(speed.factor, speed.factorPerLevel, level, maxLevel, n => `${fmt(n)}×`);
            const duration = prog(speed.durationTicks, speed.durationTicksPerLevel, level, maxLevel, ticksToSecs);
            // Who moves is authored since C4, and saying it is not decoration:
            // the caster of an ally-facing burst does NOT move faster, so the
            // shipped "Move …" sentence would have been a plain lie on it. The
            // self-only branch renders Swift byte-identically.
            const mover = speed.targetsSelf
                ? (effect.targetsAllies ? 'You and allies in range move' : 'Move')
                : 'Allies in range move';
            lines.push(`${mover} ${pace} as fast for ${duration}`);
            break;
        }
        case 'speed_aura':
            // The field form (plan-effect-types.md C4). Rendered on the
            // slow_aura pattern rather than the burst's sentence: an aura has no
            // lifetime of its own to name, so the cadence it re-applies at is
            // the second fact, and `refresh` carries it. Who it reaches rides
            // the shared targets line, which reads it off targetsAllies for
            // free — and the caster's exclusion (D9) is invisible here on
            // purpose, being a property of eligibility rather than of the
            // authored numbers.
            lines.push(`Speed: ${prog(effect.speed.factor, effect.speed.factorPerLevel, level, maxLevel, n => `${fmt(n)}×`)}${refresh}`);
            break;
        case 'stun': {
            // Both halves are spelled out on purpose. "Stuns for 3s" leaves a
            // reader to guess whether the target can still attack — and the
            // answer (no) is the entire difference between this and a root.
            const stun = effect.stun;
            const held = prog(stun.durationTicks, stun.durationTicksPerLevel, level, maxLevel, ticksToSecs);
            lines.push(`Holds one enemy for ${held} — it cannot move, attack or use abilities`);
            lines.push('Damage does not break it');
            break;
        }
        case 'retaliate_slow': {
            // Worded from the wearer's side, because that is who reads it: the
            // trigger is being hit, and the effect lands on someone else. Both
            // halves go through prog() even though the duration is authored
            // flat today — a retune that gives it a curve should not need this
            // line edited (the flat case renders as one value anyway).
            const retaliate = effect.retaliate;
            const share = prog(retaliate.fraction, retaliate.fractionPerLevel, level, maxLevel, pct);
            const duration = prog(retaliate.durationTicks, retaliate.durationTicksPerLevel, level, maxLevel, ticksToSecs);
            lines.push(`Slows anything that damages you by ${share} for ${duration}`);
            lines.push('Being hit is enough — it fires even when the hit is fully absorbed');
            break;
        }
        case 'retaliate_damage': {
            // The retaliate_slow line with an amount instead of a fraction, and
            // one line it does not need: the damage TYPE, which is what decides
            // whether the attacker shrugs the whole thing off. Physical stays
            // silent, the damage_aura rule.
            //
            // ⚑ No powerScale and no damageFactor here, unlike every other
            // damage line. The server reflects RAW AUTHORED DAMAGE — it never
            // passes the damage base-composition sites — so scaling it would
            // print a number that is never dealt.
            const reflect = effect.retaliateDamage;
            const amount = prog(reflect.hp, reflect.hpPerLevel, level, maxLevel, hpFmt);
            lines.push(`Reflects ${amount} damage onto anything that damages you`);
            if (reflect.tags.length > 1 || reflect.tags[0] !== 'physical') {
                lines.push(`Damage type: ${reflect.tags.join(', ')}`);
            }
            lines.push('Being hit is enough — it fires even when the hit is fully absorbed');
            break;
        }
        case 'retaliate_burst': {
            // The lifesteal_burst line inverted, and it carries one sentence
            // neither burst needs: WHICH damage the share is taken from. The
            // server takes it from the hit as the mob threw it, before this
            // player's own mitigation, and a reader who assumes otherwise will
            // mis-price the skill against a tanky build.
            //
            // ⚑ No powerScale and no damageFactor, like every reflect line: a
            // share is not an amount, and the server scales neither.
            const burst = effect.retaliateBurst;
            const share = prog(burst.fraction, burst.fractionPerLevel, level, maxLevel, pct);
            const window = prog(burst.durationTicks, burst.durationTicksPerLevel, level, maxLevel, ticksToSecs);
            lines.push(`For ${window}, reflects ${share} of damage taken`);
            if (burst.tags.length > 1 || burst.tags[0] !== 'physical') {
                lines.push(`Damage type: ${burst.tags.join(', ')}`);
            }
            lines.push('The share is of the hit as thrown, before your own mitigation');
            break;
        }
        case 'lifesteal_burst': {
            // The leech scales with level, the window deliberately does not —
            // the PO fixed it at six seconds, so only the fraction goes through
            // prog(). Worded as "of the damage you deal" rather than a bare
            // percentage because the number is meaningless without the base it
            // is a share of.
            const lifesteal = effect.lifesteal;
            const share = prog(lifesteal.fraction, lifesteal.fractionPerLevel, level, maxLevel, pct);
            lines.push(`Heals you for ${share} of the damage you deal, for ${ticksToSecs(lifesteal.durationTicks)}`);
            lines.push('Works with whichever aura you have on');
            break;
        }
        case 'tick_rate': {
            const tickRate = effect.tickRate;
            const speed = tickRate.factor < 1
                ? `${fmt(1 / tickRate.factor)}× faster`
                : `${fmt(tickRate.factor)}× slower`;
            lines.push(`Your auras tick ${speed} for ${ticksToSecs(tickRate.durationTicks)}`);
            break;
        }
        default:
            // Server data can't be compile-exhausted — the warn is the
            // tripwire for a new effect type missing its lines.
            console.warn(`SkillTooltip: unknown effect type "${effect.type}"`);
            lines.push(`(${effect.type})`);
    }

    const generics: EffectBlock['generics'] = {};
    // ⭐ DISTANCE IS SPELLED " m" EVERYWHERE (PO ruling 2026-08-19). World units
    // are what the server thinks in; "3u" is correct and unreadable, and the
    // three places that print a distance each said something different - "3u"
    // on the throw, "5 units" on the dash, a bare number here. A metre is the
    // right lie: a humanoid body is radius 0.3, so a unit is about a person
    // wide. Keep any new distance line on this spelling.
    if (effect.radius > 0) {
        generics.radius = `Radius: ${prog(effect.radius, effect.radiusPerLevel, level, maxLevel)} m`;
    }
    const targets = targetsLine(effect, level, maxLevel);
    if (targets) {
        generics.targets = targets;
    }

    const color = effectColor(effect.type);
    const rendered: TooltipLine[] = lines.map((text, i) =>
        i === 0 && color ? {text, labelColor: color} : {text});

    // The cost is handed back rather than rendered here (N2/D5): effects
    // charged at the same trigger merge into one line at the skill level.
    // What keys the merge is the CHARGE TRIGGER, not the tick cadence — the
    // two are only the same thing for damage and heal auras, which pay on
    // every application. See COST_TRIGGER_TEXT.
    return {
        lines: rendered,
        generics,
        cost: isCosted
            ? {when, fraction: effect.costFractionOfMax, fractionPerLevel: effect.costFractionOfMaxPerLevel}
            : undefined,
    };
}

const GENERIC_KINDS: GenericKind[] = ['radius', 'targets'];

// The summon's own effects, rendered beneath the Summons line (round-7 item 3):
// each loadout skill runs through the SAME effectBlock every ability uses, so
// a retune of the totem's aura re-renders here for free. Three mirrors of the
// server, each pinned by test:
//   · the level is the authored loadout level raised to the summon skill's
//     level, clamped to the loadout skill's own max (RaiseLoadoutLevels);
//   · HP output composes f(owner level) × (1 + powerPerOwnerLevel × (L − 1))
//     (casterPowerScale × SummonPower) — effectBlock keeps that scale off
//     radii, fractions and CC, exactly as the server does;
//   · the player's damageFactor is NOT passed: Strong multiplies the PLAYER's
//     output, and the caster here is the summon.
// previewMax is pinned to the level so no nested "→" renders — the loadout
// levels only move through the summon skill, whose own lines keep the preview.
// An unresolvable ref (catalog gap) degrades to the bare Summons line.
function summonLoadoutLines(spawn: SkillEffect['spawn'], skillLevel: number, powerScale: number,
                            playerLevel: number,
                            resolveSkill: (id: number) => SkillDefinition | undefined): TooltipLine[] {
    const out: TooltipLine[] = [];
    const summonPower = playerLevel > 0 ? scaled(1, spawn.powerPerOwnerLevel, playerLevel) : 1;
    for (const ref of spawn.summonLoadout ?? []) {
        const def = resolveSkill(ref.skillId);
        if (!def) continue;
        const level = Math.max(ref.level, Math.min(skillLevel, def.maxLevel));
        for (const effect of def.effects) {
            if (effect.type === 'spawn') continue; // a summon summoning: render one level deep only
            const block = effectBlock(effect, level, level, powerScale * summonPower, false, false);
            for (const line of block.lines) {
                out.push({text: `↳ ${line.text}`, labelColor: line.labelColor});
            }
            for (const kind of GENERIC_KINDS) {
                if (block.generics[kind] !== undefined) {
                    out.push({text: `↳ ${block.generics[kind]}`});
                }
            }
        }
    }
    return out;
}

// powerScale is f(character level), maxHealth is the live Focus pool and
// costFactor the player's cost-reduction multiplier — all passed in rather than
// read here so the whole formatter stays pure and DOM-free (and testable at
// both ends of the curve without a loaded catalog). maxHealth 0 means
// "unknown", and falls the cost lines back to the authored percentage.
//
// showNextLevel is whether the caller can actually buy the next level right now
// (PO 2026-08-01: the same affordability rule the + button greys on). The
// next-level preview answers exactly one question — "what does the point I am
// about to spend get me?" — so with no point to spend it is noise, and a
// tooltip is the wrong place to advertise numbers the player cannot reach yet.
// playerLevel feeds the summon-power composition only (summonLoadoutLines); 0
// means "no snapshot yet" and leaves the multiplier neutral. resolveSkill is
// injected so the formatter stays pure — the app passes the catalog lookup,
// tests pass fixtures, and the default keeps every existing call site working.
export function formatSkillTooltip(def: SkillDefinition, level: number, powerScale: number,
                                   maxHealth: number = 0, costFactor: number = 1,
                                   showNextLevel: boolean = true,
                                   damageFactor: number = 1,
                                   playerLevel: number = 0,
                                   resolveSkill: (id: number) => SkillDefinition | undefined = skillDefinition): TooltipContent {
    const cost = costRenderer(maxHealth, costFactor);
    // One cap gates every "→" in the tooltip, because every level-scaled value
    // renders through prog() and prog() previews only while level < cap. Capping
    // at the current level is therefore the whole feature — no per-line work,
    // and a new effect type inherits the gating for free.
    //
    // It is a RENDERING cap only: the subtitle below still reads def.maxLevel,
    // so the player keeps seeing how far the skill can go.
    const previewMax = showNextLevel ? def.maxLevel : level;
    // N2 cadence collapse: when MORE THAN ONE ticking effect renders the same
    // cadence (post-R3 the normal case — every multi-effect aura is on one
    // beat), the per-line suffixes come off and the beat prints once at the
    // bottom with the shared generics. A single ticking effect keeps its
    // inline cadence: "Damage: 14 every 1.32s" reads better than a two-line
    // split, and the 2026-07-21 no-"Ticks every"-line ruling still binds
    // there.
    const intervals = def.effects
        .map(effect => effectIntervalString(effect, level, previewMax))
        .filter(interval => interval !== null);
    const sharedCadence = intervals.length > 1 && intervals.every(i => i === intervals[0])
        ? intervals[0] : null;
    // Where the cost lines go follows how the cost is CHARGED (D8 + D5): an
    // aura pays per effect, grouped by charge trigger below; a cooldown pays
    // the SUM of its effects once on cast, so it prints once beside the
    // cooldown — three summon effects at 2 % each must not read as "2 %"
    // three times when the cast takes 6 %.
    const perEffectCost = def.category !== 'cooldown';
    // Identical spawn effects collapse into one counted "Summons 3× …" line
    // (round-7 item 3's Call-for-Aid half). Only spawns dedupe — they are the
    // one type authored as repeats-meaning-multiples — and the cost machinery
    // is unaffected: every summon is a cooldown today, and the per-cast sum
    // below reads def.effects, never this list.
    const renderEffects: { effect: SkillEffect, count: number }[] = [];
    const spawnGroups = new Map<string, { effect: SkillEffect, count: number }>();
    for (const effect of def.effects) {
        // ⚑ Deliberately 'spawn' ALONE, not its remote twin: the dedupe exists
        // for Call-for-Aid's three identical squad members, and the key is the
        // PAYLOAD, which both types share, so folding spawn_at_anchor in here
        // would let a skill authoring both placements of one mob collapse two
        // different lines into one.
        if (effect.type === 'spawn') {
            const key = JSON.stringify([effect.spawn, effect.costFractionOfMax, effect.costFractionOfMaxPerLevel]);
            const group = spawnGroups.get(key);
            if (group) {
                group.count++;
                continue;
            }
            const entry = {effect, count: 1};
            spawnGroups.set(key, entry);
            renderEffects.push(entry);
            continue;
        }
        renderEffects.push({effect, count: 1});
    }
    const blocks = renderEffects.map(({effect, count}) => {
        const block = effectBlock(effect, level, previewMax, powerScale,
            perEffectCost && scaled(effect.costFractionOfMax, effect.costFractionOfMaxPerLevel, level) > 0,
            sharedCadence !== null, damageFactor, count);
        // Both placements carry the same payload, so both get the loadout
        // lines. Omitting the remote one would lose an anchored summon's
        // abilities silently the day one has any (plan-portal-spells.md D11).
        if (effect.type === 'spawn' || effect.type === 'spawn_at_anchor' || effect.type === 'projectile') {
            // Right after the Summons line, before the summon-power line.
            block.lines.splice(1, 0,
                ...summonLoadoutLines(effect.spawn, level, powerScale, playerLevel, resolveSkill));
        }
        return block;
    });

    // A generic kind is shared when every effect that renders it renders it
    // identically — then it prints once at the bottom instead of per effect.
    // Kinds that differ between effects stay inside their effect's block.
    const isShared: { [kind in GenericKind]?: boolean } = {};
    for (const kind of GENERIC_KINDS) {
        const rendered = blocks.map(b => b.generics[kind]).filter(text => text !== undefined);
        isShared[kind] = rendered.length > 0 && rendered.every(text => text === rendered[0]);
    }

    const lines: TooltipLine[] = [];
    for (const block of blocks) {
        lines.push(...block.lines);
        for (const kind of GENERIC_KINDS) {
            if (!isShared[kind] && block.generics[kind] !== undefined) {
                lines.push({text: block.generics[kind]});
            }
        }
    }
    for (const kind of GENERIC_KINDS) {
        if (isShared[kind]) {
            lines.push({text: blocks.find(b => b.generics[kind] !== undefined).generics[kind]});
        }
    }
    // The shared beat, once (N2). Deliberately NOT a GenericKind: an unshared
    // cadence renders as an inline suffix, not as a per-block line, so the
    // radius/targets machinery (which prints unshared kinds inside blocks)
    // would double-print it.
    if (sharedCadence !== null) {
        lines.push({text: `Ticks every ${sharedCadence}`});
    }

    // Cost lines, grouped by charge trigger (N2/D5) in first-appearance
    // order. One combined per-tick figure was offered and rejected (D5):
    // Warbanner's damage and heal really are charged every beat, but its
    // shield only when one goes up or is refilled and its slow is free — one
    // number would claim a price the server does not charge, reintroducing
    // exactly the discrepancy 194036c8 closed.
    const costGroups = new Map<string, EffectCostEntry[]>();
    for (const block of blocks) {
        if (!block.cost) continue;
        const group = costGroups.get(block.cost.when);
        if (group) group.push(block.cost);
        else costGroups.set(block.cost.when, [block.cost]);
    }
    for (const [when, entries] of costGroups) {
        const fractionsAt = (l: number) =>
            entries.map(e => Math.max(0, scaled(e.fraction, e.fractionPerLevel, l)));
        // prog()'s preview semantics on a summed value: show "cur → next" only
        // below the preview cap and only when the endpoints render apart.
        const current = cost.sum(fractionsAt(level));
        let amount = current;
        if (level < previewMax) {
            const next = cost.sum(fractionsAt(level + 1));
            if (next !== current) {
                amount = `${current} → ${next}`;
            }
        }
        lines.push({text: `Costs you: ${amount}${cost.unit}${when}`, labelColor: FOCUS_COLOR_CSS});
    }

    // The faction scope is a property of the SKILL, not of any one effect
    // (plan-faction-flips D8: authored on the skill, then stamped onto its
    // effects purely so the runtime gate can read it per effect). So it renders
    // HERE, beside cooldown and cast time, and never as a case in the per-effect
    // switch — that switch is where it would become per-spell hardcoding.
    //
    // ⭐ The consequence is the acceptance test: a NEW faction-scoped skill, or
    // an existing one rescoped to another faction, needs no frontend change at
    // all. Same property L-L pins server-side, one layer up.
    //
    // The Set only collapses EXACT repeats — two distinct factions that share a
    // display name (`predator` and `wildlife_predator` are both "Predators")
    // would otherwise print the same word twice.
    if (def.targetFactions?.length) {
        lines.push({text: `Affects: ${[...new Set(def.targetFactions)].join(', ')}`});
    }
    if (def.category === 'cooldown') {
        const castCost = (l: number) => def.effects.reduce(
            (sum, e) => sum + Math.max(0, scaled(e.costFractionOfMax, e.costFractionOfMaxPerLevel, l)), 0);
        if (castCost(level) > 0) {
            // prog() scales one base+perLevel pair; a summed cost needs the sum
            // evaluated at each level, so the sum itself is passed as the base
            // with its own per-level delta.
            // The slope stays measured across the REAL level range — previewMax
            // decides whether a next value is shown, never what it would be.
            const step = def.maxLevel > 1 ? (castCost(def.maxLevel) - castCost(1)) / (def.maxLevel - 1) : 0;
            // The conversion to points happens on the SUM here, not per effect:
            // a cooldown pays every effect in one deduction, so cooldownCostHP
            // totals the raw fractions and rounds once (sys/skill_cost.go).
            // Rounding per effect would print 3 points for three 0.2 % summons
            // that cost 1.
            lines.push({
                text: `Costs you: ${prog(castCost(1), step, level, previewMax, cost.render)}${cost.unit} per cast`,
                labelColor: FOCUS_COLOR_CSS,
            });
        }
    }
    if (def.cooldownTicks > 0) {
        lines.push({text: `Cooldown: ${prog(def.cooldownTicks, def.cooldownTicksPerLevel, level, previewMax, ticksToSecs)}`});
    }
    if (def.castTicks > 0) {
        const interrupt = def.castInterruptedByDamage ? ' (interrupted by damage)' : '';
        lines.push({text: `Cast time: ${prog(def.castTicks, def.castTicksPerLevel, level, previewMax, ticksToSecs)}${interrupt}`});
    }
    return {
        title: def.displayName,
        subtitle: `${CATEGORY_LABELS[def.category] ?? def.category} · Lv ${level}/${def.maxLevel}`,
        lines,
    };
}

// --- shared tooltip element + delegated hover wiring ---

let tooltipElement: HTMLElement | null = null;
let currentAnchor: HTMLElement | null = null;

// Unspent skill points, pushed in by HUD.updateSkillPointsDisplay every time
// the server count changes. Only the next-level preview reads it.
let availableSkillPoints = 0;

export function setAvailableSkillPoints(points: number) {
    availableSkillPoints = points;
}

function ensureTooltipElement(): HTMLElement {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        // ⚑ The id says "skill" but the element is shared: the baseline-utility
        // buttons render through it too since 2026-08-03. Kept as-is because
        // five browser harnesses and the stylesheet key on it, and the rename
        // would buy nothing but the name.
        tooltipElement.id = 'skillTooltip';
        tooltipElement.classList.add('hidden');
        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

export function hideTooltip() {
    currentAnchor = null;
    tooltipElement?.classList.add('hidden');
}

function showSkillTooltip(anchor: HTMLElement, skillId: number, level: number) {
    const def = skillDefinition(skillId);
    if (!def) {
        // Catalog not loaded (or fetch failed) — names fall back, tooltips
        // simply don't show.
        hideTooltip();
        return;
    }
    // getLocalPlayerLevel lives in the mob catalog because the nameplate
    // difficulty tint (its first consumer) already owned the mob side; it is
    // live-updated from every snapshot by Player.updateFromBackend.
    // "Can I buy the next level right now?" — deliberately the affordability
    // rule the + button already greys on (HUD.updateSpellbook), not the weaker
    // "do I hold any point at all": levels cost 1–3 points on the D10 curve, so
    // the two answers differ, and a preview showing while the button is dead
    // would be advertising a spend the player cannot make.
    const nextCost = skillPointCost(def.maxLevel, level + 1);
    const canSpend = nextCost > 0 && availableSkillPoints >= nextCost;
    showTooltip(anchor, formatSkillTooltip(def, level, powerScaleAt(getLocalPlayerLevel()),
        getLocalPlayerMaxHealth(), getLocalPlayerCostFactor(), canSpend,
        getLocalPlayerDamageFactor(), getLocalPlayerLevel()));
}

// showTooltip renders any TooltipContent beside an anchor. Split out of the
// skill path so the baseline-utility buttons render through the SAME element,
// styling and placement as every ability (PO 2026-08-03: the native title=
// tooltip they had before read as a bug, because it was the only hover in the
// HUD that looked like the browser instead of the game).
export function showTooltip(anchor: HTMLElement, content: TooltipContent) {
    currentAnchor = anchor;
    const element = ensureTooltipElement();

    element.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'tooltipTitle';
    title.textContent = content.title;
    element.appendChild(title);
    const subtitle = document.createElement('div');
    subtitle.className = 'tooltipSubtitle';
    subtitle.textContent = content.subtitle;
    element.appendChild(subtitle);
    for (const {text, labelColor} of content.lines) {
        const line = document.createElement('div');
        line.className = 'tooltipLine';
        const colon = text.indexOf(':');
        if (labelColor && colon > 0) {
            // "Damage: 6 → 7.2" — tint the label, keep the numbers neutral
            // (PO pick: colored label only).
            const label = document.createElement('span');
            label.className = 'tooltipLabel';
            label.style.color = labelColor;
            label.textContent = text.slice(0, colon + 1);
            line.appendChild(label);
            line.appendChild(document.createTextNode(text.slice(colon + 1)));
        } else if (labelColor) {
            // Colon-free main lines ("Emits light") tint whole.
            line.style.color = labelColor;
            line.textContent = text;
        } else {
            line.textContent = text;
        }
        element.appendChild(line);
    }

    // Anchored placement (PO pick): beside the element, flipped left when it
    // would overflow, clamped to the viewport. The two spacing knobs live in
    // the sheet (#skillTooltip --tooltip-gap/--tooltip-margin, C6) so they are
    // tunable from CSS; the fallbacks cover jsdom and a missing sheet.
    element.classList.remove('hidden');
    const style = getComputedStyle(element);
    const gapRead = parseFloat(style.getPropertyValue('--tooltip-gap'));
    const marginRead = parseFloat(style.getPropertyValue('--tooltip-margin'));
    const gap = Number.isFinite(gapRead) ? gapRead : 8;
    const margin = Number.isFinite(marginRead) ? marginRead : 4;
    const rect = anchor.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    let x = rect.right + gap;
    if (x + width > window.innerWidth - margin) {
        x = rect.left - width - gap;
    }
    x = Math.max(margin, x);
    let y = Math.min(rect.top, window.innerHeight - height - margin);
    y = Math.max(margin, y);
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
}

// attachTooltips wires delegated hover handling onto a container whose entries
// match `selector`. Hover works on pointerenter semantics via pointerover/out —
// the MouseManager pointerdown gotcha does not affect hover events.
//
// `show` is called with the hovered entry and decides what to render; it is a
// callback rather than a content value because both callers need the CURRENT
// state at hover time (a skill's level, a utility's charge count), not the
// state at wiring time.
export function attachTooltips(container: HTMLElement, selector: string,
                               show: (entry: HTMLElement) => void) {
    container.addEventListener('pointerover', (e) => {
        const entry = (e.target as HTMLElement).closest(selector) as HTMLElement | null;
        if (!entry || !container.contains(entry)) {
            return;
        }
        if (entry === currentAnchor) {
            return; // still on the same entry, moving between its children
        }
        show(entry);
    });
    container.addEventListener('pointerout', (e) => {
        const entry = (e.target as HTMLElement).closest(selector);
        const goingTo = e.relatedTarget as HTMLElement | null;
        if (entry && goingTo && entry.contains(goingTo)) {
            return; // moving within the same entry
        }
        hideTooltip();
    });
    // Clicks re-render lists and equip/activate — the anchored element may
    // vanish under the pointer, so drop the tooltip.
    container.addEventListener('pointerdown', hideTooltip);
}

// attachSkillTooltips is attachTooltips over the catalog: the spellbook and the
// three loadout slot lists, whose entries carry data-skill-id.
export function attachSkillTooltips(container: HTMLElement, levelOf: (skillId: number) => number) {
    attachTooltips(container, '[data-skill-id]', (entry) => {
        const skillId = Number(entry.dataset.skillId);
        if (!skillId) {
            hideTooltip();
            return;
        }
        showSkillTooltip(entry, skillId, levelOf(skillId));
    });
}
