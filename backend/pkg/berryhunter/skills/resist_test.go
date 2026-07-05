package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResistMultiplier_NoSourcesIsOne(t *testing.T) {
	assert.InDelta(t, 1.0, ResistMultiplier([]string{"fire"}), 1e-6)
	assert.InDelta(t, 1.0, ResistMultiplier(nil, map[string]float32{"fire": 0.5}), 1e-6)
}

func TestResistMultiplier_MatchingTag(t *testing.T) {
	m := ResistMultiplier([]string{"fire"}, map[string]float32{"fire": 0.5})
	assert.InDelta(t, 0.5, m, 1e-6)
}

func TestResistMultiplier_AbsentTagUnresisted(t *testing.T) {
	m := ResistMultiplier([]string{"frost"}, map[string]float32{"fire": 0.5})
	assert.InDelta(t, 1.0, m, 1e-6)
}

func TestResistMultiplier_MultipliesAcrossTags(t *testing.T) {
	// General + bespoke resistance on one hit compose multiplicatively.
	m := ResistMultiplier(
		[]string{"fire", "boss_x_lava"},
		map[string]float32{"fire": 0.5, "boss_x_lava": 0.5},
	)
	assert.InDelta(t, 0.25, m, 1e-6)
}

func TestResistMultiplier_MultipliesAcrossSources(t *testing.T) {
	// Distinct sources (mob base, resist aura, passive) always stack
	// multiplicatively — immunity is unreachable unless a single source is 0.
	m := ResistMultiplier(
		[]string{"fire"},
		map[string]float32{"fire": 0.5},
		map[string]float32{"fire": 0.5},
	)
	assert.InDelta(t, 0.25, m, 1e-6)
}

func TestResistMultiplier_ImmunityAndVulnerability(t *testing.T) {
	assert.InDelta(t, 0.0, ResistMultiplier([]string{"fire"}, map[string]float32{"fire": 0}), 1e-6)
	assert.InDelta(t, 1.5, ResistMultiplier([]string{"fire"}, map[string]float32{"fire": 1.5}), 1e-6)
}

// --- ResistBuffs (transient resist-aura buffs, item 11 Phase 2 Step 3) ---

func TestResistBuffs_ApplyAndMultiplier(t *testing.T) {
	var b ResistBuffs
	b.Apply(40, []string{"fire"}, 0.5, 2)

	assert.InDelta(t, 0.5, b.Multiplier([]string{"fire"}), 1e-6)
	assert.InDelta(t, 1.0, b.Multiplier([]string{"frost"}), 1e-6, "uncovered tag is unresisted")
	assert.InDelta(t, 1.0, b.Multiplier(nil), 1e-6)
}

func TestResistBuffs_SameSkillStrongestWins(t *testing.T) {
	// The same skill from two casters does not stack — the strongest
	// currently-active application wins.
	var b ResistBuffs
	b.Apply(40, []string{"fire"}, 0.8, 2)
	b.Apply(40, []string{"fire"}, 0.5, 2)
	assert.InDelta(t, 0.5, b.Multiplier([]string{"fire"}), 1e-6)

	// A weaker application neither overwrites a stronger one...
	b.Apply(40, []string{"fire"}, 0.9, 3)
	assert.InDelta(t, 0.5, b.Multiplier([]string{"fire"}), 1e-6)
	// ...nor keeps it alive: each strength ages independently, so once the
	// stronger applications lapse, the weaker-but-active one takes over.
	b.Tick()
	b.Tick()
	assert.InDelta(t, 0.9, b.Multiplier([]string{"fire"}), 1e-6,
		"0.8/0.5 expired after their 2 ticks; the 3-tick 0.9 application remains")
}

func TestResistBuffs_StrongerApplicationFadesBackToWeaker(t *testing.T) {
	// Regression (found in-game, item 11 Phase 2): two wards of the same skill
	// at different levels, both re-applied every tick. When the stronger one
	// switches off, its factor must fade on ITS lifetime — the weaker ward's
	// per-tick refresh must not keep the stronger factor alive.
	var b ResistBuffs

	// Both auras re-apply for a few ticks (tick interval 1 → lifetime 2).
	for i := 0; i < 3; i++ {
		b.Tick()
		b.Apply(40, []string{"fire"}, 0.6, 2) // L1 ward
		b.Apply(40, []string{"fire"}, 0.4, 2) // L3 ward
	}
	assert.InDelta(t, 0.4, b.Multiplier([]string{"fire"}), 1e-6, "strongest active wins while both run")

	// The L3 ward switches off; only the L1 ward keeps re-applying.
	for i := 0; i < 2; i++ {
		b.Tick()
		b.Apply(40, []string{"fire"}, 0.6, 2)
	}
	assert.InDelta(t, 0.6, b.Multiplier([]string{"fire"}), 1e-6,
		"the stronger application expired after its own lifetime")
}

func TestResistBuffs_DifferentSkillsStack(t *testing.T) {
	// Distinct source skills stack multiplicatively.
	var b ResistBuffs
	b.Apply(40, []string{"fire"}, 0.5, 2)
	b.Apply(41, []string{"fire"}, 0.5, 2)
	assert.InDelta(t, 0.25, b.Multiplier([]string{"fire"}), 1e-6)
}

func TestResistBuffs_MultipleMatchingTagsMultiply(t *testing.T) {
	// One buff covering several of the hit's tags counts once per matching tag
	// (same semantics as a base-resistance map).
	var b ResistBuffs
	b.Apply(40, []string{"fire", "boss_x_lava"}, 0.5, 2)
	assert.InDelta(t, 0.25, b.Multiplier([]string{"fire", "boss_x_lava"}), 1e-6)
}

func TestResistBuffs_TickExpiry(t *testing.T) {
	var b ResistBuffs
	b.Apply(40, []string{"fire"}, 0.5, 2)

	b.Tick()
	assert.InDelta(t, 0.5, b.Multiplier([]string{"fire"}), 1e-6,
		"survives one tick boundary — a hazard tick before re-application is still resisted")

	b.Tick()
	assert.InDelta(t, 1.0, b.Multiplier([]string{"fire"}), 1e-6, "expired without re-application")
}
