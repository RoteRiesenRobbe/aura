package phy

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// box centered at origin, 20 wide x 10 tall -> half-extents 10 x 5.
// A radius-1 circle's center is confined to [-9,9] x [-4,4].
func newTestInvAABB() *InvAABB {
	return NewInvAABB(VEC2F_ZERO, 20, 10)
}

func TestInvAABB_IntersectWithCircle(t *testing.T) {
	a := newTestInvAABB()

	cases := []struct {
		name   string
		center Vec2f
		poking bool
	}{
		{"center", Vec2f{0, 0}, false},
		{"well inside", Vec2f{8, 3}, false},
		{"on the shrunk right edge", Vec2f{9, 0}, false},
		{"past right edge", Vec2f{9.5, 0}, true},
		{"past left edge", Vec2f{-9.5, 0}, true},
		{"past top edge", Vec2f{0, 4.5}, true},
		{"past bottom edge", Vec2f{0, -4.5}, true},
		{"past a corner", Vec2f{9.5, 4.5}, true},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			circle := NewCircle(c.center, 1)
			assert.Equal(t, c.poking, a.intersectWithCircle(circle))
		})
	}
}

func TestInvAABB_ResolveCircle(t *testing.T) {
	a := newTestInvAABB()

	cases := []struct {
		name   string
		center Vec2f
		force  Vec2f
	}{
		{"inside -> no force", Vec2f{8, 3}, Vec2f{0, 0}},
		{"center -> no force", Vec2f{0, 0}, Vec2f{0, 0}},
		{"past right -> pushed left", Vec2f{9.5, 0}, Vec2f{-0.5, 0}},
		{"past left -> pushed right", Vec2f{-9.5, 0}, Vec2f{0.5, 0}},
		{"past top -> pushed down", Vec2f{0, 4.5}, Vec2f{0, -0.5}},
		{"past bottom -> pushed up", Vec2f{0, -4.5}, Vec2f{0, 0.5}},
		{"past corner -> pushed diagonally", Vec2f{9.5, 4.5}, Vec2f{-0.5, -0.5}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			circle := NewCircle(c.center, 1)
			force := resolveInvAABB(circle, a)
			assert.Equal(t, c.force, force)

			// applying the force must land the center inside-or-on the box
			corrected := c.center.Add(force)
			assert.False(t, a.intersectWithCircle(NewCircle(corrected, 1)),
				"corrected center %v should be inside", corrected)
		})
	}
}

// End-to-end confinement through the real broadphase + resolution pipeline
// (mirrors how core/game.go wires the border wall): a dynamic circle placed
// outside each edge is pushed back inside after one Space.Update().
func TestInvAABB_ConfinesDynamicCircleThroughSpace(t *testing.T) {
	const layer = 1 // shared bit so ArbiterShapes(circle, wall) matches

	outside := []struct {
		name   string
		center Vec2f
	}{
		{"right", Vec2f{12, 0}},
		{"left", Vec2f{-12, 0}},
		{"top", Vec2f{0, 7}},
		{"bottom", Vec2f{0, -7}},
		{"corner", Vec2f{12, 7}},
	}

	for _, o := range outside {
		t.Run(o.name, func(t *testing.T) {
			s := NewSpace()

			wall := NewInvAABB(VEC2F_ZERO, 20, 10)
			wall.Shape().Layer = layer
			s.AddStaticShape(wall)

			circle := NewCircle(o.center, 1)
			circle.Shape().Mask = layer
			s.AddShape(circle)

			s.Update()

			assert.False(t, wall.intersectWithCircle(circle),
				"circle at %v should have been pushed inside, ended at %v",
				o.center, circle.Position())
		})
	}
}

// A box narrower than the circle pushes toward the center rather than producing
// a nonsensical outward force (mirrors InvCircle's degenerate-radius guard).
func TestInvAABB_ResolveCircle_BoxNarrowerThanCircle(t *testing.T) {
	a := NewInvAABB(VEC2F_ZERO, 1, 1) // half-extents 0.5, smaller than r=1
	circle := NewCircle(Vec2f{3, 0}, 1)
	force := resolveInvAABB(circle, a)
	// pushed straight back toward center on the offending axis
	assert.Equal(t, Vec2f{-3, 0}, force)
}
