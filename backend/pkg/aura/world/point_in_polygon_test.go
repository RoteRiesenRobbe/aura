package world

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ⭐⭐ THE FIXTURE IS THE TEST, AND ZONE-POLYGONS P3 IS WHY (plan-area-effects.md
// §3.2). That chunk's durable lesson was not "add a diagonal case": it was that a
// GRID-ALIGNED fixture proves nothing about a sampled predicate. Its under-cover
// test had a square and an L whose every edge lay ON the sample grid, so it
// passed for the wrong reason — and the first in-game probe was a 45° diamond on
// whole units, whose edges pass through the grid CORNERS, on which a
// DELIBERATELY BROKEN build scored clean.
//
// ⛔ So the fixture here is AWKWARD by construction: no edge is axis-aligned, no
// edge is at 45°, and no vertex sits on a whole unit. A ray cast that got its
// comparison backwards, or that used >= where it needs >, cannot survive it by
// luck.
//
// ⭐⭐ AND THE SHARPER RESULT, MEASURED HERE RATHER THAN INHERITED: AWKWARD IS
// NECESSARY AND NOT SUFFICIENT. Mutation-testing this file found that the single
// likeliest rewrite error — the ray cast's `>` becoming `>=` — is INVISIBLE to
// the awkward quadrilateral and to the concave L, and is caught ONLY by the
// axis-aligned box. The reason is exact float equality: `>` versus `>=` can only
// differ when a vertex's Y is EXACTLY the sample's Y, and a fixture with no
// axis-aligned edge and no whole-unit vertex is built never to produce one.
//
// ⛔ So the two fixtures are COMPLEMENTARY, not one real case plus one for
// readability. The awkward shape catches slope and interpolation errors; the
// grid-aligned one catches exact-equality errors. P3's lesson read alone —
// "a grid-aligned fixture proves nothing" — would have had this file DELETE the
// only fixture that catches P1. Keep both, and keep knowing which does what.

// awkward is a convex quadrilateral with four slanted, non-45° edges on
// fractional coordinates. Vertices chosen so that every edge has a distinct,
// irrational-looking slope and none lies on a grid line.
var awkward = []Point{
	{X: -7.3, Y: -4.1},
	{X: 5.9, Y: -6.7},
	{X: 8.2, Y: 3.3},
	{X: -3.6, Y: 6.4},
}

// A plain axis-aligned box, for the cases a reader should be able to verify
// without a calculator. ⚑ Named for this file: polygons_collision_test.go
// already has a square() HELPER in the same package.
var axisBox = []Point{
	{X: -2, Y: -2}, {X: 2, Y: -2}, {X: 2, Y: 2}, {X: -2, Y: 2},
}

// An L, which is CONCAVE — the shape class a convex-only implementation gets
// wrong, and the one an authored cave or bog is most likely to be.
var lShape = []Point{
	{X: 0.4, Y: 0.3}, {X: 9.1, Y: 1.2}, {X: 8.7, Y: 4.6},
	{X: 4.2, Y: 3.9}, {X: 3.8, Y: 9.4}, {X: 0.9, Y: 8.8},
}

func TestPointInPolygon_AwkwardQuadrilateral(t *testing.T) {
	cases := []struct {
		name   string
		x, y   float32
		inside bool
	}{
		{"dead centre", 0.7, -0.4, true},
		{"near the left slant, inside", -5.5, -2.0, true},
		{"just outside the left slant", -8.0, -2.0, false},
		{"near the bottom slant, inside", 2.0, -5.5, true},
		{"just outside the bottom slant", 2.0, -7.2, false},
		{"near the right slant, inside", 7.0, 1.0, true},
		{"just outside the right slant", 9.0, 1.0, false},
		{"near the top slant, inside", -2.0, 5.5, true},
		{"just outside the top slant", -2.0, 7.2, false},
		// ⛔ The corner cases a bounding box would get WRONG — outside the
		// polygon but inside its extent. A prefilter that was mistaken for the
		// predicate would pass every case above and fail these.
		{"in the bounding box, outside the shape (SW)", -7.0, -6.4, false},
		{"in the bounding box, outside the shape (NE)", 7.9, 6.1, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			assert.Equal(t, c.inside, PointInPolygon(c.x, c.y, awkward))
		})
	}
}

// ⭐ The concave case. A convex-only test (any of the three fixtures above taken
// alone) passes with an implementation that cannot express a notch.
func TestPointInPolygon_ConcaveShape(t *testing.T) {
	// Inside the lower arm.
	assert.True(t, PointInPolygon(6.0, 2.5, lShape))
	// Inside the upright arm.
	assert.True(t, PointInPolygon(2.0, 7.0, lShape))
	// ⛔ THE NOTCH: inside the bounding box, inside neither arm. A ray cast that
	// counted crossings wrongly reports this inside, and nothing else here would
	// notice.
	assert.False(t, PointInPolygon(7.0, 7.0, lShape))
}

func TestPointInPolygon_AxisAlignedBox(t *testing.T) {
	assert.True(t, PointInPolygon(0, 0, axisBox))
	assert.True(t, PointInPolygon(1.9, 1.9, axisBox))
	assert.False(t, PointInPolygon(2.1, 0, axisBox))
	assert.False(t, PointInPolygon(0, -2.1, axisBox))
	assert.False(t, PointInPolygon(100, 100, axisBox))
}

// ⚑ Winding must not matter. An author drawing a shape clockwise in Tiled and
// one drawing it counter-clockwise get the same polygon as far as this is
// concerned, and nothing upstream normalises the order.
func TestPointInPolygon_WindingDoesNotMatter(t *testing.T) {
	reversed := make([]Point, len(awkward))
	for i, p := range awkward {
		reversed[len(awkward)-1-i] = p
	}
	for _, c := range []struct {
		x, y   float32
		inside bool
	}{{0.7, -0.4, true}, {-8.0, -2.0, false}, {7.9, 6.1, false}} {
		assert.Equal(t, c.inside, PointInPolygon(c.x, c.y, reversed),
			"reversed winding changed the answer at (%g, %g)", c.x, c.y)
	}
}

// ⭐⭐ THE LEG THAT CAUGHT MY OWN FIXTURE BEING TOO KIND, and it is the P3 lesson
// arriving a second time. Mutation-testing the first cut of this file, THREE of
// four mutations SURVIVED — including flipping the ray cast's `>` to `>=`, which
// is the single most likely way a hand-rewritten copy diverges from the client's.
//
// ⛔ The two differ on exactly one class of input: a point whose Y equals a
// VERTEX's Y. Nothing in the fixtures above sampled one, so "no edge on a grid
// line" turned out not to be enough — the vertices themselves are the grid that
// matters here.
//
// ⛔⛔ AND THE PARITY CLAIM I FIRST WROTE HERE IS FALSE — MEASURED, NOT ARGUED.
// The first version of this leg asserted that Go answers a vertex exactly as the
// client does. It does not, and the cause is not the algorithm: the client
// computes in FLOAT64 (every JS number is one) and world.Point is FLOAT32, so
// the interpolation (b.X-a.X)*(y-a.Y)/(b.Y-a.Y)+a.X rounds differently on the
// one class of input where the comparison is exact.
//
//	awkward's first vertex (-7.3, -4.1):  Go true,  client true   — agree
//	lShape's  first vertex ( 0.4,  0.3):  Go FALSE, client TRUE   — DIVERGE
//
// ⚑ Harmless, and worth knowing WHY before anyone builds on the opposite
// assumption. Divergence needs a point landing EXACTLY on a vertex, and the two
// sides are already allowed to disagree by far more than that: L1 puts the drawn
// edge half a blend band (1.5 u at blend 3) outside the authored one, so the art
// and the effect boundary differ by ~1.5 units by DESIGN. A float32 ulp is not
// in the same universe.
//
// ⛔ What it does mean: do NOT write a test that claims the two predicates agree
// everywhere, and do not "fix" one to match the other at an edge. The shared
// property is the RULE (ray cast, edges not special-cased), never the bits.
//
// So what these legs pin is the Go side's own behaviour where the comparison is
// EXACT — which is the only place a `>`/`>=` slip can show, and the whole reason
// they exist.
func TestPointInPolygon_IsStableWhereTheComparisonIsExact(t *testing.T) {
	// ⭐ THE LEG THAT KILLS THE >= MUTANT, and it needs the AXIS-ALIGNED box:
	// only a horizontal edge puts a vertex's Y exactly on the sample's Y.
	// Measured — neither the awkward quad nor the L can produce this input.
	assert.True(t, PointInPolygon(0, -2, axisBox),
		"a point ON the box's bottom edge")
	assert.False(t, PointInPolygon(0, 2, axisBox),
		"a point ON the box's top edge — the OTHER side of the same rule")

	// ⚑ Characterization, not preference: "not special-cased" means the answer
	// at a vertex falls out of the arithmetic. What must not change silently is
	// that it keeps falling out the same way.
	assert.True(t, PointInPolygon(-7.3, -4.1, awkward), "awkward's first vertex")
	assert.False(t, PointInPolygon(0.4, 0.3, lShape), "lShape's first vertex")
}

// ⚑ The direction the ray is cast is ARBITRARY and must stay untested: for a
// closed polygon the crossing parity is the same either way, so flipping the x
// comparison is an EQUIVALENT mutant, not a bug. Measured — it survives, and it
// should. Do not "strengthen" the fixtures to catch it; the only thing that
// would catch it is an assertion about the implementation rather than about
// containment.

// A shape that encloses nothing is always outside. validate() refuses these at
// boot, so this pins the belt rather than a supported case.
func TestPointInPolygon_DegenerateShapesAreAlwaysOutside(t *testing.T) {
	assert.False(t, PointInPolygon(0, 0, nil))
	assert.False(t, PointInPolygon(0, 0, []Point{{X: 0, Y: 0}}))
	assert.False(t, PointInPolygon(0, 0, []Point{{X: -1, Y: 0}, {X: 1, Y: 0}}))
}

// ---- the prefilter --------------------------------------------------------

func TestBoundsOf(t *testing.T) {
	b := BoundsOf(awkward)
	assert.InDelta(t, -7.3, b.MinX, 1e-5)
	assert.InDelta(t, -6.7, b.MinY, 1e-5)
	assert.InDelta(t, 8.2, b.MaxX, 1e-5)
	assert.InDelta(t, 6.4, b.MaxY, 1e-5)
	assert.Equal(t, BoundingBox{}, BoundsOf(nil))
}

// ⛔ INCLUSIVE ON EVERY EDGE, asserted directly rather than left to the sweep
// below. Mutation P4 — tightening one `>=` to `>` — SURVIVED the sweep, because
// a 0.25-step grid never samples a box edge exactly. A prefilter that is
// exclusive on one side drops a hazard's rim, and the symptom would read as the
// polygon being drawn wrong.
func TestBoundingBoxIsInclusiveOnEveryEdge(t *testing.T) {
	b := BoundsOf(awkward)
	for _, c := range []struct {
		name string
		x, y float32
	}{
		{"min-x edge", b.MinX, 0},
		{"max-x edge", b.MaxX, 0},
		{"min-y edge", 0, b.MinY},
		{"max-y edge", 0, b.MaxY},
		{"SW corner", b.MinX, b.MinY},
		{"NE corner", b.MaxX, b.MaxY},
	} {
		assert.True(t, b.Contains(c.x, c.y), c.name+" must be inside the box")
	}
	assert.False(t, b.Contains(b.MinX-0.01, 0))
	assert.False(t, b.Contains(b.MaxX+0.01, 0))
	assert.False(t, b.Contains(0, b.MinY-0.01))
	assert.False(t, b.Contains(0, b.MaxY+0.01))
}

// ⛔ THE ONLY PROPERTY A PREFILTER MUST HAVE: it may say yes too often, never no
// too often. A box that excluded a point the predicate accepts would silently
// shrink a hazard — and the failure would look like the polygon being wrong.
// Swept over a grid rather than spot-checked, because "never" is the claim.
func TestBoundingBoxNeverExcludesAPointInsideTheShape(t *testing.T) {
	for _, poly := range [][]Point{awkward, axisBox, lShape} {
		box := BoundsOf(poly)
		for x := float32(-12); x <= 12; x += 0.25 {
			for y := float32(-12); y <= 12; y += 0.25 {
				if PointInPolygon(x, y, poly) {
					require.True(t, box.Contains(x, y),
						"box excluded (%g, %g), which is inside the polygon", x, y)
				}
			}
		}
	}
}
