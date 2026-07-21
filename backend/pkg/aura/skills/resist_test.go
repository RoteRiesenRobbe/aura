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

func TestGateOpensFor_ExplicitEntryOpens(t *testing.T) {
	// The turnip mob's map: explicitly opted into the turnip tag.
	base := map[string]float32{"*": 0, "turnip": 1}
	assert.True(t, GateOpensFor([]string{"turnip"}, base))
}

func TestGateOpensFor_ExplicitZeroStillOpens(t *testing.T) {
	// An explicit 0 entry is deliberate immunity — the gate opens and the
	// normal multiplier math produces the non-event.
	base := map[string]float32{"turnip": 0}
	assert.True(t, GateOpensFor([]string{"turnip"}, base))
}

func TestGateOpensFor_WildcardDoesNotOptIn(t *testing.T) {
	// A wildcard-resisting mob has NOT opted into the gated tag.
	base := map[string]float32{"*": 0.5}
	assert.False(t, GateOpensFor([]string{"turnip"}, base))
}

func TestGateOpensFor_AbsentOrNilMapStaysClosed(t *testing.T) {
	assert.False(t, GateOpensFor([]string{"turnip"}, map[string]float32{"physical": 0.8}))
	assert.False(t, GateOpensFor([]string{"turnip"}, nil))
}

func TestGateOpensFor_AnyTagOpens(t *testing.T) {
	// A multi-tag hit needs only one explicit entry to pass the gate; the
	// per-tag multipliers then rule as usual.
	base := map[string]float32{"turnip": 1}
	assert.True(t, GateOpensFor([]string{"physical", "turnip"}, base))
}
