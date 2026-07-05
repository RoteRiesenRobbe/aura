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

// ResistBuffs is the transient tag-resistance store carried by every mob and
// player (item 11 Phase 2 Step 3). Resist auras re-apply their buff each
// effect tick; a buff outlives its application by the aura's tick interval
// + 1, so a hazard tick landing right before the re-application is still
// resisted, and stepping out of the aura fades the buff after roughly one
// aura cycle — the slow_aura model generalized to arbitrary cadences.
//
// Entries are keyed by the granting skill: the same skill never stacks with
// itself — the strongest *currently active* application wins — while distinct
// skills are distinct sources and stack multiplicatively. Within one skill,
// applications of different strengths (levels/casters) are tracked as
// separate streams that each age on their own lifetime: a weaker ward's
// per-tick refresh must never keep a departed stronger ward's factor alive.
// The zero value is ready to use.
type ResistBuffs struct {
	entries map[SkillID][]*resistBuffEntry
}

type resistBuffEntry struct {
	tags   []string
	factor float32
	ticks  int
}

// Apply grants (or refreshes) a buff from the given source skill. An
// application refreshes the stream with the identical factor (same skill at
// the same level re-applying each aura tick); a different factor opens its
// own stream, so each strength expires independently.
func (b *ResistBuffs) Apply(source SkillID, tags []string, factor float32, ticks int) {
	if b.entries == nil {
		b.entries = make(map[SkillID][]*resistBuffEntry, 1)
	}
	for _, e := range b.entries[source] {
		if e.factor == factor {
			if ticks > e.ticks {
				e.ticks = ticks
			}
			e.tags = tags
			return
		}
	}
	b.entries[source] = append(b.entries[source], &resistBuffEntry{tags: tags, factor: factor, ticks: ticks})
}

// Tick advances the per-tick lifecycle: applications not refreshed within
// their lifetime expire. Called once per tick alongside the TickAccumulators
// reset.
func (b *ResistBuffs) Tick() {
	for source, list := range b.entries {
		kept := list[:0]
		for _, e := range list {
			e.ticks--
			if e.ticks > 0 {
				kept = append(kept, e)
			}
		}
		if len(kept) == 0 {
			delete(b.entries, source)
		} else {
			b.entries[source] = kept
		}
	}
}

// Multiplier is the combined incoming-damage multiplier of all active buffs
// for a hit's damage tags. Per skill only the strongest active application
// counts (same skill never stacks); within it, each covered hit tag
// multiplies once; across skills the factors multiply — same semantics as one
// ResistMultiplier source per skill.
func (b *ResistBuffs) Multiplier(hitTags []string) float32 {
	multiplier := float32(1)
	for _, list := range b.entries {
		var strongest *resistBuffEntry
		for _, e := range list {
			if strongest == nil || e.factor < strongest.factor {
				strongest = e
			}
		}
		if strongest == nil {
			continue
		}
		for _, hitTag := range hitTags {
			for _, covered := range strongest.tags {
				if hitTag == covered {
					multiplier *= strongest.factor
					break
				}
			}
		}
	}
	return multiplier
}
