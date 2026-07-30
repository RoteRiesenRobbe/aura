package sim

// §35 C3 tier-3 pins (plan-conf-duplication.md §5): the sim harness restates
// four conf.default.json values as Go literals — DefaultRegenTick and the
// world.go config block (LevelUpXPBase/LevelUpXPGrowthFactor/margin). They
// cannot read the conf at runtime (the harness builds its config inline by
// design, L9), so this test pins each restatement against the repo default
// read from disk: retuning the JSON without the harness goes red here, which
// is the "harness predicts the game it tunes" invariant (H1a) as a test.

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// simMirroredConf is the slice of conf.default.json the sim restates. Decoded
// as a struct on purpose: a renamed JSON key decodes to 0 and fails the
// nonzero guard below rather than silently comparing zero to zero.
type simMirroredConf struct {
	Game struct {
		MobChaseIntoAuraMargin float32 `json:"mobChaseIntoAuraMargin"`
		Player                 struct {
			HealthGainTick        float32 `json:"healthGainTick"`
			LevelUpXPBase         uint32  `json:"levelUpXPBase"`
			LevelUpXPGrowthFactor float32 `json:"levelUpXPGrowthFactor"`
		} `json:"player"`
	} `json:"game"`
}

func readSimMirroredConf(t *testing.T) simMirroredConf {
	t.Helper()
	raw, err := os.ReadFile("../../../conf.default.json")
	require.NoError(t, err)
	var conf simMirroredConf
	require.NoError(t, json.Unmarshal(raw, &conf))
	require.NotZero(t, conf.Game.MobChaseIntoAuraMargin, "mobChaseIntoAuraMargin missing/renamed in conf.default.json")
	require.NotZero(t, conf.Game.Player.HealthGainTick, "player.healthGainTick missing/renamed in conf.default.json")
	require.NotZero(t, conf.Game.Player.LevelUpXPBase, "player.levelUpXPBase missing/renamed in conf.default.json")
	require.NotZero(t, conf.Game.Player.LevelUpXPGrowthFactor, "player.levelUpXPGrowthFactor missing/renamed in conf.default.json")
	return conf
}

func TestDefaultRegenTick_MatchesConfDefault(t *testing.T) {
	conf := readSimMirroredConf(t)

	assert.Equal(t, conf.Game.Player.HealthGainTick, float32(DefaultRegenTick),
		"sim.DefaultRegenTick has drifted from conf.default.json game.player.healthGainTick — "+
			"the harness would recover players at a different rate than the live game")
}

func TestWorldConfig_MatchesConfDefault(t *testing.T) {
	conf := readSimMirroredConf(t)

	w := NewWorld(TTK(exactPlayer(), turretMob(0, 1), 0.5), 1)
	got := w.game.config

	assert.Equal(t, conf.Game.Player.LevelUpXPBase, got.PlayerConfig.LevelUpXPBase,
		"sim/world.go's LevelUpXPBase literal has drifted from conf.default.json")
	assert.Equal(t, conf.Game.Player.LevelUpXPGrowthFactor, got.PlayerConfig.LevelUpXPGrowthFactor,
		"sim/world.go's LevelUpXPGrowthFactor literal has drifted from conf.default.json")
	assert.Equal(t, conf.Game.MobChaseIntoAuraMargin, got.MobChaseIntoAuraMargin,
		"sim/world.go's chase-margin literal has drifted from conf.default.json (H1a: the harness "+
			"must run the value core/gameconf.go resolves, or it tunes a different game)")
	assert.Equal(t, conf.Game.Player.HealthGainTick, got.PlayerConfig.HealthGainTick,
		"a zero-RegenTick scenario must resolve to the live default regen")
}
