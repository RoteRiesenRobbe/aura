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
      "damageHP": 0.009,
      "damageHPPerLevel": 0.002,
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
      "healHP": 0.001,
      "healHPPerLevel": 0.0005,
      "selfDamageHP": 0.0015
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
      "damageHP": 0.15,
      "damageHPPerLevel": 0.03,
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
	assert.InDelta(t, 0.009, e.DamageHP, 1e-6)
	assert.InDelta(t, 0.002, e.DamageHPPerLevel, 1e-6)
	assert.True(t, e.TargetsMobs)
	assert.False(t, e.TargetsPlayers)
	assert.Equal(t, 1, e.TickInterval) // absent in JSON → normalized to default 1
}

// Mob aura shape: structure damage + structure targeting (Phase 6). Values
// mirror the AngryMammoth 1:1 migration.
var mobAuraJSON = []byte(`{
  "id": 104,
  "name": "AngryMammothAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [
    {
      "type": "damage_aura",
      "radius": 3.0,
      "damageHP": 0.0067,
      "structureDamageFraction": 0.67,
      "targetsMobs": false,
      "targetsPlayers": true,
      "targetsStructures": true
    }
  ]
}`)

func TestParse_MobAuraWithStructureDamage(t *testing.T) {
	def := mustParse(t, mobAuraJSON)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeDamageAura, e.Type)
	assert.InDelta(t, 0.0067, e.DamageHP, 1e-6)
	assert.InDelta(t, 0.67, e.StructureDamageFraction, 1e-6)
	assert.False(t, e.TargetsMobs)
	assert.True(t, e.TargetsPlayers)
	assert.True(t, e.TargetsStructures)
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
	assert.InDelta(t, 0.001, e.HealHP, 1e-6)
	assert.InDelta(t, 0.0005, e.HealHPPerLevel, 1e-6)
	assert.InDelta(t, 0.0015, e.SelfDamageHP, 1e-6)
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
	assert.InDelta(t, 0.15, e.DamageHP, 1e-6)
	assert.InDelta(t, 0.03, e.DamageHPPerLevel, 1e-6)
	assert.True(t, e.TargetsMobs)
	assert.False(t, e.TargetsPlayers)
}

// --- damage tags (item 11 Phase 2) ---

func TestParse_DamageTags(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "targetsMobs": true, "damageTags": ["fire", "boss_x_lava"]}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, def.Effects[0].DamageTags)
}

func TestParse_DamageTagsDefaultToPhysical(t *testing.T) {
	// Untagged damage is normalized to the reserved default tag at parse time,
	// so armor-style resistance applies to everything (Phase 2 decision).
	damage := mustParse(t, damageAuraJSON)
	require.Len(t, damage.Effects, 1)
	assert.Equal(t, []string{DamageTagPhysical}, damage.Effects[0].DamageTags)

	burst := mustParse(t, novaBurstJSON)
	require.Len(t, burst.Effects, 1)
	assert.Equal(t, []string{DamageTagPhysical}, burst.Effects[0].DamageTags)
}

func TestParse_DamageTagsAbsentOnNonDamageEffects(t *testing.T) {
	heal := mustParse(t, healAuraJSON)
	require.Len(t, heal.Effects, 1)
	assert.Nil(t, heal.Effects[0].DamageTags)
}

func TestMap_EmptyDamageTagFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsMobs":true,"damageTags":[""]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_DuplicateDamageTagFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsMobs":true,"damageTags":["fire","fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_DamageTagsOnNonDamageEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"heal_aura","targetsPlayers":true,"damageTags":["fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

// --- resist aura / resist passive (item 11 Phase 2) ---

func TestParse_ResistAura(t *testing.T) {
	data := []byte(`{
      "id": 40, "name": "FireWard", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["fire", "boss_x_lava"],
                   "resistFactor": 0.6, "resistFactorPerLevel": -0.1,
                   "targetsPlayers": true, "targetsSelf": true, "tickInterval": 1}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeResistAura, e.Type)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, e.ResistTags)
	assert.InDelta(t, 0.6, e.ResistFactor, 1e-6)
	assert.InDelta(t, -0.1, e.ResistFactorPerLevel, 1e-6)
	assert.True(t, e.TargetsPlayers)
	assert.True(t, e.TargetsSelf)
}

func TestParse_ResistPassive(t *testing.T) {
	data := []byte(`{
      "id": 41, "name": "FireSkin", "category": "passive", "maxLevel": 3,
      "effects": [{"type": "resist_passive", "resistTags": ["fire"], "resistFactor": 0.8, "resistFactorPerLevel": -0.05}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeResistPassive, e.Type)
	assert.Equal(t, []string{"fire"}, e.ResistTags)
	assert.InDelta(t, 0.8, e.ResistFactor, 1e-6)
}

func TestMap_ResistAuraWithoutTagsFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistFactor":0.5,"targetsPlayers":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_NegativeResistFactorFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistTags":["fire"],"resistFactor":-0.1,"targetsPlayers":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_ResistTagsOnNonResistEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsMobs":true,"resistTags":["fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
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

func TestMap_UnknownSelector(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsMobs":true,"selector":"no_such_selector"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestParse_SelectorAndCap(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "targetsMobs": true, "selector": "lowest_health", "maxTargets": 2, "maxTargetsPerLevel": 1, "tickIntervalPerLevel": -1}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, SelectorLowestHealth, e.Selector)
	assert.Equal(t, 2, e.MaxTargets)
	assert.Equal(t, 1, e.MaxTargetsPerLevel)
	assert.Equal(t, -1, e.TickIntervalPerLevel)
}

func TestParse_SelectorDefaultsToNearest(t *testing.T) {
	// Absent selector must default to nearest, MaxTargets 0 = uncapped.
	data := []byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsMobs":true}]}`)
	def := mustParse(t, data)

	e := def.Effects[0]
	assert.Equal(t, SelectorNearest, e.Selector)
	assert.Equal(t, 0, e.MaxTargets)
}

func TestParse_SlowAura(t *testing.T) {
	data := []byte(`{
      "id": 4, "name": "SlowAura", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "slow_aura", "radius": 1.5, "slowFraction": 0.1, "slowFractionPerLevel": 0.1, "targetsMobs": true}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeSlowAura, e.Type)
	assert.InDelta(t, 1.5, e.Radius, 1e-6)
	assert.InDelta(t, 0.1, e.SlowFraction, 1e-6)
	assert.InDelta(t, 0.1, e.SlowFractionPerLevel, 1e-6)
	assert.True(t, e.TargetsMobs)
}

func TestParse_SelfHeal(t *testing.T) {
	data := []byte(`{
      "id": 21, "name": "Heal", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 900,
      "effects": [{"type": "self_heal", "healHP": 0.20, "healHPPerLevel": 0.05}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeSelfHeal, e.Type)
	assert.InDelta(t, 0.20, e.HealHP, 1e-6)
	assert.InDelta(t, 0.05, e.HealHPPerLevel, 1e-6)
}

func TestParse_DamageReductionStat(t *testing.T) {
	data := []byte(`{
      "id": 11, "name": "ToughPassive", "category": "passive", "maxLevel": 3,
      "effects": [{"type": "stat_multiplier", "stat": "damageReduction", "additivePerLevel": 0.02}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, StatDamageReduction, def.Effects[0].Stat)
}

func TestMap_UnknownStat(t *testing.T) {
	// An unapplied stat would be a silent no-op — unknown names must fail loud.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"stat_multiplier","stat":"luck","additivePerLevel":0.1}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "unknown stat")
}

func TestMap_ExplicitTickInterval(t *testing.T) {
	data := []byte(`{
      "id": 99, "name": "SlowAura", "category": "active_aura", "maxLevel": 1,
      "effects": [{"type": "damage_aura", "tickInterval": 3, "targetsMobs": true}]
    }`)
	def := mustParse(t, data)
	assert.Equal(t, 3, def.Effects[0].TickInterval)
}
