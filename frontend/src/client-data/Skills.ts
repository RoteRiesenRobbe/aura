// Static skill ID → display name map.
// Tech debt: duplicates backend skill registry (backend/pkg/berryhunter/skills/).
// Acceptable at a handful of skills; revisit when the skill list grows.
export const SkillNames: { [id: number]: string } = {
    1: 'Damage Aura',
    2: 'Heal Aura',
    3: 'Wild Aura',
    4: 'Slow',
    5: 'Immolation Aura',
    6: 'Light Aura',
    7: 'Reaper Aura',
    10: 'Swift',
    11: 'Tough',
    20: 'Nova Burst',
    21: 'Heal',
    22: 'Ignite',
    23: 'Summon Totem',
    24: 'Summon Companion',
    25: 'Taunt',
    26: 'Fade',
    27: 'Barrier',
    28: 'Recall',
    29: 'Rejuvenation',
    30: 'Paladin Aura',
    31: 'Recover',
    32: 'Revive',
    33: 'Dash',
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
    6: 3,
    7: 3,
    10: 3,
    11: 3,
    20: 3,
    21: 3,
    22: 3,
    23: 3,
    24: 3,
    25: 3,
    26: 3,
    27: 3,
    28: 1,
    29: 3,
    30: 5,
    31: 1,
    32: 1,
    33: 3,
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
    6: 'aura',
    7: 'aura',
    10: 'passive',
    11: 'passive',
    20: 'cooldown',
    21: 'cooldown',
    22: 'cooldown',
    23: 'cooldown',
    24: 'cooldown',
    25: 'cooldown',
    26: 'cooldown',
    27: 'cooldown',
    28: 'cooldown',
    29: 'aura',
    30: 'aura',
    31: 'cooldown',
    32: 'cooldown',
    33: 'cooldown',
    40: 'aura',
};

// Unknown IDs default to 'aura' — the most common category; keeps a missing
// map entry visible (skill shows up, equips into an aura slot server-checked)
// instead of hiding the skill entirely.
export function skillCategory(id: number): SkillCategory {
    return SkillCategories[id] ?? 'aura';
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

// Skill IDs referenced by the client-side ring-style mapping (Character.setActiveSkill).
export const DAMAGE_AURA_SKILL_ID = 1;
export const HEAL_AURA_SKILL_ID = 2;
// PaladinAura damages and heals at once — it shows both rings (Phase 9).
export const PALADIN_AURA_SKILL_ID = 30;
// FireWard is a support (resist) aura — it shows the heal-style ring (item 11 Phase 2).
export const FIRE_WARD_SKILL_ID = 40;
// Rejuvenation is a support (heal-over-time) aura — heal-style ring (chunk 3).
export const REJUVENATION_AURA_SKILL_ID = 29;
