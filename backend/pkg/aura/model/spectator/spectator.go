package spectator

import (
	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func NewSpectator(pos phy.Vec2f, client model.Client) model.Spectator {
	viewport := phy.NewBox(pos, phy.Vec2f{X: constant.ViewPortWidth / 2, Y: constant.ViewPortHeight / 2})
	viewport.Shape().IsSensor = true
	viewport.Shape().Mask = int(model.LayerViewportCollision)

	return &spectator{
		BasicEntity: ecs.NewBasic(),
		pos:         pos,
		viewport:    viewport,
		client:      client,
		scale:       1,
	}
}

// NewTouringSpectator is the PRE-JOIN spectator: the start screen's backdrop.
// It rides the tour and sees through an AOI box TourViewportScale times the
// ordinary one. The death and dead-reconnect spectators stay NewSpectator: they
// watch the spot the character died on and must never move.
func NewTouringSpectator(tour *Tour, client model.Client) model.Spectator {
	s := NewSpectator(tour.Position(), client).(*spectator)
	s.tour = tour
	s.scale = TourViewportScale
	s.viewport.SetExtent(phy.Vec2f{
		X: constant.ViewPortWidth / 2 * TourViewportScale,
		Y: constant.ViewPortHeight / 2 * TourViewportScale,
	})
	return s
}

type spectator struct {
	ecs.BasicEntity

	pos      phy.Vec2f
	viewport *phy.Box

	client model.Client

	// tour is nil for every spectator but the pre-join one.
	tour  *Tour
	scale float32
}

func (s *spectator) Basic() ecs.BasicEntity {
	return s.BasicEntity
}

func (s *spectator) Position() phy.Vec2f {
	return s.pos
}

func (s *spectator) SetPosition(pos phy.Vec2f) {
	s.pos = pos
	s.viewport.SetPosition(pos)
}

// Advance moves a touring spectator along its tour; everyone else stands still.
func (s *spectator) Advance(dtMillis float32) {
	if s.tour != nil {
		s.SetPosition(s.tour.Advance(dtMillis))
	}
}

func (s *spectator) ViewportScale() float32 {
	return s.scale
}

func (s *spectator) Bodies() model.Bodies {
	bodies := make(model.Bodies, 1)
	bodies[0] = s.viewport
	return bodies
}

func (s *spectator) Viewport() phy.DynamicCollider {
	return s.viewport
}

func (s *spectator) Client() model.Client {
	return s.client
}
