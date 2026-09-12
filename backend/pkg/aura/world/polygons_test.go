package world

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- parsing & validation (plan-zone-polygons.md P2) ----------------------

func TestPolygonParses(t *testing.T) {
	const doc = `{
		"name": "Polys",
		"bounds": { "width": 60, "height": 40 },
		"polygons": [
			{ "profile": "Mountains", "blocksMovement": true,
			  "points": [{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":10},{"x":-10,"y":10}] },
			{ "profile": "Water",
			  "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }
		]
	}`
	z, err := parseZone([]byte(doc))
	require.NoError(t, err)
	require.Len(t, z.Polygons, 2)
	assert.Equal(t, "Mountains", z.Polygons[0].Profile)
	assert.True(t, z.Polygons[0].BlocksMovement)
	assert.Len(t, z.Polygons[0].Points, 4)
	// The zero value is the safe one: a polygon is decorative unless it says so.
	assert.False(t, z.Polygons[1].BlocksMovement)
}

// Every zone shipped before this authors none — the feature is inert at HEAD.
func TestZoneWithoutPolygonsIsValid(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"None","bounds":{"width":60,"height":40}}`))
	require.NoError(t, err)
	assert.Empty(t, z.Polygons)
}

// Each message names the INDEX: a polygon has no id and no unique name, so the
// array position is the only thing an author can search for — the same rule
// regions and paths already follow.
func TestPolygonValidationNamesTheIndex(t *testing.T) {
	cases := []struct {
		name, poly, want string
	}{
		{"empty profile",
			`{"profile":"  ","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}`,
			"polygon 0: profile must not be empty"},
		{"two points are a line, not an area",
			`{"profile":"Water","points":[{"x":0,"y":0},{"x":1,"y":0}]}`,
			"polygon 0: needs at least 3 points to enclose an area, got 2"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := `{"name":"P","bounds":{"width":60,"height":40},"polygons":[` + c.poly + `]}`
			_, err := parseZone([]byte(doc))
			require.Error(t, err)
			assert.EqualError(t, err, c.want)
		})
	}
}

// ⭐ THREE, not two. A polygon encloses an AREA — the region rule, not the path
// rule. Getting this wrong the other way would accept a two-point "area" whose
// collider (P3) has no inside to fill.
func TestThreePointPolygonIsValid(t *testing.T) {
	_, err := parseZone([]byte(`{"name":"P","bounds":{"width":60,"height":40},
		"polygons":[{"profile":"Water","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}]}`))
	require.NoError(t, err)
}

// ⭐ A polygon is NOT a region, and this is the pin that says so: they parse
// into different arrays and nothing merges them. Regions answer resolve() for
// footsteps, music and atmosphere; a cave wall must never turn up there.
func TestPolygonsAndRegionsAreSeparateArrays(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"P","bounds":{"width":60,"height":40},
		"regions":[{"profile":"Fields","points":[{"x":0,"y":0},{"x":9,"y":0},{"x":9,"y":9}]}],
		"polygons":[{"profile":"Mountains","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}]}`))
	require.NoError(t, err)
	require.Len(t, z.Regions, 1)
	require.Len(t, z.Polygons, 1)
	assert.Equal(t, "Fields", z.Regions[0].Profile)
	assert.Equal(t, "Mountains", z.Polygons[0].Profile)
}

// ⚑ Polygons are COLLISION geometry (P3), so they move with a placed zone's
// origin — unlike regions, which the client offsets itself. A polygon left at
// zone-local coordinates would wall the overworld instead of the cave.
func TestPolygonPointsMoveWithTheZoneOrigin(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"P","bounds":{"width":40,"height":20},
		"origin":{"x":500,"y":300},
		"regions":[{"profile":"Fields","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}],
		"polygons":[{"profile":"Mountains","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}]}`))
	require.NoError(t, err)
	require.NoError(t, Place([]*Zone{z}))

	assert.EqualValues(t, 500, z.Polygons[0].Points[0].X, "polygons are placed")
	assert.EqualValues(t, 300, z.Polygons[0].Points[0].Y)
	assert.EqualValues(t, 0, z.Regions[0].Points[0].X,
		"regions are NOT — the client applies the origin itself, and doing it here too would move them twice")
}

// ---- outlines, on BOTH surface types (plan-zone-polygons.md D3) -----------

func TestOutlineParsesOnBothSurfaceTypes(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"O","bounds":{"width":60,"height":40},
		"paths":[{"profile":"Water","width":3,"points":[{"x":0,"y":0},{"x":5,"y":0}],
		          "outlineProfile":"Coast","outlineWidth":0.5}],
		"polygons":[{"profile":"Water","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}],
		             "outlineProfile":"Ice","outlineWidth":1.25}]}`))
	require.NoError(t, err)
	assert.Equal(t, "Coast", z.Paths[0].OutlineProfile)
	assert.EqualValues(t, 0.5, z.Paths[0].OutlineWidth)
	assert.Equal(t, "Ice", z.Polygons[0].OutlineProfile)
	assert.EqualValues(t, 1.25, z.Polygons[0].OutlineWidth)
}

// Absent-safe: every shape authored before this has neither key.
func TestOutlineIsAbsentSafe(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"O","bounds":{"width":60,"height":40},
		"paths":[{"profile":"Road","width":2,"points":[{"x":0,"y":0},{"x":5,"y":0}]}],
		"polygons":[{"profile":"Water","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}]}`))
	require.NoError(t, err)
	assert.Empty(t, z.Paths[0].OutlineProfile)
	assert.EqualValues(t, 0, z.Paths[0].OutlineWidth)
	assert.Empty(t, z.Polygons[0].OutlineProfile)
}

// ⭐ Both HALF-authored forms are refused, and the reason is that both fail
// silently in game: a named profile with no width strokes zero pixels, a width
// with no profile strokes nothing at all. Either one looks exactly like the
// outline feature not working.
func TestHalfAuthoredOutlineIsRefusedOnBothTypes(t *testing.T) {
	cases := []struct{ name, doc, want string }{
		{"path: profile without width",
			`"paths":[{"profile":"Road","width":2,"points":[{"x":0,"y":0},{"x":5,"y":0}],
			  "outlineProfile":"Coast"}]`,
			`path 0: outlineProfile "Coast" needs a positive outlineWidth, got 0`},
		{"path: width without profile",
			`"paths":[{"profile":"Road","width":2,"points":[{"x":0,"y":0},{"x":5,"y":0}],
			  "outlineWidth":0.5}]`,
			"path 0: outlineWidth 0.5 draws nothing without an outlineProfile"},
		{"polygon: profile without width",
			`"polygons":[{"profile":"Water","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}],
			  "outlineProfile":"Ice"}]`,
			`polygon 0: outlineProfile "Ice" needs a positive outlineWidth, got 0`},
		{"polygon: width without profile",
			`"polygons":[{"profile":"Water","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}],
			  "outlineWidth":2}]`,
			"polygon 0: outlineWidth 2 draws nothing without an outlineProfile"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := parseZone([]byte(`{"name":"O","bounds":{"width":60,"height":40},` + c.doc + `}`))
			require.Error(t, err)
			assert.EqualError(t, err, c.want)
		})
	}
}

// ⛔ L4 — THE OUTLINE IS DECORATION AND NEVER TOUCHES COLLISION. Otherwise "my
// river blocks wider than I authored it" becomes a debugging session, and the
// outline stops being safely tunable by eye. This is the pin that says so, for
// both builders.
func TestOutlineDoesNotChangeAnyCollider(t *testing.T) {
	bare, err := parseZone([]byte(`{"name":"O","bounds":{"width":200,"height":200},
		"paths":[{"profile":"Water","width":3,"blocksMovement":true,
		          "points":[{"x":-20,"y":0},{"x":20,"y":0}]}],
		"polygons":[{"profile":"Mountains","blocksMovement":true,
		             "points":[{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":10},{"x":-10,"y":10}]}]}`))
	require.NoError(t, err)
	// The same world with a FAT outline on both — far wider than either shape.
	rimmed, err := parseZone([]byte(`{"name":"O","bounds":{"width":200,"height":200},
		"paths":[{"profile":"Water","width":3,"blocksMovement":true,
		          "points":[{"x":-20,"y":0},{"x":20,"y":0}],
		          "outlineProfile":"Coast","outlineWidth":9}],
		"polygons":[{"profile":"Mountains","blocksMovement":true,
		             "points":[{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":10},{"x":-10,"y":10}],
		             "outlineProfile":"Ice","outlineWidth":9}]}`))
	require.NoError(t, err)

	assert.Equal(t, PathCorridors(bare), PathCorridors(rimmed))
	bareP, _ := PolygonColliders(bare)
	rimP, _ := PolygonColliders(rimmed)
	assert.Equal(t, bareP, rimP)
}
