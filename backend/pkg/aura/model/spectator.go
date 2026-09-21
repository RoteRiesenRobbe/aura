package model

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Spectator is the interface representing a connected client
// that has not yet joined the game or already died.
type Spectator interface {
	BasicEntity
	Position() phy.Vec2f
	SetPosition(phy.Vec2f)
	// Advance steps a touring (pre-join) spectator by dt milliseconds. A no-op
	// for the death spectators, which never move.
	Advance(dtMillis float32)
	// ViewportScale is the AOI box's size relative to the ordinary viewport:
	// 1 for everyone but the touring spectator.
	ViewportScale() float32
	Bodies() Bodies
	Viewport() phy.DynamicCollider
	Client() Client
}
