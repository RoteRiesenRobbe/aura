package mobs

import (
	"testing"
	"testing/fstest"

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
