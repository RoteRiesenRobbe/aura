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
// The enum file directly, not the AuraApi barrel: the barrel drags the whole
// wire-binding graph (and its flatbuffers dependency) into this catalog
// module, which only needs the three named values.
import {ActivationRejection} from '../../../api/schema/js/aura-api/activation-rejection';

export type SkillCategory = 'aura' | 'passive' | 'cooldown';

// --- catalog wire types (mirror of the Go skills.SkillDefinition JSON) ---

export interface DamageParams {
    hp: number;
    hpPerLevel: number;
    tags: string[];
    // The lock-and-key tag (D4): non-empty means this payload damages ONLY mobs
    // that name the key, and it carries no damage types at all.
    gateKey: string;
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
    // The summon's authored skill loadout as catalog references, attached
    // server-side at boot (skills.SpawnParams.SummonLoadout) — the tooltip's
    // only way to say what the summon does. The levels are a floor: the spawn
    // site raises them to the summon skill's level.
    summonLoadout?: SummonSkillRef[];
}

export interface SummonSkillRef {
    skillId: number;
    level: number;
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
    // Percent-of-max healing per event, mutually exclusive with hp (D14 —
    // Recover is the first content to use it; the server hard-fails on both).
    fractionOfMax: number;
    fractionOfMaxPerLevel: number;
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

// The lifesteal_burst payload (Bloodthirst): for a window, a share of the damage
// the caster's hits deal comes back as healing. The damage-side twin of
// SpeedParams — same scalar-plus-lifetime shape, read at a different site.
export interface LifestealParams {
    fraction: number;
    fractionPerLevel: number;
    durationTicks: number;
    durationTicksPerLevel: number;
}

// The retaliate_slow payload (FrostShield): while equipped, every mob that
// damages the wearer is slowed by fraction for durationTicks. The LifestealParams
// shape read from the other side — same scalar-plus-lifetime, triggered by being
// hit rather than by hitting.
export interface RetaliateParams {
    fraction: number;
    fractionPerLevel: number;
    durationTicks: number;
    durationTicksPerLevel: number;
}

export interface CalmParams {
    durationTicks: number;
    durationTicksPerLevel: number;
}

// The stun payload (Paralyze): how long the target is held — movement AND
// casting. Shaped like CalmParams/CharmParams because a stun has no strength
// axis: an entity is held or it is not.
export interface StunParams {
    durationTicks: number;
    durationTicksPerLevel: number;
}

export interface CharmParams {
    durationTicks: number;
    durationTicksPerLevel: number;
}

export interface SkillEffect {
    type: string;
    // What one application of this effect costs its caster, as a share of the
    // caster's max HP (plan-numbers-rewrite D5/D7). It lives on the EFFECT, not
    // on a payload type, so any effect can be priced; a skill's total cost is
    // the sum of its effects', each charged on its own cadence.
    costFractionOfMax: number;
    costFractionOfMaxPerLevel: number;
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
    lifesteal?: LifestealParams;
    retaliate?: RetaliateParams;
    calm?: CalmParams;
    charm?: CharmParams;
    stun?: StunParams;
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
// ⚑ The SAME definitions, keyed the other way. Everything on the game wire
// refers to a skill by id, but a bloodline unlock is stored and served as the
// registry NAME (plan-ascension.md D17) — one durable string instead of an id
// that only means anything next to a loaded catalog.
const byName = new Map<string, SkillDefinition>();
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
            byName.clear();
            for (const def of payload.skills) {
                const resolved = {
                    ...def,
                    category: CATEGORY_MAP[def.category] ?? 'aura',
                };
                catalog.set(def.id, resolved);
                byName.set(def.name, resolved);
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

/**
 * The human-facing name for a skill named by its REGISTRY NAME rather than its
 * id — which is how a bloodline unlock travels (D17).
 *
 * ⚑ THE FALLBACK IS THE RAW KEY, DELIBERATELY, and it must not become a
 * CamelCase split. `skills.DeriveDisplayName` computes that rule server-side
 * *"so the client never re-implements it"*, and the handful of skills that
 * author an override — "Call for Aid", "Damage-Burst", "Long-Range Strike",
 * "Hold the Line" — are exactly the ones a client-side copy would get wrong.
 * Degrading to the identifier is what `skillDisplayName` above already does.
 */
export function skillDisplayNameFor(name: string): string {
    return byName.get(name)?.displayName ?? name;
}

export function skillMaxLevel(id: number): number {
    return catalog.get(id)?.maxLevel ?? 1;
}

// The D10 escalating skill-point curve (plan-numbers-rewrite), mirroring
// skills.PointCost: the first half of a skill's OWN levels cost 1 point, the
// third quarter 2, the last quarter 3, thresholds rounded up. Level 1 is free
// on unlock, so the first purchased level is 2.
//
// ⚑ Cross-language mirror (L2): the thresholds are authored in
// api/shared-constants.json and both sides assert against it
// (SharedConstants.test.ts here, cmd/aurad/shared_constants_test.go there).
// The server is still the authority — this only decides what the + button
// SHOWS, and an out-of-sync client can at worst mislabel a spend the server
// then refuses.
export const SKILL_POINT_COST = {
    tier1Points: 1,
    tier2Points: 2,
    tier3Points: 3,
    tier2AboveFraction: 0.5,
    tier3AboveFraction: 0.75,
};

export function skillPointCost(maxLevel: number, level: number): number {
    if (level <= 1 || level > maxLevel) {
        return 0;
    }
    if (level <= Math.ceil(SKILL_POINT_COST.tier2AboveFraction * maxLevel)) {
        return SKILL_POINT_COST.tier1Points;
    }
    if (level <= Math.ceil(SKILL_POINT_COST.tier3AboveFraction * maxLevel)) {
        return SKILL_POINT_COST.tier2Points;
    }
    return SKILL_POINT_COST.tier3Points;
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

// The local player's max Focus pool, mirrored here by Player.updateFromBackend
// — the setLocalPlayerLevel precedent, kept in this module because the only
// reader is the skill tooltip.
//
// ⚑ It is what lets a cost be shown as the number it actually is (R1/F6). The
// server prices a cost as a fraction of the max pool and charges it through
// vitals.HP, so the fraction alone is not what the player pays: it is floored
// at 1 point while the pool is small (0.26 % of a 100-point pool is charged as
// 1, and 12 of the 20 costed aura effects are floored somewhere in character
// levels 1–12) and it is reduced by the cost-reduction passive below. Both
// corrections are implicit once the tooltip shows absolute points.
//
// Defaults to 0, which reads as "not known yet" and falls the cost lines back
// to the authored percentage: a tooltip opened before the first snapshot is
// merely imprecise, never wrong.
let localPlayerMaxHealth = 0;

export function setLocalPlayerMaxHealth(maxHealth: number) {
    localPlayerMaxHealth = maxHealth;
}

export function getLocalPlayerMaxHealth(): number {
    return localPlayerMaxHealth;
}

// The cost-reduction multiplier the server applies to every cost this player
// pays (GameState.cost_factor, R1/F2): 1 = no reduction, 0.8 = pays 80 %.
// Mirrored by Backend from every snapshot.
//
// ⚑ Before R1 the client had no knowledge of this whatsoever — the passive
// worked and was invisible, which is exactly what the PO reported after the
// feel pass. Neutral 1 is both the wire default and the pre-snapshot value.
let localPlayerCostFactor = 1;

export function setLocalPlayerCostFactor(costFactor: number) {
    localPlayerCostFactor = costFactor;
}

export function getLocalPlayerCostFactor(): number {
    return localPlayerCostFactor;
}

// The outgoing-damage multiplier the server applies to every point of damage
// this player deals (GameState.damage_factor, round-7 item 5): 1 = no bonus,
// 1.1 = Strong at +10 %. The costFactor mirror's twin — before it, Strong
// worked and was invisible, the exact defect R1 fixed for Discipline.
let localPlayerDamageFactor = 1;

export function setLocalPlayerDamageFactor(damageFactor: number) {
    localPlayerDamageFactor = damageFactor;
}

export function getLocalPlayerDamageFactor(): number {
    return localPlayerDamageFactor;
}

// roundHP mirrors the server's vitals.HP: round half up to a whole point, and
// never round a positive amount away to nothing. Every absolute Focus number
// the UI shows goes through it, so what the tooltip promises is what the health
// bar loses.
//
// ⚑ This is live server arithmetic restated in a second language — the drift
// class §35 spent a chunk closing — so it is pinned against
// api/shared-constants.json by BOTH sides (SharedConstants.test.ts and
// backend/cmd/aurad/shared_constants_test.go).
export function roundHP(amount: number): number {
    if (amount <= 0) {
        return 0;
    }
    return Math.max(1, Math.trunc(amount + 0.5));
}

// Unknown IDs default to 'aura' — the most common category; keeps a skill
// with a missing catalog entry visible (shows up, equips into an aura slot
// server-checked) instead of hiding it entirely.
export function skillCategory(id: number): SkillCategory {
    return catalog.get(id)?.category ?? 'aura';
}

// Static rejection-reason → feedback text map (skill-vocab chunk 4, §3.5):
// keyed by the wire ActivationRejection enum (§35 C4b — server.fbs is the
// single authored home, values pinned there); rendered as floating text over
// the own character. Skills.test.ts asserts every enum member has an entry.
export const ActivationRejectionMessages: { [reason: number]: string } = {
    [ActivationRejection.NoAnchor]: 'No campfire bound',
    [ActivationRejection.NoTarget]: 'No valid target',
    [ActivationRejection.NotEnoughResource]: 'Not enough Focus',
    [ActivationRejection.NoCharges]: 'No camp charges — rest at a campfire',
};

// How many Camp charges a character of this level may hold (plan-downtime.md
// D9). PINNED to api/shared-constants.json's campChargeCap block, which the Go
// side reads too — the cap is deliberately NOT a wire field, so both languages
// compute it and SharedConstants.test.ts holds them together.
const CAMP_CHARGE_CAP_BASE = 1;      // [PLACEHOLDER]
const CAMP_CHARGE_CAP_PER_LEVELS = 7; // [PLACEHOLDER]

export function campChargeCap(level: number): number {
    return CAMP_CHARGE_CAP_BASE + Math.floor(Math.max(level, 0) / CAMP_CHARGE_CAP_PER_LEVELS);
}

export function activationRejectionMessage(reason: number): string {
    return ActivationRejectionMessages[reason] ?? 'Cannot use that now';
}
