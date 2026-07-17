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
// one hit multiply too — so a general "fire" resist composes with a bespoke
// "boss_x_lava" one. De-duplication of the *same* skill from several casters
// is the buff store's job (strongest wins there), not this function's.
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

// GateOpensFor reports whether a gated hit may damage a target with the given
// BASE resistances (content pass C1, "gatedDamageTags"): gated damage is
// opt-in — the target's own base map must explicitly name at least one of the
// hit's tags. The wildcard entry does NOT opt in (it is a fallback, not a
// declaration), and transient resist buffs never open the gate — opting into
// a chore tag is a property of the authored mob, not of a buff. An explicit 0
// entry opens the gate; the normal multiplier math then makes it a non-event
// anyway. This is what keeps Turnip-Pull popping turnips (["turnip"] against
// {"*": 0, "turnip": 1}) while every mob that never mentions the tag —
// present or future — is immune with zero authoring.
func GateOpensFor(tags []string, base map[string]float32) bool {
	for _, tag := range tags {
		if tag == ResistWildcard {
			continue
		}
		if _, ok := base[tag]; ok {
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
