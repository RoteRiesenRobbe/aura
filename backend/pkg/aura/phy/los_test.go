package phy

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// LoS prototype (plan-prototype-aura-los §6 step 1). The mask bit stands in
// for model.LayerPlayerStaticCollision; phy cannot import model.
const losMask = 0x1

func losStatic(s *Space, c Collider, layer int) {
	c.Shape().Layer = layer
	s.AddStaticShape(c)
}

func TestLineBlockedByStatics_CircleBetweenBlocks(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewCircle(Vec2f{X: 5, Y: 0}, 1), losMask)

	assert.True(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"an occluder squarely between caster and target must block")
}

func TestLineBlockedByStatics_CircleBeyondTargetIsClear(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewCircle(Vec2f{X: 15, Y: 0}, 1), losMask)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"an occluder past the target must not block")
}

func TestLineBlockedByStatics_CircleBehindCasterIsClear(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewCircle(Vec2f{X: -5, Y: 0}, 1), losMask)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"an occluder behind the caster must not block")
}

func TestLineBlockedByStatics_CircleOffAxisIsClear(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewCircle(Vec2f{X: 5, Y: 3}, 1), losMask)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"an occluder beside the sightline must not block")
}

func TestLineBlockedByStatics_OccluderContainingAnEndpointNeverBlocks(t *testing.T) {
	// D3: a caster or target standing overlapped into a prop is not sealed
	// off by it: the ray starts (or ends) inside the shape.
	s := NewSpace()
	losStatic(s, NewCircle(Vec2f{X: 0.5, Y: 0}, 1), losMask)
	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"an occluder containing the caster must not block")

	s2 := NewSpace()
	losStatic(s2, NewCircle(Vec2f{X: 9.8, Y: 0}, 1), losMask)
	assert.False(t, s2.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"an occluder containing the target must not block")
}

func TestLineBlockedByStatics_WrongLayerNeverBlocks(t *testing.T) {
	// A walkable prop sits on the viewport layer only; the mask must
	// exclude it.
	s := NewSpace()
	losStatic(s, NewCircle(Vec2f{X: 5, Y: 0}, 1), 0x2)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"a static outside the mask must not block")
}

func TestLineBlockedByStatics_BorderWallNeverBlocks(t *testing.T) {
	// The world border is an inverse shape containing everyone. Its real
	// layer (LayerBorderCollision) is already outside the mask; give it the
	// matching layer here to prove the defensive type skip holds on its own.
	s := NewSpace()
	losStatic(s, NewInvAABB(VEC2F_ZERO, 100, 100), losMask)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: -20, Y: 5}, Vec2f{X: 20, Y: -5}, losMask),
		"the inverse border wall must never block an in-world segment")
}

func TestLineBlockedByStatics_SolidAABBBetweenBlocks(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewSolidAABB(Vec2f{X: 5, Y: 0}, 2, 2), losMask)

	assert.True(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"a rect prop squarely between caster and target must block")
	assert.True(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: -3}, Vec2f{X: 10, Y: 3}, losMask),
		"a diagonal sightline through the rect must block")
}

func TestLineBlockedByStatics_SolidAABBOffAxisIsClear(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewSolidAABB(Vec2f{X: 5, Y: 5}, 2, 2), losMask)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"a rect prop beside the sightline must not block")
}

func TestLineBlockedByStatics_SolidAABBContainingAnEndpointNeverBlocks(t *testing.T) {
	s := NewSpace()
	losStatic(s, NewSolidAABB(Vec2f{X: 0, Y: 0}, 4, 4), losMask)

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"a rect prop containing the caster must not block")
}

func TestLineBlockedByStatics_EmptySpaceIsClear(t *testing.T) {
	s := NewSpace()

	assert.False(t, s.LineBlockedByStatics(Vec2f{X: 0, Y: 0}, Vec2f{X: 10, Y: 0}, losMask),
		"no statics, no block")
}
