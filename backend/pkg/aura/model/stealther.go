package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

// Stealther is an entity that can hide from mobs (plan-effect-types-round-2.md
// C6, D1-D3): players only, pinned at compile time (L8).
type Stealther interface {
	// ApplyStealth hides the entity for up to ticks; true when it took.
	ApplyStealth(source skills.SkillID, ticks int) bool
	Stealthed() bool
	// BreakStealth ends it early: damage dealt or taken that moved HP (D26).
	BreakStealth()
}

// IsStealthed reports whether e is hidden from mobs right now. Every mob door
// asks it: acquisition, threat and the shared harm seam (D25). A structural
// assert on the read alone, so a double that only hides is enough.
func IsStealthed(e any) bool {
	s, ok := e.(interface{ Stealthed() bool })
	return ok && s.Stealthed()
}
