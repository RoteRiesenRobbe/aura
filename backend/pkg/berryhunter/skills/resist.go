package skills

// ResistMultiplier computes the incoming-damage multiplier for a hit's damage
// tags against any number of resistance sources (item 11 Phase 2).
//
// Each source maps tag → multiplier (1 = normal, 0.5 = half, 0 = immune,
// > 1 = vulnerable); tags absent from a source are unresisted there. The
// stacking rule: distinct sources (mob base resistances, each distinct resist
// aura skill, passives) always stack multiplicatively, and the multipliers of
// all tags on one hit multiply too — so a general "fire" resist composes with
// a bespoke "boss_x_lava" one. De-duplication of the *same* skill from several
// casters is the buff store's job (strongest wins there), not this function's.
//
// Multiplicative stacking makes immunity unreachable by stacking alone: the
// result is 0 only if a single source grants 0 outright (design decision —
// immunities must be deliberate content, not an emergent stack).
func ResistMultiplier(tags []string, sources ...map[string]float32) float32 {
	multiplier := float32(1)
	for _, source := range sources {
		for _, tag := range tags {
			if m, ok := source[tag]; ok {
				multiplier *= m
			}
		}
	}
	return multiplier
}

// The transient per-entity resist buffs live in the generic Buffs store
// (buffs.go, effect foundations Step 2), which inherited ResistBuffs'
// source-keying, stream and stacking semantics.
