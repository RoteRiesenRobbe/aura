package mobs

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

var testAuraSkillJSON = []byte(`{
  "id": 101,
  "name": "DodoAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [{"type": "damage_aura", "radius": 0.6, "damageHP": 2, "targetsEnemies": true}]
}`)

func testSkillRegistry(t *testing.T) skills.Registry {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"dodo-aura.json": {Data: testAuraSkillJSON},
	})
	require.NoError(t, err)
	return r
}

// testCurve is the f(L) the tier+baseline derivation runs against in tests
// (C0) — the working-lock values, so derived numbers read like production.
func testCurve() curve.Curve {
	return curve.Curve{Growth: 1.12, MaxLevel: 30}
}

// --- entityType override (encounter-controller chunk 9 content) ---

func TestMapMobDefinition_EntityTypeOverrideParsed(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 10,
	  "name": "ProvingBoss",
	  "type": "MOB",
	  "entityType": "AngryMammoth",
	  "body": {"radius": 1.7, "aggroRadius": 10}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	assert.Equal(t, "AngryMammoth", def.EntityType,
		"the override decouples the def name from the wire EntityType")
}

func TestMapMobDefinition_AbsentEntityTypeStaysEmpty(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	assert.Empty(t, def.EntityType,
		"absent override → empty; NewMob falls back to the def name (all pre-chunk-9 defs)")
}

func TestMapMobDefinition_UnknownEntityTypeFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 10,
	  "name": "ProvingBoss",
	  "type": "MOB",
	  "entityType": "NoSuchWireType",
	  "body": {"radius": 1.7, "aggroRadius": 10}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err, "an entityType that is no FlatBuffers EntityType name hard-fails at load")
	assert.Contains(t, err.Error(), "NoSuchWireType")
}

func TestMapMobDefinition_UnknownNameFallbackFails(t *testing.T) {
	// No override, and a name that is no FlatBuffers EntityType. Before §27.2.1
	// this loaded clean and crashed the whole server at first spawn (mob.NewMob's
	// log.Fatalf); now it fails here at load.
	raw, err := parseMobDefinition([]byte(`{
	  "id": 10,
	  "name": "NoSuchWireType",
	  "type": "MOB",
	  "body": {"radius": 1.7, "aggroRadius": 10}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err, "a name that is no EntityType and no override hard-fails at load")
	assert.Contains(t, err.Error(), "NoSuchWireType")
}

func TestMapMobDefinition_ResolvesSkills(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "skills": [{"skillName": "DodoAura", "level": 1}],
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	require.Len(t, def.Skills, 1)
	assert.Equal(t, "DodoAura", def.Skills[0].Def.Name)
	assert.Equal(t, 1, def.Skills[0].Level)
}

func TestMapMobDefinition_SkillLevelDefaultsToOne(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "skills": [{"skillName": "DodoAura"}],
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	require.Len(t, def.Skills, 1)
	assert.Equal(t, 1, def.Skills[0].Level)
}

func TestMapMobDefinition_ResolvesUnlocks(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "unlocks": [{"skillName": "DodoAura", "chance": 0.2}],
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	require.Len(t, def.Unlocks, 1)
	assert.Equal(t, "DodoAura", def.Unlocks[0].Skill.Name)
	assert.InDelta(t, 0.2, def.Unlocks[0].Chance, 1e-6)
}

func TestMapMobDefinition_UnlockChanceDefaultsToGuaranteed(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "unlocks": [{"skillName": "DodoAura"}],
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	require.Len(t, def.Unlocks, 1)
	assert.InDelta(t, 1.0, def.Unlocks[0].Chance, 1e-6, "absent chance = guaranteed")
}

func TestMapMobDefinition_UnknownUnlockSkillFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "unlocks": [{"skillName": "NoSuchAura"}],
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	assert.Error(t, err)
}

func TestMapMobDefinition_InvalidUnlockChanceFails(t *testing.T) {
	for _, chance := range []string{"0", "-0.5", "1.5"} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1,
		  "name": "Dodo",
		  "type": "MOB",
		  "unlocks": [{"skillName": "DodoAura", "chance": ` + chance + `}],
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		assert.Error(t, err, "chance %s must be rejected", chance)
	}
}

func TestMapMobDefinition_UnknownSkillFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "skills": [{"skillName": "NoSuchAura"}],
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	assert.Error(t, err)
}

// --- resistances (item 11 Phase 2) ---

func TestMapMobDefinition_ParsesResistances(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40, "resistances": {"fire": 0.5, "physical": 0.8}},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	require.NotNil(t, def.Factors.Resistances)
	assert.InDelta(t, 0.5, def.Factors.Resistances["fire"], 1e-6)
	assert.InDelta(t, 0.8, def.Factors.Resistances["physical"], 1e-6)
}

func TestMapMobDefinition_NoResistancesIsNil(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Nil(t, def.Factors.Resistances)
}

func TestMapMobDefinition_NegativeResistanceFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"resistances": {"fire": -0.1}},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	assert.Error(t, err)
}

func TestMapMobDefinition_ParsesMaxHealthVariance(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40, "maxHealthVariance": 0.1},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.InDelta(t, 0.1, def.Factors.MaxHealthVariance, 1e-6)
}

func TestMapMobDefinition_MaxHealthVarianceDefaultsToZero(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Zero(t, def.Factors.MaxHealthVariance)
}

func TestMapMobDefinition_MaxHealthVarianceOutOfBoundsFails(t *testing.T) {
	for _, variance := range []string{"-0.1", "1", "1.5"} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1,
		  "name": "Dodo",
		  "type": "MOB",
		  "factors": {"baseMaxHealth": 40, "maxHealthVariance": ` + variance + `},
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		assert.Error(t, err, "maxHealthVariance %s must be rejected (valid: 0 <= v < 1)", variance)
	}
}

func TestMapMobDefinition_EmptyResistanceTagFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"resistances": {"": 0.5}},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	assert.Error(t, err)
}

// --- flee threshold (mob-depth chunk 2) ---

func TestMapMobDefinition_ParsesFleeBelowHealthRatio(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 6,
	  "name": "Rabbit",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 20, "fleeBelowHealthRatio": 0.5},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.InDelta(t, 0.5, def.Factors.FleeBelowHealthRatio, 1e-6)
}

func TestMapMobDefinition_FleeBelowHealthRatioDefaultsToZero(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Zero(t, def.Factors.FleeBelowHealthRatio, "absent = never flees")
}

func TestMapMobDefinition_FleeBelowHealthRatioOutOfBoundsFails(t *testing.T) {
	// 1.0 itself is valid ("flees whenever damaged"); outside [0, 1] is not.
	for _, ratio := range []string{"-0.1", "1.5"} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1,
		  "name": "Dodo",
		  "type": "MOB",
		  "factors": {"fleeBelowHealthRatio": ` + ratio + `},
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		assert.Error(t, err, "fleeBelowHealthRatio %s must be rejected (valid: 0 <= r <= 1)", ratio)
	}
}

// --- support threshold (role-as-loadout, playtest round 3) ---

func TestMapMobDefinition_ParsesSupportThreshold(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 6,
	  "name": "Rabbit",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 20, "supportThreshold": 0.5},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.InDelta(t, 0.5, def.Factors.SupportThreshold, 1e-6)
}

func TestMapMobDefinition_SupportThresholdDefaultsToZeroAndResolvesLater(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Zero(t, def.Factors.SupportThreshold,
		"absent stays 0 here; NewMob resolves it to the 1.0 default")
}

func TestMapMobDefinition_SupportThresholdOutOfBoundsFails(t *testing.T) {
	// 1.0 itself is valid ("support any ally short of full"); outside [0, 1] is
	// not — a threshold above 1 is one no ally can ever be under.
	for _, ratio := range []string{"-0.1", "1.5"} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1,
		  "name": "Dodo",
		  "type": "MOB",
		  "factors": {"supportThreshold": ` + ratio + `},
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		assert.Error(t, err, "supportThreshold %s must be rejected (valid: 0 <= r <= 1)", ratio)
	}
}

func TestMapMobDefinition_ParsesIdleFields(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40, "speed": 0.4, "wanderRadius": 2.5,
	              "idleSpeedFactor": 0.25,
	              "idleDwellMinTicks": 240, "idleDwellMaxTicks": 900},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.InDelta(t, 2.5, def.Factors.WanderRadius, 1e-6)
	assert.InDelta(t, 0.25, def.Factors.IdleSpeedFactor, 1e-6)
	assert.Equal(t, 240, def.Factors.IdleDwellMinTicks)
	assert.Equal(t, 900, def.Factors.IdleDwellMaxTicks)
}

func TestMapMobDefinition_IdleFieldsDefaultToZero(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1, "name": "Dodo", "type": "MOB",
	  "factors": {"baseMaxHealth": 40, "speed": 0.4},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.Zero(t, def.Factors.WanderRadius, "absent = no type-default wander")
	assert.Zero(t, def.Factors.IdleSpeedFactor, "absent = global default at mob construction")
	assert.Zero(t, def.Factors.IdleDwellMinTicks)
	assert.Zero(t, def.Factors.IdleDwellMaxTicks)
}

func TestMapMobDefinition_InvalidIdleFieldsFail(t *testing.T) {
	for _, factors := range []string{
		`{"baseMaxHealth": 40, "speed": 0.4, "wanderRadius": -1}`,
		`{"baseMaxHealth": 40, "speed": 0.4, "idleSpeedFactor": -0.1}`,
		`{"baseMaxHealth": 40, "speed": 0.4, "idleSpeedFactor": 1.5}`,
		`{"baseMaxHealth": 40, "speed": 0.4, "idleDwellMinTicks": -1}`,
		`{"baseMaxHealth": 40, "speed": 0.4, "idleDwellMinTicks": 300, "idleDwellMaxTicks": 90}`,
		`{"baseMaxHealth": 40, "speed": 0, "wanderRadius": 2}`,
	} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1, "name": "Dodo", "type": "MOB",
		  "factors": ` + factors + `,
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
		assert.Error(t, err, "factors %s must be rejected", factors)
	}
}

func TestRegistry_SpawnEffectUnknownMobFails(t *testing.T) {
	// Skills load before mobs, so a spawn effect's mob name can only resolve
	// once the mob registry exists — RegistryFromFS is the validation seam.
	summonSkillJSON := []byte(`{
	  "id": 23, "name": "SummonTotem", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 450,
	  "effects": [{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300}]
	}`)
	sr, err := skills.RegistryFromFS(fstest.MapFS{
		"summon-totem.json": {Data: summonSkillJSON},
	})
	require.NoError(t, err)

	totemMobJSON := []byte(`{
	  "id": 9, "name": "Totem", "type": "MOB",
	  "body": {"radius": 0.25, "aggroRadius": 0.1}
	}`)
	otherMobJSON := []byte(`{
	  "id": 1, "name": "Dodo", "type": "MOB",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`)

	// The referenced mob exists → loads fine.
	_, err = RegistryFromFS(sr, nil, testCurve(), fstest.MapFS{
		"totem.json": {Data: totemMobJSON},
	})
	require.NoError(t, err)

	// The referenced mob is missing → hard-fail naming skill and mob.
	_, err = RegistryFromFS(sr, nil, testCurve(), fstest.MapFS{
		"dodo.json": {Data: otherMobJSON},
	})
	require.Error(t, err)
	assert.ErrorContains(t, err, "SummonTotem")
	assert.ErrorContains(t, err, "Totem")
}

// --- faction resolution (mob-depth chunk 6.6) ---

func testFactionRegistry(t *testing.T) factions.Registry {
	t.Helper()
	fr, err := factions.RegistryFromFS(fstest.MapFS{
		"predator.json": {Data: []byte(`{"name": "predator", "hostileTo": ["aligned", "prey"]}`)},
		"prey.json":     {Data: []byte(`{"name": "prey", "hostileTo": []}`)},
	})
	require.NoError(t, err)
	return fr
}

// --- legacy tag (step-7 A.5) ---

func TestMapMobDefinition_LegacyTagParsed(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "legacy": true,
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.True(t, def.Legacy)
}

func TestMapMobDefinition_AbsentLegacyTagDefaultsToLive(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Wolf",
	  "type": "MOB",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)
	assert.False(t, def.Legacy)
	assert.Empty(t, def.LegacyRefs)
}

// legacyLeakFixtures builds a registry pair where skill "DodoAura" and faction
// "predator" are legacy-tagged, "WolfBite"/"prey" are live.
func legacyLeakFixtures(t *testing.T) (skills.Registry, factions.Registry) {
	t.Helper()
	sr, err := skills.RegistryFromFS(fstest.MapFS{
		"dodo-aura.json": {Data: []byte(`{
		  "id": 101, "name": "DodoAura", "category": "active_aura", "maxLevel": 5, "legacy": true,
		  "effects": [{"type": "damage_aura", "radius": 0.6, "damageHP": 2, "targetsEnemies": true}]
		}`)},
		"wolf-bite.json": {Data: []byte(`{
		  "id": 102, "name": "WolfBite", "category": "active_aura", "maxLevel": 5,
		  "effects": [{"type": "damage_aura", "radius": 0.6, "damageHP": 2, "targetsEnemies": true}]
		}`)},
	})
	require.NoError(t, err)
	fr, err := factions.RegistryFromFS(fstest.MapFS{
		"predator.json": {Data: []byte(`{"name": "predator", "hostileTo": ["aligned", "prey"], "legacy": true}`)},
		"prey.json":     {Data: []byte(`{"name": "prey", "hostileTo": []}`)},
	})
	require.NoError(t, err)
	return sr, fr
}

func TestMapMobDefinition_LiveMobCollectsLegacyRefs(t *testing.T) {
	// A live (untagged) mob referencing legacy-tagged content is an authoring
	// smell — mapping collects the offending names so the boot loader can warn
	// (the tag would otherwise silently go stale, step-7 A.5).
	sr, fr := legacyLeakFixtures(t)
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Wolf",
	  "type": "MOB",
	  "faction": "predator",
	  "body": {"radius": 0.2, "aggroRadius": 2.4},
	  "skills": [{"skillName": "DodoAura"}],
	  "unlocks": [{"skillName": "DodoAura", "chance": 0.5}]
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(sr, fr, testCurve())
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"skill DodoAura", "unlock DodoAura", "faction predator"}, def.LegacyRefs)
}

func TestMapMobDefinition_LegacyMobMayReferenceLegacyContent(t *testing.T) {
	sr, fr := legacyLeakFixtures(t)
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "legacy": true,
	  "faction": "predator",
	  "body": {"radius": 0.2, "aggroRadius": 2.4},
	  "skills": [{"skillName": "DodoAura"}]
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(sr, fr, testCurve())
	require.NoError(t, err)
	assert.Empty(t, def.LegacyRefs, "legacy referencing legacy is the expected shape")
}

func TestMapMobDefinition_LiveRefsCollectNothing(t *testing.T) {
	sr, fr := legacyLeakFixtures(t)
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Wolf",
	  "type": "MOB",
	  "faction": "prey",
	  "body": {"radius": 0.2, "aggroRadius": 2.4},
	  "skills": [{"skillName": "WolfBite"}]
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(sr, fr, testCurve())
	require.NoError(t, err)
	assert.Empty(t, def.LegacyRefs)
}

func TestMapMobDefinition_ResolvesFaction(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "SaberToothCat",
	  "type": "MOB",
	  "faction": "predator",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	fr := testFactionRegistry(t)
	def, err := raw.mapToMobDefinition(testSkillRegistry(t), fr, testCurve())
	require.NoError(t, err)

	predator, err := fr.GetByName("predator")
	require.NoError(t, err)
	assert.Equal(t, predator.ID, def.Faction)
	assert.Equal(t, predator.AggroMask, def.AggroMask)
}

func TestMapMobDefinition_AbsentFactionDefaultsToHostileVsAligned(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	// No factions registry needed for the default path (keeps tests lean).
	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	assert.Equal(t, factions.Hostile, def.Faction)
	assert.Equal(t, factions.Bit(factions.Aligned), def.AggroMask,
		"legacy default: attack players, proactively ignore every mob")
}

func TestMapMobDefinition_ExplicitHostileFactionEqualsDefault(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "faction": "hostile",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), testFactionRegistry(t), testCurve())
	require.NoError(t, err)

	assert.Equal(t, factions.Hostile, def.Faction)
	assert.Equal(t, factions.Bit(factions.Aligned), def.AggroMask)
}

func TestMapMobDefinition_FriendlyToPlayersFollowsFaction(t *testing.T) {
	// §9 lift 6 (C5): the faction's friendlyToPlayers flag rides onto the mob
	// definition so the entity can expose it to the damage-eligibility seam.
	fr, err := factions.RegistryFromFS(fstest.MapFS{
		"human_army.json": {Data: []byte(`{"name": "human_army", "hostileTo": ["orc"], "friendlyToPlayers": true}`)},
		"orc.json":        {Data: []byte(`{"name": "orc", "hostileTo": ["aligned", "human_army"]}`)},
	})
	require.NoError(t, err)

	soldier, err := parseMobDefinition([]byte(`{
	  "id": 1, "name": "ArmySoldier", "type": "MOB", "faction": "human_army",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)
	def, err := soldier.mapToMobDefinition(testSkillRegistry(t), fr, testCurve())
	require.NoError(t, err)
	assert.True(t, def.FriendlyToPlayers)

	orc, err := parseMobDefinition([]byte(`{
	  "id": 2, "name": "Orc", "type": "MOB", "faction": "orc",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)
	orcDef, err := orc.mapToMobDefinition(testSkillRegistry(t), fr, testCurve())
	require.NoError(t, err)
	assert.False(t, orcDef.FriendlyToPlayers)
}

func TestMapMobDefinition_UnknownFactionFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "faction": "pradator",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), testFactionRegistry(t), testCurve())
	require.ErrorContains(t, err, `"pradator"`)
}

func TestMapMobDefinition_AlignedFactionFails(t *testing.T) {
	// Mobs never author "aligned" — summons get it via SetFaction at spawn.
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "faction": "aligned",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), testFactionRegistry(t), testCurve())
	require.ErrorContains(t, err, "aligned")
}

func TestMapMobDefinition_FactionWithoutRegistryFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "faction": "predator",
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.ErrorContains(t, err, "no factions")
}

// --- C0: tier + baseline authoring (plan-content-zones12.md §13 C0) ---
// Mobs are authored as tier + curveLevel + baseline values; maxHealth and the
// skill-damage scale derive from f(curveLevel) so a growth change is a
// one-knob re-derivation, never a re-authoring (GDD §5).

func TestMapMobDefinition_DerivesMaxHealthAndPowerScale(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 20,
	  "name": "Wolf",
	  "type": "MOB",
	  "tier": "normal",
	  "curveLevel": 3,
	  "factors": {"baseMaxHealth": 30},
	  "body": {"radius": 0.3, "aggroRadius": 4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	assert.Equal(t, "normal", def.Tier)
	assert.Equal(t, 3, def.CurveLevel)
	// The authored baseline passes through UNSCALED (chunk 1b): f(level) is
	// applied live by *Mob.MaxHealth and *Mob.PowerScale, so nothing here is
	// pre-derived and the curve itself is the only thing retained. A mapper
	// that forgets the curve leaves every mob neutral at 1.
	assert.Equal(t, uint32(30), def.Factors.BaseMaxHealth, "the baseline, not 30 × 1.12²")
	assert.Equal(t, testCurve(), def.Curve)
	assert.InDelta(t, 1.2544, def.Curve.F(def.CurveLevel), 1e-4,
		"f(3) — what the live mob scales its pool and its skill HP values by")
}

func TestMapMobDefinition_TierAndCurveLevelDefaultToBaseline(t *testing.T) {
	// Absent tier/curveLevel = normal at curve position 1 (f = 1): baseline
	// numbers pass through unchanged. Synthetic/test defs stay minimal.
	raw, err := parseMobDefinition([]byte(`{
	  "id": 21,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"baseMaxHealth": 40},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.NoError(t, err)

	assert.Equal(t, "normal", def.Tier)
	assert.Equal(t, 1, def.CurveLevel)
	assert.Equal(t, uint32(40), def.Factors.BaseMaxHealth)
	assert.InDelta(t, 1.0, def.Curve.F(def.CurveLevel), 1e-9)
}

func TestMapMobDefinition_RawMaxHealthIsAReject(t *testing.T) {
	// Raw stat authoring is the C0 review reject, enforced mechanically.
	raw, err := parseMobDefinition([]byte(`{
	  "id": 22,
	  "name": "Wolf",
	  "type": "MOB",
	  "factors": {"maxHealth": 30},
	  "body": {"radius": 0.3, "aggroRadius": 4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "baseMaxHealth")
}

func TestMapMobDefinition_UnknownTierFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 23,
	  "name": "Wolf",
	  "type": "MOB",
	  "tier": "legendary",
	  "factors": {"baseMaxHealth": 30},
	  "body": {"radius": 0.3, "aggroRadius": 4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "legendary")
}

func TestMapMobDefinition_NegativeCurveLevelFails(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 24,
	  "name": "Wolf",
	  "type": "MOB",
	  "curveLevel": -2,
	  "factors": {"baseMaxHealth": 30},
	  "body": {"radius": 0.3, "aggroRadius": 4}
	}`))
	require.NoError(t, err)

	_, err = raw.mapToMobDefinition(testSkillRegistry(t), nil, testCurve())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "curveLevel")
}
