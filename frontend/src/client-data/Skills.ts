// Static skill ID → display name map.
// Tech debt: duplicates backend skill registry (backend/pkg/aura/skills/).
// Acceptable at a handful of skills; revisit when the skill list grows.
export const SkillNames: { [id: number]: string } = {
    1: 'Damage',
    2: 'Heal',
    3: 'Wild',
    4: 'Slow',
    5: 'Immolate',
    6: 'Light',
    7: 'Reaper',
    10: 'Swift',
    11: 'Tough',
    20: 'Nova Burst',
    21: 'First Aid',
    22: 'Ignite',
    23: 'Summon Totem',
    24: 'Summon Companion',
    25: 'Taunt',
    26: 'Fade',
    27: 'Barrier',
    28: 'Recall',
    29: 'Rejuvenation',
    30: 'Paladin',
    31: 'Recover',
    32: 'Revive',
    33: 'Dash',
    34: 'Haste',
    40: 'Fire Ward',
    41: 'Harvest',
    42: 'Hardy',
    43: 'Thick Hide',
    44: 'Berserker',
    45: 'Long-Range Strike',
    46: 'Torch',
    47: 'Antivenom',
    48: 'Pickaxe',
    49: 'Damage-Burst',
    50: 'Vanguard',
    51: 'Call for Aid',
    52: 'Spearhead',
    53: 'Lifewarden',
    54: 'Shockwave',
    55: 'Warbanner',
    56: 'Hold the Line',
    57: 'Field Medics',
    58: 'Wildfire',
    59: 'Suppression',
    60: 'Keen Eye',
    61: 'Fire Totem',
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
    34: 1,
    40: 3,
    41: 5,
    42: 3,
    43: 3,
    44: 5,
    45: 5,
    46: 3,
    47: 3,
    48: 5,
    49: 3,
    50: 5,
    51: 3,
    52: 5,
    53: 5,
    54: 3,
    55: 5,
    56: 3,
    57: 3,
    58: 5,
    59: 5,
    60: 5,
    61: 3,
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
    34: 'cooldown',
    40: 'aura',
    41: 'aura',
    42: 'passive',
    43: 'passive',
    44: 'aura',
    45: 'aura',
    46: 'passive',
    47: 'passive',
    48: 'aura',
    49: 'cooldown',
    50: 'aura',
    51: 'cooldown',
    52: 'aura',
    53: 'aura',
    54: 'cooldown',
    55: 'aura',
    56: 'cooldown',
    57: 'cooldown',
    58: 'aura',
    59: 'aura',
    60: 'passive',
    61: 'cooldown',
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

// The per-skill ring-style constants that used to live here are gone (triage
// item 7): the server now sends an effect-category bitmask on the wire, so ring
// colour needs no skill-ID table on the client and new auras colour themselves.
