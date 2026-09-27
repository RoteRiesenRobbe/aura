package skills

// instant_slow (plan-aura-drawbacks.md C2, §3.2, D3): the slow row's cooldown
// cell, the instant_resist twin. A one-shot query circle whose selected
// targets are slowed for an authored lifetime. Its payload is slow_aura's
// SlowParams, served under the same `slow` key, with the two duration fields
// the aura form leaves at 0.
//
// Also here: slow_aura's load bound, which it never had (§3.2, L8).

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func instantSlowSkill(maxLevel int, effect string) []byte {
	return []byte(`{"id": 216, "name": "Snare", "category": "cooldown", "maxLevel": ` +
		jsonInt(maxLevel) + `, "cooldownTicks": 300, "effects": [` + effect + `]}`)
}

func jsonInt(n int) string {
	b, _ := json.Marshal(n)
	return string(b)
}

func mapSkill(data []byte) (*SkillDefinition, error) {
	raw, err := parseSkillDefinition(data)
	if err != nil {
		return nil, err
	}
	return raw.mapToSkillDefinition(nil)
}

func TestInstantSlow_ParsesItsPayload(t *testing.T) {
	def := mustParse(t, instantSlowSkill(5, `{
	  "type": "instant_slow", "radius": 2.5, "radiusPerLevel": 0.1,
	  "selector": "nearest", "maxTargets": 2, "maxTargetsPerLevel": 1,
	  "targetsEnemies": true, "targetsAllies": false,
	  "slowFraction": 0.3, "slowFractionPerLevel": 0.05,
	  "slowDurationTicks": 60, "slowDurationTicksPerLevel": 6,
	  "costFractionOfMax": 0.02
	}`))
	require.Len(t, def.Effects, 1)
	e := def.Effects[0]

	assert.Equal(t, EffectTypeInstantSlow, e.Type)
	require.NotNil(t, e.Slow)
	assert.InDelta(t, 0.3, e.Slow.FractionAt(1), 1e-6)
	assert.InDelta(t, 0.5, e.Slow.FractionAt(5), 1e-6)
	assert.Equal(t, 60, e.Slow.TicksAt(1))
	assert.Equal(t, 84, e.Slow.TicksAt(5), "60 + 4 x 6")
	assert.Equal(t, 2, e.MaxTargets)
	assert.True(t, e.TargetsEnemies)
}

// The sidecar contract the client codes against: the `slow` object carries
// durationTicks and durationTicksPerLevel, both 0 on the aura form.
func TestInstantSlow_SidecarShape(t *testing.T) {
	instant := mustParse(t, instantSlowSkill(1, `{"type": "instant_slow", "radius": 2,
	  "targetsEnemies": true, "slowFraction": 0.3, "slowDurationTicks": 60, "slowDurationTicksPerLevel": 6}`))
	out, err := json.Marshal(instant.Effects[0].Slow)
	require.NoError(t, err)
	assert.JSONEq(t, `{"fraction": 0.3, "fractionPerLevel": 0, "durationTicks": 60, "durationTicksPerLevel": 6}`, string(out))

	aura := mustParse(t, []byte(`{"id": 4, "name": "Slow", "category": "active_aura", "maxLevel": 1,
	  "effects": [{"type": "slow_aura", "radius": 1.5, "slowFraction": 0.2, "targetsEnemies": true}]}`))
	out, err = json.Marshal(aura.Effects[0].Slow)
	require.NoError(t, err)
	assert.JSONEq(t, `{"fraction": 0.2, "fractionPerLevel": 0, "durationTicks": 0, "durationTicksPerLevel": 0}`, string(out))
}

func TestInstantSlow_IsACooldownOnly(t *testing.T) {
	for _, category := range []string{"active_aura", "passive"} {
		_, err := mapSkill([]byte(`{"id": 216, "name": "Snare", "category": "` + category + `", "maxLevel": 1,
		  "effects": [{"type": "instant_slow", "radius": 2, "targetsEnemies": true, "slowFraction": 0.3, "slowDurationTicks": 60}]}`))
		assert.Error(t, err, "instant_slow on a %s", category)
	}
}

func TestInstantSlow_RejectsForeignKeys(t *testing.T) {
	for _, key := range []string{`"tickInterval": 30`, `"stunTicks": 30`, `"targetsSelf": true`, `"resistDurationTicks": 30`} {
		_, err := mapSkill(instantSlowSkill(1, `{"type": "instant_slow", "radius": 2, "targetsEnemies": true,
		  "slowFraction": 0.3, "slowDurationTicks": 60, `+key+`}`))
		assert.Error(t, err, "authored %s", key)
	}
}

// Fraction within (0, 1] and duration >= 1 at EVERY level 1..maxLevel: a
// perLevel that walks out of range at a high level is refused at load, not
// clamped silently at the apply site.
func TestInstantSlow_BoundsAtEveryLevel(t *testing.T) {
	for _, c := range []struct {
		name     string
		maxLevel int
		keys     string
	}{
		{"zero fraction", 1, `"slowFraction": 0, "slowDurationTicks": 60`},
		{"fraction above 1", 1, `"slowFraction": 1.1, "slowDurationTicks": 60`},
		{"fraction walks above 1 by max level", 5, `"slowFraction": 0.8, "slowFractionPerLevel": 0.1, "slowDurationTicks": 60`},
		{"fraction walks to 0 by max level", 5, `"slowFraction": 0.2, "slowFractionPerLevel": -0.05, "slowDurationTicks": 60`},
		{"missing duration", 1, `"slowFraction": 0.3`},
		{"duration walks to 0 by max level", 5, `"slowFraction": 0.3, "slowDurationTicks": 20, "slowDurationTicksPerLevel": -5`},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := mapSkill(instantSlowSkill(c.maxLevel, `{"type": "instant_slow", "radius": 2, "targetsEnemies": true, `+c.keys+`}`))
			assert.Error(t, err)
		})
	}

	_, err := mapSkill(instantSlowSkill(5, `{"type": "instant_slow", "radius": 2, "targetsEnemies": true,
	  "slowFraction": 0.6, "slowFractionPerLevel": 0.1, "slowDurationTicks": 5, "slowDurationTicksPerLevel": -1}`))
	assert.NoError(t, err, "exactly 1.0 and exactly 1 tick at max level are legal edges")
}

// slow_aura gains the (0, 1] bound at every level (§3.2, L8): it was the one
// payload builder with no load-time numeric bound.
func TestSlowAura_BoundAtEveryLevel(t *testing.T) {
	aura := func(maxLevel int, keys string) []byte {
		return []byte(`{"id": 4, "name": "Slow", "category": "active_aura", "maxLevel": ` + jsonInt(maxLevel) + `,
		  "effects": [{"type": "slow_aura", "radius": 1.5, "targetsEnemies": true, ` + keys + `}]}`)
	}
	for _, c := range []struct {
		name     string
		maxLevel int
		keys     string
	}{
		{"zero fraction", 1, `"slowFraction": 0`},
		{"negative fraction", 1, `"slowFraction": -0.1`},
		{"fraction above 1", 1, `"slowFraction": 1.2`},
		{"fraction walks above 1 by max level", 30, `"slowFraction": 0.2, "slowFractionPerLevel": 0.05`},
	} {
		t.Run(c.name, func(t *testing.T) {
			_, err := mapSkill(aura(c.maxLevel, c.keys))
			assert.Error(t, err)
		})
	}

	_, err := mapSkill(aura(5, `"slowFraction": 0.1, "slowFractionPerLevel": 0.1`))
	assert.NoError(t, err, "the shipped Slow shape (0.5 at max level) still loads")
	_, err = mapSkill(aura(1, `"slowFraction": 1`))
	assert.NoError(t, err, "1.0 is a legal edge")
}
