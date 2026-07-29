package core

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
)

// Config's defaulting must be TOTAL over the player block (§35 C1, landmine
// L1): healthGainTick and walkingSpeedPerTick used to be copied raw, so a conf
// omitting the player block yielded 0-regen, 0-speed players with no error —
// and the shrink-to-deltas (D1) makes an absent player block the NORMAL state
// of every environment conf, not an authoring mistake.
func TestConfig_EmptyPlayerBlock_ResolvesToDefaults(t *testing.T) {
	conf := &cfg.Config{}
	var g cfg.GameConfig
	require.NoError(t, Config(conf)(&g))

	assert.Equal(t, float32(0.00033), g.PlayerConfig.HealthGainTick,
		"absent player.healthGainTick must resolve to the built-in default (regen lock, Session ③), not 0 regen")
	assert.Equal(t, float32(0.05), g.PlayerConfig.WalkingSpeedPerTick,
		"absent player.walkingSpeedPerTick must resolve to the built-in default, not an unmoving player")
}
