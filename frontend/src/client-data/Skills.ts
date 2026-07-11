// Static skill ID → display name map.
// Tech debt: duplicates backend skill registry (backend/pkg/berryhunter/skills/).
// Acceptable at a handful of skills; revisit when the skill list grows.
export const SkillNames: { [id: number]: string } = {
    1: 'Damage Aura',
    2: 'Heal Aura',
    3: 'Wild Aura',
    4: 'Slow',
    5: 'Immolation Aura',
    10: 'Swift',
    11: 'Tough',
    20: 'Nova Burst',
    21: 'Heal',
    22: 'Ignite',
    23: 'Summon Totem',
    24: 'Summon Companion',
    25: 'Taunt',
    26: 'Fade',
    30: 'Paladin Aura',
    40: 'Fire Ward',
};

export function skillDisplayName(id: number): string {
    return SkillNames[id] ?? `Skill #${id}`;
}

// Static skill ID → maxLevel map for the spellbook level badge ("2/5").
// Same tech debt as SkillNames: duplicates the backend skill registry.
export const SkillMaxLevels: { [id: number]: number } = {
    1: 5,
    2: 5,
    3: 5,
    4: 5,
    5: 5,
    10: 3,
    11: 3,
    20: 3,
    21: 3,
    22: 3,
    23: 3,
    24: 3,
    25: 3,
    26: 3,
    30: 5,
    40: 3,
};

export function skillMaxLevel(id: number): number {
    return SkillMaxLevels[id] ?? 1;
}

// Static skill ID → category map for the spellbook sections and the
// equip-click guards. Same tech debt as SkillNames.
export type SkillCategory = 'aura' | 'passive' | 'cooldown';

export const SkillCategories: { [id: number]: SkillCategory } = {
    1: 'aura',
    2: 'aura',
    3: 'aura',
    4: 'aura',
    5: 'aura',
    10: 'passive',
    11: 'passive',
    20: 'cooldown',
    21: 'cooldown',
    22: 'cooldown',
    23: 'cooldown',
    24: 'cooldown',
    25: 'cooldown',
    26: 'cooldown',
    30: 'aura',
    40: 'aura',
};

// Unknown IDs default to 'aura' — the most common category; keeps a missing
// map entry visible (skill shows up, equips into an aura slot server-checked)
// instead of hiding the skill entirely.
export function skillCategory(id: number): SkillCategory {
    return SkillCategories[id] ?? 'aura';
}

// Skill IDs referenced by the client-side ring-style mapping (Character.setActiveSkill).
export const DAMAGE_AURA_SKILL_ID = 1;
export const HEAL_AURA_SKILL_ID = 2;
// PaladinAura damages and heals at once — it shows both rings (Phase 9).
export const PALADIN_AURA_SKILL_ID = 30;
// FireWard is a support (resist) aura — it shows the heal-style ring (item 11 Phase 2).
export const FIRE_WARD_SKILL_ID = 40;
