package mobs

// plan-vertical-slice.md PF1, F55: talking people and animals don't block
// players; the things you talk to do.

import (
	"encoding/json"
	"io/fs"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
)

// talkingObjects are the wire types of the OBJECTS that talk: signs, stones and
// roots, cave mouths, remains, the portals, the sunk chest and the old tree.
var talkingObjects = map[string]bool{
	"Signpost":        true,
	"Passage":         true,
	"Remains":         true,
	"FireTotem":       true, // both portals
	"GrandfatherKnot": true,
}

// talkingObjectNames are objects still on the placeholder art, which a new
// person wears as well, so their wire type cannot tell them apart.
var talkingObjectNames = map[string]bool{
	"SunkChest": true,
}

func TestContent_OnlyTalkingObjectsBlockPlayers(t *testing.T) {
	// The raw bits (model imports this package); model/layers_test.go pins them.
	const playerStatic, action, mobStatic = 1, 2, 64

	files, err := fs.Glob(amobs.Mobs, "*.json")
	require.NoError(t, err)
	require.NotEmpty(t, files)

	people, objects := 0, 0
	for _, file := range files {
		raw, err := fs.ReadFile(amobs.Mobs, file)
		require.NoError(t, err)
		var def struct {
			Name        string
			EntityType  string
			Role        string
			Interaction json.RawMessage
			Herd        json.RawMessage
			Body        struct{ CollisionLayer int }
		}
		require.NoError(t, json.Unmarshal(raw, &def), file)
		// A structure that talks is the campfire, which never blocked anyone.
		if (def.Interaction == nil && def.Herd == nil) || strings.EqualFold(def.Role, "structure") {
			continue
		}
		entityType := def.EntityType
		if entityType == "" {
			entityType = def.Name
		}

		layer := def.Body.CollisionLayer
		if talkingObjects[entityType] || talkingObjectNames[def.Name] {
			objects++
			assert.NotZero(t, layer&playerStatic, "%s is an object: it keeps its collision", def.Name)
			continue
		}
		people++
		assert.Zero(t, layer&playerStatic, "%s is a person or an animal: players walk through", def.Name)
		assert.NotZero(t, layer&mobStatic, "%s: mobs still steer around it", def.Name)
		assert.Zero(t, layer&action, "%s: still no aura target", def.Name)
	}
	assert.Positive(t, people)
	assert.Positive(t, objects)
}
