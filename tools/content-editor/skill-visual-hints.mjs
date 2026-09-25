// The Visuals section's two helper lines (plan-skill-vfx.md §12f.5 C3b):
// the colour a layer will draw in, and the soft hints for the look mistakes
// the last sessions made by hand.
//
// ⚑ Loaded by the browser as a plain ES module (app.js) AND by smoke.mjs under
// node, so it must import nothing from `node:` (the skill-presentation.mjs
// constraint).
//
// ⭐ skillFxColor MIRRORS frontend/src/features/skill-fx/logic/SkillFxPalette.ts
// exactly, but over the RAW file rather than the catalog the client reads. The
// catalog (skills/definition.go) builds a `damage` payload for damage_aura and
// instant_damage, `dot` for dot_aura and instant_dot, and `retaliateDamage` /
// `retaliateBurst` for their types, each carrying `damageTags` normalised:
// absent tags become ["physical"], and a gateKey payload carries none (the TS
// rule then skips it, `tags.length > 0`). The mapping below is that
// normalisation, so a WolfBite with no authored tags reads physical here as it
// does in game. The hexes themselves are never copied: the palette arrives
// parsed out of the .ts file (skill-fx.mjs, served on /api/data).
//
// Every hint is a HINT, never a gate: Go is the only judge (the seam), and
// hints (1), (2), (4) describe content the PO may keep on purpose.

// The effect types whose catalog payload carries damage tags, in the order
// SkillFxPalette.ts looks at the payloads (one payload per effect).
const TAGGED_PAYLOAD_TYPES = ['damage_aura', 'instant_damage', 'dot_aura', 'instant_dot', 'retaliate_damage', 'retaliate_burst'];
// Only the `damage` payload reads gateKey (definition.go damageParams).
const GATE_KEYED_TYPES = ['damage_aura', 'instant_damage'];
const DEFAULT_DAMAGE_TAG = 'physical';

const TINT = /^#[0-9a-fA-F]{6}$/; // SkillFxPalette.ts parseTint: what the CLIENT accepts

// The tag that decides the palette colour, or null: the first effect whose
// catalog payload carries damage tags, by its first tag.
// { tag, defaulted } where `defaulted` means no damageTags were authored.
export function paletteTagOf(skill) {
  for (const effect of Array.isArray(skill?.effects) ? skill.effects : []) {
    if (!effect || !TAGGED_PAYLOAD_TYPES.includes(effect.type)) continue;
    if (GATE_KEYED_TYPES.includes(effect.type) && effect.gateKey) continue;
    const tags = Array.isArray(effect.damageTags) ? effect.damageTags : [];
    if (tags.length > 0) return { tag: tags[0], defaulted: false };
    return { tag: DEFAULT_DAMAGE_TAG, defaulted: true };
  }
  return null;
}

/**
 * The colour a layer of `skill` draws in, and why. `palette` is /api/data's
 * `skillFxPalette`: { damageTypes: { fire: '#ff7a1a', ... }, neutral }.
 */
export function skillFxColor(skill, layer, palette) {
  const tint = layer?.tint;
  if (typeof tint === 'string' && TINT.test(tint)) return { hex: tint.toLowerCase(), reason: `authored tint ${tint}` };
  const found = paletteTagOf(skill);
  if (found) {
    const hex = palette.damageTypes[found.tag];
    if (!hex) return { hex: palette.neutral, reason: `neutral grey: damage tag "${found.tag}" has no palette colour` };
    return {
      hex,
      reason: found.defaulted
        ? `${found.tag}, from the first damage effect (no damageTags authored, so physical)`
        : `${found.tag}, from the first damage-tagged effect`,
    };
  }
  return { hex: palette.neutral, reason: 'neutral grey: no tint and no damage tags' };
}

// The moments a layer of `kind` may play at on this skill: the kind's own set
// cut by the category's (D2), and `applied` only when an effect applies
// something over time. An unset or unknown category answers the kind's own
// set (the legalEffectTypes posture: the fixture cannot judge it).
export function legalMoments(vocab, kind, skill) {
  const byKind = (vocab.visualTriggersByKind || {})[kind] || [];
  const category = skill?.category;
  const byCategory = vocab.categories.includes(category) ? ((vocab.visualTriggersByCategory || {})[category] || []) : null;
  return byKind.filter((on) => (byCategory === null || byCategory.includes(on)) && (on !== 'applied' || hasOverTimeEffect(vocab, skill)));
}

// The kinds with at least one moment legal for the skill's category (the
// `applied` gate aside: no kind plays at `applied` alone).
export function legalKinds(vocab, skill) {
  const category = skill?.category;
  const byCategory = vocab.categories.includes(category) ? ((vocab.visualTriggersByCategory || {})[category] || []) : null;
  return (vocab.visualKinds || []).filter((kind) => ((vocab.visualTriggersByKind || {})[kind] || []).some((on) => byCategory === null || byCategory.includes(on)));
}

export function hasOverTimeEffect(vocab, skill) {
  const types = vocab.visualAppliedEffectTypes || [];
  return (Array.isArray(skill?.effects) ? skill.effects : []).some((e) => e && types.includes(e.type));
}

/**
 * The grey hint lines for a skill's look, as { cls, text }:
 *   1  a damage-tagged skill authoring a tint (redundant: the palette colours it)
 *   2  an untagged skill with a layer and no tint (draws neutral grey)
 *   3  every effect is over time and a layer is on `hit` (no direct landing
 *      is ever sent: the C3a-ii finding, move it to `applied`)
 *   4  an active aura or cooldown with no layers (the PO 2026-09-20 rule)
 *   5  the two STALE states the pickers cannot prevent, worded as the loader
 *      words them: a moment illegal for the current category, and `applied`
 *      with no over-time effect left
 */
export function skillVisualHints(skill, vocab) {
  const out = [];
  const layers = Array.isArray(skill?.visual?.layers) ? skill.visual.layers : [];
  const category = skill?.category;
  const knownCategory = vocab.categories.includes(category);

  if (layers.length === 0) {
    if (category === 'active_aura' || category === 'cooldown') {
      out.push({ cls: 4, text: 'No look yet: every aura and cooldown that can carry one authors one (PO 2026-09-20). Add a layer in the Visuals section; a bare file still loads.' });
    }
    return out;
  }

  const effects = Array.isArray(skill.effects) ? skill.effects.filter((e) => e && typeof e === 'object') : [];
  const found = paletteTagOf(skill);
  const overTime = vocab.visualAppliedEffectTypes || [];
  const allOverTime = effects.length > 0 && effects.every((e) => overTime.includes(e.type));
  const untinted = [];

  layers.forEach((layer, i) => {
    if (!layer || typeof layer !== 'object') return;
    const tinted = typeof layer.tint === 'string' && layer.tint !== '';
    if (tinted && found) {
      out.push({ cls: 1, text: `visual.layers[${i}] authors tint ${layer.tint}, but the skill is damage-tagged (${found.tag}): the palette already colours it, so the tint only overrides that. Fine if deliberate.` });
    }
    if (!tinted) untinted.push(i);
    if (layer.on === 'hit' && allOverTime) {
      out.push({ cls: 3, text: `visual.layers[${i}] (${layer.kind}) plays on "hit", but every effect is over time (${[...new Set(effects.map((e) => e.type))].join(', ')}): such a skill sends no direct landing, so the layer never draws. Move it to "applied".` });
    }
    if (knownCategory && typeof layer.on === 'string') {
      const legal = (vocab.visualTriggersByCategory || {})[category] || [];
      if ((vocab.visualTriggers || []).includes(layer.on) && !legal.includes(layer.on)) {
        out.push({ cls: 5, text: `visual.layers[${i}]: trigger "${layer.on}" is not legal on a ${category} skill (D2: a ${category} skill may author ${legal.join(', ')}). The loader refuses this file.` });
      }
    }
    if (layer.on === 'applied' && !hasOverTimeEffect(vocab, skill)) {
      out.push({ cls: 5, text: `visual.layers[${i}]: an "applied" layer needs an over-time effect (${overTime.join(', ')}) - nothing else is ever applied, so the layer would never draw. The loader refuses this file.` });
    }
  });

  if (!found && untinted.length > 0) {
    out.push({ cls: 2, text: `No damage tags and no tint: visual.layers[${untinted.join(', ')}] draw${untinted.length === 1 ? 's' : ''} in neutral grey. Author a tint if the look should carry a colour.` });
  }
  return out;
}
