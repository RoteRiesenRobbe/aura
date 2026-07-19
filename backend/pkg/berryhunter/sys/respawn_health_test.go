package sys

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// Hardy-style +maxHealth passive (values [PLACEHOLDER], mirrors
// api/skills/hardy.json). Lives in its own mini registry so the shared
// state_test fixture registry stays untouched.
var respawnTestHardyJSON = []byte(`{
  "id": 42,
  "name": "Hardy",
  "category": "passive",
  "maxLevel": 3,
  "effects": [
    {
      "type": "stat_multiplier",
      "stat": "maxHealth",
      "statBonus": 0.08,
      "statBonusPerLevel": 0.08
    }
  ]
}`)

func respawnTestHardyDef(t *testing.T) *skills.SkillDefinition {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"hardy.json": {Data: respawnTestHardyJSON},
	})
	require.NoError(t, err)
	def, err := r.GetByName("Hardy")
	require.NoError(t, err)
	return def
}

// Triage item 14 (plan-intermission-triage.md §14): player.New stamps
// Health = MaxHealth() at construction, but tryRespawn restores the carried
// skills only afterwards — a player carrying a +maxHealth passive must still
// come back at the FULL skilled pool, not the base one (the Revive path
// already orders it right).
func TestRespawn_FullHealthIncludesMaxHealthPassives(t *testing.T) {
	s, g := newStateFixture(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	p.SkillComponent().EquipPassive(0, respawnTestHardyDef(t), 3)
	skilledMax := p.MaxHealth()
	require.Greater(t, float32(skilledMax), float32(g.cfg.PlayerConfig.BaseHealth),
		"precondition: Hardy must raise MaxHealth above the base pool")

	kill(t, s, p)
	c.respawns = append(c.respawns, &model.Respawn{})
	s.Update(0)

	require.Len(t, g.players, 2, "respawn should create a new player entity")
	np := g.players[1]
	require.Equal(t, skilledMax, np.MaxHealth(),
		"carried skills must restore the skilled MaxHealth pool")
	assert.Equal(t, skilledMax, np.VitalSigns().Health,
		"respawn must come back at full skilled MaxHealth, not the base pool")
}
