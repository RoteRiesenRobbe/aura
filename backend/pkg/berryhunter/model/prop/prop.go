// Package prop implements hand-placed static world objects (world foundation
// chunk 3): a circle body + a client sprite picked by EntityType + the two
// occluder flags. Props are built once from the authored zone at boot; they
// route through game.AddEntity's plain model.Entity case (static body + net
// streaming) and marshal through the Resource wire table — no harvest, decay,
// respawn or update systems involved.
package prop

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

type Prop struct {
	model.BaseEntity
	blocksAura bool
}

var _ = model.PropEntity(&Prop{})

// New builds a static prop entity at pos. blocksMovement puts the body on the
// player/mob static-collision layers (the same bits solid resources use,
// minus the generation-spacing LayerRessourceCollision nothing masks anymore);
// a decorative prop keeps only the viewport layer, so it streams to clients
// but never collides. blocksAura is stored inert until aura LoS (item 6).
func New(entityType model.EntityType, pos phy.Vec2f, radius float32, blocksMovement, blocksAura bool) *Prop {
	body := phy.NewCircle(pos, radius)
	if blocksMovement {
		body.Shape().Layer = int(model.LayerPlayerStaticCollision | model.LayerMobStaticCollision | model.LayerViewportCollision)
	} else {
		body.Shape().Layer = int(model.LayerViewportCollision)
	}

	p := &Prop{
		BaseEntity: model.NewBaseEntity(body, entityType),
		blocksAura: blocksAura,
	}
	// UserData is how viewport queries find the entity behind a shape — without
	// it the prop would never be streamed (core/net.go).
	body.Shape().UserData = p
	return p
}

func (p *Prop) BlocksAura() bool {
	return p.blocksAura
}
