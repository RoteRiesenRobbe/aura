// Static skill ID → display name map.
// Tech debt: duplicates backend skill registry (backend/pkg/berryhunter/skills/).
// Acceptable at 2 skills; revisit when the skill list grows.
export const SkillNames: { [id: number]: string } = {
    1: 'Damage Aura',
    2: 'Heal Aura',
};

export function skillDisplayName(id: number): string {
    return SkillNames[id] ?? `Skill #${id}`;
}
