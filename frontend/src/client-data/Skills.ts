// Static skill ID → display name map.
// Tech debt: duplicates backend skill registry (backend/pkg/berryhunter/skills/).
// Acceptable at 2 skills; revisit when the skill list grows.
export const SkillNames: { [id: number]: string } = {
    1: 'Damage Aura',
    2: 'Heal Aura',
    3: 'Wild Aura',
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
};

export function skillMaxLevel(id: number): number {
    return SkillMaxLevels[id] ?? 1;
}

// Skill IDs referenced by the client-side ring-style mapping (Character.setActiveSkill).
export const DAMAGE_AURA_SKILL_ID = 1;
export const HEAL_AURA_SKILL_ID = 2;
