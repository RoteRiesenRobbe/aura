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

// effectiveTickInterval is the level-scaled tick interval, floored at 1 — the
// BASE cadence with no tick_rate factor (factor 1.0). The VFX-style and
// buff-lifetime callers use this: haste must not flip an aura's hit style or
// change an instant effect's buff duration. The firing loop applies the
// caster's factor directly via skills.EffectiveTickInterval.
func effectiveTickInterval(e skills.EffectDef, level int) int {
	return skills.EffectiveTickInterval(e, level, 1.0)
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
	switch e.Damage.HitStyle {
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

// effectCollisions narrows the shared aura sensor's collision set to the
// targets one effect can actually reach (atmosphere & recovery chunk 2). The
// sensor sizes to the MAX effect radius over the skill (component.go), so a
// sub-max-radius effect must re-check range or it over-reaches — the campfire
// (small heal + chunk-3 large light) is the first such skill. The check
// mirrors the sensor's own circle-circle overlap (phy.IntersectCircles) at
// the effect's scaled radius; an effect at the sensor radius returns the set
// untouched, so equal-radii skills stay bit-identical.
func effectCollisions(collisions phy.ColliderSet, casterPos phy.Vec2f, sensorRadius float32, effect skills.EffectDef, level int) phy.ColliderSet {
	radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, level)
	if radius >= sensorRadius {
		return collisions
	}
	filtered := make(phy.ColliderSet, len(collisions))
	for c := range collisions {
		circle, ok := c.(*phy.Circle)
		if !ok {
			// Non-circle bodies don't occur on aura layers today; keep them —
			// the sensor already matched them, and dropping silently would be
			// the worse failure mode.
			filtered[c] = struct{}{}
			continue
		}
		r := radius + circle.Radius
		if casterPos.DistanceToSquared(circle.Position()) < r*r {
			filtered[c] = struct{}{}
		}
	}
	return filtered
}

// selectTargets runs the item-11 targeting pipeline over a raw collision set:
// eligibility filter → deterministic base order → selector ordering → target
// cap. It returns the colliders to affect, in application order.
//
// The collision set is a map: without a fixed base order, capped-selector
// ties AND the per-target application order (each target's damage roll draws
// from the caster's rng in slice order) would ride on Go's randomized map
// iteration. Entity-ID order (creation order) makes both deterministic —
// required for fixed-seed reproducibility in the sim harness
// (plan-sim-harness §3, chunk 3) and harmless in-game.
func selectTargets(collisions phy.ColliderSet, casterPos phy.Vec2f, sel skills.Selector, maxTargets int, eligible func(phy.Collider) bool) []phy.Collider {
	candidates := make([]phy.Collider, 0, len(collisions))
	for c := range collisions {
		if eligible(c) {
			candidates = append(candidates, c)
		}
	}

	sort.Slice(candidates, func(i, j int) bool {
		return stableOrderKey(candidates[i]) < stableOrderKey(candidates[j])
	})

	// The uncapped case (maxTargets 0, selector all, or fewer candidates than
	// the cap) skips the selector sort: everyone eligible is returned, since
	// preference can't change who is hit when nobody is dropped.
	if sel == skills.SelectorAll || maxTargets <= 0 || len(candidates) <= maxTargets {
		return candidates
	}

	sortBySelector(candidates, casterPos, sel)
	return candidates[:maxTargets]
}

// stableOrderKey is a collider's deterministic sort key: the entity ID behind
// its shape (creation order, unique). Colliders without an entity UserData
// (statics — never on aura layers today) key as 0 and keep an arbitrary
// relative order among themselves.
func stableOrderKey(c phy.Collider) uint64 {
	if e, ok := c.Shape().UserData.(model.BasicEntity); ok {
		return e.Basic().ID()
	}
	return 0
}

// sortBySelector orders candidates so the first maxTargets are the ones the
// selector prefers. Ties keep the deterministic base order (entity ID) the
// caller established — the sorts are stable.
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
