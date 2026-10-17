package world

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The `exits` array (plan-passages.md P1, D1/D3): a door is level geometry,
// authored as an exit and synthesized into a talking mob at load.

// doorRegistry resolves the two shipped door definitions plus whatever extra
// definitions a test hands it.
func doorRegistry(extra ...*mobs.MobDefinition) *fakeMobRegistry {
	r := newFakeMobRegistry()
	for _, d := range append([]*mobs.MobDefinition{door(GenericDoor, ""), door("CaveExit", "")}, extra...) {
		r.byName[d.Name] = d
	}
	return r
}

func loadExits(t *testing.T, exits string) (*Zone, error) {
	t.Helper()
	return LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40}, "exits": [`+exits+`]}`),
		"", doorRegistry(), newFakePropRegistry())
}

func TestExits_LoadAndResolveTheirDoor(t *testing.T) {
	z, err := loadExits(t, `{"x": 1, "y": 2, "anchor": "below"}, {"x": 3, "y": 4, "anchor": "above", "door": "CaveExit"}`)
	require.NoError(t, err)
	require.Len(t, z.Exits, 2)
	// ⭐ No door is the generic one, so an exit authors only where it leads.
	assert.Equal(t, GenericDoor, z.Exits[0].Def.Name)
	assert.Equal(t, "CaveExit", z.Exits[1].Def.Name)
	assert.Empty(t, z.Spawns, "an exit is not a spawn in the file")
}

func TestExits_AreaExitsFlattenWithTheirArea(t *testing.T) {
	z, err := LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"exits": [{"x": 1, "y": 0, "anchor": "a"}],
		"areas": [{"id": "farmlands", "exits": [{"x": 11, "y": 0, "anchor": "b"}]}]}`),
		"", doorRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.Exits, 2)
	assert.Equal(t, "", z.Exits[0].Area)
	assert.Equal(t, "farmlands", z.Exits[1].Area)
}

func TestExits_RefuseWhatCannotTakeAnyoneAnywhere(t *testing.T) {
	cases := map[string]struct{ exit, want string }{
		"no anchor":      {`{"x": 1, "y": 2}`, "exit 0: anchor must not be empty"},
		"a blank anchor": {`{"x": 1, "y": 2, "anchor": "  "}`, "exit 0: anchor must not be empty"},
		"a blank door":   {`{"x": 1, "y": 2, "anchor": "a", "door": " "}`, "exit 0: door must not be blank"},
		"an unknown door": {`{"x": 1, "y": 2, "anchor": "a", "door": "TrapDoor"}`,
			`exit 0: unknown door "TrapDoor"`},
		"outside the bounds": {`{"x": 31, "y": 2, "anchor": "a"}`, "exit 0: (31, 2) is outside the bounds"},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := loadExits(t, c.exit)
			require.Error(t, err)
			assert.Contains(t, err.Error(), c.want)
		})
	}
}

// ⭐ A door is a definition with EXACTLY ONE anchor-mode travel row: none is a
// door that takes nobody anywhere, two leave the exit's one anchor ambiguous.
func TestExits_ADoorMustTravelByAnchorExactlyOnce(t *testing.T) {
	talker := &mobs.MobDefinition{Name: "Farmer", Interaction: &mobs.Interaction{
		Nodes: []mobs.InteractionNode{{ID: "root"}},
	}}
	twice := door("TwoWays", "")
	twice.Interaction.Nodes[0].Options = append(twice.Interaction.Nodes[0].Options,
		twice.Interaction.Nodes[0].Options[0])

	for _, def := range []*mobs.MobDefinition{talker, twice, {Name: "Mute"}} {
		t.Run(def.Name, func(t *testing.T) {
			_, err := LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40},
				"exits": [{"x": 1, "y": 2, "anchor": "a", "door": "`+def.Name+`"}]}`),
				"", doorRegistry(def), newFakePropRegistry())
			require.Error(t, err)
			assert.Contains(t, err.Error(), "exactly one anchor-mode travel_to row")
		})
	}
}

// ⭐ D3: the synthesized spawn IS today's door spawn, field for field, so the
// door behaves exactly as the spawn it replaces.
func TestExits_SynthesizeTheDoorSpawn(t *testing.T) {
	z, err := LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"areas": [{"id": "farmlands", "exits": [{"x": 1, "y": 2, "anchor": "below", "door": "CaveExit"}]}]}`),
		"", doorRegistry(), newFakePropRegistry())
	require.NoError(t, err)

	spawns := z.ExitSpawns()
	require.Len(t, spawns, 1)
	s := spawns[0]
	assert.Equal(t, "CaveExit", s.Mob)
	assert.Same(t, z.Exits[0].Def, s.Def)
	assert.Equal(t, float32(1), s.X)
	assert.Equal(t, float32(2), s.Y)
	assert.Equal(t, "below", s.Anchor)
	assert.Equal(t, "farmlands", s.Area)
	assert.Zero(t, s.Angle)
	assert.Nil(t, s.WanderRadius)
	assert.Empty(t, s.Waypoints)
}

func TestPlace_OffsetsExits(t *testing.T) {
	z := zoneAt("under", 60, 40, 0, -500)
	z.Exits = []Exit{{X: 1, Y: 2, Anchor: "up"}}
	require.NoError(t, Place([]*Zone{zoneAt("world", 144, 72, 0, 0), z}))
	assert.Equal(t, Exit{X: 1, Y: -498, Anchor: "up"}, z.Exits[0])
}

// The travel pass walks exits as well as spawns: a door authored as an exit
// that leads nowhere must refuse the boot exactly as the spawn did.
func TestCrossValidateTravelAnchors_WalksExits(t *testing.T) {
	mouth := door(GenericDoor, "")
	surface := zoneAt("world", 144, 72, 0, 0)
	surface.Exits = []Exit{{X: 3, Y: 4, Anchor: "under-west", Def: mouth}}

	_, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}}, []*Zone{surface})
	require.Error(t, err)
	assert.Contains(t, err.Error(), GenericDoor)
	assert.Contains(t, err.Error(), "under-west")

	under := zoneAt("under", 60, 40, 0, 300)
	under.Anchors = []Anchor{{Name: "under-west"}}
	warnings, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface, under})
	require.NoError(t, err)
	assert.Empty(t, warnings, "a door placed as an exit counts as placed")
}

// ⛑ Underworld L8 (portal-spells D8), now a boot refusal (D3): a talk exit
// inside a campfire's dwell circle loses every E press to the flight map.
func TestCrossValidateExitClearance_RefusesAnExitInsideADwellCircle(t *testing.T) {
	mouth := door(GenericDoor, "")
	mouth.Interaction.Range = 2
	z := zoneAt("world", 144, 72, 0, 0)
	z.BindPoints = []Campfire{{ID: "spawnpoint-1", X: 0, Y: 0}}

	// Clearance is the dwell radius plus the door's own interact range: 3 + 2.
	z.Exits = []Exit{{X: 5.5, Y: 0, Anchor: "a", Def: mouth}}
	assert.NoError(t, CrossValidateExitClearance([]*Zone{z}, 3))

	z.Exits = []Exit{{X: 4.5, Y: 0, Anchor: "a", Def: mouth}}
	err := CrossValidateExitClearance([]*Zone{z}, 3)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `campfire "spawnpoint-1"`)
	assert.Contains(t, err.Error(), `"a"`)
}

// Fires and exits in DIFFERENT zones of the set are compared too: positions
// are world coordinates once placed, and a fire beside a zone edge can reach
// nothing in another zone anyway, so one flat pass is faithful.
func TestCrossValidateExitClearance_ComparesAcrossTheSet(t *testing.T) {
	mouth := door(GenericDoor, "")
	a := zoneAt("a", 10, 10, 0, 0)
	a.BindPoints = []Campfire{{ID: "f", X: 0, Y: 0}}
	b := zoneAt("b", 10, 10, 0, 0)
	b.Exits = []Exit{{X: 1, Y: 0, Anchor: "x", Def: mouth}}
	assert.Error(t, CrossValidateExitClearance([]*Zone{a, b}, 2))
}
