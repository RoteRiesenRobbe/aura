// Ability hover tooltips (plan-ui-polish chunk 1): stats-only condensed
// info, auto-generated from the skill catalog so it stays correct through
// every balance retune. PO rulings 2026-07-21: FULL detail — every authored
// mechanic gets a line, unauthored fields show nothing — and the tooltip is
// anchored to the hovered element (not cursor-following).
//
// Values render at the player's current skill level with a next-level
// preview ("14.7 → 16.8") while below max level, answering the
// spend-a-point decision directly.

import {DamageParams, SkillDefinition, SkillEffect, skillDefinition} from '../../../../client-data/Skills';
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

function pct(fraction: number): string {
    return fmt(fraction * 100) + '%';
}

function ticksToSecs(ticks: number): string {
    return fmt(ticks * TICK_MS / 1000) + 's';
}

// prog renders a level-scaled value as "current → next" while a next level
// exists and actually changes it, else just the current value.
function prog(base: number, perLevel: number, level: number, maxLevel: number,
              render: (n: number) => string = fmt): string {
    const current = render(scaled(base, perLevel, level));
    if (perLevel !== 0 && level < maxLevel) {
        const next = render(scaled(base, perLevel, level + 1));
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
    maxHealth: 'Max health',
    damageReduction: 'Damage reduction',
    critChance: 'Crit chance',
    damageDealt: 'All damage',
};

const SELECTOR_LABELS: { [selector: string]: string } = {
    nearest: 'nearest',
    lowest_health: 'most wounded',
};

// Aura-form effects with a real tick cadence; every other type's
// tickInterval is just the parse default and means nothing.
const TICKING_TYPES = new Set([
    'damage_aura', 'heal_aura', 'dot_aura', 'hot_aura',
    'slow_aura', 'resist_aura', 'shield_aura',
]);

// spacedName splits CamelCase for incidental names (summoned mobs) — skill
// names come pre-derived from the server.
function spacedName(name: string): string {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
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

function damageExtraLines(damage: DamageParams, level: number, maxLevel: number, lines: string[]) {
    const nonPhysical = damage.tags.length > 1 || damage.tags[0] !== 'physical';
    if (nonPhysical && !damage.gated) {
        lines.push(`Damage type: ${damage.tags.join(', ')}`);
    }
    if (damage.gated) {
        lines.push(`Only affects targets vulnerable to: ${damage.tags.join(', ')}`);
    }
    if (damage.variance > 0) {
        lines.push(`Variance: ±${pct(damage.variance)}`);
    }
    if (damage.critChance > 0 || damage.critChancePerLevel > 0) {
        const factor = damage.critFactor > 0 ? ` (×${fmt(damage.critFactor)})` : '';
        lines.push(`Crit: ${prog(damage.critChance, damage.critChancePerLevel, level, maxLevel, pct)}${factor}`);
    }
    if (damage.executeBonusFactor > 0) {
        lines.push(`Execute: ×${fmt(damage.executeBonusFactor)} below ${pct(damage.executeBelowFraction)} HP`);
    }
    if (damage.berserkerMaxBonusFactor > 0) {
        lines.push(`Berserker: up to +${pct(damage.berserkerMaxBonusFactor)} damage at low HP`);
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

function effectBlock(effect: SkillEffect, level: number, maxLevel: number): EffectBlock {
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
            lines.push(`Damage: ${prog(effect.damage.hp, effect.damage.hpPerLevel, level, maxLevel)}${perTick}`);
            damageExtraLines(effect.damage, level, maxLevel, lines);
            break;
        case 'heal_aura': {
            const heal = effect.heal;
            if (heal.fractionOfMax > 0) {
                lines.push(`Heal: ${prog(heal.fractionOfMax, heal.fractionOfMaxPerLevel, level, maxLevel, pct)} of max HP${perTick}`);
            } else {
                lines.push(`Heal: ${prog(heal.hp, heal.hpPerLevel, level, maxLevel)}${perTick}`);
            }
            if (heal.variance > 0) lines.push(`Variance: ±${pct(heal.variance)}`);
            const renderCost = (n: number) => fmt(Math.max(0, n));
            if (renderCost(scaled(heal.selfDamageHp, heal.selfDamageHpPerLevel, level)) !== '0') {
                lines.push(`Costs you: ${prog(heal.selfDamageHp, heal.selfDamageHpPerLevel, level, maxLevel, renderCost)} HP per tick`);
            }
            break;
        }
        case 'self_heal': {
            const selfHeal = effect.selfHeal;
            if (selfHeal.fractionOfMax > 0) {
                lines.push(`Heal self: ${prog(selfHeal.fractionOfMax, selfHeal.fractionOfMaxPerLevel, level, maxLevel, pct)} of max HP`);
            } else {
                lines.push(`Heal self: ${prog(selfHeal.healHp, selfHeal.healHpPerLevel, level, maxLevel)} HP`);
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
            if (resist.targetsSelf) lines.push('Also applies to you');
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
            lines.push(`Damage over time: ${prog(dot.hp, dot.hpPerLevel, level, maxLevel)} × ${dot.tickCount} hits over ${duration}${refresh}`);
            const nonPhysical = dot.tags.length > 1 || dot.tags[0] !== 'physical';
            if (nonPhysical) lines.push(`Damage type: ${dot.tags.join(', ')}`);
            if (dot.variance > 0) lines.push(`Variance: ±${pct(dot.variance)}`);
            break;
        }
        case 'spawn': {
            const spawn = effect.spawn;
            lines.push(`Summons ${spacedName(spawn.mobName)} for ${prog(spawn.ttlTicks, spawn.ttlTicksPerLevel, level, maxLevel, ticksToSecs)}`);
            if (spawn.maxHealthPerOwnerLevel > 0) {
                lines.push(`Summon HP: +${fmt(spawn.maxHealthPerOwnerLevel)} per player level`);
            }
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
            lines.push('Emits light');
            break;
        case 'shield_aura':
        case 'instant_shield': {
            const shield = effect.shield;
            let line = `Shield: ${prog(shield.hp, shield.hpPerLevel, level, maxLevel)} HP`;
            if (effect.type === 'instant_shield') {
                line += ` for ${ticksToSecs(shield.durationTicks)}`;
            }
            lines.push(line + refresh);
            if (shield.targetsSelf) lines.push('Also shields you');
            break;
        }
        case 'recall':
            lines.push('Returns you to your bound campfire');
            break;
        case 'hot_aura':
        case 'instant_hot': {
            const hot = effect.hot;
            const duration = ticksToSecs(hot.tickCount * hot.interval);
            lines.push(`Heal over time: ${prog(hot.hp, hot.hpPerLevel, level, maxLevel)} × ${hot.tickCount} over ${duration}${refresh}`);
            if (hot.targetsSelf) lines.push('Also heals you');
            break;
        }
        case 'revive':
            lines.push(`Revives the nearest fallen player at ${pct(effect.revive.healthFraction)} HP`);
            break;
        case 'dash':
            lines.push(`Dash ${prog(effect.dash.distance, effect.dash.distancePerLevel, level, maxLevel)} units in your movement direction`);
            break;
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
    return {
        lines: lines.map((text, i) => i === 0 && color ? {text, labelColor: color} : {text}),
        generics,
    };
}

const GENERIC_KINDS: GenericKind[] = ['radius', 'targets'];

export function formatSkillTooltip(def: SkillDefinition, level: number): TooltipContent {
    const blocks = def.effects.map(effect => effectBlock(effect, level, def.maxLevel));

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
    const content = formatSkillTooltip(def, level);

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
