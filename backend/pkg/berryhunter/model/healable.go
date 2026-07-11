package model

import "github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"

// Healable is the capability to receive a heal aura's restoration (mob-depth
// chunk 8). Players heal their PlayerVitalSigns.Health; mobs heal their own
// health pool — the split the heal aura was previously hard-coded around
// (PlayerEntity-only targets). Both types already satisfy Combatant, so Heal
// is the only genuinely new method: it clamps to the entity's max HP, records
// the floating heal number, and returns the HP actually restored (the healer-
// threat crediting rule reads the delta).
type Healable interface {
	Combatant
	Heal(hp uint32) vitals.VitalSign
}
