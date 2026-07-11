package prop

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
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
