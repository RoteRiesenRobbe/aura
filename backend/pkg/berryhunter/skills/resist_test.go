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
