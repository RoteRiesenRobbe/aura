package skills

// Fear (plan-effect-types-round-2.md C5, D4, D22): a moving stun. The feared
// entity runs from the fearer and cannot cast; fear and stun share one
// diminishing-returns ladder.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse_Fear(t *testing.T) {
	data := []byte(`{
      "id": 166, "name": "Terrify", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 600,
      "effects": [{"type": "fear", "radius": 4, "maxTargets": 1, "selector": "nearest", "targetsEnemies": true,
        "fearTicks": 120, "fearTicksPerLevel": 15}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeFear, e.Type)
	require.NotNil(t, e.Fear)
	assert.Equal(t, 150, e.Fear.TicksAt(3), "120 + 15 per level above 1")
}

func TestMap_FearRefusesBadShapes(t *testing.T) {
	for name, effect := range map[string]string{
		"no duration": `{"type":"fear","radius":4,"targetsEnemies":true}`,
		"no radius":   `{"type":"fear","targetsEnemies":true,"fearTicks":60}`,
		"stun key":    `{"type":"fear","radius":4,"targetsEnemies":true,"fearTicks":60,"stunTicks":30}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":166,"name":"F","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[` + effect + `]}`))
		require.NoError(t, err, name)
		_, err = raw.mapToSkillDefinition(nil)
		assert.Error(t, err, name)
	}
}

func TestMap_FearIsCooldownOnly(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":166,"name":"F","category":"active_aura","maxLevel":1,"effects":[{"type":"fear","radius":4,"targetsEnemies":true,"fearTicks":60}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

type fearer struct{ name string }

func TestBuffs_FearIsAMovingHold(t *testing.T) {
	var b Buffs
	from := &fearer{"howler"}
	require.True(t, b.ApplyFear(166, from, 60))

	assert.True(t, b.Feared())
	assert.False(t, b.Stunned(), "fear is not a stun")
	src, ok := b.FearSource()
	require.True(t, ok)
	assert.Same(t, from, src)
	assert.Equal(t, float32(1), b.MovementFactor(), "a feared entity runs at its normal speed (D22)")
	assert.NotZero(t, b.AppliedEffects()&AppliedEffectFear)
	assert.Equal(t, EffectKindFear, b.OwnEffects()[0].Kinds)
}

// D4: one hard-CC family. 100 %, 50 %, 25 %, then refused, whichever of the
// two lands.
func TestBuffs_FearAndStunShareOneLadder(t *testing.T) {
	var b Buffs
	require.True(t, b.ApplyStun(1, 80))
	ageOut(&b)
	require.True(t, b.ApplyFear(2, &fearer{}, 80))
	assert.Equal(t, 40, b.OwnEffects()[0].Total, "the fear is the ladder's second step")
	ageOut(&b)
	require.True(t, b.ApplyStun(1, 80))
	ageOut(&b)
	assert.False(t, b.ApplyFear(2, &fearer{}, 80), "the fourth hard CC is refused")
	assert.False(t, b.Feared())
}

func ageOut(b *Buffs) {
	for b.Stunned() || b.Feared() {
		b.Tick()
	}
}
