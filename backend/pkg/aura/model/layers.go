package model

// Regenerating this enum needs Go 1.22/1.23 (go.mod's version). On Go 1.26 the
// directive below FAILS - the pinned golang.org/x/tools v0.21.1 does not compile
// there ("invalid array length -delta * delta" in tokeninternal.go) and enumer is
// built from it, so `go generate ./...` and `make -C backend gen` die here. Only
// this enum is blocked; the flatbuffers half of gen still succeeds. It stays
// invisible day to day because collisionlayer_enumer.go is committed - you only
// meet it when you edit CollisionLayer and try to regenerate. Fix with an older
// Go or by bumping x/tools. Hit on two separate machines as of 2026-08-18.
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
