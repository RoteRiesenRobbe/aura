package world

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---- helpers --------------------------------------------------------------

func polyZone(t *testing.T, polys string, props ...Prop) *Zone {
	t.Helper()
	z, err := parseZone([]byte(
		`{"name":"P","bounds":{"width":2000,"height":2000},"polygons":[` + polys + `]}`))
	require.NoError(t, err)
	z.Props = props
	return z
}

// A 20x20 blocking square centred on the origin, wound counter-clockwise in the
// shoelace sense used throughout this file.
const squareCCW = `{"profile":"Mountains","blocksMovement":true,"points":[
	{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":10},{"x":-10,"y":10}]}`

// The SAME square, drawn the other way round. Tiled lets you do either.
const squareCW = `{"profile":"Mountains","blocksMovement":true,"points":[
	{"x":-10,"y":10},{"x":10,"y":10},{"x":10,"y":-10},{"x":-10,"y":-10}]}`

// Does any emitted body contain this point?
func coveredBy(cs []Corridor, x, y float32) bool {
	for _, c := range cs {
		if c.IsCircle() {
			dx, dy := x-c.X, y-c.Y
			if dx*dx+dy*dy <= c.Radius*c.Radius {
				return true
			}
			continue
		}
		// Into the rect's own frame.
		sin, cos := math.Sincos(float64(-c.Angle))
		dx, dy := x-c.X, y-c.Y
		lx := dx*float32(cos) - dy*float32(sin)
		ly := dx*float32(sin) + dy*float32(cos)
		if lx >= -c.Length/2 && lx <= c.Length/2 && ly >= -c.Width/2 && ly <= c.Width/2 {
			return true
		}
	}
	return false
}

// ---- the basics -----------------------------------------------------------

// A decorative polygon is exactly free: no bodies, no cost, nothing registered.
func TestNonBlockingPolygonEmitsNothing(t *testing.T) {
	cs, note := PolygonColliders(polyZone(t,
		`{"profile":"Mountains","points":[{"x":0,"y":0},{"x":8,"y":0},{"x":8,"y":8}]}`))
	assert.Empty(t, cs)
	assert.Empty(t, note)
}

// A degenerate shape has no inside, so it walls nothing rather than handing the
// physics engine a NaN normal.
func TestDegeneratePolygonEmitsNothing(t *testing.T) {
	for _, c := range []struct{ name, pts string }{
		{"collinear", `[{"x":0,"y":0},{"x":5,"y":0},{"x":10,"y":0}]`},
		{"all duplicated", `[{"x":3,"y":3},{"x":3,"y":3},{"x":3,"y":3}]`},
	} {
		t.Run(c.name, func(t *testing.T) {
			cs, _ := PolygonColliders(polyZone(t,
				`{"profile":"Mountains","blocksMovement":true,"points":`+c.pts+`}`))
			assert.Empty(t, cs)
		})
	}
}

// Every emitted body must be finite. A NaN reaches the broadphase and poisons
// every query it touches, which presents as physics failing everywhere else.
func TestEveryBodyIsFinite(t *testing.T) {
	cs, _ := PolygonColliders(polyZone(t, squareCCW))
	require.NotEmpty(t, cs)
	for _, c := range cs {
		for _, v := range []float32{c.X, c.Y, c.Radius, c.Length, c.Width, c.Angle} {
			require.False(t, math.IsNaN(float64(v)) || math.IsInf(float64(v), 0),
				"non-finite body %+v", c)
		}
	}
}

// ---- ⭐ the three tests that exist because D2 is a HYBRID -------------------

// ⭐ WINDING (L10). The same square authored clockwise and counter-clockwise must
// produce the SAME colliders. Without normalisation one of them strokes OUTWARD,
// and nothing else in the suite would notice: the collision is not broken, it is
// mysteriously fat.
//
// ⚑ Mutation-verified: delete the `if area > 0` branch's inverse in
// windingNormalised and this goes red while every other test here stays green.
func TestWindingOrderDoesNotChangeTheColliders(t *testing.T) {
	ccw, _ := PolygonColliders(polyZone(t, squareCCW))
	cw, _ := PolygonColliders(polyZone(t, squareCW))
	require.NotEmpty(t, ccw)
	require.Equal(t, len(ccw), len(cw), "the two windings emit different body counts")

	// Order can differ (the reversal renumbers the edges), so compare as sets of
	// rounded tuples.
	key := func(c Corridor) [6]float32 {
		r := func(v float32) float32 { return float32(math.Round(float64(v)*1e3) / 1e3) }
		return [6]float32{r(c.X), r(c.Y), r(c.Radius), r(c.Length), r(c.Width), r(c.Angle)}
	}
	seen := map[[6]float32]int{}
	for _, c := range ccw {
		seen[key(c)]++
	}
	for _, c := range cw {
		seen[key(c)]--
	}
	for k, n := range seen {
		assert.Zero(t, n, "body %v is not in both windings", k)
	}
}

// ⭐ UNDER-COVER HOLDS AT THE BOUNDARY (§9): no emitted body extends past the
// drawn outline. This is what pins the INSET — a centred stroke fails it by T/2.
func TestNoBodyReachesPastTheDrawnOutline(t *testing.T) {
	for _, c := range []struct{ name, poly string }{
		{"convex", squareCCW},
		// A concave L. Its notch is the case a naive offset gets wrong.
		{"concave L", `{"profile":"Mountains","blocksMovement":true,"points":[
			{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":0},{"x":0,"y":0},
			{"x":0,"y":10},{"x":-10,"y":10}]}`},
		// ⭐⭐ THE FIXTURE THIS TEST WAS MISSING, and its absence let a real
		// defect ship. Both shapes above have every edge ON the sample grid, so
		// no interior cell could ever poke out however the fill was written —
		// the test passed for the wrong reason. A SLANTED edge is where a
		// centre-sampled cell sticks out by most of a half-diagonal, which the
		// PO met in game as big chunks of collision outside the art and no
		// sliding (2026-09-10). ⛔ Never drop the diagonals from this list.
		{"diamond — every edge at 45°", `{"profile":"Mountains","blocksMovement":true,"points":[
			{"x":0,"y":-11},{"x":11,"y":0},{"x":0,"y":11},{"x":-11,"y":0}]}`},
		{"a slanted wall at an awkward angle", `{"profile":"Mountains","blocksMovement":true,"points":[
			{"x":-13,"y":-7},{"x":9,"y":3},{"x":7,"y":7},{"x":-15,"y":-3}]}`},
	} {
		t.Run(c.name, func(t *testing.T) {
			z := polyZone(t, c.poly)
			pts := windingNormalised(z.Polygons[0].Points)
			cs, _ := PolygonColliders(z)
			require.NotEmpty(t, cs)

			// Sample densely just OUTSIDE the shape and assert nothing blocks
			// there. A tolerance of one clearStep keeps a corner circle's
			// tangent from reading as an overshoot.
			minX, minY, maxX, maxY := bounds(pts)
			out := 0
			for x := minX - 3; x <= maxX+3; x += 0.25 {
				for y := minY - 3; y <= maxY+3; y += 0.25 {
					if pointInPolygon(x, y, pts) {
						continue
					}
					// Only count points comfortably outside, so a sample sitting
					// exactly on the edge is not the thing under test.
					if distanceToOutline(x, y, pts) < 0.3 {
						continue
					}
					if coveredBy(cs, x, y) {
						out++
					}
				}
			}
			assert.Zero(t, out, "%d sampled points OUTSIDE the outline are walled", out)
		})
	}
}

// ⭐ NO GAP BETWEEN STROKE AND FILL (§4.2, L9). Walk inward along each edge's own
// normal and assert continuous coverage. Overlap is expected and fine — two
// statics summing their reaction on one circle is already normal here. A GAP is
// the bug, and ⛔ the fix is never to tune the inset to abut, which converts a
// harmless double-push into an intermittent hole.
func TestStrokeAndFillLeaveNoGap(t *testing.T) {
	// ⭐ The DIAMOND matters more than the square here. On an axis-aligned edge
	// the fill stops at most one cell short of the outline; on a 45° one it stops
	// a cell DIAGONAL short, so the band the stroke has to bridge is widest
	// exactly where the old centre-sampled fill used to overshoot instead.
	for _, c := range []struct{ name, poly string }{
		{"square", squareCCW},
		{"diamond", `{"profile":"Mountains","blocksMovement":true,"points":[
			{"x":0,"y":-11},{"x":11,"y":0},{"x":0,"y":11},{"x":-11,"y":0}]}`},
	} {
		t.Run(c.name, func(t *testing.T) { noGapIn(t, c.poly) })
	}
}

func noGapIn(t *testing.T, poly string) {
	z := polyZone(t, poly)
	pts := windingNormalised(z.Polygons[0].Points)
	cs, _ := PolygonColliders(z)

	n := len(pts)
	for i := 0; i < n; i++ {
		a, b := pts[i], pts[(i+1)%n]
		dx, dy := b.X-a.X, b.Y-a.Y
		l := float32(math.Hypot(float64(dx), float64(dy)))
		ux, uy := dx/l, dy/l
		nx, ny := inwardNormal(ux, uy)
		// Start a hair inside the face and walk to the middle of the shape.
		for t2 := float32(0.1); t2 < l; t2 += 1.0 {
			for d := float32(0.05); d <= 6; d += 0.1 {
				x := a.X + ux*t2 + nx*d
				y := a.Y + uy*t2 + ny*d
				if !pointInPolygon(x, y, pts) {
					continue
				}
				require.True(t, coveredBy(cs, x, y),
					"gap at (%.2f, %.2f), %.2f u inside edge %d", x, y, d, i)
			}
		}
	}
}

// distanceToOutline is the shortest distance from a point to any edge.
func distanceToOutline(x, y float32, pts []Point) float32 {
	best := float32(math.MaxFloat32)
	n := len(pts)
	for i := 0; i < n; i++ {
		a, b := pts[i], pts[(i+1)%n]
		dx, dy := b.X-a.X, b.Y-a.Y
		l2 := dx*dx + dy*dy
		if l2 == 0 {
			continue
		}
		t := ((x-a.X)*dx + (y-a.Y)*dy) / l2
		t = max(0, min(1, t))
		px, py := a.X+t*dx, a.Y+t*dy
		best = min(best, float32(math.Hypot(float64(x-px), float64(y-py))))
	}
	return best
}

// ---- the interior ---------------------------------------------------------

// ⭐ A CONCAVE L never fills its notch. This is the case a convex phy shape could
// not express without decomposition, and the whole reason the interior is a cell
// fill (§4.5 item 2).
func TestConcavePolygonDoesNotFillItsNotch(t *testing.T) {
	cs, _ := PolygonColliders(polyZone(t, `{"profile":"Mountains","blocksMovement":true,"points":[
		{"x":-10,"y":-10},{"x":10,"y":-10},{"x":10,"y":0},{"x":0,"y":0},
		{"x":0,"y":10},{"x":-10,"y":10}]}`))
	require.NotEmpty(t, cs)
	// Deep inside the notch — the quadrant the L does not occupy.
	assert.False(t, coveredBy(cs, 7, 7), "the notch is walled")
	// ...and the arms still are.
	assert.True(t, coveredBy(cs, -5, -5), "the corner of the L is not walled")
	assert.True(t, coveredBy(cs, 7, -5), "the east arm is not walled")
}

// ⭐ THE SEGMENT CAP APPLIES TO THE ROTATED BOUNDARY AND NOT TO THE
// AXIS-ALIGNED INTERIOR, and the asymmetry is the design rather than an
// oversight. maxCorridorSegment exists because a ROTATED rect's bounding box is
// far larger than the rect and covers walkable ground; an interior-fill box is
// axis-aligned, so its bounding box IS the box, and that box is the inside of a
// solid mass where nothing walks.
//
// ⚑ It is also what makes ejection work at all: capping the merge leaves seams,
// and two abutting solid boxes push in opposite directions at a seam. Measured
// in-game 2026-09-10 — see the comment in fillAt.
func TestTheCapBindsTheBoundaryAndFreesTheInterior(t *testing.T) {
	// ⚑ Read the two halves through their OWN builders, never by filtering the
	// combined list on Angle. A HORIZONTAL boundary edge has angle 0 too, so an
	// `Angle == 0` filter silently counts boundary pieces as interior — that
	// exact mistake made the first cut of this test read 4 boxes for a square
	// that has one.
	sq := windingNormalised(square(t))
	for _, c := range appendPolygonBoundary(nil, sq, nil, strokeThickness(sq, polygonCellSize)) {
		if !c.IsCircle() {
			assert.LessOrEqual(t, c.Length, float32(maxCorridorSegment),
				"a boundary piece is rotated, so it must stay under the broadphase cap")
		}
	}

	fill, _, _ := polygonInterior(windingNormalised(bigSquare(t)), nil)
	require.NotEmpty(t, fill)
	oversized := 0
	for _, c := range fill {
		if c.Length > maxCorridorSegment || c.Width > maxCorridorSegment {
			oversized++
		}
	}
	assert.NotZero(t, oversized,
		"the interior did not merge past the cap — the seams that trap bodies are back")
}

// The two fixtures' points, already parsed — the boundary and interior builders
// take points rather than a zone.
func square(t *testing.T) []Point { return polyZone(t, squareCCW).Polygons[0].Points }

func bigSquare(t *testing.T) []Point {
	const doc = `{"profile":"Mountains","blocksMovement":true,"points":[
		{"x":-60,"y":-40},{"x":60,"y":-40},{"x":60,"y":40},{"x":-60,"y":40}]}`
	return polyZone(t, doc).Polygons[0].Points
}

// ⭐ A rectangular mass merges into exactly ONE interior box, which is what makes
// a body inside it eject in a single push instead of walking a grid.
func TestARectangularMassIsOneInteriorBox(t *testing.T) {
	fill, _, _ := polygonInterior(windingNormalised(square(t)), nil)
	assert.Len(t, fill, 1, "a 20x20 square should need one interior box, not a grid")
}

// ---- the cap (D6) ---------------------------------------------------------

// A long diagonal BAND: every grid row's blocked run starts one cell further
// along than the last, so the greedy merge can never join two rows and the fill
// costs one body per row. ⭐ This is what the body cap is actually for — a big
// SQUARE now merges to a single box however large it is, so the shapes that
// blow the budget are the JAGGED ones, not the big ones.
const diagonalBand = `{"profile":"Mountains","blocksMovement":true,"points":[
	{"x":-700,"y":-700},{"x":-660,"y":-700},{"x":700,"y":660},{"x":700,"y":700},
	{"x":660,"y":700},{"x":-700,"y":-660}]}`

// ⭐ The cap COARSENS, it never refuses — PO 2026-09-09. A polygon big enough to
// blow the budget still boots, still blocks, and SAYS SO.
func TestTheCapCoarsensAndReportsRatherThanRefusing(t *testing.T) {
	cs, notes := PolygonColliders(polyZone(t, diagonalBand))
	require.NotEmpty(t, cs, "a huge polygon still blocks")
	require.Len(t, notes, 1, "and the coarsening is reported, not swallowed")
	assert.Equal(t, 0, notes[0].Index)
	assert.Greater(t, notes[0].Cell, float32(polygonCellSize), "the cell was raised")
	assert.Greater(t, notes[0].FromBodies, notes[0].Bodies, "and it bought bodies back")
	assert.LessOrEqual(t, notes[0].Bodies, maxPolygonInteriorBodies)
}

// ⚑ DETERMINISTIC: the same file must produce the same colliders on every boot,
// or a bug reproduces on one machine and not another.
func TestCoarseningIsDeterministic(t *testing.T) {
	a, an := PolygonColliders(polyZone(t, diagonalBand))
	b, bn := PolygonColliders(polyZone(t, diagonalBand))
	assert.Equal(t, a, b)
	assert.Equal(t, an, bn)
}

// A polygon that fits says nothing — a notice on every rock would train the
// reader to ignore the one that matters.
func TestASmallPolygonReportsNoCoarsening(t *testing.T) {
	_, notes := PolygonColliders(polyZone(t, squareCCW))
	assert.Empty(t, notes)
}

// ---- bridges --------------------------------------------------------------

// ⭐ A causeway across a filled lake, by the SAME rule as one across a river: a
// crossesPaths prop clears the cells it covers, and the boundary stroke where it
// crosses, so the way in and the way out both open.
func TestBridgeClearsAPathThroughAFilledPolygon(t *testing.T) {
	// A 10-wide deck running north-south, straight through the square.
	deck := Prop{Type: "Bridge", X: 0, Y: 0, Def: bridgeDef(4, 40)}
	walled, _ := PolygonColliders(polyZone(t, squareCCW))
	cleared, _ := PolygonColliders(polyZone(t, squareCCW, deck))

	require.True(t, coveredBy(walled, 0, 0), "without the deck the middle is walled")
	assert.False(t, coveredBy(cleared, 0, 0), "the deck did not clear the interior")
	// ⭐ And the BOUNDARY too, or the causeway runs into a wall at the shore.
	assert.False(t, coveredBy(cleared, 0, -9.7), "the deck did not clear the boundary stroke")
	// The rest of the mass is untouched — a bridge opens a way through, it does
	// not delete the rock.
	assert.True(t, coveredBy(cleared, -7, 0), "the west half stopped blocking")
	assert.True(t, coveredBy(cleared, 7, 0), "the east half stopped blocking")
}

// An ordinary prop is NOT a bridge. Without this every decorative rock standing
// on a mass would punch an invisible hole in it.
func TestOrdinaryPropDoesNotClearAPolygon(t *testing.T) {
	house := Prop{Type: "House", X: 0, Y: 0,
		Def: &PropDefinition{Name: "House", Body: PropBody{Width: 4, Height: 40}}}
	cs, _ := PolygonColliders(polyZone(t, squareCCW, house))
	assert.True(t, coveredBy(cs, 0, 0))
}

// ---- ⭐ the invariant that ties the two tuning numbers together -----------

// The interior fill can only reach cells lying WHOLLY inside, so at a slanted
// edge it stops up to one cell DIAGONAL short of the outline. The boundary
// stroke has to bridge that band, or a body ejected inward by the stroke lands
// in a ring-shaped gap it cannot leave.
//
// ⛔ This is why polygonCellSize and polygonBoundaryThickness cannot be tuned
// independently. Raise the cell and this goes red.
func TestTheStrokeCanBridgeWhatTheFillCannotReach(t *testing.T) {
	assert.GreaterOrEqual(t, float32(polygonBoundaryThickness),
		float32(polygonCellSize)*float32(math.Sqrt2),
		"the boundary stroke is too thin to cover the band the fill cannot reach")
}

// ⛔ A stroke thicker than the shape would poke out through the OPPOSITE edge,
// silently inverting the under-cover ruling. strokeThickness clamps it to the
// shape's own inradius, and when that clamp binds the two opposite strokes meet
// in the middle — so a shape too thin for the derived thickness is still covered
// end to end.
func TestAThinShapeDoesNotGetAStrokeThickerThanItself(t *testing.T) {
	// A 2-unit strip, 100 long: far thinner than a coarsened cell's diagonal.
	strip := []Point{{X: -50, Y: -1}, {X: 50, Y: -1}, {X: 50, Y: 1}, {X: -50, Y: 1}}
	assert.Less(t, strokeThickness(strip, 8), float32(2),
		"the stroke would cross the strip and poke out the far side")

	// A fat shape is unaffected by the ceiling.
	assert.EqualValues(t, polygonBoundaryThickness,
		strokeThickness(windingNormalised(square(t)), polygonCellSize))
}

// ⭐ THE DIAGONAL CASE, stated as a number rather than a sample sweep: no body
// may sit further outside a 45° face than the drawn outline. This is the pin for
// the defect the PO found — under the old centre test the fill stuck out by most
// of a half-diagonal on exactly this shape.
func TestNothingPokesOutOfASlantedFace(t *testing.T) {
	for _, c := range []struct{ name, poly string }{
		{"45 degree diamond", `{"profile":"Mountains","blocksMovement":true,"points":[
			{"x":0,"y":-11},{"x":11,"y":0},{"x":0,"y":11},{"x":-11,"y":0}]}`},
		// ⭐ AWKWARD, not merely diagonal: no edge axis-aligned, at 45°, or on a
		// grid line. A 45° edge on whole units passes through the sample grid's
		// CORNERS, so every cell is wholly in or wholly out and the defect cannot
		// manifest at all — the in-game probe was built that way first and scored
		// a deliberately broken build as clean.
		{"awkward quad", `{"profile":"Mountains","blocksMovement":true,"points":[
			{"x":-23.1,"y":8.4},{"x":-20.3,"y":18.7},
			{"x":-33.4,"y":21.3},{"x":-35.2,"y":9.7}]}`},
	} {
		t.Run(c.name, func(t *testing.T) { noPokeOut(t, c.poly) })
	}
}

func noPokeOut(t *testing.T, poly string) {
	z := polyZone(t, poly)
	pts := windingNormalised(z.Polygons[0].Points)
	cs, _ := PolygonColliders(z)
	require.NotEmpty(t, cs)

	minX, minY, maxX, maxY := bounds(pts)
	worst := float32(0)
	for x := minX - 3; x <= maxX+3; x += 0.1 {
		for y := minY - 3; y <= maxY+3; y += 0.1 {
			if pointInPolygon(x, y, pts) || !coveredBy(cs, x, y) {
				continue
			}
			if d := distanceToOutline(x, y, pts); d > worst {
				worst = d
			}
		}
	}
	// ⚑ 0.1 u is 12 px, and what is left is the square END of a stroke box
	// overhanging a corner — the joint circles are inset to their TANGENT point,
	// so there is nothing rounder to gain. It was ~1.4 u before the fill was made
	// strictly-inside and 0.153 before the joints were tightened. ⛔ Do not let
	// this number creep back up: it IS the PO's "big chunks poking out".
	assert.Less(t, worst, float32(0.1),
		"collision reaches %.2f u outside a slanted face — something pokes through the art", worst)
}
