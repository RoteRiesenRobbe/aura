package model

import "github.com/trichner/berryhunter/pkg/berryhunter/phy"

// Combatant is a living, factioned combat participant as mob aggro sees one
// (mob-depth chunk 3): everything acquisition, threat retention and
// chase/flee need from a target. Players, mobs and summons all satisfy it;
// "living" is HealthRatio() > 0, which players and mobs share since item 11.
type Combatant interface {
	BasicEntity
	Factioned

	Position() phy.Vec2f
	Radius() float32
	HealthRatio() float32
}
