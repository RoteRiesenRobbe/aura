package world

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// placed is one flattened object as the shared fixture names it: its x (a
// shape's first point), its area, and for a prop its layer.
type placed struct {
	X     float32 `json:"x"`
	Area  string  `json:"area"`
	Layer string  `json:"layer,omitempty"`
}

// ⭐ The cross-language pin (plan-prop-draw-order.md P4, D11). The client's
// ZoneAreas.test.ts flattens the SAME fixture against the SAME expectation, so
// the server and the client cannot disagree about the order. It also asserts
// the area every flattened object came from: the PO's condition on D10.
func TestZone_AreasFlattenLikeTheClient(t *testing.T) {
	raw, err := os.ReadFile("testdata/area-flatten.json")
	require.NoError(t, err)
	var fixture struct {
		Zone     json.RawMessage     `json:"zone"`
		Expected map[string][]placed `json:"expected"`
	}
	require.NoError(t, json.Unmarshal(raw, &fixture))

	z, err := parseZone(fixture.Zone)
	require.NoError(t, err)

	first := func(pts []Point) float32 { return pts[0].X }
	got := map[string][]placed{}
	for _, o := range z.Decals {
		got["decals"] = append(got["decals"], placed{X: o.X, Area: o.Area})
	}
	for _, o := range z.Props {
		got["props"] = append(got["props"], placed{X: o.X, Area: o.Area, Layer: o.Layer})
	}
	for _, o := range z.Spawns {
		got["spawns"] = append(got["spawns"], placed{X: o.X, Area: o.Area})
	}
	for _, o := range z.BindPoints {
		got["bindPoints"] = append(got["bindPoints"], placed{X: o.X, Area: o.Area})
	}
	for _, o := range z.DarkAreas {
		got["darkAreas"] = append(got["darkAreas"], placed{X: o.X, Area: o.Area})
	}
	for _, o := range z.Regions {
		got["regions"] = append(got["regions"], placed{X: first(o.Points), Area: o.Area})
	}
	for _, o := range z.Paths {
		got["paths"] = append(got["paths"], placed{X: first(o.Points), Area: o.Area})
	}
	for _, o := range z.Structures {
		got["structures"] = append(got["structures"], placed{X: first(o.Points), Area: o.Area})
	}
	for _, o := range z.Atmospheres {
		got["atmospheres"] = append(got["atmospheres"], placed{X: first(o.Points), Area: o.Area})
	}
	for _, o := range z.Clearings {
		got["clearings"] = append(got["clearings"], placed{X: first(o.Points), Area: o.Area})
	}
	for _, o := range z.Anchors {
		got["anchors"] = append(got["anchors"], placed{X: o.X, Area: o.Area})
	}
	assert.Equal(t, fixture.Expected, got)

	// The fixture must cover every kind an area can hold, or a kind the
	// flatten forgot would pass here by being absent from both sides.
	assert.ElementsMatch(t, objectKindNames(), keysOf(fixture.Expected))

	// One copy of every object: the nested forms are emptied once flattened,
	// and only the ids are kept, for the boot's list check (P4b).
	assert.Nil(t, z.Areas)
	assert.Equal(t, []string{"farmlands", "dark-woods"}, z.AreaIDs)
	assert.NoError(t, CrossValidateAreaIDs([]string{"farmlands", "dark-woods"}, []*Zone{z}))
	assert.Equal(t, PropLayers{}, z.PropLayers)
}

func keysOf(m map[string][]placed) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestZone_ObjectKindsAreTheObjectArrays(t *testing.T) {
	assert.ElementsMatch(t, []string{
		"decals", "props", "spawns", "bindPoints", "darkAreas", "regions",
		"paths", "structures", "atmospheres", "clearings", "anchors",
	}, objectKindNames())
}

const areaZone = `{"name": "X", "bounds": {"width": 60, "height": 40}, "areas": [%s]}`

func parseAreas(t *testing.T, areas string) error {
	t.Helper()
	_, err := parseZone([]byte(strings.Replace(areaZone, "%s", areas, 1)))
	return err
}

// D12: an id is a slug, unique in the zone, and never a kind name (a message
// would read `spawn 1 in area "spawns"`). The same rule holds the list (P4b).
func TestZone_AreaIDsAreSlugsUniqueAndNotKindNames(t *testing.T) {
	require.NoError(t, parseAreas(t, `{"id": "farmlands"}, {"id": "dark-woods-2"}`))

	for _, tc := range []struct{ areas, want string }{
		{`{"id": ""}`, `area 0: id "" must be`},
		{`{"id": "Farmlands"}`, `area 0: id "Farmlands" must be`},
		{`{"id": "dark woods"}`, `area 0: id "dark woods" must be`},
		{`{"id": "a"}, {"id": "a"}`, `area 1: duplicate id "a"`},
		{`{"id": "spawns"}`, `area 0: id "spawns" is the name of an object array`},
		{`{"id": "props"}`, `area 0: id "props" is the name of an object array`},
	} {
		err := parseAreas(t, tc.areas)
		require.Error(t, err, tc.areas)
		assert.Contains(t, err.Error(), tc.want, tc.areas)
	}
}

// What an area may hold is the object arrays and nothing else: zone-level
// settings stay zone-level, and an unknown key refuses by name.
func TestZone_AnAreaHoldsOnlyObjectArrays(t *testing.T) {
	for _, key := range []string{`"name": "x"`, `"bounds": {"width": 1, "height": 1}`, `"ground": "Grass"`, `"roofs": []`} {
		err := parseAreas(t, `{"id": "a", `+key+`}`)
		require.Error(t, err, key)
	}
}

// A message about an object in an area names the area as well as the index,
// and the index is the one in the area's own array, which is what an author
// can find in the file. Zone-level messages read exactly as before.
func TestZone_AreaErrorsNameTheAreaAndItsOwnIndex(t *testing.T) {
	err := parseAreas(t, `{"id": "a", "spawns": [{"mob": "Wolf", "x": 0, "y": 0, "angle": 0}]},
		{"id": "b", "spawns": [{"mob": "Wolf", "x": 0, "y": 0, "angle": 0},
		                       {"mob": "Wolf", "x": 0, "y": 0, "angle": 0, "level": 0}]}`)
	require.Error(t, err)
	assert.Equal(t, `spawn 1 in area "b": level 0 must be >= 1`, err.Error())

	_, err = parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"paths": [{"profile": "Road", "points": [{"x": 0, "y": 0}, {"x": 1, "y": 0}], "width": 0}]}`))
	require.Error(t, err)
	assert.Equal(t, "path 0: width must be positive, got 0", err.Error())

	err = parseAreas(t, `{"id": "a", "regions": [{"profile": "G", "points": [{"x": 0, "y": 0}]}]}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `region 0 in area "a": needs at least 3 points`)

	err = parseAreas(t, `{"id": "a", "props": {"canopy": [{"type": "T", "x": 0, "y": 0, "scale": 0}]}}`)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `prop props.canopy[0] in area "a": scale 0`)
}

// resolve() names the area too: an unknown prop type, and D4's bridge pairing.
func TestZone_AreaResolveErrorsNameTheArea(t *testing.T) {
	const doc = `{"name": "X", "bounds": {"width": 60, "height": 40},
		"props": {"default": [{"type": "Bridge", "x": 0, "y": 0}]},
		"areas": [{"id": "a", "props": {"default": [{"type": "Rock", "x": 0, "y": 0}, {"type": "Bridge", "x": 0, "y": 0}]}}]}`
	pr := newFakePropRegistry("Rock")
	pr.byName["Bridge"] = &PropDefinition{Name: "Bridge", CrossesPaths: true, Body: PropBody{Radius: 0.5},
		BlocksMovement: boolPtr(false)}

	// The zone-level bridge is reported first and reads exactly as before.
	_, err := LoadZoneFS(mapFS(doc), "", newFakeMobRegistry(), pr)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `prop props.default[0]: "Bridge" crosses paths`)
	assert.NotContains(t, err.Error(), "in area")

	moved := strings.Replace(doc, `"props": {"default": [{"type": "Bridge", "x": 0, "y": 0}]},`, "", 1)
	_, err = LoadZoneFS(mapFS(moved), "", newFakeMobRegistry(), pr)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `prop props.default[1] in area "a": "Bridge" crosses paths`)

	_, err = LoadZoneFS(mapFS(strings.Replace(moved, `"Rock"`, `"Rok"`, 1)), "", newFakeMobRegistry(), pr)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `prop props.default[0] in area "a": unknown type "Rok"`)
}

// Names that must be unique stay unique ZONE-WIDE: an encounter script looks
// an anchor up by name, and a character's bind is persisted by id, whichever
// group the author happened to put the object in.
func TestZone_UniqueNamesStayZoneWideAcrossAreas(t *testing.T) {
	_, err := parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"anchors": [{"name": "boss", "x": 0, "y": 0}],
		"areas": [{"id": "a", "anchors": [{"name": "boss", "x": 1, "y": 1}]}]}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), `anchor 0 in area "a": duplicate name "boss"`)

	_, err = parseZone([]byte(`{"name": "X", "bounds": {"width": 60, "height": 40},
		"areas": [{"id": "a", "bindPoints": [{"id": "spawnpoint-1", "x": 0, "y": 0}]},
		          {"id": "b", "bindPoints": [{"id": "spawnpoint-1", "x": 1, "y": 1}]}]}`))
	require.Error(t, err)
	assert.Contains(t, err.Error(), `bind point 0 in area "b": duplicate spawn point id "spawnpoint-1"`)
}
