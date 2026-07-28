package world

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// fakeMobRegistry resolves only the names it was given, so an unknown spawn
// mob surfaces as a load error.
type fakeMobRegistry struct {
	byName map[string]*mobs.MobDefinition
}

func newFakeMobRegistry(names ...string) *fakeMobRegistry {
	r := &fakeMobRegistry{byName: map[string]*mobs.MobDefinition{}}
	for _, n := range names {
		// Speed 1 so patrol/wander spawns validate; the stationary-mob test
		// overrides it to 0 explicitly.
		def := &mobs.MobDefinition{Name: n}
		def.Factors.Speed = 1
		r.byName[n] = def
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
			  "blocksMovement": true }
		],
		"spawns": [
			{ "mob": "Dodo", "x": 30, "y": 12, "angle": 0,
			  "respawnTicks": 900, "respawnVariancePct": 0.2 }
		]
	}`

	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry("Rock"))
	require.NoError(t, err)

	assert.Equal(t, "Scaffold", z.Name)
	// ID is the file stem, distinct from the human-readable Name.
	assert.Equal(t, "zone", z.ID)
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

	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	assert.Empty(t, z.Props)
	assert.Empty(t, z.Spawns)
}

func TestZone_ParsesCampfires(t *testing.T) {
	const doc = `{
		"name": "X",
		"bounds": { "width": 60, "height": 40 },
		"campfires": [ { "x": 3, "y": -4.5, "startingSpawn": true }, { "x": 0, "y": 0 } ]
	}`

	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.Campfires, 2)
	assert.EqualValues(t, 3, z.Campfires[0].X)
	assert.EqualValues(t, -4.5, z.Campfires[0].Y)
	assert.True(t, z.Campfires[0].StartingSpawn, "the flagged fire parses its startingSpawn flag")
	assert.False(t, z.Campfires[1].StartingSpawn, "an unflagged fire defaults to false")
}

// Triage item 5: a zone that places campfires must flag at least one as a
// starting spawn, or fresh players would have nowhere to land — boot hard-fails.
func TestZone_RejectsCampfiresWithNoStartingSpawn(t *testing.T) {
	const doc = `{
		"name": "X",
		"bounds": { "width": 60, "height": 40 },
		"campfires": [ { "x": 3, "y": -4.5 }, { "x": 0, "y": 0 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "startingSpawn")
}

// A zone with no campfires at all is fine (bare test zones fall back to a
// random spawn) — the flag requirement only bites once a fire is placed.
func TestZone_AllowsNoCampfires(t *testing.T) {
	const doc = `{ "name": "X", "bounds": { "width": 60, "height": 40 } }`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
}

// --- legacy tag (step-7 A.5) ---

// legacyZoneFixtures: mob "Mammoth" is legacy-tagged, "Wolf" is live. Spawn
// mobs are the zone's only content reference since the NPC merge (chunk 3a), so
// there is no skill side to this fixture any more — a legacy TAUGHT skill now
// surfaces through the mob definition that teaches it, in items/mobs.
func legacyZoneFixtures() *fakeMobRegistry {
	mr := newFakeMobRegistry("Mammoth", "Wolf")
	mr.byName["Mammoth"].Legacy = true
	return mr
}

func TestZone_CollectsLegacyRefs(t *testing.T) {
	// A live zone referencing legacy-tagged content is an authoring smell —
	// resolve aggregates the distinct offenders so the boot loader can warn.
	const doc = `{
		"name": "X",
		"bounds": { "width": 60, "height": 40 },
		"spawns": [
			{ "mob": "Mammoth", "x": 1, "y": 1 },
			{ "mob": "Mammoth", "x": 2, "y": 2 },
			{ "mob": "Wolf", "x": 3, "y": 3 }
		]
	}`

	mr := legacyZoneFixtures()
	z, err := LoadZoneFS(mapFS(doc), "", mr, newFakePropRegistry())
	require.NoError(t, err)
	// Spawn mobs are the zone's only content reference since the NPC merge —
	// a legacy skill now surfaces through the MOB definition that teaches it
	// (items/mobs collects "teaching X" the way it collects skills and drops).
	assert.ElementsMatch(t, []string{"mob Mammoth"}, z.LegacyRefs,
		"distinct names, duplicates collapsed")
}

func TestZone_LegacyZoneMayReferenceLegacyContent(t *testing.T) {
	const doc = `{
		"name": "X",
		"legacy": true,
		"bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Mammoth", "x": 1, "y": 1 } ]
	}`

	mr := legacyZoneFixtures()
	z, err := LoadZoneFS(mapFS(doc), "", mr, newFakePropRegistry())
	require.NoError(t, err)
	assert.True(t, z.Legacy)
	assert.Empty(t, z.LegacyRefs, "legacy referencing legacy is the expected shape")
}

func TestZone_LiveRefsCollectNothing(t *testing.T) {
	const doc = `{
		"name": "X",
		"bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Wolf", "x": 3, "y": 3 } ]
	}`

	mr := legacyZoneFixtures()
	z, err := LoadZoneFS(mapFS(doc), "", mr, newFakePropRegistry())
	require.NoError(t, err)
	assert.False(t, z.Legacy)
	assert.Empty(t, z.LegacyRefs)
}

func TestZone_RejectsUnknownCampfireKey(t *testing.T) {
	const doc = `{
		"name": "X",
		"bounds": { "width": 60, "height": 40 },
		"campfires": [ { "x": 3, "y": -4.5, "radius": 2 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "radius")
}

func TestZone_ParsesDarkAreas(t *testing.T) {
	const doc = `{
		"name": "X",
		"bounds": { "width": 60, "height": 40 },
		"darkAreas": [ { "x": 3, "y": -4.5, "radius": 6 } ]
	}`

	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.DarkAreas, 1)
	assert.EqualValues(t, 3, z.DarkAreas[0].X)
	assert.EqualValues(t, -4.5, z.DarkAreas[0].Y)
	assert.EqualValues(t, 6, z.DarkAreas[0].Radius)
}

func TestZone_RejectsNonPositiveDarkAreaRadius(t *testing.T) {
	for _, radius := range []string{"0", "-2"} {
		doc := `{
			"name": "X",
			"bounds": { "width": 60, "height": 40 },
			"darkAreas": [ { "x": 3, "y": -4.5, "radius": ` + radius + ` } ]
		}`

		_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
		require.Error(t, err, "radius %s must be rejected", radius)
		assert.Contains(t, err.Error(), "radius")
	}
}

func TestZone_RejectsUnknownKey(t *testing.T) {
	const doc = `{ "name": "X", "bounds": { "width": 60, "height": 40 }, "radius": 20 }`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "radius")
}

func TestZone_RejectsNonPositiveBounds(t *testing.T) {
	for _, doc := range []string{
		`{ "name": "X", "bounds": { "width": 0, "height": 40 } }`,
		`{ "name": "X", "bounds": { "width": 60, "height": -1 } }`,
		`{ "name": "X" }`,
	} {
		_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "bounds")
	}
}

func TestZone_RejectsMissingName(t *testing.T) {
	const doc = `{ "bounds": { "width": 60, "height": 40 } }`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "name")
}

func TestZone_RejectsUnknownSpawnMob(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Nonexistent", "x": 0, "y": 0 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry("Rock"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Nonexistent")
}

func TestZone_RejectsUnknownPropType(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"props": [ { "type": "Nonexistent", "x": 0, "y": 0 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry("Rock"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Nonexistent")
}

func TestZone_ParsesWanderAndWaypoints(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [
			{ "mob": "Dodo", "x": 30, "y": 12, "angle": 0,
			  "respawnTicks": 900, "respawnVariancePct": 0.2,
			  "wanderRadius": 3.0 },
			{ "mob": "SaberToothCat", "x": -10, "y": 5, "angle": 0,
			  "respawnTicks": 1800, "respawnVariancePct": 0,
			  "waypoints": [ { "x": -5, "y": 5 }, { "x": -5, "y": 10 } ] }
		]
	}`

	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo", "SaberToothCat"), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.Spawns, 2)
	require.NotNil(t, z.Spawns[0].WanderRadius)
	assert.EqualValues(t, 3.0, *z.Spawns[0].WanderRadius)
	assert.Empty(t, z.Spawns[0].Waypoints)
	assert.Nil(t, z.Spawns[1].WanderRadius, "absent = inherit the mob-type default")
	require.Len(t, z.Spawns[1].Waypoints, 2)
	assert.EqualValues(t, -5, z.Spawns[1].Waypoints[0].X)
	assert.EqualValues(t, 10, z.Spawns[1].Waypoints[1].Y)
}

func TestZone_ParsesIdleOverridesAndPatrolMode(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [
			{ "mob": "Dodo", "x": 1, "y": 1, "wanderRadius": 0 },
			{ "mob": "Dodo", "x": 2, "y": 2, "idleSpeedFactor": 0.7,
			  "waypoints": [ { "x": 3, "y": 3 }, { "x": 4, "y": 4 } ],
			  "patrolMode": "loop" }
		]
	}`

	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
	require.NoError(t, err)
	// Explicit 0 = stationary override despite a wandering species (the
	// "bridge guard" case) — distinct from absent.
	require.NotNil(t, z.Spawns[0].WanderRadius)
	assert.EqualValues(t, 0, *z.Spawns[0].WanderRadius)
	require.NotNil(t, z.Spawns[1].IdleSpeedFactor)
	assert.InDelta(t, 0.7, *z.Spawns[1].IdleSpeedFactor, 1e-6)
	assert.Equal(t, "loop", z.Spawns[1].PatrolMode)
}

func TestZone_RejectsInvalidIdleSpeedFactor(t *testing.T) {
	for _, factor := range []string{"0", "-0.5", "1.5"} {
		doc := `{ "name": "X", "bounds": { "width": 60, "height": 40 },
			"spawns": [ { "mob": "Dodo", "x": 0, "y": 0, "idleSpeedFactor": ` + factor + ` } ] }`

		_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
		require.Error(t, err, "idleSpeedFactor %s must be rejected", factor)
		assert.Contains(t, err.Error(), "idleSpeedFactor")
	}
}

func TestZone_RejectsBadPatrolMode(t *testing.T) {
	for _, spawn := range []string{
		// unknown mode name
		`{ "mob": "Dodo", "x": 0, "y": 0, "patrolMode": "circle",
		   "waypoints": [ { "x": 1, "y": 1 }, { "x": 2, "y": 2 } ] }`,
		// mode without a route
		`{ "mob": "Dodo", "x": 0, "y": 0, "patrolMode": "loop" }`,
	} {
		doc := `{ "name": "X", "bounds": { "width": 60, "height": 40 },
			"spawns": [ ` + spawn + ` ] }`

		_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "patrolMode")
	}
}

func TestZone_RejectsNegativeWanderRadius(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Dodo", "x": 0, "y": 0, "wanderRadius": -1 } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "wanderRadius")
}

func TestZone_RejectsWanderAndWaypointsTogether(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Dodo", "x": 0, "y": 0, "wanderRadius": 2,
		              "waypoints": [ { "x": 1, "y": 1 }, { "x": 2, "y": 2 } ] } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "wanderRadius")
	assert.Contains(t, err.Error(), "waypoints")
}

func TestZone_RejectsSingleWaypoint(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Dodo", "x": 0, "y": 0,
		              "waypoints": [ { "x": 1, "y": 1 } ] } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "waypoints")
}

func TestZone_RejectsPatrolOnStationaryMob(t *testing.T) {
	for _, spawn := range []string{
		`{ "mob": "Totem", "x": 0, "y": 0, "wanderRadius": 2 }`,
		`{ "mob": "Totem", "x": 0, "y": 0,
		   "waypoints": [ { "x": 1, "y": 1 }, { "x": 2, "y": 2 } ] }`,
	} {
		doc := `{ "name": "X", "bounds": { "width": 60, "height": 40 },
			"spawns": [ ` + spawn + ` ] }`

		mr := newFakeMobRegistry("Totem")
		mr.byName["Totem"].Factors.Speed = 0

		_, err := LoadZoneFS(mapFS(doc), "", mr, newFakePropRegistry())
		require.Error(t, err)
		assert.Contains(t, err.Error(), "stationary")
	}
}

func TestZone_RejectsUnknownWaypointKey(t *testing.T) {
	const doc = `{
		"name": "X", "bounds": { "width": 60, "height": 40 },
		"spawns": [ { "mob": "Dodo", "x": 0, "y": 0,
		              "waypoints": [ { "x": 1, "y": 1, "z": 3 }, { "x": 2, "y": 2 } ] } ]
	}`

	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry("Dodo"), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "z")
}

// twoZoneFS holds two distinct named zones ("a" and "b").
func twoZoneFS() fstest.MapFS {
	return fstest.MapFS{
		"a.json": {Data: []byte(`{ "name": "Alpha", "bounds": { "width": 60, "height": 40 } }`)},
		"b.json": {Data: []byte(`{ "name": "Beta", "bounds": { "width": 20, "height": 10 } }`)},
	}
}

func TestZone_SelectsByName(t *testing.T) {
	z, err := LoadZoneFS(twoZoneFS(), "b", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	assert.Equal(t, "b", z.ID)
	assert.Equal(t, "Beta", z.Name)
	assert.EqualValues(t, 20, z.Bounds.Width)
}

func TestZone_RejectsUnknownName(t *testing.T) {
	_, err := LoadZoneFS(twoZoneFS(), "c", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "not found")
	// the error lists the available zones so the mistake is obvious
	assert.Contains(t, err.Error(), "a")
	assert.Contains(t, err.Error(), "b")
}

// With multiple zones and no selection, the loader refuses and asks for -zone
// rather than guessing.
func TestZone_RequiresNameWhenMultiple(t *testing.T) {
	_, err := LoadZoneFS(twoZoneFS(), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "multiple zone")
}

// A WIP zone that is malformed must not break boot when a valid, different
// zone is the one selected (candidates are enumerated, not parsed).
func TestZone_IgnoresUnselectedMalformedZone(t *testing.T) {
	fsys := fstest.MapFS{
		"good.json":  {Data: []byte(`{ "name": "Good", "bounds": { "width": 60, "height": 40 } }`)},
		"broken.json": {Data: []byte(`{ this is not json`)},
	}
	z, err := LoadZoneFS(fsys, "good", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	assert.Equal(t, "good", z.ID)
}

func TestZone_RejectsNoZone(t *testing.T) {
	_, err := LoadZoneFS(fstest.MapFS{}, "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no zone file")
}

// Terrain is parsed into the zone (so DisallowUnknownFields accepts it and
// typos fail by name) but is purely client-visual — the server never uses it.
func TestZone_ParsesTerrain(t *testing.T) {
	const doc = `{
		"name": "T", "bounds": { "width": 60, "height": 40 },
		"terrain": [
			{ "type": "Sand", "x": 1.5, "y": -2.5, "size": 3, "rotation": 0.7, "flipped": "vertical" }
		]
	}`
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.Terrain, 1)
	assert.Equal(t, "Sand", z.Terrain[0].Type)
	assert.EqualValues(t, 1.5, z.Terrain[0].X)
	assert.Equal(t, "vertical", z.Terrain[0].Flipped)
}

func TestZone_RejectsUnknownTerrainKey(t *testing.T) {
	const doc = `{
		"name": "T", "bounds": { "width": 60, "height": 40 },
		"terrain": [ { "type": "Sand", "x": 0, "y": 0, "size": 1, "flip": "vertical" } ]
	}`
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "flip")
}

func TestZone_ParsesAnchorsAndLooksThemUp(t *testing.T) {
	const doc = `{
		"name": "A", "bounds": { "width": 60, "height": 40 },
		"anchors": [
			{ "name": "warlord-home", "x": 28, "y": -10.5 },
			{ "name": "wave-mouth", "x": 22, "y": -8 }
		]
	}`
	z, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.Anchors, 2)

	x, y, ok := z.AnchorPos("warlord-home")
	require.True(t, ok)
	assert.EqualValues(t, 28, x)
	assert.EqualValues(t, -10.5, y)

	_, _, ok = z.AnchorPos("no-such-anchor")
	assert.False(t, ok)
}

func TestZone_RejectsDuplicateAnchorName(t *testing.T) {
	const doc = `{
		"name": "A", "bounds": { "width": 60, "height": 40 },
		"anchors": [
			{ "name": "spot", "x": 1, "y": 2 },
			{ "name": "spot", "x": 3, "y": 4 }
		]
	}`
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "duplicate")
}

func TestZone_RejectsEmptyAnchorName(t *testing.T) {
	const doc = `{
		"name": "A", "bounds": { "width": 60, "height": 40 },
		"anchors": [ { "name": "  ", "x": 1, "y": 2 } ]
	}`
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "name")
}

func TestZone_RejectsOutOfBoundsAnchor(t *testing.T) {
	const doc = `{
		"name": "A", "bounds": { "width": 60, "height": 40 },
		"anchors": [ { "name": "way-out", "x": 31, "y": 0 } ]
	}`
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bounds")
}
