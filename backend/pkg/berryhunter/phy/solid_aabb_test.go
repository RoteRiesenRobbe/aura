package phy

import (
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
