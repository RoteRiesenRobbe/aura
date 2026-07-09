package skills

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// JSON literals from docs/plan-skill-system.md examples.

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
      "targetsEnemies": true,
      "targetsAllies": false
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
      "statBonus": 0.05,
      "statBonusPerLevel": 0.05
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
      "targetsEnemies": true,
      "targetsAllies": false
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
	assert.InDelta(t, 0.009, e.Damage.HP, 1e-6)
	assert.InDelta(t, 0.002, e.Damage.HPPerLevel, 1e-6)
	assert.True(t, e.TargetsEnemies)
	assert.False(t, e.TargetsAllies)
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
      "targetsAllies": false,
      "targetsEnemies": true,
      "targetsStructures": true
    }
  ]
}`)

func TestParse_MobAuraWithStructureDamage(t *testing.T) {
	def := mustParse(t, mobAuraJSON)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeDamageAura, e.Type)
	assert.InDelta(t, 0.0067, e.Damage.HP, 1e-6)
	assert.InDelta(t, 0.67, e.Damage.StructureDamageFraction, 1e-6)
	assert.False(t, e.TargetsAllies)
	assert.True(t, e.TargetsEnemies)
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
	assert.InDelta(t, 0.001, e.Heal.HP, 1e-6)
	assert.InDelta(t, 0.0005, e.Heal.HPPerLevel, 1e-6)
	assert.InDelta(t, 0.0015, e.Heal.SelfDamageHP, 1e-6)
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
	assert.Equal(t, "movementSpeed", e.Stat.Name)
	assert.InDelta(t, 0.05, e.Stat.Bonus, 1e-6)
	assert.InDelta(t, 0.05, e.Stat.BonusPerLevel, 1e-6)
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
	assert.InDelta(t, 0.15, e.Damage.HP, 1e-6)
	assert.InDelta(t, 0.03, e.Damage.HPPerLevel, 1e-6)
	assert.True(t, e.TargetsEnemies)
	assert.False(t, e.TargetsAllies)
}

// --- damage tags (item 11 Phase 2) ---

func TestParse_DamageTags(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "targetsEnemies": true, "damageTags": ["fire", "boss_x_lava"]}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, def.Effects[0].Damage.Tags)
}

func TestParse_DamageTagsDefaultToPhysical(t *testing.T) {
	// Untagged damage is normalized to the reserved default tag at parse time,
	// so armor-style resistance applies to everything (Phase 2 decision).
	damage := mustParse(t, damageAuraJSON)
	require.Len(t, damage.Effects, 1)
	assert.Equal(t, []string{DamageTagPhysical}, damage.Effects[0].Damage.Tags)

	burst := mustParse(t, novaBurstJSON)
	require.Len(t, burst.Effects, 1)
	assert.Equal(t, []string{DamageTagPhysical}, burst.Effects[0].Damage.Tags)
}

func TestParse_DamageTagsAbsentOnNonDamageEffects(t *testing.T) {
	heal := mustParse(t, healAuraJSON)
	require.Len(t, heal.Effects, 1)
	assert.Nil(t, heal.Effects[0].Damage)
}

func TestMap_EmptyDamageTagFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageTags":[""]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_DuplicateDamageTagFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageTags":["fire","fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_DamageTagsOnNonDamageEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"heal_aura","damageTags":["fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

// --- per-hit variance (item 11 Phase 3) ---

func TestParse_Variance(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "targetsEnemies": true, "damageHP": 7, "variance": 0.15}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.InDelta(t, 0.15, def.Effects[0].Damage.Variance, 1e-6)
}

func TestParse_VarianceDefaultsToZero(t *testing.T) {
	def := mustParse(t, damageAuraJSON)
	require.Len(t, def.Effects, 1)
	assert.Zero(t, def.Effects[0].Damage.Variance, "absent variance → static value")
}

func TestParse_VarianceValidOnAllRollingEffects(t *testing.T) {
	// Damage and heal amounts both roll (decision C1): damage_aura,
	// instant_damage, heal_aura and self_heal all accept a variance band.
	for _, effect := range []string{
		`{"type": "instant_damage", "targetsEnemies": true, "damageHP": 25, "variance": 0.1}`,
		`{"type": "heal_aura", "healHP": 6, "variance": 0.1}`,
		`{"type": "self_heal", "healHP": 20, "variance": 0.1}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		def, err := raw.mapToSkillDefinition()
		require.NoError(t, err, "variance must be accepted on %s", effect)
		e := def.Effects[0]
		var variance float32
		switch {
		case e.Damage != nil:
			variance = e.Damage.Variance
		case e.Heal != nil:
			variance = e.Heal.Variance
		case e.SelfHeal != nil:
			variance = e.SelfHeal.Variance
		}
		assert.InDelta(t, 0.1, variance, 1e-6)
	}
}

func TestMap_VarianceOutOfBoundsFails(t *testing.T) {
	for _, variance := range []string{"-0.1", "1", "1.5"} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageHP":7,"variance":` + variance + `}]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition()
		assert.Error(t, err, "variance %s must be rejected (valid: 0 <= v < 1)", variance)
	}
}

func TestMap_VarianceOnNonRollingEffectFails(t *testing.T) {
	// On an effect without a rolled amount, variance would be a silent no-op.
	for _, effect := range []string{
		`{"type": "slow_aura", "targetsEnemies": true, "slowFraction": 0.5, "variance": 0.1}`,
		`{"type": "stat_multiplier", "stat": "movementSpeed", "statBonus": 0.1, "statBonusPerLevel": 0.1, "variance": 0.1}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition()
		assert.Error(t, err, "variance must be rejected on %s", effect)
	}
}

// --- resist aura / resist passive (item 11 Phase 2) ---

func TestParse_ResistAura(t *testing.T) {
	data := []byte(`{
      "id": 40, "name": "FireWard", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["fire", "boss_x_lava"],
                   "resistFactor": 0.6, "resistFactorPerLevel": -0.1,
                   "targetsAllies": true, "targetsSelf": true, "tickInterval": 1}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeResistAura, e.Type)
	assert.Equal(t, []string{"fire", "boss_x_lava"}, e.Resist.Tags)
	assert.InDelta(t, 0.6, e.Resist.Factor, 1e-6)
	assert.InDelta(t, -0.1, e.Resist.FactorPerLevel, 1e-6)
	assert.True(t, e.TargetsAllies)
	assert.True(t, e.Resist.TargetsSelf)
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
	assert.Equal(t, []string{"fire"}, e.Resist.Tags)
	assert.InDelta(t, 0.8, e.Resist.Factor, 1e-6)
}

func TestMap_ResistAuraWithoutTagsFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistFactor":0.5,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_NegativeResistFactorFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistTags":["fire"],"resistFactor":-0.1,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestMap_ResistTagsOnNonResistEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"resistTags":["fire"]}]}`))
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
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"selector":"no_such_selector"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.Error(t, err)
}

func TestParse_SelectorAndCap(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "targetsEnemies": true, "selector": "lowest_health", "maxTargets": 2, "maxTargetsPerLevel": 1, "tickIntervalPerLevel": -1}]
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
	data := []byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true}]}`)
	def := mustParse(t, data)

	e := def.Effects[0]
	assert.Equal(t, SelectorNearest, e.Selector)
	assert.Equal(t, 0, e.MaxTargets)
}

func TestParse_SlowAura(t *testing.T) {
	data := []byte(`{
      "id": 4, "name": "SlowAura", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "slow_aura", "radius": 1.5, "slowFraction": 0.1, "slowFractionPerLevel": 0.1, "targetsEnemies": true}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeSlowAura, e.Type)
	assert.InDelta(t, 1.5, e.Radius, 1e-6)
	assert.InDelta(t, 0.1, e.Slow.Fraction, 1e-6)
	assert.InDelta(t, 0.1, e.Slow.FractionPerLevel, 1e-6)
	assert.True(t, e.TargetsEnemies)
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
	assert.InDelta(t, 0.20, e.SelfHeal.HealHP, 1e-6)
	assert.InDelta(t, 0.05, e.SelfHeal.HealHPPerLevel, 1e-6)
}

func TestParse_DamageReductionStat(t *testing.T) {
	data := []byte(`{
      "id": 11, "name": "ToughPassive", "category": "passive", "maxLevel": 3,
      "effects": [{"type": "stat_multiplier", "stat": "damageReduction", "statBonus": 0.02, "statBonusPerLevel": 0.02}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, StatDamageReduction, def.Effects[0].Stat.Name)
}

func TestMap_UnknownStat(t *testing.T) {
	// An unapplied stat would be a silent no-op — unknown names must fail loud.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"stat_multiplier","stat":"luck","statBonus":0.1}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "unknown stat")
}

func TestMap_StatMultiplierNoScalingFails(t *testing.T) {
	// Both statBonus and statBonusPerLevel zero would be a do-nothing passive.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"stat_multiplier","stat":"movementSpeed"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "no scaling")
}

func TestMap_StaleAdditivePerLevelKeyFails(t *testing.T) {
	// The pre-unification "additivePerLevel" key (or any typo) is not on the
	// stat_multiplier allowlist — the key check fails it by name instead of
	// json.Unmarshal silently dropping it.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"stat_multiplier","stat":"movementSpeed","additivePerLevel":0.05}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "additivePerLevel")
}

func TestMap_RetiredTargetFlagKeysFailWithHint(t *testing.T) {
	// The pre-faction targetsMobs/targetsPlayers keys (effect foundations
	// Step 1) hard-fail with a pointer to the faction-relative successors.
	for _, effect := range []string{
		`{"type":"damage_aura","targetsMobs":true}`,
		`{"type":"damage_aura","targetsPlayers":false}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition()
		assert.ErrorContains(t, err, "targetsEnemies", "stale flag must name the successor: %s", effect)
	}
}

func TestMap_UnknownEffectKeyFails(t *testing.T) {
	// Typos hard-fail on every effect type — json.Unmarshal alone would drop
	// the key and load a silently mis-tuned effect.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"radiusPerLvl":0.5}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "radiusPerLvl")
}

func TestParse_ExactlyOnePayload(t *testing.T) {
	// The EffectDef invariant: the payload matching Type is non-nil, all
	// others nil.
	def := mustParse(t, damageAuraJSON)
	e := def.Effects[0]
	assert.NotNil(t, e.Damage)
	assert.Nil(t, e.Heal)
	assert.Nil(t, e.SelfHeal)
	assert.Nil(t, e.Slow)
	assert.Nil(t, e.Resist)
	assert.Nil(t, e.Stat)
	assert.Nil(t, e.Dot)
	assert.Nil(t, e.Spawn)

	heal := mustParse(t, healAuraJSON)
	assert.NotNil(t, heal.Effects[0].Heal)
	assert.Nil(t, heal.Effects[0].Damage)

	passive := mustParse(t, swiftPassiveJSON)
	assert.NotNil(t, passive.Effects[0].Stat)
	assert.Nil(t, passive.Effects[0].Damage)
}

// --- dot_aura / instant_dot (effect foundations Step 2) ---

func TestMap_DotAura(t *testing.T) {
	data := []byte(`{
      "id": 5, "name": "ImmolationAura", "category": "active_aura", "maxLevel": 5,
      "effects": [{
        "type": "dot_aura", "radius": 1.0, "tickInterval": 20,
        "damageHP": 5, "damageHPPerLevel": 1, "damageTags": ["fire"], "variance": 0.1,
        "dotTicks": 3, "dotTickInterval": 30,
        "targetsEnemies": true, "selector": "nearest", "maxTargets": 1
      }]
    }`)
	def := mustParse(t, data)
	e := def.Effects[0]
	require.NotNil(t, e.Dot)
	assert.Nil(t, e.Damage, "dot payload, not damage payload")
	assert.InDelta(t, 7, e.Dot.HPAt(3), 1e-6)
	assert.Equal(t, []string{"fire"}, e.Dot.Tags)
	assert.InDelta(t, 0.1, e.Dot.Variance, 1e-6)
	assert.Equal(t, 3*30+1, e.Dot.DurationTicks(), "all events + the tick-boundary grace")
}

func TestMap_DotDefaultsToPhysicalTag(t *testing.T) {
	data := []byte(`{
      "id": 22, "name": "Ignite", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 300,
      "effects": [{"type": "instant_dot", "radius": 1.5, "damageHP": 6, "dotTicks": 3, "dotTickInterval": 30, "targetsEnemies": true}]
    }`)
	def := mustParse(t, data)
	assert.Equal(t, []string{DamageTagPhysical}, def.Effects[0].Dot.Tags)
}

func TestMap_DotMissingCadenceOrDamageFails(t *testing.T) {
	// A dot without events, spacing, or damage is a silent no-op — hard-fail
	// like the stat_multiplier no-scaling guard.
	for _, effect := range []string{
		`{"type": "dot_aura", "targetsEnemies": true, "damageHP": 5, "dotTickInterval": 30}`,
		`{"type": "dot_aura", "targetsEnemies": true, "damageHP": 5, "dotTicks": 3}`,
		`{"type": "instant_dot", "targetsEnemies": true, "dotTicks": 3, "dotTickInterval": 30}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition()
		assert.Error(t, err, "underspecified dot must be rejected: %s", effect)
	}
}

func TestMap_DotKeysOnOtherEffectsFail(t *testing.T) {
	// dotTicks on a plain damage_aura would be silently ignored.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageHP":7,"dotTicks":3}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "dotTicks")
}

func TestMap_StatFieldsOnNonStatEffectFails(t *testing.T) {
	// stat/statBonus on other effect types would be a silent no-op.
	for _, effect := range []string{
		`{"type": "damage_aura", "targetsEnemies": true, "damageHP": 7, "statBonus": 0.1}`,
		`{"type": "slow_aura", "targetsEnemies": true, "slowFraction": 0.5, "stat": "movementSpeed"}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition()
		assert.Error(t, err, "stat fields must be rejected on %s", effect)
	}
}

func TestMap_ExplicitTickInterval(t *testing.T) {
	data := []byte(`{
      "id": 99, "name": "SlowAura", "category": "active_aura", "maxLevel": 1,
      "effects": [{"type": "damage_aura", "tickInterval": 3, "targetsEnemies": true}]
    }`)
	def := mustParse(t, data)
	assert.Equal(t, 3, def.Effects[0].TickInterval)
}

// --- spawn (effect foundations Step 3 / mob-depth chunk 1) ---

func TestMap_SpawnEffect(t *testing.T) {
	data := []byte(`{
      "id": 23, "name": "SummonTotem", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 450,
      "effects": [{
        "type": "spawn", "spawnMob": "Totem",
        "ttlTicks": 300, "ttlTicksPerLevel": 60,
        "maxHealthPerOwnerLevel": 2, "powerPerOwnerLevel": 0.05
      }]
    }`)
	def := mustParse(t, data)
	e := def.Effects[0]
	require.NotNil(t, e.Spawn)
	assert.Nil(t, e.Damage, "spawn payload, not damage payload")
	assert.Equal(t, "Totem", e.Spawn.MobName)
	assert.Equal(t, 300, e.Spawn.TTLAt(1))
	assert.Equal(t, 420, e.Spawn.TTLAt(3), "skill level scales the TTL")
	assert.InDelta(t, 0, e.Spawn.MaxHealthBonusAt(1), 1e-6, "level-1 owner gets no bonus")
	assert.InDelta(t, 8, e.Spawn.MaxHealthBonusAt(5), 1e-6)
	assert.InDelta(t, 1, e.Spawn.PowerAt(1), 1e-6, "level-1 owner has neutral power")
	assert.InDelta(t, 1.2, e.Spawn.PowerAt(5), 1e-6)
}

func TestMap_SpawnEffectDefaultsScalingToOff(t *testing.T) {
	data := []byte(`{
      "id": 23, "name": "SummonTotem", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 450,
      "effects": [{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300}]
    }`)
	def := mustParse(t, data)
	e := def.Effects[0].Spawn
	require.NotNil(t, e)
	assert.Equal(t, 300, e.TTLAt(5), "absent per-level = static TTL")
	assert.InDelta(t, 0, e.MaxHealthBonusAt(10), 1e-6)
	assert.InDelta(t, 1, e.PowerAt(10), 1e-6)
}

func TestMap_SpawnEffectInvalid(t *testing.T) {
	for _, effect := range []string{
		// missing mob name
		`{"type": "spawn", "ttlTicks": 300}`,
		// missing/zero TTL — an instantly-expiring summon is unauthorable
		`{"type": "spawn", "spawnMob": "Totem"}`,
		`{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 0}`,
		// negative owner-level scaling — these fields are buffs by design
		`{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300, "maxHealthPerOwnerLevel": -1}`,
		`{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300, "powerPerOwnerLevel": -0.1}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":23,"name":"X","category":"cooldown","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition()
		assert.Error(t, err, "invalid spawn must be rejected: %s", effect)
	}
}

func TestMap_SpawnKeysOnOtherEffectsFail(t *testing.T) {
	// spawnMob/ttlTicks on a non-spawn effect would be silently ignored.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageHP":7,"spawnMob":"Totem"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition()
	assert.ErrorContains(t, err, "spawnMob")
}
