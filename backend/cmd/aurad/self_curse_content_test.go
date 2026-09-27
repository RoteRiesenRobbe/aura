package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// TestNoShippedAuraCursesItsOwnCaster pins a door left open ON PURPOSE
// (plan-aura-drawbacks.md §6, §8 Q4): a resist_aura with targetsSelf and a
// factor above 1 is a per-tag self-curse, and the loader still accepts it
// (skills.TestLoader_SelfTargetedResistAuraAboveOneStillLoads). The designed
// drawback is a while-active stat_multiplier; this shape is legal but
// UNAUTHORED, and the first file that authors it should be a decision someone
// makes here, not an accident. Every skill, player and mob, at every level.
func TestNoShippedAuraCursesItsOwnCaster(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	registry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)

	selfTargeted := 0
	for _, def := range registry.All() {
		for _, e := range def.Effects {
			if e.Type != skills.EffectTypeResistAura || !e.Resist.TargetsSelf {
				continue
			}
			selfTargeted++
			for level := 1; level <= def.MaxLevel; level++ {
				assert.LessOrEqualf(t, e.Resist.FactorAt(level), float32(1),
					"%s at level %d: a self-targeted resist_aura above 1 curses its own caster. Legal, but "+
						"the drawback shape is a while-active stat_multiplier; decide it here (§8 Q4)", def.Name, level)
			}
		}
	}
	// Not vacuous: self-targeted resist auras exist (OmniAura, the wards), all below 1.
	require.NotZero(t, selfTargeted, "no self-targeted resist_aura left to census")
}
