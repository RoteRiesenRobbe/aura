package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// JSON literals from docs/skill-system-design.md examples.

var damageAuraJSON = []byte(`{
  "id": 1,
  "name": "DamageAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [
    {
      "type": "damage_aura",
      "radius": 1.0,
      "radiusPerLevel": 0.0,
      "damageFraction": 0.009,
      "damageFractionPerLevel": 0.002,
      "targetsMobs": true,
      "targetsPlayers": false
    }
  ]
}`)

var healAuraJSON = []byte(`{
  "id": 2,
  "name": "HealAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [
    {
      "type": "heal_aura",
      "radius": 1.0,
      "radiusPerLevel": 0.05,
      "healFraction": 0.001,
      "healFractionPerLevel": 0.0005,
      "selfDamageFraction": 0.0015
    }
  ]
}`)

var swiftPassiveJSON = []byte(`{
  "id": 10,
  "name": "SwiftPassive",
  "category": "passive",
  "maxLevel": 3,
  "effects": [
    {
      "type": "stat_multiplier",
      "stat": "movementSpeed",
      "additivePerLevel": 0.05
    }
  ]
}`)

var novaBurstJSON = []byte(`{
  "id": 20,
  "name": "NovaBurst",
  "category": "cooldown",
  "maxLevel": 3,
  "cooldownTicks": 300,
  "cooldownTicksPerLevel": -20,
  "effects": [
    {
      "type": "instant_damage",
      "radius": 1.5,
      "radiusPerLevel": 0.1,
      "damageFraction": 0.15,
      "damageFractionPerLevel": 0.03,
      "targetsMobs": true,
      "targetsPlayers": false
    }
  ]
}`)

func mustParse(t *testing.T, data []byte) *SkillDefinition {
	t.Helper()
	raw, err := parseSkillDefinition(data)
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition()
	require.NoError(t, err)
	return def
}

func TestParse_DamageAura(t *testing.T) {
	def := mustParse(t, damageAuraJSON)

	assert.Equal(t, SkillID(1), def.ID)
	assert.Equal(t, "DamageAura", def.Name)
	assert.Equal(t, SkillCategoryActiveAura, def.Category)
	assert.Equal(t, 5, def.MaxLevel)
	assert.Equal(t, 0, def.CooldownTicks)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeDamageAura, e.Type)
	assert.InDelta(t, 1.0, e.Radius, 1e-6)
	assert.InDelta(t, 0.0, e.RadiusPerLevel, 1e-6)
	assert.InDelta(t, 0.009, e.DamageFraction, 1e-6)
	assert.InDelta(t, 0.002, e.DamageFractionPerLevel, 1e-6)
	assert.True(t, e.TargetsMobs)
	assert.False(t, e.TargetsPlayers)
	assert.Equal(t, 1, e.TickInterval) // absent in JSON → normalized to default 1
}

func TestParse_HealAura(t *testing.T) {
	def := mustParse(t, healAuraJSON)

	assert.Equal(t, SkillID(2), def.ID)
	assert.Equal(t, "HealAura", def.Name)
	assert.Equal(t, SkillCategoryActiveAura, def.Category)
	assert.Equal(t, 5, def.MaxLevel)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeHealAura, e.Type)
	assert.InDelta(t, 1.0, e.Radius, 1e-6)
	assert.InDelta(t, 0.05, e.RadiusPerLevel, 1e-6)
	assert.InDelta(t, 0.001, e.HealFraction, 1e-6)
	assert.InDelta(t, 0.0005, e.HealFractionPerLevel, 1e-6)
	assert.InDelta(t, 0.0015, e.SelfDamageFraction, 1e-6)
	assert.Equal(t, 1, e.TickInterval)
}

func TestParse_SwiftPassive(t *testing.T) {
	def := mustParse(t, swiftPassiveJSON)

	assert.Equal(t, SkillID(10), def.ID)
	assert.Equal(t, "SwiftPassive", def.Name)
	assert.Equal(t, SkillCategoryPassive, def.Category)
	assert.Equal(t, 3, def.MaxLevel)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeStatMultiplier, e.Type)
	assert.Equal(t, "movementSpeed", e.Stat)
	assert.InDelta(t, 0.05, e.AdditivePerLevel, 1e-6)
}

func TestParse_NovaBurst(t *testing.T) {
	def := mustParse(t, novaBurstJSON)

	assert.Equal(t, SkillID(20), def.ID)
	assert.Equal(t, "NovaBurst", def.Name)
	assert.Equal(t, SkillCategoryCooldown, def.Category)
	assert.Equal(t, 3, def.MaxLevel)
	assert.Equal(t, 300, def.CooldownTicks)
	assert.Equal(t, -20, def.CooldownTicksPerLevel)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeInstantDamage, e.Type)
	assert.InDelta(t, 1.5, e.Radius, 1e-6)
	assert.InDelta(t, 0.1, e.RadiusPerLevel, 1e-6)
	assert.InDelta(t, 0.15, e.DamageFraction, 1e-6)
	assert.InDelta(t, 0.03, e.DamageFractionPerLevel, 1e-6)
	assert.True(t, e.TargetsMobs)
	assert.False(t, e.TargetsPlayers)
}

func TestParse_InvalidJSON(t *testing.T) {
	_, err := parseSkillDefinition([]byte(`{invalid`))
	assert.Error(t, err)
}

func TestMap_UnknownCategory(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"unknown","maxLevel":1,"effects":[]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_UnknownEffectType(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"no_such_type"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_ExplicitTickInterval(t *testing.T) {
	data := []byte(`{
      "id": 99, "name": "SlowAura", "category": "active_aura", "maxLevel": 1,
      "effects": [{"type": "damage_aura", "tickInterval": 3, "targetsMobs": true}]
    }`)
	def := mustParse(t, data)
	assert.Equal(t, 3, def.Effects[0].TickInterval)
}
