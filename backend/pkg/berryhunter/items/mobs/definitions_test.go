package mobs

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/factions"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.Error(t, err, "an entityType that is no FlatBuffers EntityType name hard-fails at load")
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

		_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	assert.Error(t, err)
}

// --- resistances (item 11 Phase 2) ---

func TestMapMobDefinition_ParsesResistances(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"maxHealth": 40, "resistances": {"fire": 0.5, "physical": 0.8}},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	assert.Error(t, err)
}

func TestMapMobDefinition_ParsesMaxHealthVariance(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"maxHealth": 40, "maxHealthVariance": 0.1},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.NoError(t, err)
	assert.InDelta(t, 0.1, def.Factors.MaxHealthVariance, 1e-6)
}

func TestMapMobDefinition_MaxHealthVarianceDefaultsToZero(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"maxHealth": 40},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.NoError(t, err)
	assert.Zero(t, def.Factors.MaxHealthVariance)
}

func TestMapMobDefinition_MaxHealthVarianceOutOfBoundsFails(t *testing.T) {
	for _, variance := range []string{"-0.1", "1", "1.5"} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1,
		  "name": "Dodo",
		  "type": "MOB",
		  "factors": {"maxHealth": 40, "maxHealthVariance": ` + variance + `},
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	assert.Error(t, err)
}

// --- flee threshold (mob-depth chunk 2) ---

func TestMapMobDefinition_ParsesFleeBelowHealthRatio(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 6,
	  "name": "Rabbit",
	  "type": "MOB",
	  "factors": {"maxHealth": 20, "fleeBelowHealthRatio": 0.5},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.NoError(t, err)
	assert.InDelta(t, 0.5, def.Factors.FleeBelowHealthRatio, 1e-6)
}

func TestMapMobDefinition_FleeBelowHealthRatioDefaultsToZero(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"maxHealth": 40},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

		_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
		assert.Error(t, err, "fleeBelowHealthRatio %s must be rejected (valid: 0 <= r <= 1)", ratio)
	}
}

func TestMapMobDefinition_ParsesIdleFields(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1,
	  "name": "Dodo",
	  "type": "MOB",
	  "factors": {"maxHealth": 40, "speed": 0.4, "wanderRadius": 2.5,
	              "idleSpeedFactor": 0.25,
	              "idleDwellMinTicks": 240, "idleDwellMaxTicks": 900},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.NoError(t, err)
	assert.InDelta(t, 2.5, def.Factors.WanderRadius, 1e-6)
	assert.InDelta(t, 0.25, def.Factors.IdleSpeedFactor, 1e-6)
	assert.Equal(t, 240, def.Factors.IdleDwellMinTicks)
	assert.Equal(t, 900, def.Factors.IdleDwellMaxTicks)
}

func TestMapMobDefinition_IdleFieldsDefaultToZero(t *testing.T) {
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1, "name": "Dodo", "type": "MOB",
	  "factors": {"maxHealth": 40, "speed": 0.4},
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.NoError(t, err)
	assert.Zero(t, def.Factors.WanderRadius, "absent = no type-default wander")
	assert.Zero(t, def.Factors.IdleSpeedFactor, "absent = global default at mob construction")
	assert.Zero(t, def.Factors.IdleDwellMinTicks)
	assert.Zero(t, def.Factors.IdleDwellMaxTicks)
}

func TestMapMobDefinition_InvalidIdleFieldsFail(t *testing.T) {
	for _, factors := range []string{
		`{"maxHealth": 40, "speed": 0.4, "wanderRadius": -1}`,
		`{"maxHealth": 40, "speed": 0.4, "idleSpeedFactor": -0.1}`,
		`{"maxHealth": 40, "speed": 0.4, "idleSpeedFactor": 1.5}`,
		`{"maxHealth": 40, "speed": 0.4, "idleDwellMinTicks": -1}`,
		`{"maxHealth": 40, "speed": 0.4, "idleDwellMinTicks": 300, "idleDwellMaxTicks": 90}`,
		`{"maxHealth": 40, "speed": 0, "wanderRadius": 2}`,
	} {
		raw, err := parseMobDefinition([]byte(`{
		  "id": 1, "name": "Dodo", "type": "MOB",
		  "factors": ` + factors + `,
		  "body": {"radius": 0.2, "aggroRadius": 2.4}
		}`))
		require.NoError(t, err)

		_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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
	_, err = RegistryFromFS(nil, sr, nil, fstest.MapFS{
		"totem.json": {Data: totemMobJSON},
	})
	require.NoError(t, err)

	// The referenced mob is missing → hard-fail naming skill and mob.
	_, err = RegistryFromFS(nil, sr, nil, fstest.MapFS{
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
	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), fr)
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
	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t), testFactionRegistry(t))
	require.NoError(t, err)

	assert.Equal(t, factions.Hostile, def.Faction)
	assert.Equal(t, factions.Bit(factions.Aligned), def.AggroMask)
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), testFactionRegistry(t))
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), testFactionRegistry(t))
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t), nil)
	require.ErrorContains(t, err, "no factions")
}
