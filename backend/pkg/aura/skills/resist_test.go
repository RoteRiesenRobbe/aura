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

// --- "*" wildcard (plan-skill-vocab chunk 1, §4.1 confirmed 2026-07-13) ---

func TestResistMultiplier_WildcardCoversAbsentTag(t *testing.T) {
	// "*" is the multiplier for every hit tag not explicitly in the source.
	m := ResistMultiplier([]string{"frost"}, map[string]float32{"*": 0.5, "fire": 0.1})
	assert.InDelta(t, 0.5, m, 1e-6)
}

func TestResistMultiplier_ExplicitTagBeatsWildcard(t *testing.T) {
	m := ResistMultiplier([]string{"fire"}, map[string]float32{"*": 0.5, "fire": 0.1})
	assert.InDelta(t, 0.1, m, 1e-6)
}

func TestResistMultiplier_WildcardMultiTagPin(t *testing.T) {
	// §4.1 multi-tag pin: the wildcard is per tag, per source — NOT a whole-hit
	// fallback. A hit tagged [key_x, fire] against {"*": 0, "key_x": 1}
	// multiplies 1 × 0 = 0: only the PURE key_x hit pierces the immunity.
	m := ResistMultiplier([]string{"key_x", "fire"}, map[string]float32{"*": 0, "key_x": 1})
	assert.InDelta(t, 0.0, m, 1e-6)

	pure := ResistMultiplier([]string{"key_x"}, map[string]float32{"*": 0, "key_x": 1})
	assert.InDelta(t, 1.0, pure, 1e-6, "the pure key pierces the wildcard immunity")
}

func TestResistMultiplier_WildcardOnlySource(t *testing.T) {
	// A bare {"*": x} source applies x once per hit tag.
	m := ResistMultiplier([]string{"fire", "frost"}, map[string]float32{"*": 0.5})
	assert.InDelta(t, 0.25, m, 1e-6)
}

func TestResistMultiplier_WildcardComposesAcrossSources(t *testing.T) {
	// A wildcard source stacks multiplicatively with an explicit one.
	m := ResistMultiplier(
		[]string{"fire"},
		map[string]float32{"*": 0.5},
		map[string]float32{"fire": 0.5},
	)
	assert.InDelta(t, 0.25, m, 1e-6)
}

// GateOpensFor is a membership test since the D4 split: a mob opts into a gate
// by naming the key in factors.gateKeys, full stop.
//
// ⚑ Four tests died here, and their deaths are the argument for the split. They
// pinned edge cases that existed ONLY because the gate was overloaded onto the
// resistance map: that the "*" wildcard must not accidentally open every gate;
// that an explicit `{"turnip": 0}` opens the gate and is then zeroed by the
// multiplier math; that a multi-tag hit opens on any one entry. None of those
// questions can be asked any more — a key list has no wildcard, no multiplier
// and no second meaning. This is what "each concept gets the right validation"
// buys beyond the typo check.
func TestGateOpensFor_NamedKeyOpens(t *testing.T) {
	assert.True(t, GateOpensFor("harvest", []string{"harvest"}))
	assert.True(t, GateOpensFor("harvest", []string{"smash", "harvest"}))
}

func TestGateOpensFor_UnnamedKeyStaysClosed(t *testing.T) {
	assert.False(t, GateOpensFor("harvest", []string{"smash"}))
	assert.False(t, GateOpensFor("harvest", nil),
		"every mob that never mentions the key is immune with zero authoring")
	assert.False(t, GateOpensFor("", []string{"harvest"}),
		"ordinary damage carries no key and must never open a gate")
}

func TestGateOpensFor_IgnoresResistanceVocabulary(t *testing.T) {
	// The wildcard is a resistance concept and has no meaning in a key list —
	// it cannot open a gate by being present, which used to need a special case
	// inside the function itself.
	assert.False(t, GateOpensFor("harvest", []string{ResistWildcard}))
}
