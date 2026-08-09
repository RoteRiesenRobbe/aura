package mobs

import (
	"encoding/json"
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Two files authoring the same id must hard-fail at boot: add() used to
// silently overwrite, and the quest ledger keys lifetime counters by MobID
// (plan-quests.md L12) — a silent overwrite would merge two species' counts.
func TestRegistryFromFS_DuplicateAuthoredIDHardFails(t *testing.T) {
	_, err := RegistryFromFS(testSkillRegistry(t), nil, testCurve(), fstest.MapFS{
		"wolf.json": {Data: []byte(`{
		  "id": 12,
		  "name": "Wolf",
		  "type": "MOB",
		  "curveLevel": 2,
		  "factors": {"baseMaxHealth": 20},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
		"boar.json": {Data: []byte(`{
		  "id": 12,
		  "name": "Boar",
		  "type": "MOB",
		  "curveLevel": 2,
		  "factors": {"baseMaxHealth": 25},
		  "body": {"radius": 0.3, "aggroRadius": 3}
		}`)},
	})
	require.Error(t, err)
	require.Contains(t, err.Error(), "duplicate")
}

// A spawn effect that only names its mob leaves the tooltip unable to say what
// the summon DOES (playtest round-7 item 3, third raise) — the /skills catalog
// is the client's only skill data source and the /mobs catalog deliberately
// omits loadouts (zero-hint policy). RegistryFromFS therefore attaches the
// summon's loadout to the spawn payload at the moment it already resolves the
// mob: a minimal carve-out — only mobs referenced by a spawn effect expose
// their loadout, and only through the summoning skill's own catalog entry.
func TestRegistryFromFS_SpawnEffectCarriesSummonLoadout(t *testing.T) {
	sr, err := skills.RegistryFromFS(fstest.MapFS{
		"dodo-aura.json": {Data: testAuraSkillJSON},
		"summon-dodo-totem.json": {Data: []byte(`{
		  "id": 23, "name": "SummonDodoTotem", "category": "cooldown", "maxLevel": 3, "cooldownTicks": 450,
		  "effects": [{"type": "spawn", "spawnMob": "Totem", "ttlTicks": 300}]
		}`)},
	}, nil)
	require.NoError(t, err)

	_, err = RegistryFromFS(sr, nil, testCurve(), fstest.MapFS{
		"totem.json": {Data: []byte(`{
		  "id": 9, "name": "Totem", "type": "MOB",
		  "body": {"radius": 0.25, "aggroRadius": 0.1},
		  "skills": [{"skillName": "DodoAura", "level": 2}]
		}`)},
	})
	require.NoError(t, err)

	summon, err := sr.GetByName("SummonDodoTotem")
	require.NoError(t, err)
	spawn := summon.Effects[0].Spawn
	require.NotNil(t, spawn)
	require.Len(t, spawn.SummonLoadout, 1)
	assert.Equal(t, skills.SkillID(101), spawn.SummonLoadout[0].SkillID)
	assert.Equal(t, 2, spawn.SummonLoadout[0].Level)

	// The wire name is what the client tooltip reads — pin it.
	marshaled, err := json.Marshal(spawn)
	require.NoError(t, err)
	assert.Contains(t, string(marshaled), `"summonLoadout":[{"skillId":101,"level":2}]`)
}
