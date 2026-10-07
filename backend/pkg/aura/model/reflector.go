package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

// Reflector is an entity that can wear a retaliate_burst reflect and bounce a
// share of every hit it takes back at whoever landed it
// (plan-effect-types-round-2.md C2, D16-D17). Players and mobs both implement
// it, pinned at compile time beside StatBuffable (L8).
type Reflector interface {
	// ApplyReflect grants or refreshes the reflect buff.
	ApplyReflect(source skills.SkillID, fraction float32, tags []string, ticks int)
	// ReflectBurst is the strongest live reflect: its skill, its share of the
	// incoming hit and the damage type it goes back as; zeros when none is up.
	ReflectBurst() (skills.SkillID, float32, []string)
}
