package world

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- parsing & validation (C1) -------------------------------------------

func TestPathParses(t *testing.T) {
	const doc = `{
		"name": "Paths",
		"bounds": { "width": 60, "height": 40 },
		"paths": [
			{ "profile": "Water", "width": 5, "blocksMovement": true,
			  "points": [{"x":-10,"y":0},{"x":10,"y":0}] },
			{ "profile": "Road", "width": 2.5,
			  "points": [{"x":0,"y":-10},{"x":0,"y":0},{"x":0,"y":10}] }
		]
	}`
	z, err := parseZone([]byte(doc))
	require.NoError(t, err)
	require.Len(t, z.Paths, 2)
	assert.Equal(t, "Water", z.Paths[0].Profile)
	assert.EqualValues(t, 5, z.Paths[0].Width)
	assert.True(t, z.Paths[0].BlocksMovement)
	// The zero value is the safe one: a path is decorative unless it says so.
	assert.False(t, z.Paths[1].BlocksMovement)
	assert.Len(t, z.Paths[1].Points, 3)
}

// A zone authoring no paths at all stays valid — every zone shipped before this.
func TestZoneWithoutPathsIsValid(t *testing.T) {
	z, err := parseZone([]byte(`{"name":"NoPaths","bounds":{"width":60,"height":40}}`))
	require.NoError(t, err)
	assert.Empty(t, z.Paths)
	assert.Empty(t, PathCorridors(z))
}

// Each message names the INDEX: a path has no id and no unique name, so the
// array position is the only thing an author can search for.
func TestPathValidationNamesTheIndex(t *testing.T) {
	cases := []struct {
		name, path, want string
	}{
		{"empty profile",
			`{"profile":"  ","width":2,"points":[{"x":0,"y":0},{"x":1,"y":1}]}`,
			"path 0: profile must not be empty"},
		{"one point is not a line",
			`{"profile":"Road","width":2,"points":[{"x":0,"y":0}]}`,
			"path 0: needs at least 2 points to draw a line, got 1"},
		{"zero width",
			`{"profile":"Road","width":0,"points":[{"x":0,"y":0},{"x":1,"y":1}]}`,
			"path 0: width must be positive, got 0"},
		{"negative width",
			`{"profile":"Road","width":-3,"points":[{"x":0,"y":0},{"x":1,"y":1}]}`,
			"path 0: width must be positive, got -3"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			doc := `{"name":"P","bounds":{"width":60,"height":40},"paths":[` + c.path + `]}`
			_, err := parseZone([]byte(doc))
			require.Error(t, err)
			assert.EqualError(t, err, c.want)
		})
	}
}

// ⭐ TWO, not three. A region encloses an area and needs 3; a path is an open
// polyline and 2 points are a complete road. Getting this wrong would silently
// refuse the most common shape there is.
func TestTwoPointPathIsValid(t *testing.T) {
	_, err := parseZone([]byte(`{"name":"P","bounds":{"width":60,"height":40},
		"paths":[{"profile":"Road","width":2,"points":[{"x":0,"y":0},{"x":5,"y":0}]}]}`))
	require.NoError(t, err)
}

// ---- corridors (C2) -------------------------------------------------------

func blockingZone(t *testing.T, paths string, props ...Prop) *Zone {
	t.Helper()
	z, err := parseZone([]byte(`{"name":"P","bounds":{"width":200,"height":200},"paths":[` + paths + `]}`))
	require.NoError(t, err)
	z.Props = props
	return z
}

const eastRiver = `{"profile":"Water","width":5,"blocksMovement":true,
	"points":[{"x":-20,"y":0},{"x":20,"y":0}]}`

// A decorative path is exactly free: no bodies, no cost, nothing registered.
func TestNonBlockingPathEmitsNothing(t *testing.T) {
	z := blockingZone(t, `{"profile":"Road","width":3,"points":[{"x":-20,"y":0},{"x":20,"y":0}]}`)
	assert.Empty(t, PathCorridors(z))
}

func TestBlockingPathEmitsRectsAlongTheLine(t *testing.T) {
	// 40 units long, capped at 8 per rect -> 5 rects, end to end.
	z := blockingZone(t, eastRiver)
	cs := PathCorridors(z)
	require.Len(t, cs, 5)

	var covered float32
	for _, c := range cs {
		assert.False(t, c.IsCircle())
		assert.EqualValues(t, 5, c.Width, "width across is the path's width")
		assert.EqualValues(t, 0, c.Angle, "a due-east segment has angle 0")
		assert.LessOrEqual(t, c.Length, float32(maxCorridorSegment))
		assert.InDelta(t, 0, c.Y, 1e-4)
		covered += c.Length
	}
	assert.InDelta(t, 40, covered, 1e-3, "the whole river is walled")
}

// ⚑ The cap is the broadphase guard (maxCorridorSegment), not decoration: one
// 100-unit diagonal rect would occupy a bounding box the size of a city block
// and be paired against everything in it, every tick.
func TestLongSegmentIsSplitForTheBroadphase(t *testing.T) {
	z := blockingZone(t, `{"profile":"Water","width":4,"blocksMovement":true,
		"points":[{"x":-50,"y":0},{"x":50,"y":0}]}`)
	cs := PathCorridors(z)
	require.NotEmpty(t, cs)
	for _, c := range cs {
		assert.LessOrEqual(t, c.Length, float32(maxCorridorSegment))
	}
}

// A bend gets a circle so the outer corner has no open wedge between two rects
// meeting at an angle.
func TestBendGetsAJointCircle(t *testing.T) {
	z := blockingZone(t, `{"profile":"Water","width":6,"blocksMovement":true,
		"points":[{"x":-10,"y":0},{"x":0,"y":0},{"x":0,"y":10}]}`)
	var circles []Corridor
	for _, c := range PathCorridors(z) {
		if c.IsCircle() {
			circles = append(circles, c)
		}
	}
	require.Len(t, circles, 1, "one interior vertex, one joint")
	assert.InDelta(t, 0, circles[0].X, 1e-4)
	assert.InDelta(t, 0, circles[0].Y, 1e-4)
	assert.InDelta(t, 3, circles[0].Radius, 1e-4, "half the path width")
}

func TestDegenerateSegmentIsSkipped(t *testing.T) {
	// A doubled vertex — one stray double-click in Tiled. A zero-length rect is
	// a degenerate body and atan2(0,0) is not an angle anyone wants.
	z := blockingZone(t, `{"profile":"Water","width":4,"blocksMovement":true,
		"points":[{"x":0,"y":0},{"x":0,"y":0},{"x":10,"y":0}]}`)
	cs := PathCorridors(z)
	require.NotEmpty(t, cs)
	for _, c := range cs {
		if !c.IsCircle() {
			assert.Greater(t, c.Length, float32(0))
		}
	}
}

// ---- the bridge (D6) ------------------------------------------------------

func bridgeDef(w, h float32) *PropDefinition {
	return &PropDefinition{Name: "Bridge", Body: PropBody{Width: w, Height: h}, CrossesPaths: true}
}

// ⭐ THE test for D6, and it is mutation-verified: drop the coveredByBridge call
// in appendPathCorridors and this goes red, because the river is then walled end
// to end and nothing can ever cross it.
func TestBridgeClearsTheCorridorUnderItsDeck(t *testing.T) {
	// A 40-unit river due east through the origin, and a 4x10 deck across it.
	z := blockingZone(t, eastRiver, Prop{Type: "Bridge", X: 0, Y: 0, Def: bridgeDef(4, 10)})

	cs := PathCorridors(z)
	require.NotEmpty(t, cs)

	// Nothing is left standing under the deck.
	for _, c := range cs {
		require.False(t, c.IsCircle())
		left, right := c.X-c.Length/2, c.X+c.Length/2
		assert.False(t, left < 2 && right > -2,
			"corridor [%g,%g] overlaps the deck at [-2,2]", left, right)
	}

	// And the river is still walled on both banks — a bridge opens a gap, it
	// does not delete the river.
	minX, maxX := float32(math.MaxFloat32), float32(-math.MaxFloat32)
	for _, c := range cs {
		minX = min32(minX, c.X-c.Length/2)
		maxX = max32(maxX, c.X+c.Length/2)
	}
	assert.InDelta(t, -20, minX, clearStep, "west bank still walled")
	assert.InDelta(t, 20, maxX, clearStep, "east bank still walled")

	// The gap is real and roughly the deck's width.
	assert.InDelta(t, 4, gapAround(cs, 0), 2*clearStep, "the gap matches the deck")
}

// ⚑ A bridge is a PROP, so ordering does not enter it: there is no "the bridge
// must be authored after the river" trap. This pins that.
func TestBridgeClearsRegardlessOfPropOrder(t *testing.T) {
	deck := Prop{Type: "Bridge", X: 0, Y: 0, Def: bridgeDef(4, 10)}
	tree := Prop{Type: "Tree", X: 5, Y: 5, Def: &PropDefinition{Name: "Tree", Body: PropBody{Radius: 1}}}

	first := gapAround(PathCorridors(blockingZone(t, eastRiver, deck, tree)), 0)
	second := gapAround(PathCorridors(blockingZone(t, eastRiver, tree, deck)), 0)
	assert.InDelta(t, first, second, 1e-4)
	assert.Greater(t, first, float32(0))
}

// An ordinary prop is NOT a bridge — only a definition authoring crossesPaths
// clears anything. Without this, every decorative prop on a riverbank would
// punch an invisible hole in the water.
func TestOrdinaryPropDoesNotClear(t *testing.T) {
	house := Prop{Type: "House", X: 0, Y: 0,
		Def: &PropDefinition{Name: "House", Body: PropBody{Width: 4, Height: 10}}}
	assert.EqualValues(t, 0, gapAround(PathCorridors(blockingZone(t, eastRiver, house)), 0))
}

// The deck is turned, so the footprint that clears must turn with it.
func TestBridgeRotationTurnsTheClearedFootprint(t *testing.T) {
	// A river running NORTH, and a 10x4 deck. Unturned, its 10-unit side lies
	// along the river and clears 10; turned a quarter, only its 4-unit side does.
	river := `{"profile":"Water","width":5,"blocksMovement":true,
		"points":[{"x":0,"y":-20},{"x":0,"y":20}]}`
	upright := gapAroundY(PathCorridors(blockingZone(t, river,
		Prop{Type: "Bridge", X: 0, Y: 0, Def: bridgeDef(10, 4)})), 0)
	turned := gapAroundY(PathCorridors(blockingZone(t, river,
		Prop{Type: "Bridge", X: 0, Y: 0, Rotation: math.Pi / 2, Def: bridgeDef(10, 4)})), 0)

	assert.InDelta(t, 4, upright, 2*clearStep, "unturned, the 4-unit side spans the river")
	assert.InDelta(t, 10, turned, 2*clearStep, "turned, the 10-unit side does")
}

// A round-bodied crossing clears too — the body form is the prop's, not ours.
func TestCircleBodiedBridgeClears(t *testing.T) {
	z := blockingZone(t, eastRiver, Prop{Type: "Ford", X: 0, Y: 0,
		Def: &PropDefinition{Name: "Ford", Body: PropBody{Radius: 3}, CrossesPaths: true}})
	assert.InDelta(t, 6, gapAround(PathCorridors(z), 0), 2*clearStep)
}

// ---- helpers --------------------------------------------------------------

// gapAround measures the unwalled span containing x, along a due-east path.
func gapAround(cs []Corridor, x float32) float32 {
	return gapIn(cs, x, func(c Corridor) (float32, float32) {
		return c.X - c.Length/2, c.X + c.Length/2
	})
}

// gapAroundY is the same measurement for a path running north.
func gapAroundY(cs []Corridor, y float32) float32 {
	return gapIn(cs, y, func(c Corridor) (float32, float32) {
		return c.Y - c.Length/2, c.Y + c.Length/2
	})
}

func gapIn(cs []Corridor, at float32, span func(Corridor) (float32, float32)) float32 {
	left, right := float32(-math.MaxFloat32), float32(math.MaxFloat32)
	for _, c := range cs {
		if c.IsCircle() {
			continue
		}
		l, r := span(c)
		// Walled right here: there is no gap at all, however wide the nearest
		// clear span on either side happens to be.
		if l <= at && r >= at {
			return 0
		}
		if r <= at && r > left {
			left = r
		}
		if l >= at && l < right {
			right = l
		}
	}
	if left == -math.MaxFloat32 || right == math.MaxFloat32 {
		return 0
	}
	return right - left
}

func min32(a, b float32) float32 {
	if a < b {
		return a
	}
	return b
}

func max32(a, b float32) float32 {
	if a > b {
		return a
	}
	return b
}
