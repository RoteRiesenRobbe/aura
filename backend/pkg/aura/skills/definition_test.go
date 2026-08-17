package skills

import (
	"encoding/json"
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// JSON literals from docs/archive/plan-skill-system.md examples.

var damageAuraJSON = []byte(`{
  "id": 1,
  "name": "Damage",
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
  "name": "Heal",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [
    {
      "type": "heal_aura",
      "radius": 1.0,
      "radiusPerLevel": 0.05,
      "healHP": 0.001,
      "healHPPerLevel": 0.0005,
      "costFractionOfMax": 0.0015
    }
  ]
}`)

var swiftPassiveJSON = []byte(`{
  "id": 10,
  "name": "Swift",
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
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)
	return def
}

func TestParse_DamageAura(t *testing.T) {
	def := mustParse(t, damageAuraJSON)

	assert.Equal(t, SkillID(1), def.ID)
	assert.Equal(t, "Damage", def.Name)
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
	assert.False(t, def.Legacy)        // absent → live content
}

// Legacy tag (step-7 A.5, plan-rebrand-cleanup.md §4): proving-grounds-only
// defs carry "legacy": true so the live world can warn on references to them.
func TestParse_LegacyTag(t *testing.T) {
	var legacyJSON = []byte(`{
	  "id": 3,
	  "name": "DodoAura",
	  "category": "active_aura",
	  "maxLevel": 1,
	  "legacy": true,
	  "effects": [
	    {
	      "type": "damage_aura",
	      "radius": 1.0,
	      "damageHP": 0.001,
	      "targetsEnemies": true
	    }
	  ]
	}`)
	def := mustParse(t, legacyJSON)
	assert.True(t, def.Legacy)
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
	assert.Equal(t, "Heal", def.Name)
	assert.Equal(t, SkillCategoryActiveAura, def.Category)
	assert.Equal(t, 5, def.MaxLevel)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeHealAura, e.Type)
	assert.InDelta(t, 1.0, e.Radius, 1e-6)
	assert.InDelta(t, 0.05, e.RadiusPerLevel, 1e-6)
	assert.InDelta(t, 0.001, e.Heal.HP, 1e-6)
	assert.InDelta(t, 0.0005, e.Heal.HPPerLevel, 1e-6)
	assert.Equal(t, 1, e.TickInterval)
}

// --- triage item 2's falling self-cost, now on the EFFECT (numbers rewrite
// D5/D7): the guarantee did not change, only where it lives. Heal is still the
// authored case — 10 % of the pool at level 1, falling to 2 % at its cap — and
// the clamp is still what stops an over-levelled curve refunding health.

func TestEffectDef_CostFractionAtScalesDownAndClampsAtZero(t *testing.T) {
	// The authored curve mirrors heal.json at its cap-10 shape: 0.10 falling
	// by 0.008889/level, i.e. 0.02 at level 10.
	e := &EffectDef{CostFractionOfMax: 0.10, CostFractionOfMaxPerLevel: -0.008889}
	assert.InDelta(t, 0.10, e.CostFractionAt(1), 1e-6)
	assert.InDelta(t, 0.091111, e.CostFractionAt(2), 1e-6)
	assert.InDelta(t, 0.02, e.CostFractionAt(10), 1e-6)
	// Past the cap the curve would go negative; it clamps at 0 — a cost never
	// becomes a refund.
	assert.InDelta(t, 0, e.CostFractionAt(20), 1e-6, "cost floors at 0, never negative")
}

func TestParse_EffectCostPerLevel(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":5,"effects":[{"type":"heal_aura","radius":1,"healHP":12,"costFractionOfMax":0.1,"costFractionOfMaxPerLevel":-0.02,"tickInterval":120}]}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)
	assert.InDelta(t, -0.02, def.Effects[0].CostFractionOfMaxPerLevel, 1e-6)
}

// --- triage item 13: percent-of-max heal (campfire) ---

func TestHealParams_FractionAt(t *testing.T) {
	p := &HealParams{FractionOfMax: 0.1, FractionOfMaxPerLevel: 0.05}
	assert.InDelta(t, 0.1, p.FractionAt(1), 1e-6)
	assert.InDelta(t, 0.2, p.FractionAt(3), 1e-6)
	assert.InDelta(t, 0, (&HealParams{}).FractionAt(1), 1e-6, "unset → 0")
}

func TestParse_HealFractionOfMax(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"heal_aura","radius":1.5,"healFractionOfMax":0.12,"maxTargets":0,"tickInterval":60}]}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)
	assert.InDelta(t, 0.12, def.Effects[0].Heal.FractionOfMax, 1e-6)
	assert.InDelta(t, 0, def.Effects[0].Heal.HP, 1e-6, "no flat HP authored")
}

func TestMap_HealFlatAndFractionMutuallyExclusiveFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"heal_aura","radius":1,"healHP":5,"healFractionOfMax":0.1,"tickInterval":60}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "mutually exclusive")
}

func TestParse_SwiftPassive(t *testing.T) {
	def := mustParse(t, swiftPassiveJSON)

	assert.Equal(t, SkillID(10), def.ID)
	assert.Equal(t, "Swift", def.Name)
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

// ⚑ This used to pin the opposite: damage tags were "arbitrary strings by
// design", so a bespoke `boss_x_lava` composed with a general `fire`. D4 closed
// the vocabulary — an unknown type is a typo, not an extension point — which
// RETIRES that bespoke-tag capability. It was documented but unused: no content
// ever authored one. If boss content wants a bespoke axis later it needs a
// deliberate re-opening, not a silent one.
func TestParse_DamageTags(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "radius": 1, "damageHP": 5, "targetsEnemies": true, "damageTags": ["fire", "bleed"]}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, []string{"fire", "bleed"}, def.Effects[0].Damage.Tags)
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
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_DuplicateDamageTagFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageTags":["fire","fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_DamageTagsOnNonDamageEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"heal_aura","damageTags":["fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

// --- gate keys and the closed damage-type vocabulary (D4) ---

func TestParse_GateKey(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "radius": 1, "damageHP": 5, "targetsEnemies": true, "gateKey": "harvest"}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, "harvest", def.Effects[0].Damage.GateKey)
	assert.Empty(t, def.Effects[0].Damage.Tags,
		"a gated hit declares no damage type — its targets are an explicit list")
}

func TestParse_GateKeyDefaultsToEmpty(t *testing.T) {
	damage := mustParse(t, damageAuraJSON)
	require.Len(t, damage.Effects, 1)
	assert.Empty(t, damage.Effects[0].Damage.GateKey)
}

// The whole point of closing the two vocabularies (D4) is that neither can be
// typo'd into the other, and that a mistake NAMES itself instead of shipping as
// a skill that silently hits nothing.
func TestMap_VocabularyMixUpsAreNamed(t *testing.T) {
	effect := func(body string) error {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","radius":1,"targetsEnemies":true,"damageHP":5,` + body + `}]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		return err
	}

	err := effect(`"damageTags": ["harvest"]`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "GATE KEY", "a gate key in damageTags says so")

	err = effect(`"gateKey": "fire"`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DAMAGE TYPE", "a damage type in gateKey says so")

	err = effect(`"damageTags": ["frost", "flame"]`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown damage type", "a typo is rejected, not silently carried")

	err = effect(`"gateKey": "harvest", "damageTags": ["physical"]`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no damageTags", "the two concepts are mutually exclusive")

	require.NoError(t, effect(`"damageTags": ["frost"]`), "a real damage type loads")
	require.NoError(t, effect(`"gateKey": "smash"`), "a real gate key loads")
}

// --- per-hit variance (item 11 Phase 3) ---

func TestParse_Variance(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "radius": 1, "targetsEnemies": true, "damageHP": 7, "variance": 0.15}]
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
		`{"type": "instant_damage", "radius": 1, "targetsEnemies": true, "damageHP": 25, "variance": 0.1}`,
		`{"type": "heal_aura", "radius": 1, "healHP": 6, "variance": 0.1}`,
		`{"type": "self_heal", "healHP": 20, "variance": 0.1}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		def, err := raw.mapToSkillDefinition(nil)
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
		_, err = raw.mapToSkillDefinition(nil)
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
		_, err = raw.mapToSkillDefinition(nil)
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
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_NegativeResistFactorFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistTags":["fire"],"resistFactor":-0.1,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestParse_ResistWildcardTag(t *testing.T) {
	// The invulnerability shape (plan-effect-types.md D6): one wildcard tag at
	// factor 0 loads as ordinary resist content.
	data := []byte(`{
      "id": 70, "name": "Aegis", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["*"],
                   "resistFactor": 0, "targetsAllies": true, "tickInterval": 90}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.Equal(t, []string{ResistWildcard}, def.Effects[0].Resist.Tags)
	assert.InDelta(t, 0.0, def.Effects[0].Resist.Factor, 1e-6)
}

func TestMap_ResistWildcardMixedWithNamedTagsFails(t *testing.T) {
	// A wildcard alongside named tags would double-apply on the named tags'
	// own hits: the buff covers each hit tag once per matching entry, so
	// ["*", "fire"] at 0.5 would land a pure fire hit at 0.25 while every other
	// hit takes 0.5. Unauthorable rather than a silent asymmetry.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistTags":["*","fire"],"resistFactor":0.5,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

// --- the resist_aura buff-lifetime override (plan-effect-types.md D7) ---

func TestParse_ResistAuraBuffLifetimeMatchesInterval(t *testing.T) {
	data := []byte(`{
      "id": 70, "name": "Aegis", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["*"], "resistFactor": 0,
                   "targetsAllies": true, "tickInterval": 90, "buffLifetimeMatchesInterval": true}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	assert.True(t, def.Effects[0].Resist.BuffLifetimeMatchesInterval)
}

func TestParse_ResistAuraDefaultsToTheIntervalPlusOneConvention(t *testing.T) {
	// Absent means the shipped behavior, for every skill authored before D7.
	data := []byte(`{
      "id": 40, "name": "FireWard", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "resist_aura", "radius": 1.5, "resistTags": ["fire"],
                   "resistFactor": 0.6, "targetsAllies": true, "tickInterval": 30}]
    }`)
	def := mustParse(t, data)
	assert.False(t, def.Effects[0].Resist.BuffLifetimeMatchesInterval)
}

func TestMap_BuffLifetimeMatchesIntervalOnNonAuraResistFormsFails(t *testing.T) {
	// The lever is a CADENCE lever: it only means anything where a lifetime is
	// derived from a tick interval. The passive has no cadence and the instant
	// form authors its lifetime outright, so the key is a silent no-op on both
	// and the allowlist rejects it.
	for _, body := range []string{
		`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"resist_passive","resistTags":["fire"],"resistFactor":0.5,"buffLifetimeMatchesInterval":true}]}`,
		`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":10,"effects":[{"type":"instant_resist","radius":1,"resistTags":["*"],"resistFactor":0,"resistDurationTicks":150,"targetsAllies":true,"buffLifetimeMatchesInterval":true}]}`,
	} {
		raw, err := parseSkillDefinition([]byte(body))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "buffLifetimeMatchesInterval")
	}
}

// --- instant_resist (plan-effect-types.md C3 / D5) ---

func TestParse_InstantResist(t *testing.T) {
	// The resist row's cooldown cell: the resist payload plus its own authored
	// buff lifetime, the instant_shield shape.
	data := []byte(`{
      "id": 69, "name": "Sanctuary", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 900,
      "effects": [{"type": "instant_resist", "radius": 1.5, "resistTags": ["*"],
                   "resistFactor": 0, "resistDurationTicks": 150,
                   "targetsAllies": true, "maxTargets": 1, "maxTargetsPerLevel": 1}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeInstantResist, e.Type)
	require.NotNil(t, e.Resist)
	assert.Equal(t, []string{ResistWildcard}, e.Resist.Tags)
	assert.InDelta(t, 0.0, e.Resist.Factor, 1e-6)
	assert.Equal(t, 150, e.Resist.DurationTicks)
	assert.True(t, e.TargetsAllies)
	assert.False(t, e.Resist.TargetsSelf)
}

func TestMap_InstantResistWithoutDurationFails(t *testing.T) {
	// The instant form carries its own buff lifetime, the instant_shield rule:
	// an absent duration would expire on application.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":10,"effects":[{"type":"instant_resist","radius":1,"resistTags":["*"],"resistFactor":0,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "resistDurationTicks")
}

func TestMap_ResistDurationOnResistAuraFails(t *testing.T) {
	// The aura form derives its buff lifetime from the tick cadence, so the key
	// is not in its allowlist; authoring it there is a silent no-op otherwise.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"resist_aura","radius":1,"resistTags":["fire"],"resistFactor":0.5,"resistDurationTicks":150,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_ResistTagsOnNonResistEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"resistTags":["fire"]}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestParse_InvalidJSON(t *testing.T) {
	_, err := parseSkillDefinition([]byte(`{invalid`))
	assert.Error(t, err)
}

func TestMap_UnknownCategory(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"unknown","maxLevel":1,"effects":[]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_UnknownEffectType(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"no_such_type"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_UnknownSelector(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"selector":"no_such_selector"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestParse_SelectorAndCap(t *testing.T) {
	data := []byte(`{
      "id": 1, "name": "X", "category": "active_aura", "maxLevel": 5,
      "effects": [{"type": "damage_aura", "radius": 1, "damageHP": 5, "targetsEnemies": true, "selector": "lowest_health", "maxTargets": 2, "maxTargetsPerLevel": 1, "tickIntervalPerLevel": -1}]
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
	data := []byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","radius":1,"damageHP":5,"targetsEnemies":true}]}`)
	def := mustParse(t, data)

	e := def.Effects[0]
	assert.Equal(t, SelectorNearest, e.Selector)
	assert.Equal(t, 0, e.MaxTargets)
}

func TestParse_SlowAura(t *testing.T) {
	data := []byte(`{
      "id": 4, "name": "Slow", "category": "active_aura", "maxLevel": 5,
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
      "id": 21, "name": "FirstAid", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 900,
      "effects": [{"type": "self_heal", "healHP": 0.20, "healHPPerLevel": 0.05}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeSelfHeal, e.Type)
	assert.InDelta(t, 0.20, e.SelfHeal.HealHP, 1e-6)
	assert.InDelta(t, 0.05, e.SelfHeal.HealHPPerLevel, 1e-6)
}

func TestParse_Dash(t *testing.T) {
	data := []byte(`{
      "id": 33, "name": "Dash", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 300,
      "effects": [{"type": "dash", "dashDistance": 2.5, "dashDistancePerLevel": 0.5}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeDash, e.Type)
	require.NotNil(t, e.Dash)
	assert.InDelta(t, 2.5, e.Dash.Distance, 1e-6)
	assert.InDelta(t, 0.5, e.Dash.DistancePerLevel, 1e-6)
}

func TestParse_DashDistanceScalesPerLevel(t *testing.T) {
	// Distance is a plain Scaled() base+perLevel pair; L1 = base, higher levels
	// add DistancePerLevel each.
	assert.InDelta(t, 2.5, Scaled(float32(2.5), 0.5, 1), 1e-6)
	assert.InDelta(t, 3.5, Scaled(float32(2.5), 0.5, 3), 1e-6)
}

func TestMap_DashZeroDistanceFails(t *testing.T) {
	// A zero-distance dash is a do-nothing cooldown — reject it loud.
	raw, err := parseSkillDefinition([]byte(`{"id":33,"name":"Dash","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"dash","dashDistance":0}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "dashDistance")
}

func TestMap_DashKeyOnOtherEffectFails(t *testing.T) {
	// dashDistance on a non-dash effect is a silent no-op — the allowlist rejects it.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"self_heal","healHP":0.2,"dashDistance":2.5}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestParse_TickRate(t *testing.T) {
	data := []byte(`{
      "id": 34, "name": "Haste", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 300,
      "effects": [{"type": "tick_rate", "tickRateFactor": 0.5, "tickRateDurationTicks": 90}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeTickRate, e.Type)
	require.NotNil(t, e.TickRate)
	assert.InDelta(t, 0.5, e.TickRate.Factor, 1e-6)
	assert.Equal(t, 90, e.TickRate.DurationTicks)
}

func TestMap_TickRateNonPositiveFactorFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":34,"name":"Haste","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"tick_rate","tickRateFactor":0,"tickRateDurationTicks":90}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "tickRateFactor")
}

func TestMap_TickRateUnityFactorFails(t *testing.T) {
	// A factor of 1 is neither haste nor slow — a silent no-op cooldown.
	raw, err := parseSkillDefinition([]byte(`{"id":34,"name":"Haste","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"tick_rate","tickRateFactor":1,"tickRateDurationTicks":90}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "tickRateFactor")
}

func TestMap_TickRateZeroDurationFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":34,"name":"Haste","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"tick_rate","tickRateFactor":0.5,"tickRateDurationTicks":0}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "tickRateDurationTicks")
}

func TestMap_TickRateKeyOnOtherEffectFails(t *testing.T) {
	// tickRateFactor on a non-tick_rate effect is a silent no-op — the allowlist rejects it.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"self_heal","healHP":0.2,"tickRateFactor":0.5}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestParse_SpeedBurst(t *testing.T) {
	data := []byte(`{
      "id": 10, "name": "Swift", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 600,
      "effects": [{"type": "speed_burst", "targetsSelf": true, "speedFactor": 1.5, "speedFactorPerLevel": 0.1,
                   "speedDurationTicks": 150, "speedDurationTicksPerLevel": 30}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeSpeedBurst, e.Type)
	require.NotNil(t, e.Speed)
	assert.True(t, e.Speed.TargetsSelf)
	assert.False(t, e.TargetsAllies)
	assert.InDelta(t, 1.5, e.Speed.Factor, 1e-6)
	assert.InDelta(t, 0.1, e.Speed.FactorPerLevel, 1e-6)
	assert.Equal(t, 150, e.Speed.DurationTicks)
	assert.Equal(t, 30, e.Speed.DurationTicksPerLevel)
}

// ⚑ Landmine C, direction 1 (plan-effect-types.md C4): opening speed_burst's
// allowlist to "radius" puts it under the generic zero-radius gate, which would
// hard-fail the SHIPPED Swift authoring at boot. A self-only burst reaches only
// the caster and projects no query circle, so it must keep parsing radius-less.
func TestMap_SpeedBurstSelfOnlyNeedsNoRadius(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":10,"name":"Swift","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[{"type":"speed_burst","targetsSelf":true,"speedFactor":1.5,"speedDurationTicks":150}]}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)
	assert.InDelta(t, 0, def.Effects[0].Radius, 1e-6)
}

// ⚑ Landmine C, direction 2: the ALLY form does project a query circle, and a
// circle with no radius reaches nobody — the silent no-op the generic gate
// exists to stop. Same rule, conditioned on the flag that turns the circle on.
func TestMap_SpeedBurstAlliesWithoutRadiusFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":10,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[{"type":"speed_burst","targetsAllies":true,"speedFactor":1.5,"speedDurationTicks":150}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "radius")
}

// A burst that targets neither the caster nor allies is a cast that reaches
// nobody — the no-silent-no-op posture, and the reason targetsSelf had to become
// authored rather than implicit (D8).
func TestMap_SpeedBurstWithNoTargetFlagFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":10,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[{"type":"speed_burst","speedFactor":1.5,"speedDurationTicks":150}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "targetsSelf")
}

func TestParse_SpeedBurstAllyForm(t *testing.T) {
	data := []byte(`{
      "id": 72, "name": "Onward", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 900,
      "effects": [{"type": "speed_burst", "targetsAllies": true, "radius": 3, "selector": "nearest",
                   "maxTargets": 2, "maxTargetsPerLevel": 1,
                   "speedFactor": 1.4, "speedDurationTicks": 150}]
    }`)
	def := mustParse(t, data)

	e := def.Effects[0]
	assert.Equal(t, EffectTypeSpeedBurst, e.Type)
	assert.True(t, e.TargetsAllies)
	assert.False(t, e.Speed.TargetsSelf, "the caster stays behind (D9) unless it authors targetsSelf")
	assert.InDelta(t, 3, e.Radius, 1e-6)
	assert.Equal(t, SelectorNearest, e.Selector)
	assert.Equal(t, 2, e.MaxTargets)
}

// speed_burst never learned targetsEnemies: dragging an enemy is slow_aura's
// axis, and a speed BUFF on an enemy is content nobody asked for.
func TestMap_SpeedBurstRejectsTargetsEnemies(t *testing.T) {
	mustFailMapCooldown(t, `{"type":"speed_burst","targetsEnemies":true,"radius":3,"speedFactor":1.5,"speedDurationTicks":150}`, "not valid on this effect type")
}

func TestParse_SpeedAura(t *testing.T) {
	data := []byte(`{
      "id": 71, "name": "FlyYouFools", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "speed_aura", "targetsAllies": true, "radius": 2.5,
                   "tickInterval": 30, "costFractionOfMax": 0.02,
                   "speedFactor": 1.3, "speedFactorPerLevel": 0.05}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeSpeedAura, e.Type)
	require.NotNil(t, e.Speed)
	assert.True(t, e.TargetsAllies)
	assert.False(t, e.Speed.TargetsSelf, "D9: the caster is never in its own in-range set")
	assert.InDelta(t, 1.3, e.Speed.Factor, 1e-6)
	assert.InDelta(t, 0.05, e.Speed.FactorPerLevel, 1e-6)
	assert.Equal(t, 0, e.Speed.DurationTicks, "the aura form derives its lifetime from the cadence")
	assert.InDelta(t, 2.5, e.Radius, 1e-6)
	assert.Equal(t, 30, e.TickInterval)
}

// The aura form is a HASTE field: a factor at or below 1 would be a "speed"
// aura that drags its own allies, which is slow_aura's job and the opposite of
// what the type is named for.
func TestMap_SpeedAuraFactorNotAboveUnityFails(t *testing.T) {
	for _, factor := range []string{"0.8", "1"} {
		raw, err := parseSkillDefinition([]byte(`{"id":71,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"speed_aura","targetsAllies":true,"radius":2,"tickInterval":30,"speedFactor":` + factor + `}]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "speedFactor", "factor %s", factor)
	}
}

// targetsAllies is the aura's ONLY delivery: no targetsSelf (D9 excludes the
// caster) and no targetsEnemies (slow_aura owns that axis), so without the flag
// the aura ticks, charges and reaches nobody.
func TestMap_SpeedAuraWithoutTargetsAlliesFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":71,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"speed_aura","radius":2,"tickInterval":30,"speedFactor":1.3}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "targetsAllies")
}

// The keys the aura form deliberately does NOT take: a duration (its lifetime
// comes from the cadence, computed not authored), targetsEnemies and
// targetsSelf. Each would be a silent no-op the allowlist turns into a boot
// failure.
func TestMap_SpeedAuraRejectsDurationAndTheOtherTargetFlags(t *testing.T) {
	for _, extra := range []string{
		`"speedDurationTicks": 150`,
		`"speedDurationTicksPerLevel": 15`,
		`"targetsEnemies": true`,
		`"targetsSelf": true`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":71,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"speed_aura","targetsAllies":true,"radius":2,"tickInterval":30,"speedFactor":1.3,` + extra + `}]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "not valid on this effect type", "extra: %s", extra)
	}
}

func TestParse_LifestealBurst(t *testing.T) {
	data := []byte(`{
      "id": 8, "name": "Bloodthirst", "category": "cooldown", "maxLevel": 5, "cooldownTicks": 900,
      "effects": [{"type": "lifesteal_burst", "lifestealFraction": 0.3,
                   "lifestealFractionPerLevel": 0.05, "lifestealDurationTicks": 180}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeLifestealBurst, e.Type)
	require.NotNil(t, e.Lifesteal)
	assert.InDelta(t, 0.3, e.Lifesteal.Fraction, 1e-6)
	assert.InDelta(t, 0.05, e.Lifesteal.FractionPerLevel, 1e-6)
	assert.Equal(t, 180, e.Lifesteal.DurationTicks)

	assert.InDelta(t, 0.5, e.Lifesteal.FractionAt(5), 1e-6, "0.3 + 4×0.05")
	assert.Equal(t, 180, e.Lifesteal.TicksAt(5), "the window is fixed — level buys strength, not uptime")
}

func TestMap_LifestealBurstNonPositiveFails(t *testing.T) {
	// A zero leech is a cooldown that costs resource and does nothing; a zero
	// lifetime is a buff that expires before a single hit can read it.
	mustFailMapCooldown(t, `{"type":"lifesteal_burst","lifestealFraction":0,"lifestealDurationTicks":180}`, "lifestealFraction")
	mustFailMapCooldown(t, `{"type":"lifesteal_burst","lifestealFraction":0.3,"lifestealDurationTicks":0}`, "lifestealDurationTicks")
}

// lifesteal_burst SHARES the lifestealFraction key with the damage payload —
// same quantity, granted for a while instead of welded to one effect. The
// per-type allowlist is the only thing keeping the two apart, so the halves that
// do NOT transfer are worth pinning: a burst has no geometry and no targets.
func TestMap_LifestealBurstRejectsGeometryAndTargeting(t *testing.T) {
	for _, effect := range []string{
		`{"type": "lifesteal_burst", "lifestealFraction": 0.3, "lifestealDurationTicks": 180, "radius": 2}`,
		`{"type": "lifesteal_burst", "lifestealFraction": 0.3, "lifestealDurationTicks": 180, "targetsEnemies": true}`,
		`{"type": "lifesteal_burst", "lifestealFraction": 0.3, "lifestealDurationTicks": 180, "maxTargets": 1}`,
		`{"type": "lifesteal_burst", "lifestealFraction": 0.3, "lifestealDurationTicks": 180, "damageHP": 5}`,
	} {
		mustFailMapCooldown(t, effect, "not valid on this effect type")
	}
}

// mustFailMapCooldown is mustFailMap for effects that only make sense on a
// cooldown — an active_aura wrapper would fail on the category rather than on
// the thing under test.
func mustFailMapCooldown(t *testing.T, effect string, wantErr string) {
	t.Helper()
	raw, err := parseSkillDefinition([]byte(`{"id":8,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[` + effect + `]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, wantErr, "effect: %s", effect)
}

func TestMap_SpeedBurstNonPositiveFactorFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":10,"name":"Swift","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[{"type":"speed_burst","speedFactor":0,"speedDurationTicks":150}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "speedFactor")
}

func TestMap_SpeedBurstUnityFactorFails(t *testing.T) {
	// A factor of 1 neither hastens nor slows — a silent no-op cooldown, the
	// tickRateFactor rule.
	raw, err := parseSkillDefinition([]byte(`{"id":10,"name":"Swift","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[{"type":"speed_burst","speedFactor":1,"speedDurationTicks":150}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "speedFactor")
}

func TestMap_SpeedBurstZeroDurationFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":10,"name":"Swift","category":"cooldown","maxLevel":1,"cooldownTicks":600,"effects":[{"type":"speed_burst","speedFactor":1.5,"speedDurationTicks":0}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "speedDurationTicks")
}

func TestMap_SpeedBurstKeyOnOtherEffectFails(t *testing.T) {
	// speedFactor on a non-speed_burst effect is a silent no-op — the allowlist rejects it.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"self_heal","healHP":0.2,"speedFactor":1.5}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestParse_DamageReductionStat(t *testing.T) {
	data := []byte(`{
      "id": 11, "name": "Tough", "category": "passive", "maxLevel": 3,
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
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "unknown stat")
}

func TestMap_StatMultiplierNoScalingFails(t *testing.T) {
	// Both statBonus and statBonusPerLevel zero would be a do-nothing passive.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"stat_multiplier","stat":"movementSpeed"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "no scaling")
}

func TestMap_StaleAdditivePerLevelKeyFails(t *testing.T) {
	// The pre-unification "additivePerLevel" key (or any typo) is not on the
	// stat_multiplier allowlist — the key check fails it by name instead of
	// json.Unmarshal silently dropping it.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"passive","maxLevel":1,"effects":[{"type":"stat_multiplier","stat":"movementSpeed","additivePerLevel":0.05}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
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
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "targetsEnemies", "stale flag must name the successor: %s", effect)
	}
}

func TestMap_UnknownEffectKeyFails(t *testing.T) {
	// Typos hard-fail on every effect type — json.Unmarshal alone would drop
	// the key and load a silently mis-tuned effect.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"radiusPerLvl":0.5}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
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
      "id": 5, "name": "Immolate", "category": "active_aura", "maxLevel": 5,
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
		_, err = raw.mapToSkillDefinition(nil)
		assert.Error(t, err, "underspecified dot must be rejected: %s", effect)
	}
}

func TestMap_DotKeysOnOtherEffectsFail(t *testing.T) {
	// dotTicks on a plain damage_aura would be silently ignored.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageHP":7,"dotTicks":3}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "dotTicks")
}

// --- taunt / detaunt (mob-depth chunk 7) ---

func TestMap_Taunt(t *testing.T) {
	data := []byte(`{
      "id": 25, "name": "Taunt", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 300,
      "effects": [{"type": "taunt", "radius": 2.0, "targetsEnemies": true, "threatMargin": 50}]
    }`)
	def := mustParse(t, data)
	e := def.Effects[0]
	require.NotNil(t, e.Threat, "taunt payload")
	assert.Nil(t, e.Damage)
	assert.InDelta(t, 50, e.Threat.Margin, 1e-6)
	assert.True(t, e.TargetsEnemies)
}

func TestMap_Detaunt(t *testing.T) {
	data := []byte(`{
      "id": 26, "name": "Fade", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 300,
      "effects": [{"type": "detaunt", "radius": 2.0, "targetsEnemies": true}]
    }`)
	def := mustParse(t, data)
	e := def.Effects[0]
	require.NotNil(t, e.Threat, "detaunt still carries the (empty) threat payload")
	assert.InDelta(t, 0, e.Threat.Margin, 1e-6, "detaunt ignores margin")
}

func TestMap_TauntZeroMarginFails(t *testing.T) {
	// A margin that merely equals the current top loses the retention tiebreak
	// (handoff: exceed, don't match) — a zero/negative margin is a no-op.
	for _, margin := range []string{"0", "-5"} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":100,"effects":[{"type":"taunt","radius":2,"targetsEnemies":true,"threatMargin":` + margin + `}]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "threatMargin", "margin %s must be rejected", margin)
	}
}

func TestMap_ThreatMarginOnDetauntFails(t *testing.T) {
	// threatMargin on detaunt would be a silent no-op — the allowlist rejects it.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":100,"effects":[{"type":"detaunt","radius":2,"targetsEnemies":true,"threatMargin":50}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "threatMargin")
}

func TestMap_StatFieldsOnNonStatEffectFails(t *testing.T) {
	// stat/statBonus on other effect types would be a silent no-op.
	for _, effect := range []string{
		`{"type": "damage_aura", "targetsEnemies": true, "damageHP": 7, "statBonus": 0.1}`,
		`{"type": "slow_aura", "targetsEnemies": true, "slowFraction": 0.5, "stat": "movementSpeed"}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.Error(t, err, "stat fields must be rejected on %s", effect)
	}
}

func TestMap_ExplicitTickInterval(t *testing.T) {
	data := []byte(`{
      "id": 99, "name": "Slow", "category": "active_aura", "maxLevel": 1,
      "effects": [{"type": "damage_aura", "radius": 1, "damageHP": 5, "tickInterval": 3, "targetsEnemies": true}]
    }`)
	def := mustParse(t, data)
	assert.Equal(t, 3, def.Effects[0].TickInterval)
}

// TickInterval is a *int precisely so "absent" and "authored 0" are
// distinguishable (backlog §27.3.3). An authored 0 or negative is a value the
// engine cannot honour, so it must hard-fail at load like every other inert
// config — silently rewriting it to 1 is the one thing this file exists to
// prevent. Absent stays normalized to 1 (TestMap_* above pin that).
func TestMap_NonPositiveTickIntervalFails(t *testing.T) {
	mustFailMap(t, `{"type":"damage_aura","radius":1,"targetsEnemies":true,"damageHP":5,"tickInterval":0}`, "tickInterval")
	mustFailMap(t, `{"type":"damage_aura","radius":1,"targetsEnemies":true,"damageHP":5,"tickInterval":-5}`, "tickInterval")
}

// --- the buff-lifetime property (plan-resource-costs-feedback R3 / §4.1) ---

// A dot_aura or hot_aura holds its target through REFRESH: the aura re-applies
// every tickInterval, and each application resets a buff whose own lifetime is
// dotTicks × dotTickInterval. Authoring the lifetime shorter than the cadence
// turns a debuff the player experiences as permanent into a blinking one — it
// expires, the target walks free, and it comes back on the next application.
//
// This is the ONE place the property is authorable. resist / slow / shield
// derive their lifetime as `effectiveTickInterval + 1` at the apply site, so the
// refresh structurally outruns the expiry however the cadence is authored; the
// over-time pair is the pair where the two numbers are independent.
//
// It matters now because F5 moved four effects onto a slower shared beat. The
// failure is silent in every other channel: the skill loads, the tooltip reads
// right, and only a player watching a dot icon flicker would ever notice.
func TestMap_DotAuraLifetimeMustOutlastItsReapplyCadence(t *testing.T) {
	// lifetime 2 × 10 + 1 = 21 ticks, re-applied every 30 — it expires first.
	mustFailMap(t, `{"type":"dot_aura","radius":1,"targetsEnemies":true,"damageHP":5,"dotTicks":2,"dotTickInterval":10,"tickInterval":30}`,
		"outlast")
	mustFailMap(t, `{"type":"hot_aura","radius":1,"healHP":5,"hotTicks":2,"hotTickInterval":10,"tickInterval":30}`,
		"outlast")
}

// The cadence scales with level and the lifetime does not, so the property has
// to hold at maxLevel, not at level 1. Authored here as the level-1-passes /
// level-5-fails case, because that is the shape a real content edit takes: a
// per-level cadence tweak, correct where it was checked.
func TestMap_DotAuraLifetimeCheckedAtMaxLevel(t *testing.T) {
	// lifetime 61; interval 10 at L1 (fine) but 10 + 4×15 = 70 at L5.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":5,"effects":[` +
		`{"type":"dot_aura","radius":1,"targetsEnemies":true,"damageHP":5,"dotTicks":2,"dotTickInterval":30,"tickInterval":10,"tickIntervalPerLevel":15}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "outlast")
}

// The instant twins carry no re-apply cadence — a cooldown fires once per cast,
// so a short-lived dot from Ignite or NovaBurst is the authored intent, not a
// blinking permanent one. Guarding them would reject live content.
func TestMap_InstantDotIsNotSubjectToTheLifetimeRule(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[` +
		`{"type":"instant_dot","radius":1.5,"targetsEnemies":true,"damageHP":6,"dotTicks":2,"dotTickInterval":10}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.NoError(t, err)
}

// --- spawn (effect foundations Step 3 / mob-depth chunk 1) ---

func TestMap_SpawnEffect(t *testing.T) {
	data := []byte(`{
      "id": 23, "name": "SummonTotem", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 450,
      "effects": [{
        "type": "spawn", "spawnMob": "Totem",
        "ttlTicks": 300, "ttlTicksPerLevel": 60,
        "powerPerOwnerLevel": 0.05
      }]
    }`)
	def := mustParse(t, data)
	e := def.Effects[0]
	require.NotNil(t, e.Spawn)
	assert.Nil(t, e.Damage, "spawn payload, not damage payload")
	assert.Equal(t, "Totem", e.Spawn.MobName)
	assert.Equal(t, 300, e.Spawn.TTLAt(1))
	assert.Equal(t, 420, e.Spawn.TTLAt(3), "skill level scales the TTL")
	// The authored RATE is what the spawn site hands the summon; the multiplier
	// itself is derived live from the owner's level by Mob.SummonPower (R5).
	assert.InDelta(t, 0.05, e.Spawn.PowerPerOwnerLevel, 1e-6)
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
	assert.Zero(t, e.PowerPerOwnerLevel, "absent per-level = no owner scaling")
}

func TestMap_SpawnEffectInvalid(t *testing.T) {
	for _, effect := range []string{
		// missing mob name
		`{"type": "spawn", "ttlTicks": 300}`,
		// missing/zero TTL — an instantly-expiring summon is unauthorable
		`{"type": "spawn", "spawnMob": "Totem"}`,
		`{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 0}`,
		// negative owner-level scaling — the field is a buff by design
		`{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300, "powerPerOwnerLevel": -0.1}`,
		// retired with chunk 1b: a summon's body scaling IS its owner's level
		`{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300, "maxHealthPerOwnerLevel": 2}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":23,"name":"X","category":"cooldown","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.Error(t, err, "invalid spawn must be rejected: %s", effect)
	}
}

func TestMap_SpawnKeysOnOtherEffectsFail(t *testing.T) {
	// spawnMob/ttlTicks on a non-spawn effect would be silently ignored.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageHP":7,"spawnMob":"Totem"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "spawnMob")
}

// light_aura (atmosphere & recovery chunk 3): the first rendering-only effect
// type — geometry only, no payload, no targeting, no cadence, no apply path.

func TestParse_LightAura(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 6,
	  "name": "Light",
	  "category": "active_aura",
	  "maxLevel": 3,
	  "effects": [
	    {"type": "light_aura", "radius": 4.0, "radiusPerLevel": 1.0}
	  ]
	}`))

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeLightAura, e.Type)
	assert.InDelta(t, 4.0, e.Radius, 1e-6)
	assert.InDelta(t, 1.0, e.RadiusPerLevel, 1e-6)
	// Rendering-only: no payload, no target flags.
	assert.Nil(t, e.Damage)
	assert.Nil(t, e.Heal)
	assert.False(t, e.TargetsEnemies)
	assert.False(t, e.TargetsAllies)
}

func TestMap_LightAuraRejectsNonGeometryKeys(t *testing.T) {
	for _, effect := range []string{
		`{"type": "light_aura", "radius": 4, "healHP": 6}`,
		`{"type": "light_aura", "radius": 4, "targetsEnemies": true}`,
		`{"type": "light_aura", "radius": 4, "tickInterval": 30}`,
		`{"type": "light_aura", "radius": 4, "maxTargets": 1}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":6,"name":"Light","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "not valid on this effect type", "light_aura must reject: %s", effect)
	}
}

// --- inert-config guards: no-op payloads and zero-radius geometry (§27.3.1/§27.3.2) ---

func TestParse_PayloadlessTypesStillParse(t *testing.T) {
	// §27.3.1 regression: light_aura and recall are the two types the payload
	// switch intentionally handles with no payload. They must keep parsing
	// (the default: branch hard-fails only a type forgotten from the switch).
	for _, effect := range []string{
		`{"type": "light_aura", "radius": 4}`,
		`{"type": "recall"}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		require.NoError(t, err, "payload-less type must still parse: %s", effect)
	}
}

func TestMap_DamageWithNoAmountFails(t *testing.T) {
	// damageHP, damageHPPerLevel and structureDamageFraction all 0 → the aura
	// deals nothing (§27.3.2).
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","radius":1,"targetsEnemies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no damage authored")
}

func TestParse_SiegeDamageAuraStaysValid(t *testing.T) {
	// A structure-only aura (0 direct HP but a structureDamageFraction) still
	// damages placeables, so it must NOT trip the no-damage guard (§27.3.2).
	def := mustParse(t, []byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","radius":1,"targetsStructures":true,"structureDamageFraction":0.5}]}`))
	require.Len(t, def.Effects, 1)
	assert.InDelta(t, 0.5, def.Effects[0].Damage.StructureDamageFraction, 1e-6)
}

func TestMap_HealAuraWithNoHealFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"heal_aura","radius":1,"tickInterval":60}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no heal authored")
}

func TestMap_SelfHealWithNoHealFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":300,"effects":[{"type":"self_heal"}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no heal authored")
}

func TestMap_ZeroRadiusGeometryEffectFails(t *testing.T) {
	// A geometry effect with radius 0 senses nothing (§27.3.2). Non-geometry
	// types (self_heal, stat_multiplier, recall, …) carry no radius and are
	// unaffected. Placed after the payload build, so a payload error would win
	// — here every payload is valid, isolating the radius check.
	for _, effect := range []string{
		`{"type": "damage_aura", "radius": 0, "targetsEnemies": true, "damageHP": 5}`,
		`{"type": "heal_aura", "healHP": 5, "tickInterval": 60}`,             // radius omitted → 0
		`{"type": "slow_aura", "targetsEnemies": true, "slowFraction": 0.3}`, // radius omitted → 0
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		require.Error(t, err, "zero-radius geometry effect must fail: %s", effect)
		assert.Contains(t, err.Error(), "radius must be > 0", "for: %s", effect)
	}
}

// --- damage vocabulary: execute / berserker / crit / lifesteal (plan-skill-vocab chunk 1) ---

func TestParse_DamageVocabularyFields(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 7, "name": "Reaper", "category": "active_aura", "maxLevel": 3,
	  "effects": [{
	    "type": "damage_aura", "targetsEnemies": true, "radius": 3, "damageHP": 6,
	    "executeBelowFraction": 0.35, "executeBonusFactor": 2,
	    "berserkerMaxBonusFactor": 1,
	    "critChance": 0.25, "critFactor": 2,
	    "lifestealFraction": 0.5
	  }]
	}`))

	require.Len(t, def.Effects, 1)
	d := def.Effects[0].Damage
	assert.InDelta(t, 0.35, d.ExecuteBelowFraction, 1e-6)
	assert.InDelta(t, 2.0, d.ExecuteBonusFactor, 1e-6)
	assert.InDelta(t, 1.0, d.BerserkerMaxBonusFactor, 1e-6)
	assert.InDelta(t, 0.25, d.CritChance, 1e-6)
	assert.InDelta(t, 2.0, d.CritFactor, 1e-6)
	assert.InDelta(t, 0.5, d.LifestealFraction, 1e-6)
}

func TestParse_DamageVocabularyDefaultsInert(t *testing.T) {
	def := mustParse(t, damageAuraJSON)
	d := def.Effects[0].Damage
	assert.Zero(t, d.ExecuteBelowFraction)
	assert.Zero(t, d.ExecuteBonusFactor)
	assert.Zero(t, d.BerserkerMaxBonusFactor)
	assert.Zero(t, d.CritChance)
	assert.Zero(t, d.CritFactor)
	assert.Zero(t, d.LifestealFraction)
}

func TestParse_DamageVocabularyValidOnInstantDamage(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 7, "name": "X", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 100,
	  "effects": [{
	    "type": "instant_damage", "targetsEnemies": true, "radius": 3, "damageHP": 20,
	    "executeBelowFraction": 0.2, "executeBonusFactor": 3, "lifestealFraction": 1.0
	  }]
	}`))
	d := def.Effects[0].Damage
	assert.InDelta(t, 0.2, d.ExecuteBelowFraction, 1e-6)
	assert.InDelta(t, 1.0, d.LifestealFraction, 1e-6)
}

// mustFailMap asserts that a single-effect skill JSON fails at mapping.
func mustFailMap(t *testing.T, effect string, wantErr string) {
	t.Helper()
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[` + effect + `]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, wantErr, "effect: %s", effect)
}

func TestMap_ExecutePairIncompleteFails(t *testing.T) {
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"executeBelowFraction":0.35}`, "execute")
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"executeBonusFactor":2}`, "execute")
}

func TestMap_ExecuteBoundsFail(t *testing.T) {
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"executeBelowFraction":1.2,"executeBonusFactor":2}`, "executeBelowFraction")
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"executeBelowFraction":-0.1,"executeBonusFactor":2}`, "executeBelowFraction")
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"executeBelowFraction":0.35,"executeBonusFactor":-1}`, "executeBonusFactor")
}

func TestMap_CritChanceAloneIsValid(t *testing.T) {
	// §4.3 v2 (PO 2026-07-20): a skill may author extra crit CHANCE without a
	// factor — it adds to the caster's own crit chance and rolls at the
	// global default factor. Per-level scaling follows the base+(L−1)×perLevel
	// convention.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":5,"effects":[{"type":"damage_aura","radius":1,"targetsEnemies":true,"damageHP":6,"critChance":0.01,"critChancePerLevel":0.01}]}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)
	d := def.Effects[0].Damage
	assert.InDelta(t, 0.01, d.CritChance, 1e-6)
	assert.InDelta(t, 0.01, d.CritChancePerLevel, 1e-6)
	assert.InDelta(t, 0.02, d.CritChanceAt(2), 1e-6)
	assert.InDelta(t, 0.05, d.CritChanceAt(5), 1e-6)
}

func TestMap_CritFactorAloneFails(t *testing.T) {
	// A factor with no authored chance source on the skill stays invalid.
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"critFactor":2}`, "crit")
}

func TestMap_CritBoundsFail(t *testing.T) {
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"critChance":1.5,"critFactor":2}`, "critChance")
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"critChance":-0.1,"critFactor":2}`, "critChance")
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"critChance":0.25,"critFactor":-2}`, "critFactor")
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"critChance":0.01,"critChancePerLevel":-0.01}`, "critChancePerLevel")
}

func TestMap_NegativeBerserkerFails(t *testing.T) {
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"berserkerMaxBonusFactor":-1}`, "berserkerMaxBonusFactor")
}

func TestMap_NegativeLifestealFails(t *testing.T) {
	mustFailMap(t, `{"type":"damage_aura","targetsEnemies":true,"damageHP":6,"lifestealFraction":-0.5}`, "lifestealFraction")
}

func TestMap_DamageVocabularyOnDotsFails(t *testing.T) {
	// Dots are excluded in v1 (§3.3): the allowlist rejects the keys outright.
	mustFailMap(t, `{"type":"dot_aura","targetsEnemies":true,"damageHP":2,"dotTicks":3,"dotTickInterval":10,"executeBelowFraction":0.35,"executeBonusFactor":2}`, "not valid on this effect type")
	mustFailMap(t, `{"type":"instant_dot","targetsEnemies":true,"damageHP":2,"dotTicks":3,"dotTickInterval":10,"lifestealFraction":0.5}`, "not valid on this effect type")
	mustFailMap(t, `{"type":"dot_aura","targetsEnemies":true,"damageHP":2,"dotTicks":3,"dotTickInterval":10,"critChance":0.25,"critFactor":2}`, "not valid on this effect type")
}

func TestDamageParams_ExecuteMultiplier(t *testing.T) {
	d := &DamageParams{ExecuteBelowFraction: 0.35, ExecuteBonusFactor: 2}
	assert.InDelta(t, 2.0, d.ExecuteMultiplier(0.2), 1e-6, "below threshold")
	assert.InDelta(t, 1.0, d.ExecuteMultiplier(0.35), 1e-6, "AT threshold is not below (strict)")
	assert.InDelta(t, 1.0, d.ExecuteMultiplier(0.9), 1e-6, "above threshold")

	unset := &DamageParams{}
	assert.InDelta(t, 1.0, unset.ExecuteMultiplier(0.1), 1e-6, "unset execute is neutral")
}

func TestDamageParams_BerserkerMultiplier(t *testing.T) {
	d := &DamageParams{BerserkerMaxBonusFactor: 1}
	assert.InDelta(t, 1.0, d.BerserkerMultiplier(1.0), 1e-6, "full HP = no bonus")
	assert.InDelta(t, 1.5, d.BerserkerMultiplier(0.5), 1e-6, "half HP = half the max bonus")
	assert.InDelta(t, 2.0, d.BerserkerMultiplier(0.0), 1e-6, "zero HP = full bonus")
	assert.InDelta(t, 1.0, d.BerserkerMultiplier(1.5), 1e-6, "ratio clamped at 1")

	unset := &DamageParams{}
	assert.InDelta(t, 1.0, unset.BerserkerMultiplier(0.0), 1e-6, "unset berserker is neutral")
}

// --- shield_aura / instant_shield (plan-skill-vocab chunk 2) ---

func TestParse_ShieldAura(t *testing.T) {
	data := []byte(`{
      "id": 8, "name": "WardingAura", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "shield_aura", "radius": 1.5, "shieldHP": 20, "shieldHPPerLevel": 5,
                   "targetsAllies": true, "targetsSelf": true, "tickInterval": 1}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeShieldAura, e.Type)
	require.NotNil(t, e.Shield)
	assert.InDelta(t, 20, e.Shield.HP, 1e-6)
	assert.InDelta(t, 5, e.Shield.HPPerLevel, 1e-6)
	assert.True(t, e.TargetsAllies)
	assert.True(t, e.Shield.TargetsSelf)
	assert.InDelta(t, 30, e.Shield.HPAt(3), 1e-6, "level-scaled pool size")
}

func TestParse_InstantShield(t *testing.T) {
	data := []byte(`{
      "id": 27, "name": "Barrier", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 300,
      "effects": [{"type": "instant_shield", "radius": 1.5, "shieldHP": 20,
                   "shieldDurationTicks": 300, "targetsAllies": true, "targetsSelf": true}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeInstantShield, e.Type)
	require.NotNil(t, e.Shield)
	assert.InDelta(t, 20, e.Shield.HP, 1e-6)
	assert.Equal(t, 300, e.Shield.DurationTicks)
	assert.True(t, e.Shield.TargetsSelf)
}

func TestMap_ShieldNoPoolAuthoredFails(t *testing.T) {
	// A both-zero shield is a do-nothing buff — hard-fail like the dot/stat
	// no-scaling guards.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"shield_aura","radius":1,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_NegativeShieldHPFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"shield_aura","radius":1,"shieldHP":-5,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.Error(t, err)
}

func TestMap_InstantShieldWithoutDurationFails(t *testing.T) {
	// The instant form carries its own buff lifetime; an absent/zero duration
	// would expire on application — unauthorable rather than a silent no-op.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":10,"effects":[{"type":"instant_shield","radius":1,"shieldHP":20,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "shieldDurationTicks")
}

func TestMap_ShieldDurationOnShieldAuraFails(t *testing.T) {
	// The aura form derives its buff lifetime from the tick cadence
	// (interval + 1); an authored duration would be a silent no-op.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"shield_aura","radius":1,"shieldHP":20,"shieldDurationTicks":300,"targetsAllies":true}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "shieldDurationTicks")
}

func TestMap_ShieldKeysOnNonShieldEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"shieldHP":20}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "shieldHP")
}

// --- hot pair + revive (plan-skill-vocab chunk 3) ---

func TestParse_HotAura(t *testing.T) {
	data := []byte(`{
      "id": 30, "name": "Rejuvenation", "category": "active_aura", "maxLevel": 3,
      "effects": [{"type": "hot_aura", "radius": 2, "healHP": 3, "healHPPerLevel": 1,
                   "hotTicks": 5, "hotTickInterval": 30, "tickInterval": 10}]
    }`)
	def := mustParse(t, data)

	require.Len(t, def.Effects, 1)
	e := def.Effects[0]
	assert.Equal(t, EffectTypeHotAura, e.Type)
	require.NotNil(t, e.Hot)
	assert.InDelta(t, 3, e.Hot.HP, 1e-6)
	assert.Equal(t, 5, e.Hot.TickCount)
	assert.Equal(t, 30, e.Hot.Interval)
	assert.InDelta(t, 5, e.Hot.HPAt(3), 1e-6, "level-scaled per-event heal")
	assert.Equal(t, 5*30+1, e.Hot.DurationTicks(), "buff lifetime outlasts the aura cadence → lingers")
	assert.False(t, e.Hot.TargetsSelf, "hot_aura is allies-implicit, never self")
}

func TestParse_InstantHot(t *testing.T) {
	data := []byte(`{
      "id": 31, "name": "Recover", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 300,
      "effects": [{"type": "instant_hot", "radius": 2, "healHP": 4,
                   "hotTicks": 6, "hotTickInterval": 20, "targetsSelf": true, "targetsAllies": true}]
    }`)
	def := mustParse(t, data)

	e := def.Effects[0]
	assert.Equal(t, EffectTypeInstantHot, e.Type)
	require.NotNil(t, e.Hot)
	assert.True(t, e.Hot.TargetsSelf)
	assert.True(t, e.TargetsAllies)
	assert.Equal(t, 6*20+1, e.Hot.DurationTicks())
}

func TestMap_HotNoHealAuthoredFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"hot_aura","radius":1,"hotTicks":3,"hotTickInterval":10}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "no heal authored")
}

func TestMap_HotWithoutCadenceFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"hot_aura","radius":1,"healHP":5}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "hotTicks")
}

func TestMap_HotKeysOnNonHotEffectFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"hotTicks":3}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "hotTicks")
}

func TestParse_Revive(t *testing.T) {
	data := []byte(`{
      "id": 32, "name": "Revive", "category": "cooldown", "maxLevel": 1, "cooldownTicks": 600,
      "effects": [{"type": "revive", "radius": 3, "reviveHealthFraction": 0.3}]
    }`)
	def := mustParse(t, data)

	e := def.Effects[0]
	assert.Equal(t, EffectTypeRevive, e.Type)
	require.NotNil(t, e.Revive)
	assert.InDelta(t, 0.3, e.Revive.HealthFraction, 1e-6)
}

func TestMap_ReviveFractionOutOfBoundsFails(t *testing.T) {
	for _, frac := range []string{"0", "-0.1", "1.5"} {
		raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":1,"cooldownTicks":10,"effects":[{"type":"revive","radius":3,"reviveHealthFraction":` + frac + `}]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(nil)
		assert.ErrorContains(t, err, "reviveHealthFraction", "fraction %s must fail", frac)
	}
}

// --- cast-time skill-def fields (plan-skill-vocab chunk 4) ---

func TestParse_CastTicks(t *testing.T) {
	def := mustParse(t, []byte(`{
	  "id": 28, "name": "Recall", "category": "cooldown", "maxLevel": 1,
	  "cooldownTicks": 9000, "castTicks": 300, "castTicksPerLevel": -30,
	  "castInterruptedByDamage": true,
	  "effects": [{"type": "recall"}]
	}`))

	assert.Equal(t, 300, def.CastTicks)
	assert.Equal(t, -30, def.CastTicksPerLevel)
	assert.True(t, def.CastInterruptedByDamage)
}

func TestParse_CastTicksAbsentDefaultsToInstant(t *testing.T) {
	def := mustParse(t, novaBurstJSON)

	assert.Equal(t, 0, def.CastTicks)
	assert.False(t, def.CastInterruptedByDamage)
}

func TestMap_NegativeCastTicksFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 28, "name": "Recall", "category": "cooldown", "maxLevel": 1,
	  "cooldownTicks": 9000, "castTicks": -5,
	  "effects": [{"type": "recall"}]
	}`))
	require.NoError(t, err)

	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "castTicks")
}

func TestMap_CastInterruptedByDamageWithoutCastTicksFails(t *testing.T) {
	// The flag on an instant skill is an authoring error — it would silently
	// never apply (mirrors the no-scaling hard-fail guards).
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 20, "name": "NovaBurst", "category": "cooldown", "maxLevel": 1,
	  "cooldownTicks": 300, "castInterruptedByDamage": true,
	  "effects": [{"type": "instant_damage", "radius": 1, "damageHP": 5, "targetsEnemies": true}]
	}`))
	require.NoError(t, err)

	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "castInterruptedByDamage")
}

func TestParse_RecallEffectRejectsPayloadKeys(t *testing.T) {
	// recall has no payload — any key beyond "type" hard-fails via effectKeys.
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 28, "name": "Recall", "category": "cooldown", "maxLevel": 1,
	  "cooldownTicks": 9000, "castTicks": 300,
	  "effects": [{"type": "recall", "radius": 2}]
	}`))
	require.NoError(t, err)

	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "radius")
}

// --- calm + the faction allowlist (plan-faction-flips chunk 2) ---

// calmFactions is the two-faction fixture the calm tests scope against, plus a
// third the allowlist deliberately excludes — a one-faction fixture could not
// tell "resolved the names" from "let everything through".
func calmFactions(t *testing.T) factions.Registry {
	t.Helper()
	fr, err := factions.RegistryFromFS(fstest.MapFS{
		"prey.json":     {Data: []byte(`{"name": "prey", "displayName": "Prey", "hostileTo": []}`)},
		"predator.json": {Data: []byte(`{"name": "predator", "displayName": "Predators", "hostileTo": ["aligned", "prey"]}`)},
		"bandit.json":   {Data: []byte(`{"name": "bandit", "hostileTo": ["aligned"]}`)},
	})
	require.NoError(t, err)
	return fr
}

const calmSkillJSON = `{
  "id": 62, "name": "Calm", "category": "cooldown", "maxLevel": 3,
  "cooldownTicks": 600,
  "targetFactions": ["prey", "predator"],
  "effects": [{"type": "calm", "radius": 4.0, "targetsEnemies": true,
               "calmTicks": 300, "calmTicksPerLevel": 60}]
}`

func TestMap_CalmResolvesTargetFactionsToAMask(t *testing.T) {
	fr := calmFactions(t)
	raw, err := parseSkillDefinition([]byte(calmSkillJSON))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(fr)
	require.NoError(t, err)

	prey, err := fr.GetByName("prey")
	require.NoError(t, err)
	predator, err := fr.GetByName("predator")
	require.NoError(t, err)
	bandit, err := fr.GetByName("bandit")
	require.NoError(t, err)

	want := factions.Bit(prey.ID) | factions.Bit(predator.ID)
	assert.Equal(t, want, def.TargetFactionMask, "authored names resolve to their bits")
	assert.Zero(t, def.TargetFactionMask&factions.Bit(bandit.ID), "an unlisted faction is outside the mask")

	// ⭐ D8's whole point: the runtime gate reads the EFFECT, so the skill's
	// mask has to reach it. A mask that resolved but never got stamped would
	// pass every test above and let calm reach every faction in the game.
	require.Len(t, def.Effects, 1)
	assert.Equal(t, want, def.Effects[0].TargetFactionMask, "the skill's mask is stamped onto its effects")

	require.NotNil(t, def.Effects[0].Calm)
	assert.Equal(t, 300, def.Effects[0].Calm.DurationTicks)
	assert.Equal(t, 60, def.Effects[0].Calm.DurationTicksPerLevel)
}

func TestMap_TargetFactionsCarryTheirDisplayNamesToTheCatalog(t *testing.T) {
	// The mask is the runtime gate; these are what a player READS. The client
	// gets the parsed SkillDefinition verbatim over /skills, so carrying the
	// resolved display names here is the whole delivery mechanism — the bits
	// alone are undecodable client-side (there is no faction catalog), and the
	// authored identifiers are not fit to show.
	fr := calmFactions(t)
	raw, err := parseSkillDefinition([]byte(calmSkillJSON))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(fr)
	require.NoError(t, err)

	// Authoring order, not registry order: the tooltip should read the way the
	// content author wrote it.
	assert.Equal(t, []string{"Prey", "Predators"}, def.TargetFactions)
}

func TestMap_TargetFactionMaskIsNotServedToTheClient(t *testing.T) {
	// The mask is server-only state (backlog §27.3.6). /skills marshals
	// SkillDefinition verbatim, so before this pin the resolved bits shipped on
	// the skill AND on every one of its effects — with zero client readers, and
	// undecodable there anyway: the faction registry is boot-only and the bits
	// depend on registry load order. The DISPLAY NAMES are the thing that
	// travels (see the test above); the bits stay home.
	fr := calmFactions(t)
	raw, err := parseSkillDefinition([]byte(calmSkillJSON))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(fr)
	require.NoError(t, err)

	// Still load-bearing in memory — this is a serialization change, not a
	// deletion. eligibleByTargetFlags reads the effect-level copy every tick.
	require.NotZero(t, def.TargetFactionMask)
	require.Len(t, def.Effects, 1)
	require.NotZero(t, def.Effects[0].TargetFactionMask)

	payload, err := json.Marshal(def)
	require.NoError(t, err)
	assert.NotContains(t, string(payload), "targetFactionMask",
		"the resolved mask must not reach the client, on the skill or on any effect")
	assert.Contains(t, string(payload), "targetFactions",
		"the display names still travel — that is the whole delivery mechanism")
}

func TestMap_TargetFactionsFallBackToTheIdentifier(t *testing.T) {
	// A faction with no authored displayName still renders something.
	fr := calmFactions(t)
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 99, "name": "Hush", "category": "cooldown", "maxLevel": 1,
	  "cooldownTicks": 100, "targetFactions": ["bandit"],
	  "effects": [{"type": "calm", "radius": 4.0, "targetsEnemies": true, "calmTicks": 30}]
	}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(fr)
	require.NoError(t, err)

	assert.Equal(t, []string{"bandit"}, def.TargetFactions)
}

func TestMap_AnUnscopedSkillCarriesNoTargetFactions(t *testing.T) {
	// omitempty + nil: every skill authored before chunk 2 must stay absent
	// from the payload, so the tooltip renders no scope line for them.
	raw, err := parseSkillDefinition([]byte(damageAuraJSON))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)

	assert.Nil(t, def.TargetFactions)
}

func TestMap_CalmWithoutTargetFactionsFails(t *testing.T) {
	// The typo guard (factionScopedEffects): skill-level JSON is parsed without
	// DisallowUnknownFields, so a mistyped `targetFaction` key vanishes
	// silently. Requiring the allowlist turns that into a boot error instead of
	// a calm that reaches every faction in the game.
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 62, "name": "Calm", "category": "cooldown", "maxLevel": 3,
	  "targetFaction": ["prey"],
	  "effects": [{"type": "calm", "radius": 4.0, "targetsEnemies": true, "calmTicks": 300}]
	}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(calmFactions(t))
	assert.ErrorContains(t, err, "targetFactions")
}

func TestMap_UnknownTargetFactionFails(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{
	  "id": 62, "name": "Calm", "category": "cooldown", "maxLevel": 3,
	  "targetFactions": ["prey", "nosuchfaction"],
	  "effects": [{"type": "calm", "radius": 4.0, "targetsEnemies": true, "calmTicks": 300}]
	}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(calmFactions(t))
	assert.ErrorContains(t, err, "nosuchfaction")
}

func TestMap_CalmEffectInvalid(t *testing.T) {
	for _, effect := range []string{
		// no duration — a cast that applies nothing
		`{"type": "calm", "radius": 4.0, "targetsEnemies": true}`,
		`{"type": "calm", "radius": 4.0, "targetsEnemies": true, "calmTicks": 0}`,
		// no radius — a circle that reaches nothing
		`{"type": "calm", "targetsEnemies": true, "calmTicks": 300}`,
		// calm has no cadence: it fires on activation, not per tick
		`{"type": "calm", "radius": 4.0, "targetsEnemies": true, "calmTicks": 300, "tickInterval": 5}`,
		// and no cap/selector — it takes everything in the circle by design
		`{"type": "calm", "radius": 4.0, "targetsEnemies": true, "calmTicks": 300, "maxTargets": 1}`,
	} {
		raw, err := parseSkillDefinition([]byte(`{"id":62,"name":"Calm","category":"cooldown","maxLevel":1,"targetFactions":["prey"],"effects":[` + effect + `]}`))
		require.NoError(t, err)
		_, err = raw.mapToSkillDefinition(calmFactions(t))
		assert.Error(t, err, "invalid calm must be rejected: %s", effect)
	}
}

func TestMap_CalmKeysOnOtherEffectsFail(t *testing.T) {
	// calmTicks on a non-calm effect would be silently ignored.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"damage_aura","targetsEnemies":true,"damageHP":7,"calmTicks":300}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	assert.ErrorContains(t, err, "calmTicks")
}

func TestMap_SkillsWithoutAnAllowlistStayUnrestricted(t *testing.T) {
	// 0 = unrestricted is what makes this chunk behaviour-neutral for the other
	// 83 skills: none authors targetFactions, so none gains a gate.
	def := mustParse(t, damageAuraJSON)
	assert.Zero(t, def.TargetFactionMask)
	for _, e := range def.Effects {
		assert.Zero(t, e.TargetFactionMask)
	}
}

// --- resource cost on the effect (plan-numbers-rewrite D5/D7) ---

func TestParse_CostFractionIsValidOnAnyEffectType(t *testing.T) {
	// D5's PO requirement: the cost must not be hard-coded per effect type.
	// slow_aura has no cost-shaped payload field of its own and never could.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":5,"effects":[{"type":"slow_aura","radius":2,"slowFraction":0.3,"costFractionOfMax":0.04,"costFractionOfMaxPerLevel":-0.005,"tickInterval":30}]}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)

	assert.InDelta(t, 0.04, def.Effects[0].CostFractionOfMax, 1e-6)
	assert.InDelta(t, 0.04, def.Effects[0].CostFractionAt(1), 1e-6)
	assert.InDelta(t, 0.03, def.Effects[0].CostFractionAt(3), 1e-6, "an authored negative makes it cheaper per level")
	assert.InDelta(t, 0, def.Effects[0].CostFractionAt(10), 1e-6, "floored at 0, never a refund")
}

func TestParse_CostFractionOfWholePoolIsRejected(t *testing.T) {
	// A cost nothing can pay reads as a silently dead skill: the aura path
	// would clamp it away every tick and the cooldown path would reject every
	// activation, with nothing failing at load.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"slow_aura","radius":2,"slowFraction":0.3,"costFractionOfMax":1,"tickInterval":30}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "costFractionOfMax")
}

// --- percent-of-max HoT (D14 / L11) ---

func TestParse_HotFractionOfMax(t *testing.T) {
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"cooldown","maxLevel":5,"cooldownTicks":600,"effects":[{"type":"instant_hot","radius":1,"healFractionOfMax":0.05,"healFractionOfMaxPerLevel":0.01,"hotTicks":9,"hotTickInterval":30,"targetsSelf":true}]}`))
	require.NoError(t, err)
	def, err := raw.mapToSkillDefinition(nil)
	require.NoError(t, err)

	assert.InDelta(t, 0.05, def.Effects[0].Hot.FractionOfMax, 1e-6)
	assert.InDelta(t, 0.07, def.Effects[0].Hot.FractionAt(3), 1e-6)
}

func TestParse_HotFlatAndFractionAreMutuallyExclusive(t *testing.T) {
	// L11: authoring both is a content bug that must hard-fail rather than
	// silently pick one — the same rule HealParams already carries.
	raw, err := parseSkillDefinition([]byte(`{"id":1,"name":"X","category":"active_aura","maxLevel":1,"effects":[{"type":"hot_aura","radius":1,"healHP":4,"healFractionOfMax":0.05,"hotTicks":9,"hotTickInterval":30,"tickInterval":30}]}`))
	require.NoError(t, err)
	_, err = raw.mapToSkillDefinition(nil)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "mutually exclusive")
}
