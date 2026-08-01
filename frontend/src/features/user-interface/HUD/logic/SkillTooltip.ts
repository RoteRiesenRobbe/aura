// Ability hover tooltips (plan-ui-polish chunk 1): stats-only condensed
// info, auto-generated from the skill catalog so it stays correct through
// every balance retune. PO rulings 2026-07-21: FULL detail — every authored
// mechanic gets a line, unauthored fields show nothing — and the tooltip is
// anchored to the hovered element (not cursor-following).
//
// Values scale along BOTH of the game's axes (round-4 tooltip fix):
//   · the SKILL level, rendered with a next-level preview ("14.7 → 16.8")
//     while below max level, answering the spend-a-point decision directly;
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
    getLocalPlayerMaxHealth,
    powerScaleAt,
    roundHP,
    skillDefinition,
} from '../../../../client-data/Skills';
import {getLocalPlayerLevel, mobDisplayName} from '../../../../client-data/Mobs';
import {AURA_CATEGORY_COLORS} from '../../../game-objects/logic/AuraRings';

const TICK_MS = 33;

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
    slow_aura: 'slow',
    resist_aura: 'resist', resist_passive: 'resist',
    light_aura: 'light',
};

// The Focus color (F7): the health bar's own fill (vitalSigns.less #healthBar
// > .indicator), so a cost line points at the bar it drains. The resource has a
// name AND a color code now — that was the whole ask; a tooltip saying "Costs
// you" in neutral text made spending look like just another stat.
const FOCUS_COLOR = 'crimson';

function effectColor(type: string): string | undefined {
    const key = EFFECT_COLOR_KEYS[type];
    if (key === undefined) {
        return undefined;
    }
    return '#' + AURA_CATEGORY_COLORS[key].toString(16).padStart(6, '0');
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

const STAT_LABELS: { [stat: string]: string } = {
    movementSpeed: 'Movement speed',
    maxHealth: 'Max Focus',
    damageReduction: 'Damage reduction',
    critChance: 'Crit chance',
    damageDealt: 'All damage',
};

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
const TICKING_TYPES = new Set([
    'damage_aura', 'heal_aura', 'dot_aura', 'hot_aura',
    'slow_aura', 'resist_aura', 'shield_aura',
]);

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
};

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

interface EffectBlock {
    lines: TooltipLine[];
    generics: Partial<Record<GenericKind, string>>;
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
interface CostRenderer {
    render: (fraction: number) => string;
    unit: string;
}

function costRenderer(maxHealth: number, costFactor: number): CostRenderer {
    if (maxHealth <= 0) {
        return {render: pct, unit: ' of max Focus'};
    }
    return {
        render: (fraction: number) => String(roundHP(fraction * maxHealth * costFactor)),
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
                     isCosted: boolean, cost: CostRenderer): EffectBlock {
    const lines: string[] = [];

    // Cadence folds into the main line instead of its own "Ticks every" line
    // (PO text-size pass 2026-07-21): hit auras read "every Xs", state/
    // over-time auras "refreshed every Xs". Interval 1 (continuous) shows
    // nothing but the hit auras' "per tick".
    const renderInterval = (ticks: number) => ticksToSecs(Math.max(1, ticks));
    const interval = TICKING_TYPES.has(effect.type) && effect.tickInterval > 1
        ? prog(effect.tickInterval, effect.tickIntervalPerLevel, level, maxLevel, renderInterval)
        : null;
    const perTick = interval !== null ? ` every ${interval}`
        : (TICKING_TYPES.has(effect.type) ? ' per tick' : '');
    const refresh = interval !== null ? `, refreshed every ${interval}` : '';

    switch (effect.type) {
        case 'damage_aura':
        case 'instant_damage':
            lines.push(`Damage: ${prog(effect.damage.hp, effect.damage.hpPerLevel, level, maxLevel, hpFmt, powerScale)}${perTick}`);
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
        case 'resist_passive': {
            const resist = effect.resist;
            // Factor is the incoming-damage multiplier (0.5 = takes half);
            // render as the reduction players think in.
            const renderReduction = (factor: number) => pct(1 - Math.max(0, factor));
            lines.push(`Resist ${resist.tags.join(', ')}: −${prog(resist.factor, resist.factorPerLevel, level, maxLevel, renderReduction)} damage taken${refresh}`);
            if (resist.targetsSelf) lines.push(selfTargetLine(effect, 'applies to'));
            break;
        }
        case 'stat_multiplier': {
            const stat = effect.stat;
            const label = STAT_LABELS[stat.name] ?? stat.name;
            lines.push(`${label}: +${prog(stat.bonus, stat.bonusPerLevel, level, maxLevel, pct)}`);
            break;
        }
        case 'dot_aura':
        case 'instant_dot': {
            const dot = effect.dot;
            const duration = ticksToSecs(dot.tickCount * dot.interval);
            lines.push(`Damage over time: ${prog(dot.hp, dot.hpPerLevel, level, maxLevel, hpFmt, powerScale)} × ${dot.tickCount} hits over ${duration}${refresh}`);
            const nonPhysical = dot.tags.length > 1 || dot.tags[0] !== 'physical';
            if (nonPhysical) lines.push(`Damage type: ${dot.tags.join(', ')}`);
            if (dot.variance > 0) lines.push(`Variance: ±${pct(dot.variance)}`);
            break;
        }
        case 'spawn': {
            const spawn = effect.spawn;
            // The mob catalog serves the display name (§35 C4a) — the client
            // does not re-derive it; before the catalog loads, the raw name.
            lines.push(`Summons ${mobDisplayName(spawn.mobName)} for ${prog(spawn.ttlTicks, spawn.ttlTicksPerLevel, level, maxLevel, ticksToSecs)}`);
            if (spawn.powerPerOwnerLevel > 0) {
                lines.push(`Summon power: +${pct(spawn.powerPerOwnerLevel)} per player level`);
            }
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
            lines.push(`Dash ${prog(effect.dash.distance, effect.dash.distancePerLevel, level, maxLevel)} units in your movement direction`);
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
            lines.push(`Move ${pace} as fast for ${duration}`);
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
    if (effect.radius > 0) {
        generics.radius = `Radius: ${prog(effect.radius, effect.radiusPerLevel, level, maxLevel)}`;
    }
    const targets = targetsLine(effect, level, maxLevel);
    if (targets) {
        generics.targets = targets;
    }

    const color = effectColor(effect.type);
    const rendered: TooltipLine[] = lines.map((text, i) =>
        i === 0 && color ? {text, labelColor: color} : {text});

    // The cost closes the block (plan-numbers-rewrite D5/D7), in the Focus
    // color rather than the effect's own: it is the one line that talks about
    // the player's pool instead of what the effect does to somebody else.
    //
    // What follows the amount is the CHARGE TRIGGER, not the tick cadence — the
    // two are only the same thing for damage and heal auras, which pay on every
    // application. See COST_TRIGGER_TEXT.
    if (isCosted) {
        const amount = prog(effect.costFractionOfMax, effect.costFractionOfMaxPerLevel,
            level, maxLevel, cost.render);
        const trigger = COST_TRIGGER_TEXT[effect.type];
        const when = trigger ? ` ${trigger}` : perTick;
        rendered.push({text: `Costs you: ${amount}${cost.unit}${when}`, labelColor: FOCUS_COLOR});
    }

    return {lines: rendered, generics};
}

const GENERIC_KINDS: GenericKind[] = ['radius', 'targets'];

// powerScale is f(character level), maxHealth is the live Focus pool and
// costFactor the player's cost-reduction multiplier — all passed in rather than
// read here so the whole formatter stays pure and DOM-free (and testable at
// both ends of the curve without a loaded catalog). maxHealth 0 means
// "unknown", and falls the cost lines back to the authored percentage.
export function formatSkillTooltip(def: SkillDefinition, level: number, powerScale: number,
                                   maxHealth: number = 0, costFactor: number = 1): TooltipContent {
    const cost = costRenderer(maxHealth, costFactor);
    // Where the cost line goes follows how the cost is CHARGED (D8): an aura
    // pays per effect on each effect's own cadence, so each block prints its
    // own; a cooldown pays the SUM of its effects once on cast, so it prints
    // once beside the cooldown — three summon effects at 2 % each must not read
    // as "2 %" three times when the cast takes 6 %.
    const perEffectCost = def.category !== 'cooldown';
    const blocks = def.effects.map(effect =>
        effectBlock(effect, level, def.maxLevel, powerScale,
            perEffectCost && scaled(effect.costFractionOfMax, effect.costFractionOfMaxPerLevel, level) > 0,
            cost));

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
            const step = def.maxLevel > 1 ? (castCost(def.maxLevel) - castCost(1)) / (def.maxLevel - 1) : 0;
            // The conversion to points happens on the SUM here, not per effect:
            // a cooldown pays every effect in one deduction, so cooldownCostHP
            // totals the raw fractions and rounds once (sys/skill_cost.go).
            // Rounding per effect would print 3 points for three 0.2 % summons
            // that cost 1.
            lines.push({
                text: `Costs you: ${prog(castCost(1), step, level, def.maxLevel, cost.render)}${cost.unit} per cast`,
                labelColor: FOCUS_COLOR,
            });
        }
    }
    if (def.cooldownTicks > 0) {
        lines.push({text: `Cooldown: ${prog(def.cooldownTicks, def.cooldownTicksPerLevel, level, def.maxLevel, ticksToSecs)}`});
    }
    if (def.castTicks > 0) {
        const interrupt = def.castInterruptedByDamage ? ' (interrupted by damage)' : '';
        lines.push({text: `Cast time: ${prog(def.castTicks, def.castTicksPerLevel, level, def.maxLevel, ticksToSecs)}${interrupt}`});
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

function ensureTooltipElement(): HTMLElement {
    if (!tooltipElement) {
        tooltipElement = document.createElement('div');
        tooltipElement.id = 'skillTooltip';
        tooltipElement.classList.add('hidden');
        document.body.appendChild(tooltipElement);
    }
    return tooltipElement;
}

function hideTooltip() {
    currentAnchor = null;
    tooltipElement?.classList.add('hidden');
}

function showTooltip(anchor: HTMLElement, skillId: number, level: number) {
    const def = skillDefinition(skillId);
    if (!def) {
        // Catalog not loaded (or fetch failed) — names fall back, tooltips
        // simply don't show.
        hideTooltip();
        return;
    }
    currentAnchor = anchor;
    const element = ensureTooltipElement();
    // getLocalPlayerLevel lives in the mob catalog because the nameplate
    // difficulty tint (its first consumer) already owned the mob side; it is
    // live-updated from every snapshot by Player.updateFromBackend.
    const content = formatSkillTooltip(def, level, powerScaleAt(getLocalPlayerLevel()),
        getLocalPlayerMaxHealth(), getLocalPlayerCostFactor());

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
    // would overflow, clamped to the viewport.
    element.classList.remove('hidden');
    const rect = anchor.getBoundingClientRect();
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    let x = rect.right + 8;
    if (x + width > window.innerWidth - 4) {
        x = rect.left - width - 8;
    }
    x = Math.max(4, x);
    let y = Math.min(rect.top, window.innerHeight - height - 4);
    y = Math.max(4, y);
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
}

// attachSkillTooltips wires delegated hover handling onto a list container
// whose entries carry data-skill-id (the spellbook and the three loadout
// slot lists). Hover works on pointerenter semantics via pointerover/out —
// the MouseManager pointerdown gotcha does not affect hover events.
export function attachSkillTooltips(container: HTMLElement, levelOf: (skillId: number) => number) {
    container.addEventListener('pointerover', (e) => {
        const entry = (e.target as HTMLElement).closest('[data-skill-id]') as HTMLElement | null;
        if (!entry || !container.contains(entry)) {
            return;
        }
        const skillId = Number(entry.dataset.skillId);
        if (!skillId) {
            hideTooltip();
            return;
        }
        if (entry === currentAnchor) {
            return; // still on the same entry, moving between its children
        }
        showTooltip(entry, skillId, levelOf(skillId));
    });
    container.addEventListener('pointerout', (e) => {
        const entry = (e.target as HTMLElement).closest('[data-skill-id]');
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
