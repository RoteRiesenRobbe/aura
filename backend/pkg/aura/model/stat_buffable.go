package model

import "github.com/RoteRiesenRobbe/aura/pkg/aura/skills"

// StatBuffable is an entity that can carry timed stat buffs and debuffs from
// stat_aura and instant_stat (plan-effect-types-round-2.md C1, D11-D15), and
// report its stats as they stand right now. Players and mobs both implement it
// (pinned at compile time beside their other interface pins); a type that
// stops matching would otherwise degrade to "not applicable" in silence (L8).
type StatBuffable interface {
	// ApplyStat grants or refreshes the buff; true when genuinely new (§5.2).
	ApplyStat(source skills.SkillID, stat string, bonus float32, ticks int) bool
	// EffectiveStats is Derived plus the timed stat buffs (DerivedStats.WithBuffs):
	// what the damage, crit, mitigation and threat sites read.
	EffectiveStats() skills.DerivedStats
}
