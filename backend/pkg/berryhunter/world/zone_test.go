package world

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
)

// fakeMobRegistry resolves only the names it was given, so an unknown spawn
// mob surfaces as a load error.
type fakeMobRegistry struct {
	byName map[string]*mobs.MobDefinition
}

func newFakeMobRegistry(names ...string) *fakeMobRegistry {
	r := &fakeMobRegistry{byName: map[string]*mobs.MobDefinition{}}
	for _, n := range names {
		r.byName[n] = &mobs.MobDefinition{Name: n}
	}
	return r
}

func (r *fakeMobRegistry) Get(i mobs.MobID) (*mobs.MobDefinition, error) {
	return nil, fmt.Errorf("not implemented")
}

func (r *fakeMobRegistry) GetByName(name string) (*mobs.MobDefinition, error) {
	m, ok := r.byName[name]
	if !ok {
		return nil, fmt.Errorf("mob %q not found", name)
	}
	return m, nil
}

func (r *fakeMobRegistry) Mobs() []*mobs.MobDefinition {
	out := make([]*mobs.MobDefinition, 0, len(r.byName))
	for _, m := range r.byName {
		out = append(out, m)
	}
	return out
}

// fakePropRegistry resolves only the names it was given, so an unknown prop
// type surfaces as a load error.
type fakePropRegistry struct {
	byName map[string]*PropDefinition
}

func newFakePropRegistry(names ...string) *fakePropRegistry {
	r := &fakePropRegistry{byName: map[string]*PropDefinition{}}
	for _, n := range names {
		r.byName[n] = &PropDefinition{Name: n, Body: PropBody{Radius: 0.5}}
	}
	return r
}

func (r *fakePropRegistry) GetByName(name string) (*PropDefinition, error) {
	p, ok := r.byName[name]
	if !ok {
		return nil, fmt.Errorf("prop %q not found", name)
	}
	return p, nil
}

func (r *fakePropRegistry) Props() []*PropDefinition {
	out := make([]*PropDefinition, 0, len(r.byName))
	for _, p := range r.byName {
		out = append(out, p)
	}
	return out
}

func mapFS(json string) fstest.MapFS {
	return fstest.MapFS{"zone.json": {Data: []byte(json)}}
}

func TestZone_LoadsValid(t *testing.T) {
	const doc = `{
		"name": "Scaffold",
		"bounds": { "width": 60, "height": 40 },
		"props": [
			{ "type": "Rock", "x": 12, "y": -5, "rotation": 0,
			  "blocksMovement": true, "blocksAura": true }
		],
		"spawns": [
			{ "mob": "Dodo", "x": 30, "y": 12, "angle": 0,
			  "respawnTicks": 900, "respawnVariancePct": 0.2 }
		]
	}`

	z, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry("Dodo"), newFakePropRegistry("Rock"))
	require.NoError(t, err)

	assert.Equal(t, "Scaffold", z.Name)
	assert.EqualValues(t, 60, z.Bounds.Width)
	assert.EqualValues(t, 40, z.Bounds.Height)
	require.Len(t, z.Props, 1)
	assert.Equal(t, "Rock", z.Props[0].Type)
	assert.True(t, z.Props[0].BlocksMovement)
	// prop type names are resolved at load time
	require.NotNil(t, z.Props[0].Def)
	assert.Equal(t, "Rock", z.Props[0].Def.Name)
	require.Len(t, z.Spawns, 1)
	// spawn mob names are resolved at load time
	require.NotNil(t, z.Spawns[0].Def)
	assert.Equal(t, "Dodo", z.Spawns[0].Def.Name)
}

func TestZone_LoadsEmptyPropsAndSpawns(t *testing.T) {
	const doc = `{ "name": "Empty", "bounds": { "width": 60, "height": 40 } }`

	z, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	assert.Empty(t, z.Props)
	assert.Empty(t, z.Spawns)
}

func TestZone_RejectsUnknownKey(t *testing.T) {
	const doc = `{ "name": "X", "bounds": { "width": 60, "height": 40 }, "radius": 20 }`

	_, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "radius")
}

func TestZone_RejectsNonPositiveBounds(t *testing.T) {
	for _, doc := range []string{
		`{ "name": "X", "bounds": { "width": 0, "height": 40 } }`,
		`{ "name": "X", "bounds": { "width": 60, "height": -1 } }`,
		`{ "name": "X" }`,
	} {
		_, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry(), newFakePropRegistry())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "bounds")
	}
}

func TestZone_RejectsMissingName(t *testing.T) {
	const doc = `{ "bounds": { "width": 60, "height": 40 } }`

	_, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "name")
}

func TestZone_RejectsUnknownSpawnMob(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Nonexistent", "x": 0, "y": 0 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry("Dodo"), newFakePropRegistry("Rock"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Nonexistent")
}

func TestZone_RejectsUnknownPropType(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"props": [ { "type": "Nonexistent", "x": 0, "y": 0 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), newFakeMobRegistry(), newFakePropRegistry("Rock"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Nonexistent")
}

func TestZone_RejectsMultipleZones(t *testing.T) {
	fsys := fstest.MapFS{
		"a.json": {Data: []byte(`{ "name": "A", "bounds": { "width": 60, "height": 40 } }`)},
		"b.json": {Data: []byte(`{ "name": "B", "bounds": { "width": 60, "height": 40 } }`)},
	}
	_, err := LoadZoneFS(fsys, newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "multiple zone")
}

func TestZone_RejectsNoZone(t *testing.T) {
	_, err := LoadZoneFS(fstest.MapFS{}, newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no zone file")
}
