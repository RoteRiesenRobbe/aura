package phy

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

// box centered at origin, 20 wide x 10 tall -> half-extents 10 x 5.
func newTestSolidAABB() *SolidAABB {
	return NewSolidAABB(VEC2F_ZERO, 20, 10)
}

func TestSolidAABB_IntersectWithCircle(t *testing.T) {
	a := newTestSolidAABB()

	cases := []struct {
		name    string
		center  Vec2f
		overlap bool
	}{
		{"far away", Vec2f{20, 20}, false},
		{"near right face but clear", Vec2f{11.5, 0}, false},
		{"touching right face exactly", Vec2f{11, 0}, false},
		{"overlapping right face", Vec2f{10.5, 0}, true},
		{"overlapping left face", Vec2f{-10.5, 0}, true},
		{"overlapping top face", Vec2f{0, 5.5}, true},
		{"overlapping bottom face", Vec2f{0, -5.5}, true},
		{"overlapping corner", Vec2f{10.3, 5.4}, true},
		{"clear past corner", Vec2f{10.8, 5.8}, false},
		{"center inside", Vec2f{9, 4}, true},
		{"dead center", Vec2f{0, 0}, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			circle := NewCircle(c.center, 1)
			assert.Equal(t, c.overlap, a.intersectWithCircle(circle))
		})
	}
}

func TestSolidAABB_ResolveCircle(t *testing.T) {
	a := newTestSolidAABB()

	cases := []struct {
		name   string
		center Vec2f
		force  Vec2f
	}{
		{"clear -> no force", Vec2f{12, 0}, Vec2f{0, 0}},
		{"right face -> pushed right", Vec2f{10.5, 0}, Vec2f{0.5, 0}},
		{"left face -> pushed left", Vec2f{-10.5, 0}, Vec2f{-0.5, 0}},
		{"top face -> pushed up", Vec2f{0, 5.5}, Vec2f{0, 0.5}},
		{"bottom face -> pushed down", Vec2f{0, -5.5}, Vec2f{0, -0.5}},
		// closest corner (10,5), d=(0.3,0.4) len 0.5 -> push 0.5 along d/|d|
		{"corner -> pushed diagonally", Vec2f{10.3, 5.4}, Vec2f{0.3, 0.4}},
		// center inside: least-penetration axis wins (right face is nearest)
		{"inside near right -> ejected right", Vec2f{9.5, 0}, Vec2f{1.5, 0}},
		{"inside near top -> ejected up", Vec2f{0, 4.5}, Vec2f{0, 1.5}},
		// dead center: shorter half-extent axis (Y) wins, positive tie-break
		{"dead center -> ejected up", Vec2f{0, 0}, Vec2f{0, 6}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			circle := NewCircle(c.center, 1)
			force := resolveSolidAABB(circle, a)
			assert.InDelta(t, float64(c.force.X), float64(force.X), 1e-5, "force.X")
			assert.InDelta(t, float64(c.force.Y), float64(force.Y), 1e-5, "force.Y")

			// applying the force must land the circle outside-or-on the box
			corrected := c.center.Add(force)
			assert.False(t, a.intersectWithCircle(NewCircle(corrected, 1)),
				"corrected center %v should be clear of the box", corrected)
		})
	}
}

// A player viewport is a dynamic Box that queries the space to stream
// entities — a solid rect prop carries the viewport layer exactly like circle
// props, so the box-vs-SolidAABB dispatch MUST work (found in-game: the stub
// panicked the server on first join near a house).
func TestSolidAABB_ViewportBoxSeesIt(t *testing.T) {
	const layer = 1

	s := NewSpace()

	box := NewSolidAABB(Vec2f{5, 0}, 4, 3)
	box.Shape().Layer = layer
	s.AddStaticShape(box)

	viewport := NewBox(VEC2F_ZERO, Vec2f{10, 6})
	viewport.Shape().Mask = layer
	s.AddShape(viewport)

	s.Update()

	_, seen := viewport.Collisions()[Collider(box)]
	assert.True(t, seen, "the viewport box must register the overlapping solid rect")
}

func TestSolidAABB_ViewportBoxOutOfRangeDoesNotSeeIt(t *testing.T) {
	const layer = 1

	s := NewSpace()

	box := NewSolidAABB(Vec2f{50, 0}, 4, 3)
	box.Shape().Layer = layer
	s.AddStaticShape(box)

	viewport := NewBox(VEC2F_ZERO, Vec2f{10, 6})
	viewport.Shape().Mask = layer
	s.AddShape(viewport)

	s.Update()

	_, seen := viewport.Collisions()[Collider(box)]
	assert.False(t, seen, "a far-away solid rect must not stream")
}

// End-to-end through the real broadphase + resolution pipeline (mirrors how
// props are wired as static bodies): a dynamic circle overlapping each face is
// pushed clear after one Space.Update().
func TestSolidAABB_BlocksDynamicCircleThroughSpace(t *testing.T) {
	const layer = 1 // shared bit so ArbiterShapes(circle, box) matches

	overlapping := []struct {
		name   string
		center Vec2f
	}{
		{"right", Vec2f{10.5, 0}},
		{"left", Vec2f{-10.5, 0}},
		{"top", Vec2f{0, 5.5}},
		{"bottom", Vec2f{0, -5.5}},
		{"corner", Vec2f{10.3, 5.4}},
		{"inside", Vec2f{9.5, 0}},
	}

	for _, o := range overlapping {
		t.Run(o.name, func(t *testing.T) {
			s := NewSpace()

			box := NewSolidAABB(VEC2F_ZERO, 20, 10)
			box.Shape().Layer = layer
			s.AddStaticShape(box)

			circle := NewCircle(o.center, 1)
			circle.Shape().Mask = layer
			s.AddShape(circle)

			s.Update()

			assert.False(t, box.intersectWithCircle(circle),
				"circle at %v should have been pushed clear, ended at %v",
				o.center, circle.Position())
		})
	}
}

// --- rotation (plan-prop-scale.md C2b) -------------------------------------
//
// A rotated rect prop used to render turned and collide upright — the D3
// option-(B) lie, reported in-game by the PO after C2 shipped rotation to the
// client ("the colliders of rotated houses are not correct and behave as if
// unrotated"). These pin the box actually turning.
//
// The reference box below is 4 x 3 (a House) at 45°, where the two readings
// disagree by a lot and the numbers are checkable by hand:
//
//   p = (2.4, 0)  local (rot -45°) = ( 1.697, -1.697) -> clamped (1.697, -1.5)
//                 gap 0.197  =>  a radius-0.3 circle OVERLAPS
//                 unrotated gap would be 0.4  =>  it would NOT
//
//   p = (2.1, 1.4) local = ( 2.475, -0.495) -> clamped (2, -0.495)
//                 gap 0.475  =>  a radius-0.3 circle is CLEAR
//                 unrotated gap would be 0.1  =>  it would overlap

func newTestHouse(deg float64) *SolidAABB {
	return NewSolidRotatedAABB(VEC2F_ZERO, 4, 3, float32(deg*math.Pi/180))
}

func TestSolidAABB_RotatedIntersectWithCircle(t *testing.T) {
	house := newTestHouse(45)

	// The corner the unrotated box could never reach.
	assert.True(t, house.intersectWithCircle(NewCircle(Vec2f{2.4, 0}, 0.3)),
		"the rotated box reaches out along its diagonal and must block here")
	// ...and the corner it no longer occupies.
	assert.False(t, house.intersectWithCircle(NewCircle(Vec2f{2.1, 1.4}, 0.3)),
		"the rotated box has moved out of this corner and must not block here")

	// Same two points against the unrotated box: exactly the opposite verdicts,
	// which is what makes the pair a real test rather than two magic numbers.
	flat := newTestHouse(0)
	assert.False(t, flat.intersectWithCircle(NewCircle(Vec2f{2.4, 0}, 0.3)))
	assert.True(t, flat.intersectWithCircle(NewCircle(Vec2f{2.1, 1.4}, 0.3)))
}

func TestSolidAABB_RotatedResolvePushesAlongTheTurnedFace(t *testing.T) {
	house := newTestHouse(45)

	// Straddling the long face, which at 45° faces up-right: the push must come
	// out along that diagonal, not along a world axis.
	f := resolveSolidAABB(NewCircle(Vec2f{2.4, 0}, 0.3), house)
	assert.InDelta(t, 0.103, float64(f.Abs()), 1e-3, "pushed clear by exactly the overlap")
	// The nearest face is the box's LOCAL -Y (the 4-unit long side), whose
	// outward normal at 45° points right and DOWN — not along any world axis,
	// which is the whole point.
	dir := f.Div(f.Abs())
	assert.InDelta(t, 0.7071, float64(dir.X), 1e-3)
	assert.InDelta(t, -0.7071, float64(dir.Y), 1e-3)

	// And the invariant behind the numbers, checkable without knowing any of
	// them: applying the force leaves the circle touching the face and no
	// deeper. ⚑ Asserted as a gap rather than as !intersect, because the push
	// lands ON the boundary and intersectWithCircle's strict < then turns a
	// one-ulp rounding either way into a coin flip.
	landed := Vec2f{2.4, 0}.Add(f)
	assert.InDelta(t, 0.3, float64(landed.Sub(house.clamp(landed)).Abs()), 1e-4)
}

// ⭐ 0° must be EXACTLY the old behaviour, not approximately: cos=1, sin=0
// makes every transform below an identity, so no unrotated prop in the world
// moves by a float ulp. Asserted with == on purpose.
func TestSolidAABB_UnrotatedIsBitIdentical(t *testing.T) {
	flat := NewSolidAABB(Vec2f{3, -4}, 20, 10)
	turned := NewSolidRotatedAABB(Vec2f{3, -4}, 20, 10, 0)


	for _, p := range []Vec2f{{0, 0}, {13.5, -4}, {3, 1.4}, {-8, -9}, {3.5, -4.5}} {
		assert.Equal(t, flat.clamp(p), turned.clamp(p), "clamp at %v", p)
		assert.Equal(t,
			resolveSolidAABB(NewCircle(p, 1), flat),
			resolveSolidAABB(NewCircle(p, 1), turned), "resolve at %v", p)
	}
	assert.Equal(t, flat.Shape().bb, turned.Shape().bb)
}

// A quarter turn is the case the PO actually authored (two houses at 90.7° and
// 270.5°), and it is exactly a width/height swap — worth its own pin because it
// is the one rotation whose answer can be checked without trigonometry.
func TestSolidAABB_QuarterTurnSwapsTheExtents(t *testing.T) {
	turned := newTestHouse(90)
	swapped := NewSolidAABB(VEC2F_ZERO, 3, 4)

	for _, p := range []Vec2f{{0, 0}, {1.6, 0}, {0, 2.1}, {1.4, 1.9}, {-1.6, -2.1}} {
		c, s := turned.clamp(p), swapped.clamp(p)
		assert.InDelta(t, float64(s.X), float64(c.X), 1e-5, "clamp X at %v", p)
		assert.InDelta(t, float64(s.Y), float64(c.Y), 1e-5, "clamp Y at %v", p)
	}
}

// The broadphase bound must cover the turned box, or the grid never even offers
// the pair to the narrowphase and the collider silently stops existing at the
// corners. A 4x3 at 45° spans (4+3)/sqrt(2) = 4.9497 on both axes.
func TestSolidAABB_RotatedBoundingBoxCoversTheCorners(t *testing.T) {
	bb := newTestHouse(45).Shape().bb
	assert.InDelta(t, 2.4749, float64(bb.Right), 1e-3)
	assert.InDelta(t, -2.4749, float64(bb.Left), 1e-3)
	assert.InDelta(t, 2.4749, float64(bb.Upper), 1e-3)
	assert.InDelta(t, -2.4749, float64(bb.Bottom), 1e-3)
}
