package prop

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func TestNew_BlocksMovementSetsStaticCollisionLayers(t *testing.T) {
	p := New(5, phy.Vec2f{X: 3, Y: -2}, 0.5, 0.5, true)

	layer := p.Bodies()[0].Shape().Layer
	assert.NotZero(t, layer&int(model.LayerPlayerStaticCollision), "players must collide")
	assert.NotZero(t, layer&int(model.LayerMobStaticCollision), "mobs must collide")
	assert.NotZero(t, layer&int(model.LayerViewportCollision), "must stream to viewports")

	assert.EqualValues(t, 5, p.Type())
	assert.EqualValues(t, 0.5, p.Radius())
	assert.Equal(t, phy.Vec2f{X: 3, Y: -2}, p.Position())
}

func TestNew_DecorativeKeepsOnlyViewportLayer(t *testing.T) {
	p := New(5, phy.VEC2F_ZERO, 0.5, 0.5, false)

	layer := p.Bodies()[0].Shape().Layer
	assert.Equal(t, int(model.LayerViewportCollision), layer,
		"a decorative prop streams but never collides")
}

func TestNew_SetsUserDataForViewportStreaming(t *testing.T) {
	p := New(5, phy.VEC2F_ZERO, 0.5, 0.5, true)
	assert.Same(t, p, p.Bodies()[0].Shape().UserData,
		"viewport queries resolve entities via Shape().UserData")
}

func TestNewRect_BuildsSolidAABBBody(t *testing.T) {
	p := NewRect(5, phy.Vec2f{X: 3, Y: -2}, 4, 3, 2, true)

	body, ok := p.Bodies()[0].(*phy.SolidAABB)
	require.True(t, ok, "rect prop body must be a SolidAABB")
	assert.EqualValues(t, 2, body.HalfWidth)
	assert.EqualValues(t, 1.5, body.HalfHeight)

	layer := body.Shape().Layer
	assert.NotZero(t, layer&int(model.LayerPlayerStaticCollision), "players must collide")
	assert.NotZero(t, layer&int(model.LayerMobStaticCollision), "mobs must collide")
	assert.NotZero(t, layer&int(model.LayerViewportCollision), "must stream to viewports")

	assert.EqualValues(t, 5, p.Type())
	assert.Equal(t, phy.Vec2f{X: 3, Y: -2}, p.Position())
	assert.EqualValues(t, 2, p.Radius(), "wire radius is the max half-extent")
	assert.Same(t, p, body.Shape().UserData,
		"viewport queries resolve entities via Shape().UserData")

	aabb := p.AABB()
	assert.EqualValues(t, 1, aabb.Left)
	assert.EqualValues(t, 5, aabb.Right)
	assert.EqualValues(t, -3.5, aabb.Bottom)
	assert.EqualValues(t, -0.5, aabb.Upper)
}

// ⭐ plan-prop-scale.md C1b: the wire radius and the collider are now two
// different numbers, and only Radius() may report the visual one. A tree is
// the real case — a 1.4-unit crown over a 1.0-unit trunk.
func TestNew_WireRadiusIsVisualWhileTheBodyStaysTheCollider(t *testing.T) {
	p := New(5, phy.VEC2F_ZERO, 1.0, 1.4, true)

	assert.EqualValues(t, float32(1.4), p.Radius(), "the wire carries the VISUAL radius")

	body, ok := p.Bodies()[0].(*phy.Circle)
	require.True(t, ok)
	assert.EqualValues(t, 1.0, body.Radius, "the collider must be untouched by the visual size")

	// ⚑ The streamed AABB feeds the dev overlay, so it correctly stays the
	// collider's — a debug box that drew the sprite would be lying.
	aabb := p.AABB()
	assert.EqualValues(t, 2, aabb.Right-aabb.Left)
}

func TestNewRect_WireRadiusIsVisualWhileTheBodyStaysTheCollider(t *testing.T) {
	// A rect with a smaller collider: visual 4×3 (max half-extent 2), solid 2×1.5.
	p := NewRect(5, phy.VEC2F_ZERO, 2, 1.5, 2, true)

	assert.EqualValues(t, 2, p.Radius(), "the wire carries the VISUAL max half-extent")

	body := p.Bodies()[0].(*phy.SolidAABB)
	assert.EqualValues(t, 1, body.HalfWidth)
	assert.EqualValues(t, 0.75, body.HalfHeight)
}

func TestNewRect_DecorativeKeepsOnlyViewportLayer(t *testing.T) {
	p := NewRect(5, phy.VEC2F_ZERO, 4, 3, 2, false)

	layer := p.Bodies()[0].Shape().Layer
	assert.Equal(t, int(model.LayerViewportCollision), layer,
		"a decorative rect prop streams but never collides")
}

// A player-masked circle overlapping a rect prop's face is pushed clear
// through the real broadphase + resolution pipeline.
func TestProp_BlockingRectPropStopsCircleThroughSpace(t *testing.T) {
	s := phy.NewSpace()

	house := NewRect(5, phy.VEC2F_ZERO, 4, 3, 2, true)
	s.AddStaticShape(house.Bodies()[0].(phy.Collider))

	circle := phy.NewCircle(phy.Vec2f{X: 2.2, Y: 0}, 0.5)
	circle.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)
	s.AddShape(circle)

	for i := 0; i < 10; i++ {
		s.Update()
	}

	// clear of the right face (half-width 2 + radius 0.5)
	require.GreaterOrEqual(t, float64(circle.Position().X), 2.5-1e-3,
		"circle should be pushed clear of the house, ended at %v", circle.Position())
}

// End-to-end through the real broadphase + resolution pipeline (mirrors
// phy's InvAABB confinement test): a player-masked dynamic circle overlapping
// a blocking prop is pushed out; a decorative prop lets it sit unmoved.
func TestProp_BlockingPropStopsCircleThroughSpace(t *testing.T) {
	s := phy.NewSpace()

	blocker := New(5, phy.VEC2F_ZERO, 1, 1, true)
	s.AddStaticShape(blocker.Bodies()[0])

	circle := phy.NewCircle(phy.Vec2f{X: 1.2, Y: 0}, 0.5)
	circle.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)
	s.AddShape(circle)

	for i := 0; i < 10; i++ {
		s.Update()
	}

	dist := circle.Position().Sub(blocker.Position()).AbsSq()
	require.GreaterOrEqual(t, float64(dist), float64(1.5*1.5)-1e-3,
		"circle should be pushed out of the blocking prop, ended at %v", circle.Position())
}

func TestProp_DecorativePropDoesNotCollideThroughSpace(t *testing.T) {
	s := phy.NewSpace()

	decoration := New(5, phy.VEC2F_ZERO, 1, 1, false)
	s.AddStaticShape(decoration.Bodies()[0])

	start := phy.Vec2f{X: 0.2, Y: 0}
	circle := phy.NewCircle(start, 0.5)
	circle.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)
	s.AddShape(circle)

	for i := 0; i < 10; i++ {
		s.Update()
	}

	assert.Equal(t, start, circle.Position(),
		"a decorative prop must not push the circle anywhere")
}
