package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

// Empowerable is an entity that can hold an empower offer for its next
// cooldown (plan-effect-types-round-2.md C4, D20, D21). Players only, pinned
// at compile time beside the player's other interface pins (L8).
type Empowerable interface {
	// ApplyEmpower stands the offer, replacing any live one.
	ApplyEmpower(source skills.SkillID, p skills.EmpowerParams, ticks int)
	// Empower is the live offer: the instant and free reads.
	Empower() (skills.EmpowerParams, bool)
	// ArmEmpower marks the offer as spent by the fire now running.
	ArmEmpower()
	// EmpoweredFire is the offer during that fire: the crit and factor reads.
	EmpoweredFire() (skills.EmpowerParams, bool)
	// ConsumeEmpower spends it, once, after that fire.
	ConsumeEmpower()
}
