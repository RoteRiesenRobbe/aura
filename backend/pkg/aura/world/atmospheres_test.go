package world

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- parsing & validation (plan-region-atmosphere.md A0) -------------------

func TestAtmosphereParses(t *testing.T) {
	const doc = `{
		"name": "Airs",
		"bounds": { "width": 60, "height": 40 },
		"atmospheres": [
			{ "profile": "CaveAir",
			  "points": [{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":10},{"x":-10,"y":10}] },
			{ "profile": "Fog",
			  "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }
		]
	}`
	z, err := parseZone([]byte(doc))
	require.NoError(t, err)
	require.Len(t, z.Atmospheres, 2)
	assert.Equal(t, "CaveAir", z.Atmospheres[0].Profile)
	assert.Len(t, z.Atmospheres[0].Points, 4)
	assert.Equal(t, "Fog", z.Atmospheres[1].Profile)
}

// Every zone shipped before this authors none — the feature is inert at HEAD,
// the same bar every other surface primitive was held to.
func TestZoneWithoutAtmospheresIsValid(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"None","bounds":{"width":60,"height":40}}`))
	require.NoError(t, err)
	assert.Empty(t, z.Atmospheres)
}

// Each message names the INDEX: an atmosphere has no id and no unique name, so
// the array position is the only thing an author can search for — the rule
// regions, paths and polygons already follow.
func TestAtmosphereValidationNamesTheIndex(t *testing.T) {
	cases := []struct {
		name, atmo, want string
	}{
		{"empty profile",
			`{"profile":"  ","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}`,
			"atmosphere 0: profile must not be empty"},
		{"two points are a line, not an area",
			`{"profile":"Fog","points":[{"x":0,"y":0},{"x":1,"y":0}]}`,
			"atmosphere 0: needs at least 3 points to enclose an area, got 2"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := `{"name":"A","bounds":{"width":60,"height":40},"atmospheres":[` + c.atmo + `]}`
			_, err := parseZone([]byte(doc))
			require.Error(t, err)
			assert.EqualError(t, err, c.want)
		})
	}
}

// THREE, like a region and a polygon: an atmosphere encloses an AREA.
func TestThreePointAtmosphereIsValid(t *testing.T) {
	_, err := parseZone([]byte(`{"name":"A","bounds":{"width":60,"height":40},
		"atmospheres":[{"profile":"Fog","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}]}`))
	require.NoError(t, err)
}

// ⭐ D0: atmosphere is its OWN array, not properties on a region. The four
// surfaces parse into four places and nothing merges them — a region answers
// resolve() for footsteps and music, and the air a player walks through must
// never turn up in that lookup just because it covers the same ground.
func TestAtmospheresAreTheirOwnArray(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"A","bounds":{"width":60,"height":40},
		"regions":[{"profile":"Fields","points":[{"x":0,"y":0},{"x":9,"y":0},{"x":9,"y":9}]}],
		"polygons":[{"profile":"Mountains","points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}],
		"atmospheres":[{"profile":"CaveAir","points":[{"x":0,"y":0},{"x":7,"y":0},{"x":7,"y":7}]}]}`))
	require.NoError(t, err)
	require.Len(t, z.Regions, 1)
	require.Len(t, z.Polygons, 1)
	require.Len(t, z.Atmospheres, 1)
	assert.Equal(t, "Fields", z.Regions[0].Profile)
	assert.Equal(t, "Mountains", z.Polygons[0].Profile)
	assert.Equal(t, "CaveAir", z.Atmospheres[0].Profile)
}

// ---- D15: it is NOT a Polygon ---------------------------------------------

// ⭐ THE D15 PIN. "Polygon" in the PO's ask meant the SHAPE, not the wall/mass
// concept. An atmosphere is air: it must be impossible to author collision onto
// one, and DisallowUnknownFields is what makes "impossible" true rather than
// merely undocumented. Deleting the distinction would make these keys parse
// silently and do nothing — a field that looks load-bearing and is not.
func TestAtmosphereCannotBeAuthoredToBlockOrOutline(t *testing.T) {
	cases := []struct{ name, key string }{
		{"blocksMovement", `"blocksMovement": true`},
		{"outlineProfile", `"outlineProfile": "Rim"`},
		{"outlineWidth", `"outlineWidth": 0.5`},
		{"width", `"width": 2`},
		{"closed", `"closed": true`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := `{"name":"A","bounds":{"width":60,"height":40},"atmospheres":[
				{"profile":"Fog", ` + c.key + `,
				 "points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}]}`
			_, err := parseZone([]byte(doc))
			require.Error(t, err, "an atmosphere must refuse %s by name, not accept and ignore it", c.name)
		})
	}
}

// ⭐ The other half of D15, and the one a unit test can actually observe: an
// atmosphere emits NO collision geometry. A polygon over the same points walls
// the area; the atmosphere beside it adds nothing at all.
func TestAtmosphereEmitsNoColliders(t *testing.T) {
	square := `"points":[{"x":-5,"y":-5},{"x":5,"y":-5},{"x":5,"y":5},{"x":-5,"y":5}]`

	withPolygon, err := parseZone([]byte(`{"name":"A","bounds":{"width":60,"height":40},
		"polygons":[{"profile":"Mountains","blocksMovement":true,` + square + `}]}`))
	require.NoError(t, err)
	baseline, _ := PolygonColliders(withPolygon)
	require.NotEmpty(t, baseline, "the control: a blocking polygon does emit bodies")

	withBoth, err := parseZone([]byte(`{"name":"A","bounds":{"width":60,"height":40},
		"polygons":[{"profile":"Mountains","blocksMovement":true,` + square + `}],
		"atmospheres":[{"profile":"CaveAir",` + square + `}]}`))
	require.NoError(t, err)
	both, _ := PolygonColliders(withBoth)

	assert.Len(t, both, len(baseline),
		"an atmosphere laid exactly over a wall must not add one body — it is air")
}

// ⚑ Atmospheres are CLIENT-VISUAL, so they stay zone-local and the client
// applies the origin itself — regions' posture, not polygons'. Placing them
// here as well would move every fog bank twice, and the failure is invisible in
// `world` (origin {0,0}) and 300 units off in the underworld (L5).
// ⭐⭐ REVERSED AT plan-area-effects.md E2, AND THE OLD REASON WAS WRONG ON THE
// MECHANISM. This leg used to assert that atmospheres stay ZONE-LOCAL, "because
// the client applies the origin, and doing it here too would move them twice".
//
// ⛔ The client never sees this copy — MEASURED, not argued. Zone geometry is not
// on the wire at all (no atmosphere or polygon field exists in api/schema/*.fbs),
// and the client bundles api/zones/*.json straight through webpack
// (GroundTextureManager.ts's require.context). So the server's in-memory offset
// is private to the server and cannot double-move anything.
//
// ⚑ What the old rule got RIGHT was the policy of its day: don't do dead work
// for an array nobody server-side reads. E2 created the reader — an atmosphere
// may carry an `effect`, and the area-effect system point-tests entities against
// it in WORLD coordinates — so the premise expired rather than the rule being
// mistaken.
//
// ⛔ The failure this now prevents is INVISIBLE ON THE OVERWORLD: origin {0,0}
// means no offset, so an unplaced miasma bank works perfectly in world.json and
// acts at the wrong spot in every zone that IS placed — the underworld, which is
// exactly where the hazards are going.
func TestAtmospherePointsArePlaced(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"A","bounds":{"width":40,"height":20},
		"origin":{"x":500,"y":300},
		"polygons":[{"profile":"Mountains","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}],
		"atmospheres":[{"profile":"CaveAir","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}],
		"clearings":[{"clears":"both","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}]}`))
	require.NoError(t, err)
	require.NoError(t, Place([]*Zone{z}))

	assert.EqualValues(t, 500, z.Polygons[0].Points[0].X, "the control: polygons ARE placed")
	assert.EqualValues(t, 500, z.Atmospheres[0].Points[0].X,
		"atmospheres are placed too since E2 — an effect-bearing one must act where it is DRAWN")
	assert.EqualValues(t, 300, z.Atmospheres[0].Points[0].Y)

	// ⛔ And the line has to stay somewhere: a CLEARING is still client-only —
	// it erases atmosphere on the client and no server code reads it (A4). It is
	// the control that stops "place everything" being read into this change.
	assert.EqualValues(t, 0, z.Clearings[0].Points[0].X,
		"clearings stay zone-local — the server still never reads one")
}

// ---- A4: the clearing is its own CLASS, not a magic value ------------------

func TestClearingParses(t *testing.T) {
	const doc = `{
		"name": "Airs",
		"bounds": { "width": 60, "height": 40 },
		"clearings": [
			{ "clears": "both",
			  "points": [{"x":-2,"y":-2},{"x":2,"y":-2},{"x":2,"y":2},{"x":-2,"y":2}] },
			{ "clears": "haze",
			  "points": [{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}] }
		]
	}`
	z, err := parseZone([]byte(doc))
	require.NoError(t, err)
	require.Len(t, z.Clearings, 2)
	assert.Equal(t, ClearsBoth, z.Clearings[0].Clears)
	assert.Len(t, z.Clearings[0].Points, 4)
	assert.Equal(t, ClearsHaze, z.Clearings[1].Clears)
}

// Inert at HEAD, the bar every surface primitive before it was held to.
func TestZoneWithoutClearingsIsValid(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"None","bounds":{"width":60,"height":40}}`))
	require.NoError(t, err)
	assert.Empty(t, z.Clearings)
}

// ⛔ THE VALUE MUST BE REFUSED, NOT DEFAULTED. A clearing that silently cleared
// nothing looks exactly like one drawn in the wrong place, and no picture
// distinguishes the two — so an unrecognised `clears` has to die at boot.
func TestClearingValidationNamesTheIndex(t *testing.T) {
	cases := []struct {
		name, clearing, want string
	}{
		{"empty clears",
			`{"clears":"","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}`,
			`clearing 0: clears "" must be one of "darkness", "haze" or "both"`},
		{"a value outside the closed set",
			`{"clears":"sight","points":[{"x":0,"y":0},{"x":1,"y":0},{"x":1,"y":1}]}`,
			`clearing 0: clears "sight" must be one of "darkness", "haze" or "both"`},
		{"two points are a line, not an area",
			`{"clears":"both","points":[{"x":0,"y":0},{"x":1,"y":0}]}`,
			"clearing 0: needs at least 3 points to enclose an area, got 2"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := `{"name":"A","bounds":{"width":60,"height":40},"clearings":[` + c.clearing + `]}`
			_, err := parseZone([]byte(doc))
			require.Error(t, err)
			assert.EqualError(t, err, c.want)
		})
	}
}

// ⭐ THE A4 RULING IN THE TYPE SYSTEM: a clearing takes NO profile. It paints
// nothing, so an author reaching for "what colour is my clearing" must find
// NOTHING rather than a field that quietly means something else (L7). It also
// still refuses everything an atmosphere refuses — it is air, not a wall.
func TestClearingTakesNoProfileAndNoCollision(t *testing.T) {
	cases := []struct{ name, key string }{
		{"profile", `"profile": "Clearing"`},
		{"darkness", `"darkness": 0`},
		{"blocksMovement", `"blocksMovement": true`},
		{"outlineProfile", `"outlineProfile": "Rim"`},
		{"width", `"width": 2`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := `{"name":"A","bounds":{"width":60,"height":40},"clearings":[
				{"clears":"both", ` + c.key + `,
				 "points":[{"x":0,"y":0},{"x":5,"y":0},{"x":5,"y":5}]}]}`
			_, err := parseZone([]byte(doc))
			require.Error(t, err, "a clearing must refuse %s by name, not accept and ignore it", c.name)
		})
	}
}

// A clearing is air like the atmosphere it cuts: nothing reaches phy.Space.
func TestClearingEmitsNoColliders(t *testing.T) {
	square := `"points":[{"x":-5,"y":-5},{"x":5,"y":-5},{"x":5,"y":5},{"x":-5,"y":5}]`

	withPolygon, err := parseZone([]byte(`{"name":"A","bounds":{"width":60,"height":40},
		"polygons":[{"profile":"Mountains","blocksMovement":true,` + square + `}]}`))
	require.NoError(t, err)
	baseline, _ := PolygonColliders(withPolygon)
	require.NotEmpty(t, baseline)

	withBoth, err := parseZone([]byte(`{"name":"A","bounds":{"width":60,"height":40},
		"polygons":[{"profile":"Mountains","blocksMovement":true,` + square + `}],
		"clearings":[{"clears":"both",` + square + `}]}`))
	require.NoError(t, err)
	both, _ := PolygonColliders(withBoth)
	assert.Len(t, both, len(baseline))
}

// ⚑ Client-visual, so zone-local — the atmospheres rule verbatim. A clearing
// placed here as well would be cut 300 units from the hole it belongs in, and
// the failure is invisible in `world` (origin {0,0}).
func TestClearingPointsStayZoneLocal(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"A","bounds":{"width":40,"height":20},
		"origin":{"x":500,"y":300},
		"polygons":[{"profile":"Mountains","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}],
		"clearings":[{"clears":"both","points":[{"x":0,"y":0},{"x":4,"y":0},{"x":4,"y":4}]}]}`))
	require.NoError(t, err)
	require.NoError(t, Place([]*Zone{z}))

	assert.EqualValues(t, 500, z.Polygons[0].Points[0].X, "the control: polygons ARE placed")
	assert.EqualValues(t, 0, z.Clearings[0].Points[0].X,
		"clearings are NOT — the client applies the origin, and doing it here too would move them twice")
}
