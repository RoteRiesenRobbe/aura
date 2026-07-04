// Static skill ID → display name map.
// Tech debt: duplicates backend skill registry (backend/pkg/berryhunter/skills/).
// Acceptable at a handful of skills; revisit when the skill list grows.
export const SkillNames: { [id: number]: string } = {
    1: 'Damage Aura',
    2: 'Heal Aura',
    3: 'Wild Aura',
    10: 'Swift',
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
    10: 3,
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
    10: 'passive',
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
