package sys

import (
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The persist round-trip lands the while-active fold (plan-aura-drawbacks.md
// C1, L3): Derived is never stored, it is recomputed from the loadout, and the
// load path's SetActiveAura (after the slots are restored) is what turns the
// active aura's drawback back on. Loaded through the real JSON loader, the
// 2026-09-12 file shape.
func TestColdJoinRestoresTheActiveAurasDrawback(t *testing.T) {
	s, g := newStateFixture(t)
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"drawback.json": {Data: []byte(`{
  "id": 41, "name": "Harvest", "category": "active_aura", "maxLevel": 1,
  "effects": [
    {"type": "damage_aura", "radius": 1, "damageHP": 5, "targetsEnemies": true},
    {"type": "stat_multiplier", "stat": "maxHealth", "statBonus": -0.4}
  ]
}`)},
	}, nil)
	require.NoError(t, err)
	g.skillReg = r

	p := joinWithState(t, s, g, newFakeClient(), "Hagar", persist.CharacterState{
		Level: 1, ActiveAuraSlot: 0,
		Spellbook: map[int32]int{41: 1},
		Loadout:   []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 41}},
	})

	require.Equal(t, 0, p.SkillComponent().ActiveAuraSlot)
	assert.Equal(t, vitals.VitalSign(60), p.MaxHealth(), "the drawback is on after the load")
	assert.Equal(t, vitals.VitalSign(60), p.VitalSigns().Health, "and the load's full-health stamp reads the shrunken pool")
}
