// How the Skills tab PRESENTS each authorable key: label, unit, which control
// draws it, and whether it sits in the card's shared or payload group. Keyed
// by key NAME only (plan-content-editor.md §B4.2): WHICH keys a type accepts
// is never decided here - that comes from api/skill-vocabulary.json, which Go
// generates. This file decides only how a key looks once the fixture says it
// exists.
//
// ⚑ Loaded by the browser as a plain ES module (app.js) AND by smoke.mjs under
// node, so it must import nothing from `node:` - the same constraint that
// keeps validate.mjs out of the smoke script.
//
// smoke.mjs asserts, both ways, that this table and the fixture describe the
// same key set: a key the fixture knows but this table does not reddens the
// smoke (a new Go key reaches the form, but gets a conscious presentation
// entry rather than a guessed one), and an entry naming a key the fixture no
// longer carries reddens it too (a Go rename cannot leave a stale row here).
// A key with no entry STILL renders in the tab, as a plain input, so nothing
// is ever silently unauthorable (§B3); the assert exists so that state never
// ships.
//
// Entry shape:
//   control  'number' | 'bool' | 'text' | 'textarea' | 'select' | 'multi'
//            | 'mob' | 'icon' | 'effects'   (required on every entry)
//   unit     'ticks' | 'units' | 'hp' | 'fraction' | 'factor' | 'count'
//            (numbers only; 'ticks' renders seconds beside the value, D5)
//   options  for select/multi: the NAME of the vocabulary list to offer
//            ('selectors', 'statNames', 'gateKeys', 'categories',
//            'damageTypes', 'resistTags', 'factions')
//   group    'shared' | 'payload' (effect keys only; §B4.3's two groups)
//   section  'identity' | 'category' (TOP-LEVEL keys only; which block of the
//            skill form the key is drawn in, §B4.3 items 1 and 2). Absent =
//            'identity'. smoke.mjs (d) refuses any other value. This is
//            PLACEMENT, not a field list: a key with no entry still renders,
//            under Identity, so L1 holds.
//   hidden   true ⇒ never rendered, preserved on round trip (§B4.8)
//   label    override for the derived camelCase → words label
//   hint     one line under the field
//
// A key ending in "PerLevel" is rendered beside its base key and needs no
// entry of its own beyond `control` (its unit is the base's).

const SHARED = 'shared';
const PAYLOAD = 'payload';

// The 15 top-level keys (skillDefinition's json tags, fixture `topLevelKeys`).
export const SKILL_PRESENTATION = {
  id: { control: 'number', unit: 'count', hint: 'Persisted in every spellbook row; never changes once shipped (C5 will lock it).' },
  name: { control: 'text', hint: 'The reference key everywhere: mob skills[]/unlocks[], milestones, NPC grants, recipes, the SKILL cheat.' },
  displayName: { control: 'text', hint: 'Optional; blank derives one from the name (CamelCase → spaces).' },
  icon: { control: 'icon', hint: 'Must be a vendored glyph (frontend/src/client-data/icons/vendor); SkillIcons.test.ts reddens otherwise.' },
  description: { control: 'textarea', hint: 'Optional tooltip flavor line.' },
  category: { control: 'select', options: 'categories' },
  maxLevel: { control: 'number', unit: 'count', hint: 'Never decreases on a shipped skill (persisted levels may exceed a lowered cap).' },
  legacy: { control: 'bool', hidden: true },
  cooldownTicks: { control: 'number', unit: 'ticks', section: 'category' },
  cooldownTicksPerLevel: { control: 'number', section: 'category' },
  castTicks: { control: 'number', unit: 'ticks', section: 'category', hint: 'Cost and cooldown are consumed at cast completion; moving cancels for free.' },
  castTicksPerLevel: { control: 'number', section: 'category' },
  castInterruptedByDamage: { control: 'bool', section: 'category', hint: 'Only legal when castTicks > 0 (loader rule).' },
  targetFactions: { control: 'multi', options: 'factions', section: 'category', hint: 'Faction allowlist; MANDATORY when any effect is calm or charm, and then it gates EVERY effect of the skill.' },
  effects: { control: 'effects' },
};

// The cost pair, legal on every effect type (fixture `costKeys`).
export const COST_PRESENTATION = {
  costFractionOfMax: { control: 'number', unit: 'fraction', group: SHARED, hint: 'Share of the max pool charged per application; [0, 1). GOD zeroes it.' },
  costFractionOfMaxPerLevel: { control: 'number', group: SHARED },
};

// The 81 effect keys (effectDef's json tags, fixture `effectKeys`).
export const EFFECT_PRESENTATION = {
  // --- the shared group (§B4.3): geometry, cadence, cap, target flags ---
  radius: { control: 'number', unit: 'units', group: SHARED, hint: 'World units; must be > 0 on every geometry type.' },
  radiusPerLevel: { control: 'number', group: SHARED },
  tickInterval: { control: 'number', unit: 'ticks', group: SHARED, hint: 'Blank = every tick (1). An authored 0 is refused.' },
  tickIntervalPerLevel: { control: 'number', group: SHARED },
  selector: { control: 'select', options: 'selectors', group: SHARED, hint: 'Which of the in-range candidates get the effect; blank = the loader default.' },
  maxTargets: { control: 'number', unit: 'count', group: SHARED, hint: 'Blank/0 = uncapped.' },
  maxTargetsPerLevel: { control: 'number', group: SHARED },
  targetsEnemies: { control: 'bool', group: SHARED },
  targetsAllies: { control: 'bool', group: SHARED },
  targetsSelf: { control: 'bool', group: SHARED },

  // --- damage payload ---
  damageHP: { control: 'number', unit: 'hp', group: PAYLOAD, label: 'Damage HP' },
  damageHPPerLevel: { control: 'number', group: PAYLOAD },
  damageTags: { control: 'multi', options: 'damageTypes', group: PAYLOAD, hint: 'Mutually exclusive with gateKey.' },
  gateKey: { control: 'select', options: 'gateKeys', group: PAYLOAD, hint: 'Chore-only damage: hits only mobs authoring the same gate key. Mutually exclusive with damageTags.' },
  variance: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: '± share applied per hit; [0, 1).' },
  hitStyle: { control: 'select', group: PAYLOAD, hidden: true },
  targetsStructures: { control: 'bool', group: PAYLOAD },
  structureDamageFraction: { control: 'number', unit: 'fraction', group: PAYLOAD },
  executeBelowFraction: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Authored together with executeBonusFactor or not at all.' },
  executeBonusFactor: { control: 'number', unit: 'factor', group: PAYLOAD },
  berserkerMaxBonusFactor: { control: 'number', unit: 'factor', group: PAYLOAD, hint: 'Bonus at 0 HP, scaling with the caster\'s missing health.' },
  critChance: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Adds to the character\'s own crit chance.' },
  critChancePerLevel: { control: 'number', group: PAYLOAD },
  critFactor: { control: 'number', unit: 'factor', group: PAYLOAD },
  lifestealFraction: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Share of damage dealt returned as healing.' },
  lifestealFractionPerLevel: { control: 'number', group: PAYLOAD },
  lifestealDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },
  lifestealDurationTicksPerLevel: { control: 'number', group: PAYLOAD },

  // --- dot / hot ---
  dotTicks: { control: 'number', unit: 'count', group: PAYLOAD, hint: 'Damage events per application.' },
  dotTickInterval: { control: 'number', unit: 'ticks', group: PAYLOAD, hint: 'Game ticks between events.' },
  hotTicks: { control: 'number', unit: 'count', group: PAYLOAD, hint: 'Heal events per application.' },
  hotTickInterval: { control: 'number', unit: 'ticks', group: PAYLOAD, hint: 'Game ticks between events.' },

  // --- heal payload ---
  healHP: { control: 'number', unit: 'hp', group: PAYLOAD, label: 'Heal HP', hint: 'Flat; mutually exclusive with healFractionOfMax.' },
  healHPPerLevel: { control: 'number', group: PAYLOAD },
  healFractionOfMax: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Share of the TARGET\'s max pool; mutually exclusive with healHP.' },
  healFractionOfMaxPerLevel: { control: 'number', group: PAYLOAD },

  // --- resist payload ---
  resistTags: { control: 'multi', options: 'resistTags', group: PAYLOAD, hint: 'The wildcard * must stand alone.' },
  resistFactor: { control: 'number', unit: 'factor', group: PAYLOAD, hint: 'Incoming-damage multiplier: < 1 protects, > 1 is a vulnerability, 0 is immunity.' },
  resistFactorPerLevel: { control: 'number', group: PAYLOAD },
  resistDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },
  buffLifetimeMatchesInterval: { control: 'bool', group: PAYLOAD, hint: 'Drops the +1 tick of buff lifetime so every re-application is charged (Aegis; plan-effect-types C3 D7).' },

  // --- shield ---
  shieldHP: { control: 'number', unit: 'hp', group: PAYLOAD, label: 'Shield HP' },
  shieldHPPerLevel: { control: 'number', group: PAYLOAD },
  shieldDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },

  // --- slow / speed / tick rate ---
  slowFraction: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Movement speed removed; [0, 1).' },
  slowFractionPerLevel: { control: 'number', group: PAYLOAD },
  slowDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },
  slowDurationTicksPerLevel: { control: 'number', group: PAYLOAD },
  speedFactor: { control: 'number', unit: 'factor', group: PAYLOAD, hint: 'Movement multiplier: > 1 sprints, < 1 drags.' },
  speedFactorPerLevel: { control: 'number', group: PAYLOAD },
  speedDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },
  speedDurationTicksPerLevel: { control: 'number', group: PAYLOAD },
  tickRateFactor: { control: 'number', unit: 'factor', group: PAYLOAD, hint: 'Cadence multiplier: < 1 haste, > 1 slow. ⚑ Guardrail-frozen for new player content in both directions (see OmniStrike\'s note).' },
  tickRateDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },

  // --- retaliate ---
  reflectFraction: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Share of a received hit thrown back. ⚑ Flat by the C2 raw-damage ruling; whether it should scale is an open PO call (content-passives.md).' },
  reflectFractionPerLevel: { control: 'number', group: PAYLOAD },
  reflectDurationTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },
  reflectDurationTicksPerLevel: { control: 'number', group: PAYLOAD },

  // --- CC ---
  stunTicks: { control: 'number', unit: 'ticks', group: PAYLOAD },
  stunTicksPerLevel: { control: 'number', group: PAYLOAD },
  calmTicks: { control: 'number', unit: 'ticks', group: PAYLOAD, hint: 'Ticks out of combat; breaks on any damage.' },
  calmTicksPerLevel: { control: 'number', group: PAYLOAD },
  charmTicks: { control: 'number', unit: 'ticks', group: PAYLOAD, hint: 'Ticks fighting for the charmer; ends by turning on you.' },
  charmTicksPerLevel: { control: 'number', group: PAYLOAD },
  threatMargin: { control: 'number', unit: 'hp', group: PAYLOAD, hint: 'Head start above the current top of the threat table.' },

  // --- stat passives ---
  stat: { control: 'select', options: 'statNames', group: PAYLOAD },
  statBonus: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Additive share of the stat (0.04 = +4 %).' },
  statBonusPerLevel: { control: 'number', group: PAYLOAD },

  // --- spawn / projectile ---
  spawnMob: { control: 'mob', group: PAYLOAD, hint: 'A mob name; followers and totems are picked, never authored inline (D2).' },
  ttlTicks: { control: 'number', unit: 'ticks', group: PAYLOAD, label: 'TTL ticks' },
  ttlTicksPerLevel: { control: 'number', group: PAYLOAD, label: 'TTL per level' },
  powerPerOwnerLevel: { control: 'number', unit: 'fraction', group: PAYLOAD, hint: 'Damage multiplier the summon gains per OWNER level.' },
  requiresAnchor: { control: 'bool', group: PAYLOAD },
  forwardUnits: { control: 'number', unit: 'units', group: PAYLOAD, hidden: true },
  armTicks: { control: 'number', unit: 'ticks', group: PAYLOAD, hidden: true },

  // --- the rest ---
  reviveHealthFraction: { control: 'number', unit: 'fraction', group: PAYLOAD },
  dashDistance: { control: 'number', unit: 'units', group: PAYLOAD },
  dashDistancePerLevel: { control: 'number', group: PAYLOAD },
};

// Notes shown on a card by effect TYPE (§B4.8's "in, with a hint" rows, and
// the one parked type). Keyed by type name; smoke.mjs asserts every key here
// is a live effect type, but not that every type has a note.
export const EFFECT_TYPE_NOTES = {
  projectile: { parked: true, text: 'PARKED prototype (plan-prototype-projectile.md, PO 2026-08-20): its second in-game pass decides P2/P3 or delete. Hidden from the type picker; this skill opens read-only. forwardUnits / armTicks are not rendered, and are preserved untouched.' },
  spawn_at_anchor: { text: 'Shipped (the portal pair), but its COST is an open PO call and it stays cheat-only until an unlock path is placed (plan-portal-spells.md §10 item 13).' },
  recall: { text: 'No authorable fields: the destination is the bound campfire, the cast refuses when none is bound.' },
  tick_rate: { text: '⚑ Guardrail-frozen for NEW player content in both directions (cmd/aurad content guards); Haste is the one shipped user.' },
};

// Sidebar and header labels for the fixture's categories, in the plan's
// display order (Auras · Cooldowns · Passives). Keyed by the authored
// category name.
export const CATEGORY_LABELS = { active_aura: 'Auras', cooldown: 'Cooldowns', passive: 'Passives' };

// The effect type a fresh effect card starts on, by skill category (§B4.5).
// Lives here rather than in app.js so C4's "+ New skill" flow reads the same
// map, and smoke.mjs (d) asserts every key is a live category and every value
// a live effect type.
export const EFFECT_TYPE_DEFAULTS = {
  active_aura: 'damage_aura',
  cooldown: 'instant_damage',
  passive: 'stat_multiplier',
};

// The effect types the picker never offers (§B4.8). A skill that already
// authors one still opens, read-only, with the type's note as a banner.
export const HIDDEN_EFFECT_TYPES = ['projectile'];

// Level-scaling resolution, the same formula as skills/scaling.go:
// base + (level-1) × perLevel. Both halves default to 0 when unauthored, so
// an unauthored pair resolves to 0 at every level rather than NaN.
export function resolveAt(base, perLevel, level) {
  return (base ?? 0) + (level - 1) * (perLevel ?? 0);
}

// The scaling pairs a key list contains: every key K whose `${K}PerLevel`
// sibling is in the same list. Order follows the list (the fixture keeps
// mergeKeys order on purpose).
export function scalingPairs(keys) {
  const set = new Set(keys);
  return keys.filter((k) => set.has(k + 'PerLevel')).map((k) => ({ base: k, perLevel: k + 'PerLevel' }));
}

// Every `*PerLevel` key in a list whose base is NOT in the same list - the
// structural claim the preview relies on. Empty for a sane vocabulary.
export function orphanPerLevelKeys(keys) {
  const set = new Set(keys);
  return keys.filter((k) => k.endsWith('PerLevel') && !set.has(k.slice(0, -'PerLevel'.length)));
}

// The presentation entry for a key, whichever table holds it, or undefined.
export function presentationFor(key) {
  return SKILL_PRESENTATION[key] ?? COST_PRESENTATION[key] ?? EFFECT_PRESENTATION[key];
}

// The derived label: camelCase → words, capitalised, with the table's
// override winning. "damageHP" → "Damage HP" comes from the override; the
// derivation alone would give "Damage H P".
export function labelFor(key) {
  const entry = presentationFor(key);
  if (entry && entry.label) return entry.label;
  if (key.endsWith('PerLevel')) return 'per level';
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Seconds for a tick count at the shared cadence, formatted for a label
// ("1.33 s"), or '' for anything that is not a finite number.
export function ticksToSecondsLabel(ticks, ticksPerSecond) {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks) || !ticksPerSecond) return '';
  const s = ticks / ticksPerSecond;
  const rounded = Math.abs(s) >= 10 ? s.toFixed(1) : s.toFixed(2);
  return `${rounded.replace(/\.?0+$/, '')} s`;
}

// Number formatting for the preview table: at most 4 decimals, no trailing
// zeros, so 14 + 3 × 0.2222 reads as 14.6666, not 14.666600000000001.
export function formatNumber(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return String(Number(n.toFixed(4)));
}
