package sys

import (
	"sort"

	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// healthRatioer is implemented by targets the lowest_health selector ranks by
// wounded-ness (current/max, 0..1). Players and mobs implement it; a target
// without it sorts as full health (least wounded).
type healthRatioer interface {
	HealthRatio() float32
}

// effectiveMaxTargets is the level-scaled target cap; 0 = uncapped (AoE-all).
// A configured cap never scales below 1.
func effectiveMaxTargets(e skills.EffectDef, level int) int {
	if e.MaxTargets <= 0 {
		return 0
	}
	n := skills.Scaled(e.MaxTargets, e.MaxTargetsPerLevel, level)
	if n < 1 {
		n = 1
	}
	return n
}

// effectiveTickInterval is the level-scaled tick interval, floored at 1.
func effectiveTickInterval(e skills.EffectDef, level int) int {
	n := skills.Scaled(e.TickInterval, e.TickIntervalPerLevel, level)
	if n < 1 {
		n = 1
	}
	return n
}

// auraSlashTickThreshold is the effective tick interval at or above which a
// damage aura reads as a discrete slash rather than sustained fire (item 11
// Step 4). [PLACEHOLDER] — content picks its style purely by its tickInterval,
// so new slow/fast auras and cooldowns fall on the right side automatically.
const auraSlashTickThreshold = 15

// auraHitStyleFor resolves a damage effect's hit VFX. A per-effect override
// (JSON `hitStyle`) wins when set; otherwise HitStyleAuto derives the style from
// the effective tick cadence — slow-tick auras stamp a slash, fast-tick auras a
// fire/spark. This keeps the cadence default while letting each aura pin its own
// style in content.
func auraHitStyleFor(e skills.EffectDef, level int) model.AuraHitStyle {
	switch e.HitStyle {
	case skills.HitStyleSlash:
		return model.AuraHitStyleSlash
	case skills.HitStyleFire:
		return model.AuraHitStyleFire
	case skills.HitStyleNone:
		return model.AuraHitStyleNone
	}
	// HitStyleAuto: derive from cadence.
	if effectiveTickInterval(e, level) >= auraSlashTickThreshold {
		return model.AuraHitStyleSlash
	}
	return model.AuraHitStyleFire
}

// selectTargets runs the item-11 targeting pipeline over a raw collision set:
// eligibility filter → selector ordering → target cap. It returns the colliders
// to affect, in application order.
//
// The uncapped case (maxTargets 0, selector all, or fewer candidates than the
// cap) short-circuits without sorting: everyone eligible is returned, since
// ordering can't change who is hit when nobody is dropped.
func selectTargets(collisions phy.ColliderSet, casterPos phy.Vec2f, sel skills.Selector, maxTargets int, eligible func(phy.Collider) bool) []phy.Collider {
	candidates := make([]phy.Collider, 0, len(collisions))
	for c := range collisions {
		if eligible(c) {
			candidates = append(candidates, c)
		}
	}

	if sel == skills.SelectorAll || maxTargets <= 0 || len(candidates) <= maxTargets {
		return candidates
	}

	sortBySelector(candidates, casterPos, sel)
	return candidates[:maxTargets]
}

// sortBySelector orders candidates so the first maxTargets are the ones the
// selector prefers. Ties are resolved arbitrarily (stable over the pre-sort
// order, which itself comes from unordered map iteration).
func sortBySelector(candidates []phy.Collider, casterPos phy.Vec2f, sel skills.Selector) {
	switch sel {
	case skills.SelectorLowestHealth:
		sort.SliceStable(candidates, func(i, j int) bool {
			return healthRatioOf(candidates[i]) < healthRatioOf(candidates[j])
		})
	default: // SelectorNearest
		sort.SliceStable(candidates, func(i, j int) bool {
			return casterPos.DistanceToSquared(candidates[i].Position()) <
				casterPos.DistanceToSquared(candidates[j].Position())
		})
	}
}

// healthRatioOf reads a candidate's current/max health ratio; targets that
// don't expose it count as full health (last picked by lowest_health).
func healthRatioOf(c phy.Collider) float32 {
	if h, ok := c.Shape().UserData.(healthRatioer); ok {
		return h.HealthRatio()
	}
	return 1
}
