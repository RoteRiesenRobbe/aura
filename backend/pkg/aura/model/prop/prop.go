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
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// FromZone builds the entity for one resolved zone placement — the SINGLE
// definition of how an authored prop becomes a thing in the world.
//
// ⚑ It exists because there were three copies of this eight-line loop (the
// boot seam, the scaling profile's world builder, and a test) and
// plan-prop-scale.md C1b had to change all three at once. A fourth would drift.
//
// The two footprints are the whole point: VisualBody is what the client draws
// and the Tiled box shows, CollisionBody is what blocks. Both already carry the
// placement's optional scale multiplier.
//
// ⚑ world imports nothing from model, so this direction is the only one
// available: model imports world, which is why the zone package cannot build
// entities itself.
func FromZone(p *world.Prop) *Prop {
	pos := phy.Vec2f{X: p.X, Y: p.Y}
	entityType := model.EntityType(p.Def.EntityType)
	visual, solid := p.VisualBody(), p.CollisionBody()
	if solid.IsRect() {
		return NewRect(entityType, pos, solid.Width, solid.Height, visual.VisualRadius(), p.BlocksMovement)
	}
	return New(entityType, pos, solid.Radius, visual.VisualRadius(), p.BlocksMovement)
}

type Prop struct {
	model.BaseEntity

	// rect is set for rectangle-bodied props (content-pass C1 rect-prop
	// lift); BaseEntity.Body stays nil then and every body access below is
	// overridden. Circle props keep the BaseEntity path untouched.
	rect *phy.SolidAABB

	// visualRadius is what the wire carries, and it is deliberately NOT the
	// body's (plan-prop-scale.md C1b): a tree crown overhangs its trunk, so the
	// sprite is larger than the collider. The client draws at exactly this
	// number and applies no factor of its own, which is what lets the Tiled box
	// — sized from the same authored body — match the game.
	//
	// ⚑ Radius() is the ONLY consumer that must see the visual size. Mob
	// steering takes the phy.Circle directly and the streamed AABB feeds the
	// dev overlay, so both correctly keep reporting the collider.
	visualRadius float32
}

var _ = model.PropEntity(&Prop{})

// New builds a static circle prop entity at pos. radius is the COLLIDER;
// visualRadius is what the client draws the sprite at and is usually larger
// (see Prop.visualRadius). blocksMovement puts the body on the player/mob
// static-collision layers (the same bits solid resources use); a decorative
// prop keeps only the viewport layer, so it streams to clients but never
// collides.
func New(entityType model.EntityType, pos phy.Vec2f, radius, visualRadius float32, blocksMovement bool) *Prop {
	body := phy.NewCircle(pos, radius)
	body.Shape().Layer = propLayer(blocksMovement)

	p := &Prop{
		BaseEntity:   model.NewBaseEntity(body, entityType),
		visualRadius: visualRadius,
	}
	// UserData is how viewport queries find the entity behind a shape — without
	// it the prop would never be streamed (core/net.go).
	body.Shape().UserData = p
	return p
}

// NewRect builds a static axis-aligned rectangle prop entity at pos (the
// rect's center), width x height — the COLLIDER. visualRadius is the max
// half-extent of the VISUAL body, which is what the wire carries. Layer rules
// match New.
func NewRect(entityType model.EntityType, pos phy.Vec2f, width, height, visualRadius float32, blocksMovement bool) *Prop {
	body := phy.NewSolidAABB(pos, width, height)
	body.Shape().Layer = propLayer(blocksMovement)

	p := &Prop{
		BaseEntity:   model.NewBaseEntity(nil, entityType),
		rect:         body,
		visualRadius: visualRadius,
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

// Radius is the single size scalar on the Resource wire table — the VISUAL
// radius, not the collider's. For a rect it is the max half-extent, which lets
// the client scale a sprite whose aspect matches the authored body.
func (p *Prop) Radius() float32 {
	return p.visualRadius
}
