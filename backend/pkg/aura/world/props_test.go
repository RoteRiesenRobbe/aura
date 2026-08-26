package world

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
)

func propFS(files map[string]string) fstest.MapFS {
	fsys := fstest.MapFS{}
	for name, data := range files {
		fsys[name] = &fstest.MapFile{Data: []byte(data)}
	}
	return fsys
}

func TestPropRegistry_LoadsValid(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json": `{ "name": "Rock", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": 0.5 } }`,
		"tree.json": `{ "name": "Tree", "entityType": "RoundTree", "sprite": "roundTree.png", "body": { "radius": 1.0 } }`,
	})

	r, err := PropRegistryFromFS(fsys)
	require.NoError(t, err)
	assert.Len(t, r.Props(), 2)

	rock, err := r.GetByName("Rock")
	require.NoError(t, err)
	assert.EqualValues(t, AuraApi.EntityTypeStone, rock.EntityType)
	assert.EqualValues(t, 0.5, rock.Body.Radius)
}

func TestPropRegistry_UnknownNameFails(t *testing.T) {
	r, err := PropRegistryFromFS(propFS(nil))
	require.NoError(t, err)

	_, err = r.GetByName("Rock")
	assert.Error(t, err)
}

func TestPropRegistry_RejectsUnknownKey(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json": `{ "name": "Rock", "entityType": "Stone", "body": { "radius": 0.5 }, "solid": true }`,
	})

	_, err := PropRegistryFromFS(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "solid")
}

func TestPropRegistry_RejectsUnknownEntityType(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json": `{ "name": "Rock", "entityType": "Bolder", "sprite": "stone.png", "body": { "radius": 0.5 } }`,
	})

	_, err := PropRegistryFromFS(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Bolder")
}

func TestPropRegistry_RejectsMissingSprite(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json": `{ "name": "Rock", "entityType": "Stone", "body": { "radius": 0.5 } }`,
	})

	_, err := PropRegistryFromFS(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "sprite")
}

func TestPropRegistry_RejectsNonPositiveRadius(t *testing.T) {
	for _, doc := range []string{
		`{ "name": "Rock", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": 0 } }`,
		`{ "name": "Rock", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": -1 } }`,
		`{ "name": "Rock", "entityType": "Stone", "sprite": "stone.png" }`,
	} {
		_, err := PropRegistryFromFS(propFS(map[string]string{"rock.json": doc}))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "radius")
	}
}

func TestPropRegistry_LoadsRectBody(t *testing.T) {
	fsys := propFS(map[string]string{
		"house.json": `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "width": 4, "height": 3 } }`,
	})

	r, err := PropRegistryFromFS(fsys)
	require.NoError(t, err)

	house, err := r.GetByName("House")
	require.NoError(t, err)
	assert.True(t, house.Body.IsRect())
	assert.EqualValues(t, 4, house.Body.Width)
	assert.EqualValues(t, 3, house.Body.Height)
	assert.EqualValues(t, 0, house.Body.Radius)
}

func TestPropRegistry_CircleBodyIsNotRect(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json": `{ "name": "Rock", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": 0.5 } }`,
	})

	r, err := PropRegistryFromFS(fsys)
	require.NoError(t, err)

	rock, err := r.GetByName("Rock")
	require.NoError(t, err)
	assert.False(t, rock.Body.IsRect())
}

func TestPropRegistry_RejectsInvalidRectBodies(t *testing.T) {
	for name, doc := range map[string]string{
		"radius and rect":  `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": 1, "width": 4, "height": 3 } }`,
		"width only":       `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "width": 4 } }`,
		"height only":      `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "height": 3 } }`,
		"negative width":   `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "width": -4, "height": 3 } }`,
		"zero height":      `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "width": 4, "height": 0 } }`,
		"radius and width": `{ "name": "House", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": 1, "width": 4 } }`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := PropRegistryFromFS(propFS(map[string]string{"house.json": doc}))
			require.Error(t, err)
		})
	}
}

func TestPropRegistry_RejectsMissingName(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json": `{ "entityType": "Stone", "body": { "radius": 0.5 } }`,
	})

	_, err := PropRegistryFromFS(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "name")
}

func TestPropRegistry_RejectsDuplicateName(t *testing.T) {
	fsys := propFS(map[string]string{
		"rock.json":  `{ "name": "Rock", "entityType": "Stone", "sprite": "stone.png", "body": { "radius": 0.5 } }`,
		"rock2.json": `{ "name": "Rock", "entityType": "RoundTree", "sprite": "roundTree.png", "body": { "radius": 1.0 } }`,
	})

	_, err := PropRegistryFromFS(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "duplicate")
}
