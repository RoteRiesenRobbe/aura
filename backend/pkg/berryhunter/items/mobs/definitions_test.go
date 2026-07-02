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
