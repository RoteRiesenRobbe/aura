package mobs

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

var testAuraSkillJSON = []byte(`{
  "id": 101,
  "name": "DodoAura",
  "category": "active_aura",
  "maxLevel": 5,
  "effects": [{"type": "damage_aura", "radius": 0.6, "damageFraction": 0.001, "targetsPlayers": true}]
}`)

func testSkillRegistry(t *testing.T) skills.Registry {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"dodo-aura.json": {Data: testAuraSkillJSON},
	})
	require.NoError(t, err)
	return r
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

		_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	def, err := raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

		_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t))
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

	_, err = raw.mapToMobDefinition(nil, testSkillRegistry(t))
	assert.Error(t, err)
}
