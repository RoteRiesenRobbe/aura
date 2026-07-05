package model

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
)

type Interacter interface {
	MobTouches(m MobEntity, factors mobs.Factors)
	// PlayerTouches applies a player-sourced hit; damage is absolute HP for
	// living targets (item 11 Phase 1). Structures instead read the fractional
	// StructureDamageFraction from their own path.
	PlayerTouches(p PlayerEntity, damage float32)
}
