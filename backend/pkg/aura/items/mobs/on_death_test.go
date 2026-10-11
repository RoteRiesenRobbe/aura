package mobs

// Death triggers (plan-effect-types-round-2.md C7, D27): a mob file names
// cooldown skills in `onDeath`, the `skills` shape, and the loader resolves
// them against the skill registry.

import (
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func onDeathSkillRegistry(t *testing.T) skills.Registry {
	t.Helper()
	r, err := skills.RegistryFromFS(fstest.MapFS{
		"dodo-aura.json": {Data: testAuraSkillJSON},
		"death-burst.json": {Data: []byte(`{
		  "id": 102, "name": "DeathBurst", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 30,
		  "effects": [{"type": "instant_damage", "radius": 2, "damageHP": 5, "targetsEnemies": true, "selector": "all"}]
		}`)},
	}, nil)
	require.NoError(t, err)
	return r
}

func mapOnDeath(t *testing.T, onDeath string) (*MobDefinition, error) {
	t.Helper()
	raw, err := parseMobDefinition([]byte(`{
	  "id": 1, "name": "Wolf", "type": "MOB",
	  "onDeath": ` + onDeath + `,
	  "body": {"radius": 0.2, "aggroRadius": 2.4}
	}`))
	require.NoError(t, err)
	return raw.mapToMobDefinition(onDeathSkillRegistry(t), nil, testCurve())
}

func TestMapMobDefinition_ResolvesOnDeath(t *testing.T) {
	def, err := mapOnDeath(t, `[{"skillName": "DeathBurst", "level": 2}, {"skillName": "DeathBurst"}]`)
	require.NoError(t, err)

	require.Len(t, def.OnDeath, 2)
	assert.Equal(t, "DeathBurst", def.OnDeath[0].Def.Name)
	assert.Equal(t, 2, def.OnDeath[0].Level)
	assert.Equal(t, 1, def.OnDeath[1].Level, "absent level reads 1, as on skills")
	assert.Empty(t, def.Skills, "a death trigger is not part of the loadout")
}

func TestMapMobDefinition_OnDeathUnknownSkillFails(t *testing.T) {
	_, err := mapOnDeath(t, `[{"skillName": "NoSuchBurst"}]`)
	assert.Error(t, err)
}

func TestMapMobDefinition_OnDeathMustBeACooldown(t *testing.T) {
	_, err := mapOnDeath(t, `[{"skillName": "DodoAura"}]`)
	require.Error(t, err, "an aura has no one-shot fire to run at death")
	assert.Contains(t, err.Error(), "DodoAura")
}
