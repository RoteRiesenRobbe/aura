package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// freeFloorSkills is the permanently-free set (plan-numbers-rewrite D6): the
// base damage aura, which GDD §3 requires to be usable at any resource level so
// a player is never left with no action, plus the non-combat utility skills —
// light and gathering should not tax survivability, and the zone-1→2 tunnel
// already charges the Lantern carrier an OPPORTUNITY cost.
//
// ⚑ D16b, stated so no later tuning pass "fixes" it: Damage stays free at all
// of its levels and is deliberately the weakest damage aura in the game. Its
// value is that it always works, not that it competes.
var freeFloorSkills = []string{"Damage", "Torch", "Lantern", "Harvest", "Pickaxe"}

// TestFreeFloorSkillsCostNothingAtEveryLevel is L10's guard. Authoring `0` IS
// the whole mechanism, which means one careless content edit could tax the
// guaranteed action with nothing else failing — no test, no boot warning, no
// visible symptom until a player dies to their own base aura.
func TestFreeFloorSkillsCostNothingAtEveryLevel(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	registry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)

	for _, name := range freeFloorSkills {
		def, err := registry.GetByName(name)
		require.NoError(t, err, "the free floor names a skill that must exist")

		for level := 1; level <= def.MaxLevel; level++ {
			for i := range def.Effects {
				assert.Zero(t, def.Effects[i].CostFractionAt(level),
					"%s effect %d must be free at level %d (D6 — the guaranteed action)", name, i, level)
			}
		}
	}
}
