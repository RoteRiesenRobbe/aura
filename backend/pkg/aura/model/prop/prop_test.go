package prop

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func TestNew_BlocksMovementSetsStaticCollisionLayers(t *testing.T) {
	p := New(5, phy.Vec2f{X: 3, Y: -2}, 0.5, true)

	layer := p.Bodies()[0].Shape().Layer
	assert.NotZero(t, layer&int(model.LayerPlayerStaticCollision), "players must collide")
	assert.NotZero(t, layer&int(model.LayerMobStaticCollision), "mobs must collide")
	assert.NotZero(t, layer&int(model.LayerViewportCollision), "must stream to viewports")

	assert.EqualValues(t, 5, p.Type())
	assert.EqualValues(t, 0.5, p.Radius())
	assert.Equal(t, phy.Vec2f{X: 3, Y: -2}, p.Position())
}

func TestNew_DecorativeKeepsOnlyViewportLayer(t *testing.T) {
	p := New(5, phy.VEC2F_ZERO, 0.5, false)

	layer := p.Bodies()[0].Shape().Layer
	assert.Equal(t, int(model.LayerViewportCollision), layer,
		"a decorative prop streams but never collides")
}

func TestNew_SetsUserDataForViewportStreaming(t *testing.T) {
	p := New(5, phy.VEC2F_ZERO, 0.5, true)
	assert.Same(t, p, p.Bodies()[0].Shape().UserData,
		"viewport queries resolve entities via Shape().UserData")
}

func TestNewRect_BuildsSolidAABBBody(t *testing.T) {
	p := NewRect(5, phy.Vec2f{X: 3, Y: -2}, 4, 3, true)

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

func TestNewRect_DecorativeKeepsOnlyViewportLayer(t *testing.T) {
	p := NewRect(5, phy.VEC2F_ZERO, 4, 3, false)

	layer := p.Bodies()[0].Shape().Layer
	assert.Equal(t, int(model.LayerViewportCollision), layer,
		"a decorative rect prop streams but never collides")
}

// A player-masked circle overlapping a rect prop's face is pushed clear
// through the real broadphase + resolution pipeline.
func TestProp_BlockingRectPropStopsCircleThroughSpace(t *testing.T) {
	s := phy.NewSpace()

	house := NewRect(5, phy.VEC2F_ZERO, 4, 3, true)
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

	blocker := New(5, phy.VEC2F_ZERO, 1, true)
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

	decoration := New(5, phy.VEC2F_ZERO, 1, false)
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
