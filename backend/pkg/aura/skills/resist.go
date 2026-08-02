package skills

// ResistWildcard is the reserved resistance-map key covering every hit tag
// not explicitly present in that source (plan-skill-vocab chunk 1, §4.1):
// per tag, per source — NOT a whole-hit fallback. {"*": 0, "key_x": 1} means
// "immune to everything except pure key_x hits": a multi-tag [key_x, fire]
// hit multiplies 1 × 0 = 0, because the uncovered fire tag re-enters the
// wildcard.
const ResistWildcard = "*"

// ResistMultiplier computes the incoming-damage multiplier for a hit's damage
// tags against any number of resistance sources (item 11 Phase 2).
//
// Each source maps tag → multiplier (1 = normal, 0.5 = half, 0 = immune,
// > 1 = vulnerable); tags absent from a source fall back to its "*" entry
// (ResistWildcard) if present, else are unresisted there. The stacking rule:
// distinct sources (mob base resistances, each distinct resist aura skill,
// passives) always stack multiplicatively, and the multipliers of all tags on
// one hit multiply too — so a "fire" resist composes with a "bleed" one on a
// two-type hit. De-duplication of the *same* skill from several casters is the
// buff store's job (strongest wins there), not this function's.
//
// ⚑ Tags used to be arbitrary strings, and this comment used to advertise a
// bespoke "boss_x_lava" axis. D4 closed the vocabulary to skills.DamageTypes,
// which retires that — no content ever used it, and the cost of keeping it open
// was that every typo shipped as a silently-inert skill. Re-opening it for boss
// content is a deliberate decision, not an accident away.
//
// Multiplicative stacking makes immunity unreachable by stacking alone: the
// result is 0 only if a single source grants 0 outright (design decision —
// immunities must be deliberate content, not an emergent stack). Rider
// (confirmed 2026-07-13): wildcard immunity must stay temporarily strippable
// by content — multiplicative buffs cannot undo a ×0, so that needs its own
// seam (per-mob resistance override for encounter scripts, a sunder-style
// override buff for skills); demand-driven, first boss content pulls it.
func ResistMultiplier(tags []string, sources ...map[string]float32) float32 {
	multiplier := float32(1)
	for _, source := range sources {
		wildcard, hasWildcard := source[ResistWildcard]
		for _, tag := range tags {
			if m, ok := source[tag]; ok {
				multiplier *= m
			} else if hasWildcard {
				multiplier *= wildcard
			}
		}
	}
	return multiplier
}

// GateOpensFor reports whether a gated hit may damage a target that opts into
// the given gate keys (content pass C1; the vocabulary split is
// plan-numbers-rewrite D4). Gated damage is opt-in: the target's authored
// `factors.gateKeys` must name the hit's key. This is what keeps Harvest
// popping turnips while every mob that never mentions the key — present or
// future — is immune with zero authoring.
//
// ⚑ It reads a KEY LIST, not the resistance map. It used to read the map, which
// meant a lock ("immune to everything except harvest") and a resistance ("takes
// half damage from fire") were written in the same words, and three things
// followed from that overload: a mistyped key produced a silently inert skill,
// the "*" wildcard needed a special case here so it could not accidentally open
// every gate, and adding a new damage type silently changed what a wildcard mob
// was immune to (L13). All three are gone with the split.
func GateOpensFor(key string, gateKeys []string) bool {
	for _, k := range gateKeys {
		if k == key {
			return true
		}
	}
	return false
}

// The transient per-entity resist buffs live in the generic Buffs store
// (buffs.go, effect foundations Step 2), which inherited ResistBuffs'
// source-keying, stream and stacking semantics. The tag-LIST-shaped resist
// BUFFS deliberately do not learn "*" — no consumer; one line when content
// wants a resist-everything bubble (§4.1, recorded not built).
