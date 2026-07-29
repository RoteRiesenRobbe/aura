// Skill catalog (plan-ui-polish chunk 1): metadata for every skill — display
// name, category, max level, and the full effect numbers for tooltips —
// fetched once at startup from the aurad HTTP sidecar (GET /skills). The
// server serves its PARSED registry, so this stays correct through every
// balance retune and `-content` iteration. This replaces the three
// hand-maintained maps that used to live here (name/maxLevel/category).
//
// Until the fetch lands (or if it fails) the accessors degrade to fallbacks:
// names render as "Skill #<id>", tooltips simply don't show. The game never
// blocks on the catalog.

import {catalogUrl} from '../features/backend/logic/Urls';

export type SkillCategory = 'aura' | 'passive' | 'cooldown';

// --- catalog wire types (mirror of the Go skills.SkillDefinition JSON) ---

export interface DamageParams {
    hp: number;
    hpPerLevel: number;
    tags: string[];
    gated: boolean;
    variance: number;
    hitStyle: string;
    structureDamageFraction: number;
    executeBelowFraction: number;
    executeBonusFactor: number;
    berserkerMaxBonusFactor: number;
    critChance: number;
    critChancePerLevel: number;
    critFactor: number;
    lifestealFraction: number;
}

export interface HealParams {
    hp: number;
    hpPerLevel: number;
    selfDamageHp: number;
    selfDamageHpPerLevel: number;
    fractionOfMax: number;
    fractionOfMaxPerLevel: number;
    variance: number;
}

export interface SelfHealParams {
    healHp: number;
    healHpPerLevel: number;
    fractionOfMax: number;
    fractionOfMaxPerLevel: number;
    variance: number;
}

export interface SlowParams {
    fraction: number;
    fractionPerLevel: number;
}

export interface ResistParams {
    tags: string[];
    factor: number;
    factorPerLevel: number;
    targetsSelf: boolean;
}

export interface StatParams {
    name: string;
    bonus: number;
    bonusPerLevel: number;
}

export interface DotParams {
    hp: number;
    hpPerLevel: number;
    tags: string[];
    variance: number;
    tickCount: number;
    interval: number;
}

export interface SpawnParams {
    mobName: string;
    ttlTicks: number;
    ttlTicksPerLevel: number;
    // No maxHealthPerOwnerLevel: entity-model chunk 1b made a summon's HP fully
    // derived from the OWNER's live level, and retired the key server-side — the
    // loader now hard-fails on it, so it can never appear in this payload again.
    powerPerOwnerLevel: number;
}

export interface ThreatParams {
    margin: number;
}

export interface ShieldParams {
    hp: number;
    hpPerLevel: number;
    durationTicks: number;
    targetsSelf: boolean;
}

export interface HotParams {
    hp: number;
    hpPerLevel: number;
    variance: number;
    tickCount: number;
    interval: number;
    targetsSelf: boolean;
}

export interface ReviveParams {
    healthFraction: number;
}

export interface DashParams {
    distance: number;
    distancePerLevel: number;
}

export interface TickRateParams {
    factor: number;
    durationTicks: number;
}

export interface SpeedParams {
    factor: number;
    factorPerLevel: number;
    durationTicks: number;
    durationTicksPerLevel: number;
}

export interface CalmParams {
    durationTicks: number;
    durationTicksPerLevel: number;
}

export interface CharmParams {
    durationTicks: number;
    durationTicksPerLevel: number;
}

export interface SkillEffect {
    type: string;
    radius: number;
    radiusPerLevel: number;
    tickInterval: number;
    tickIntervalPerLevel: number;
    selector: string;
    maxTargets: number;
    maxTargetsPerLevel: number;
    targetsEnemies: boolean;
    targetsAllies: boolean;
    targetsStructures: boolean;
    damage?: DamageParams;
    heal?: HealParams;
    selfHeal?: SelfHealParams;
    slow?: SlowParams;
    resist?: ResistParams;
    stat?: StatParams;
    dot?: DotParams;
    spawn?: SpawnParams;
    threat?: ThreatParams;
    shield?: ShieldParams;
    hot?: HotParams;
    revive?: ReviveParams;
    dash?: DashParams;
    tickRate?: TickRateParams;
    speed?: SpeedParams;
    calm?: CalmParams;
    charm?: CharmParams;
}

export interface SkillDefinition {
    id: number;
    name: string;
    displayName: string;
    category: SkillCategory;
    maxLevel: number;
    legacy: boolean;
    cooldownTicks: number;
    cooldownTicksPerLevel: number;
    castTicks: number;
    castTicksPerLevel: number;
    castInterruptedByDamage: boolean;

    // targetFactions is the skill's faction allowlist as DISPLAY NAMES, in
    // authoring order — absent on every unscoped skill (the server omits it).
    // The catalog also carries the resolved bitmask, but that is server-side
    // runtime state: the bits depend on faction registry load order and there
    // is no faction catalog here to decode them against. Names travel.
    targetFactions?: string[];

    effects: SkillEffect[];
}

// LevelCurve mirrors the Go curve.Curve served alongside the definitions
// (skills.Catalog). Growth 0 means "no curve known" and is neutral — the same
// un-configured-curve convention curve.F uses server-side.
export interface LevelCurve {
    growth: number;
    maxLevel: number;
}

// --- catalog state + fetch ---

const catalog = new Map<number, SkillDefinition>();
let levelCurve: LevelCurve = {growth: 0, maxLevel: 0};

// The server's category vocabulary → the client's (the HUD panels and equip
// guards say 'aura').
const CATEGORY_MAP: { [server: string]: SkillCategory } = {
    active_aura: 'aura',
    passive: 'passive',
    cooldown: 'cooldown',
};

export function loadSkillCatalog(): Promise<void> {
    return fetch(catalogUrl('skills'))
        .then(response => {
            if (!response.ok) {
                throw new Error(`GET /skills returned ${response.status}`);
            }
            return response.json();
        })
        .then((payload: { curve?: LevelCurve, skills: any[] }) => {
            levelCurve = payload.curve ?? {growth: 0, maxLevel: 0};
            catalog.clear();
            for (const def of payload.skills) {
                catalog.set(def.id, {
                    ...def,
                    category: CATEGORY_MAP[def.category] ?? 'aura',
                });
            }
        })
        .catch(error => {
            console.warn('Skill catalog unavailable — falling back to placeholder names', error);
        });
}

// Fetched once at startup; the accessors below degrade gracefully until then.
loadSkillCatalog();

// --- accessors (same signatures as the retired hand-sync maps) ---

export function skillDefinition(id: number): SkillDefinition | undefined {
    return catalog.get(id);
}

export function skillDisplayName(id: number): string {
    return catalog.get(id)?.displayName ?? `Skill #${id}`;
}

export function skillMaxLevel(id: number): number {
    return catalog.get(id)?.maxLevel ?? 1;
}

// powerScaleAt is f(character level) — the number-inflation multiplier the
// server applies to every HP-valued output (casterPowerScale, GDD §5).
// Mirrors curve.F exactly, including both of its degenerate cases: an
// un-configured curve is neutral, and levels below 1 clamp to the baseline.
//
// Neutral-on-failure is deliberate: if the catalog fetch never lands, the
// tooltip reproduces exactly its pre-round-4 behaviour (authored values, no
// curve) rather than inventing a factor or refusing to render.
export function powerScaleAt(characterLevel: number): number {
    if (levelCurve.growth <= 0) {
        return 1;
    }
    return Math.pow(levelCurve.growth, Math.max(1, characterLevel) - 1);
}

// Unknown IDs default to 'aura' — the most common category; keeps a skill
// with a missing catalog entry visible (shows up, equips into an aura slot
// server-checked) instead of hiding it entirely.
export function skillCategory(id: number): SkillCategory {
    return catalog.get(id)?.category ?? 'aura';
}

// Static rejection-reason → feedback text map (skill-vocab chunk 4, §3.5):
// keyed by the wire activation_rejected_reason; rendered as floating text
// over the own character. Hand-synced with model.ActivationRejection.
export const ActivationRejectionMessages: { [reason: number]: string } = {
    1: 'No campfire bound',
    2: 'No valid target',
};

export function activationRejectionMessage(reason: number): string {
    return ActivationRejectionMessages[reason] ?? 'Cannot use that now';
}
