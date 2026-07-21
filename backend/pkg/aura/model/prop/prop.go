// Package prop implements hand-placed static world objects (world foundation
// chunk 3): a circle or rectangle body + a client sprite picked by EntityType
// + the blocksMovement flag. Props are built once from the authored zone at
// boot; they route through game.AddEntity's plain model.Entity case (static
// body + net streaming) and marshal through the Resource wire table — no
// harvest, decay, respawn or update systems involved.
package prop

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

type Prop struct {
	model.BaseEntity

	// rect is set for rectangle-bodied props (content-pass C1 rect-prop
	// lift); BaseEntity.Body stays nil then and every body access below is
	// overridden. Circle props keep the BaseEntity path untouched.
	rect *phy.SolidAABB
}

var _ = model.PropEntity(&Prop{})

// New builds a static circle prop entity at pos. blocksMovement puts the body
// on the player/mob static-collision layers (the same bits solid resources
// use); a decorative prop keeps only the viewport layer, so it streams to
// clients but never collides.
func New(entityType model.EntityType, pos phy.Vec2f, radius float32, blocksMovement bool) *Prop {
	body := phy.NewCircle(pos, radius)
	body.Shape().Layer = propLayer(blocksMovement)

	p := &Prop{
		BaseEntity: model.NewBaseEntity(body, entityType),
	}
	// UserData is how viewport queries find the entity behind a shape — without
	// it the prop would never be streamed (core/net.go).
	body.Shape().UserData = p
	return p
}

// NewRect builds a static axis-aligned rectangle prop entity at pos (the
// rect's center), width x height. Layer rules match New.
func NewRect(entityType model.EntityType, pos phy.Vec2f, width, height float32, blocksMovement bool) *Prop {
	body := phy.NewSolidAABB(pos, width, height)
	body.Shape().Layer = propLayer(blocksMovement)

	p := &Prop{
		BaseEntity: model.NewBaseEntity(nil, entityType),
		rect:       body,
	}
	body.Shape().UserData = p
	return p
}

func propLayer(blocksMovement bool) int {
	if blocksMovement {
		return int(model.LayerPlayerStaticCollision | model.LayerMobStaticCollision | model.LayerViewportCollision)
	}
	return int(model.LayerViewportCollision)
}

// The overrides below route every body access to the rect body when present;
// circle props fall through to BaseEntity.

func (p *Prop) Bodies() model.Bodies {
	if p.rect == nil {
		return p.BaseEntity.Bodies()
	}
	return model.Bodies{p.rect}
}

func (p *Prop) Position() phy.Vec2f {
	if p.rect == nil {
		return p.BaseEntity.Position()
	}
	return p.rect.Position()
}

func (p *Prop) SetPosition(pos phy.Vec2f) {
	if p.rect == nil {
		p.BaseEntity.SetPosition(pos)
		return
	}
	p.rect.SetPosition(pos)
}

func (p *Prop) AABB() model.AABB {
	if p.rect == nil {
		return p.BaseEntity.AABB()
	}
	return model.AABB(p.rect.BoundingBox())
}

// Radius is the single size scalar on the Resource wire table; for a rect the
// max half-extent lets the client scale a sprite whose aspect matches the
// authored body.
func (p *Prop) Radius() float32 {
	if p.rect == nil {
		return p.BaseEntity.Radius()
	}
	if p.rect.HalfWidth > p.rect.HalfHeight {
		return p.rect.HalfWidth
	}
	return p.rect.HalfHeight
}
