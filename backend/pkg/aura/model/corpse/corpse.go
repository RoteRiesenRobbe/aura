// Package corpse implements the dead player's corpse (atmosphere & recovery
// chunk 4): a non-colliding world marker spawned at the deathspot and removed
// when the player respawns or their dead client disconnects. It marshals
// through the Resource wire table like props do, but its body is DYNAMIC —
// props ride the static add-path and PhysicsSystem.Remove panics on statics,
// while a corpse is the first prop-shaped entity that must be removable.
package corpse

import (
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// corpseRadius is the corpse body radius, which sets Revive's reach (a query
// overlap, sys/skills.go nearestCorpseID). Not the drawn size: the client
// draws the corpse at the player's token size (plan-appearance.md D44).
// [PLACEHOLDER]
const corpseRadius = 0.5

type Corpse struct {
	model.BaseEntity
	// The dead player's look as wire values (plan-appearance.md C6, D40),
	// 0 = the default, as on the player.
	portrait, ring uint16
}

var _ = model.CorpseEntity(&Corpse{})

// New spawns a corpse wearing the dead player's look.
func New(pos phy.Vec2f, portrait, ring uint16) *Corpse {
	body := phy.NewCircle(pos, corpseRadius)
	// Viewport-only: streams to clients, never collides with anything.
	body.Shape().Layer = int(model.LayerViewportCollision)

	c := &Corpse{
		BaseEntity: model.NewBaseEntity(body, model.EntityType(AuraApi.EntityTypeCorpse)),
		portrait:   portrait,
		ring:       ring,
	}
	// UserData is how viewport queries find the entity behind a shape — without
	// it the corpse would never be streamed (core/net.go).
	body.Shape().UserData = c
	return c
}

func (c *Corpse) IsCorpse() {}

func (c *Corpse) Look() (portrait, ring uint16) { return c.portrait, c.ring }
