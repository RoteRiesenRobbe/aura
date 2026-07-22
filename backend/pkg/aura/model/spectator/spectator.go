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
	}
}

type spectator struct {
	ecs.BasicEntity

	pos      phy.Vec2f
	viewport *phy.Box

	client model.Client
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
