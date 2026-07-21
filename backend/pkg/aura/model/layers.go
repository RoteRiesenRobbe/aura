package model

//go:generate go run github.com/dmarkham/enumer -type=CollisionLayer
type CollisionLayer int

const LayerNoneCollision CollisionLayer = 0

const (
	LayerPlayerStaticCollision CollisionLayer = 0x1 << iota // layer with everything that should collide with a player

	LayerActionCollision
	LayerWeaponCollision

	// Reserved gap: this bit was LayerHeatCollision until the dead heat
	// machinery was removed (2026-07-21). It MUST stay reserved — every
	// `body.collisionLayer` / `body.collisionMask` in api/mobs/*.json is a
	// raw integer (e.g. campfire 32 = "Viewport only", totem 160 =
	// "Viewport|Player"), so deleting the bit silently re-points all 14 of
	// those mobs at the wrong layers. It did exactly that once: the campfire
	// fell out of the viewport query and stopped being sent to clients while
	// still showing in the zone editor.
	_

	LayerBorderCollision
	LayerViewportCollision

	LayerMobStaticCollision
	LayerPlayerCollision    // layer with all players on
	LayerPlaceableCollision // layer with all placeables on
)
