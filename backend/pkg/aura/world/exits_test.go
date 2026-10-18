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
	for _, d := range append([]*mobs.MobDefinition{passage(GenericDoor), passage("CaveExit")}, extra...) {
		r.byName[d.Name] = d
	}
	return r
}

// passage is a door definition the way the shipped ones author it: one
// anchor travel row, drawn as a Passage (plan-passages.md D4).
func passage(name string) *mobs.MobDefinition {
	d := door(name, "")
	d.EntityType = "Passage"
	return d
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

// ⭐ P2 (D4/D5): the look and the turn belong to the exit and are drawn by the
// client; the server only refuses a look the client has no art for.
func TestExits_LookAndRotation(t *testing.T) {
	z, err := loadExits(t, `{"x": 1, "y": 2, "rotation": 1.5, "anchor": "a", "look": "stairs-down"},
		{"x": 3, "y": 4, "anchor": "b"}`)
	require.NoError(t, err)
	assert.Equal(t, float32(1.5), z.Exits[0].Rotation)
	assert.Equal(t, ExitLookStairsDown, z.Exits[0].EffectiveLook())
	assert.Equal(t, ExitLookCaveMouth, z.Exits[1].EffectiveLook(), "absent is the cave mouth")

	for _, look := range ExitLooks {
		_, err := loadExits(t, `{"x": 1, "y": 2, "anchor": "a", "look": "`+look+`"}`)
		assert.NoError(t, err, look)
	}
	_, err = loadExits(t, `{"x": 1, "y": 2, "anchor": "a", "look": "trapdoor"}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `exit 0: look "trapdoor" must be one of`)
}

// D3/D4: a door is drawn by its exit, so its mob must draw nothing itself. A
// door definition on any other entityType would put a sprite, a health bar
// and a plate on top of the exit's look.
func TestExits_ADoorMustBeAPassage(t *testing.T) {
	signpost := door("OldDoor", "")
	signpost.EntityType = "Signpost"
	_, err := LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"exits": [{"x": 1, "y": 2, "anchor": "a", "door": "OldDoor"}]}`),
		"", doorRegistry(signpost), newFakePropRegistry())
	require.Error(t, err)
	assert.Contains(t, err.Error(), `door "OldDoor" must have entityType "Passage"`)
}

// ⭐ P3 (D7): an exit's id keys its words in a file a person edits, so it is a
// readable slug, and unique across the placed set like an anchor name.
func TestExits_IDIsASlug(t *testing.T) {
	z, err := loadExits(t, `{"id": "barn-door", "x": 1, "y": 2, "anchor": "a"}`)
	require.NoError(t, err)
	assert.Equal(t, "barn-door", z.Exits[0].ID)

	for _, id := range []string{"Barn Door", "barn.door", " "} {
		_, err := loadExits(t, `{"id": "`+id+`", "x": 1, "y": 2, "anchor": "a"}`)
		require.Error(t, err, id)
		assert.Contains(t, err.Error(), "exit 0: id")
	}
}

func TestPlace_RefusesAnExitIDTwice(t *testing.T) {
	a := zoneAt("a", 10, 10, 0, 0)
	a.Exits = []Exit{{ID: "the-door", Anchor: "x"}}
	b := zoneAt("b", 10, 10, 0, 100)
	b.Exits = []Exit{{ID: "the-door", Anchor: "y"}}
	err := Place([]*Zone{a, b})
	require.Error(t, err)
	assert.Contains(t, err.Error(), `both author exit "the-door"`)

	b.Exits[0].ID = "another-door"
	assert.NoError(t, Place([]*Zone{a, b}))
}

// wordsDoor is a door that says something, so a test can tell its own words
// from the words an exit gives it.
func wordsDoor(name string) *mobs.MobDefinition {
	d := passage(name)
	d.Interaction.Nodes[0].Lines = []string{"A dark opening."}
	d.Interaction.Nodes[0].LineIDs = []string{"conv." + name + ".a-dark-opening"}
	d.Interaction.Nodes[0].Options[0].ID = "conv." + name + ".climb-down"
	return d
}

func wordsExit(id, anchor string, def *mobs.MobDefinition) *Zone {
	z := zoneAt("world", 60, 40, 0, 0)
	z.Exits = []Exit{{ID: id, Anchor: anchor, Def: def}}
	return z
}

// root is the one node a door definition built by door() authors.
func root(e *Exit) *mobs.InteractionNode { return &e.Def.Interaction.Nodes[0] }

// ⭐ D6: the words a door shows, three tiers, the first key with English winning
// per column. Text and row resolve here, at boot; the header is the client's.
func TestApplyExitWords_Tiers(t *testing.T) {
	en := map[string]string{
		"anchor.barn-inside.text": "A low door into the barn.",
		"exit.cellar-stairs.text": "Steps lead up.",
		"exit.cellar-stairs.go":   "Climb the stairs.",
		"exit.only-a-row.go":      "Go in.",
	}

	t.Run("nothing authored: the definition's words", func(t *testing.T) {
		mouth := wordsDoor(GenericDoor)
		z := wordsExit("", "nowhere-known", mouth)
		ApplyExitWords([]*Zone{z}, en)
		assert.Equal(t, []string{"A dark opening."}, root(&z.Exits[0]).Lines)
		assert.Equal(t, "conv.CaveMouth.climb-down", root(&z.Exits[0]).Options[0].ID)
	})

	t.Run("tier 2: the destination's text on a stock door", func(t *testing.T) {
		for _, name := range StockDoors {
			z := wordsExit("", "barn-inside", wordsDoor(name))
			ApplyExitWords([]*Zone{z}, en)
			assert.Equal(t, []string{"A low door into the barn."}, root(&z.Exits[0]).Lines, name)
			assert.Equal(t, []string{"anchor.barn-inside.text"}, root(&z.Exits[0]).LineIDs, name)
			assert.Equal(t, "conv."+name+".climb-down", root(&z.Exits[0]).Options[0].ID, "no row at tier 2")
		}
	})

	t.Run("tier 0: a custom door keeps its words over the destination's", func(t *testing.T) {
		z := wordsExit("", "barn-inside", wordsDoor("BeastDoor"))
		ApplyExitWords([]*Zone{z}, en)
		assert.Equal(t, []string{"A dark opening."}, root(&z.Exits[0]).Lines)
	})

	t.Run("tier 1: the exit's own words beat everything", func(t *testing.T) {
		for _, name := range []string{GenericDoor, "BeastDoor"} {
			z := wordsExit("cellar-stairs", "barn-inside", wordsDoor(name))
			ApplyExitWords([]*Zone{z}, en)
			n := root(&z.Exits[0])
			assert.Equal(t, []string{"Steps lead up."}, n.Lines, name)
			assert.Equal(t, []string{"exit.cellar-stairs.text"}, n.LineIDs, name)
			assert.Equal(t, "Climb the stairs.", n.Options[0].Text, name)
			assert.Equal(t, "exit.cellar-stairs.go", n.Options[0].ID, name)
		}
	})

	t.Run("per column: an exit with only a row still reads its destination", func(t *testing.T) {
		z := wordsExit("only-a-row", "barn-inside", wordsDoor(GenericDoor))
		ApplyExitWords([]*Zone{z}, en)
		n := root(&z.Exits[0])
		assert.Equal(t, []string{"A low door into the barn."}, n.Lines)
		assert.Equal(t, "exit.only-a-row.go", n.Options[0].ID)
	})
}

// ⚑ The words are PER EXIT: one definition serves every door in the world, so
// giving one exit its words must never reach the definition or another door.
func TestApplyExitWords_LeavesTheDefinitionAlone(t *testing.T) {
	mouth := wordsDoor(GenericDoor)
	z := zoneAt("world", 60, 40, 0, 0)
	z.Exits = []Exit{{ID: "cellar-stairs", Anchor: "a", Def: mouth}, {Anchor: "b", Def: mouth}}
	ApplyExitWords([]*Zone{z}, map[string]string{"exit.cellar-stairs.text": "Steps.", "exit.cellar-stairs.go": "Up."})

	assert.Equal(t, []string{"A dark opening."}, mouth.Interaction.Nodes[0].Lines)
	assert.Equal(t, "conv.CaveMouth.climb-down", mouth.Interaction.Nodes[0].Options[0].ID)
	assert.Equal(t, []string{"A dark opening."}, root(&z.Exits[1]).Lines)
	assert.Equal(t, GenericDoor, z.Exits[0].Def.Name, "still the same door, only its words differ")
	assert.Equal(t, mouth.ID, z.Exits[0].Def.ID)
}

// The client names the panel from the exit (D6's header column), so every
// door carries which exit it is: the id, or the anchor for an id-less exit.
func TestApplyExitWords_StampsTheExitID(t *testing.T) {
	z := zoneAt("world", 60, 40, 0, 0)
	z.Exits = []Exit{{ID: "cellar-stairs", Anchor: "a", Def: passage(GenericDoor)},
		{Anchor: "barn-inside", Def: passage(GenericDoor)}}
	ApplyExitWords([]*Zone{z}, nil)
	assert.Equal(t, "cellar-stairs", z.Exits[0].Def.Interaction.ExitID)
	assert.Equal(t, "@barn-inside", z.Exits[1].Def.Interaction.ExitID)
	assert.Equal(t, "@barn-inside", z.ExitSpawns()[1].Def.Interaction.ExitID, "the spawn talks with it")
}

// --- P4: touch exits (D1, D8) ---------------------------------------------

func loadExitAreas(t *testing.T, areas string) (*Zone, error) {
	t.Helper()
	return LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40}, "exitAreas": [`+areas+`]}`),
		"", doorRegistry(), newFakePropRegistry())
}

const glowSquare = `"points": [{"x": 0, "y": 0}, {"x": 2, "y": 0}, {"x": 2, "y": 2}, {"x": 0, "y": 2}]`

func TestExitAreas_LoadAndFlatten(t *testing.T) {
	z, err := LoadZoneFS(mapFS(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"exitAreas": [{"id": "glow-pit", `+glowSquare+`, "anchor": "a", "look": "hidden"}],
		"areas": [{"id": "farmlands", "exitAreas": [{`+glowSquare+`, "anchor": "b"}]}]}`),
		"", doorRegistry(), newFakePropRegistry())
	require.NoError(t, err)
	require.Len(t, z.ExitAreas, 2)
	assert.Equal(t, "glow-pit", z.ExitAreas[0].ID)
	assert.Equal(t, ExitLookHidden, z.ExitAreas[0].Look)
	assert.Len(t, z.ExitAreas[0].Points, 4)
	assert.Equal(t, "farmlands", z.ExitAreas[1].Area)
	assert.Equal(t, Point{X: 1, Y: 1}, z.ExitAreas[0].Centroid())
}

func TestExitAreas_RefuseWhatCannotTakeAnyoneAnywhere(t *testing.T) {
	cases := map[string]struct{ area, want string }{
		"no anchor":     {`{` + glowSquare + `}`, "exitArea 0: anchor must not be empty"},
		"two points":    {`{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}], "anchor": "a"}`, "exitArea 0: needs at least 3 points"},
		"an unknown look": {`{` + glowSquare + `, "anchor": "a", "look": "portal"}`, `exitArea 0: look "portal" must be one of`},
		"a bad id":      {`{"id": "Glow Pit", ` + glowSquare + `, "anchor": "a"}`, `exitArea 0: id "Glow Pit" must be a slug`},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := loadExitAreas(t, c.area)
			require.Error(t, err)
			assert.Contains(t, err.Error(), c.want)
		})
	}
}

func TestPlace_OffsetsExitAreas(t *testing.T) {
	z := zoneAt("under", 60, 40, 0, -500)
	z.ExitAreas = []ExitArea{{Anchor: "up", Points: []Point{{X: 0, Y: 0}, {X: 2, Y: 0}, {X: 0, Y: 2}}}}
	require.NoError(t, Place([]*Zone{zoneAt("world", 144, 72, 0, 0), z}))
	assert.Equal(t, []Point{{X: 0, Y: -500}, {X: 2, Y: -500}, {X: 0, Y: -498}}, z.ExitAreas[0].Points)
}

// One id namespace for both kinds of exit (D7).
func TestPlace_RefusesAnIDSharedByAnExitAndAnArea(t *testing.T) {
	a := zoneAt("a", 10, 10, 0, 0)
	a.Exits = []Exit{{ID: "the-way", Anchor: "x"}}
	a.ExitAreas = []ExitArea{{ID: "the-way", Anchor: "y"}}
	err := Place([]*Zone{a})
	require.Error(t, err)
	assert.Contains(t, err.Error(), `exit "the-way"`)
}

// ⛑ L3, the belt to D8's disarm: an anchor inside a touch area would land
// travellers on a crossing, and two such areas bounce a player forever.
func TestCrossValidateExitAreas(t *testing.T) {
	square := func(cx, cy float32) []Point {
		return []Point{{X: cx - 1, Y: cy - 1}, {X: cx + 1, Y: cy - 1}, {X: cx + 1, Y: cy + 1}, {X: cx - 1, Y: cy + 1}}
	}
	surface := zoneAt("world", 144, 72, 0, 0)
	surface.Anchors = []Anchor{{Name: "home", X: 10, Y: 10}}
	under := zoneAt("under", 60, 40, 0, 300)
	under.Anchors = []Anchor{{Name: "below", X: 0, Y: 300}}
	surface.ExitAreas = []ExitArea{{Anchor: "below", Points: square(0, 0)}}
	under.ExitAreas = []ExitArea{{Anchor: "home", Points: square(5, 300)}}
	zones := []*Zone{surface, under}
	require.NoError(t, CrossValidateExitAreas(zones))

	under.ExitAreas[0].Anchor = "nowhere"
	err := CrossValidateExitAreas(zones)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `"nowhere"`)

	under.ExitAreas[0] = ExitArea{Anchor: "home", Points: square(0, 300)}
	err = CrossValidateExitAreas(zones)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `anchor "below" stands inside`)
}
