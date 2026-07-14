package skills

import "math"

// Scaled is THE level-scaling convention for every leveled value in the
// skill system: base + (level−1) × perLevel. Level 1 always yields the
// base; negative perLevel means "stronger/faster at higher levels".
// Floors (0, 1, uncapped sentinels) differ per field and stay at the
// call sites.
func Scaled[T interface{ ~int | ~float32 }](base, perLevel T, level int) T {
	return base + T(level-1)*perLevel
}

// EffectiveTickInterval is THE source of truth for how often an aura effect
// fires: the level-scaled TickInterval composed with a tick_rate factor
// (skill-vocab chunk 6), rounded and floored at 1 tick. factor 1.0 = the plain
// level-scaled interval; < 1 hastes, > 1 slows. Both the SkillSystem firing
// loop (caster's Buffs factor) and the model wire accessors (own factor,
// first effect) call this, so the indicator and the actual ticks stay in sync.
func EffectiveTickInterval(e EffectDef, level int, factor float32) int {
	base := Scaled(e.TickInterval, e.TickIntervalPerLevel, level)
	n := int(math.Round(float64(base) * float64(factor)))
	if n < 1 {
		n = 1
	}
	return n
}
