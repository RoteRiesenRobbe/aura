package model

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
)

type Interacter interface {
	MobTouches(m MobEntity, factors mobs.Factors)
	PlayerTouches(p PlayerEntity, damageFraction float32)
}
