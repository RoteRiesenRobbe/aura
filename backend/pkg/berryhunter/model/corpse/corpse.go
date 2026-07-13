// Package corpse implements the dead player's corpse (atmosphere & recovery
// chunk 4): a non-colliding world marker spawned at the deathspot and removed
// when the player respawns or their dead client disconnects. It marshals
// through the Resource wire table like props do, but its body is DYNAMIC —
// props ride the static add-path and PhysicsSystem.Remove panics on statics,
// while a corpse is the first prop-shaped entity that must be removable.
package corpse

import (
	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// corpseRadius is the corpse body/sprite radius. [PLACEHOLDER]
const corpseRadius = 0.5

type Corpse struct {
	model.BaseEntity
}

var _ = model.CorpseEntity(&Corpse{})

func New(pos phy.Vec2f) *Corpse {
	body := phy.NewCircle(pos, corpseRadius)
	// Viewport-only: streams to clients, never collides with anything.
	body.Shape().Layer = int(model.LayerViewportCollision)

	c := &Corpse{
		BaseEntity: model.NewBaseEntity(body, model.EntityType(BerryhunterApi.EntityTypeCorpse)),
	}
	// UserData is how viewport queries find the entity behind a shape — without
	// it the corpse would never be streamed (core/net.go).
	body.Shape().UserData = c
	return c
}

func (c *Corpse) IsCorpse() {}
