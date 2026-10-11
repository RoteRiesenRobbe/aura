package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

// Fearable is an entity that can be feared (plan-effect-types-round-2.md C5,
// D22, D23): it runs from the fearer and cannot cast. Players and mobs both
// implement it, pinned at compile time (L8); who may be feared is each
// door's business (ccImmune, GOD, the shared hard-CC ladder).
type Fearable interface {
	// ApplyFear reports whether the fear landed. from is the fearer; anything
	// with a Position() is run from.
	ApplyFear(source skills.SkillID, from any, ticks int) bool
	Feared() bool
}
