package sys

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Line-of-sight prototype (docs/plan-prototype-aura-los.md): auras and
// instant deliveries do not pass through movement-blocking props. The
// occluder definition lives in model.LoSOccluderMask, shared with mob AI.

// losVisible reports whether target collider c has a clear sightline from
// casterPos (D1: binary, center to center).
func (s *SkillSystem) losVisible(casterPos phy.Vec2f, c phy.Collider) bool {
	return !s.space.LineBlockedByStatics(casterPos, c.Position(), model.LoSOccluderMask)
}

// losFilter narrows set to the colliders with a clear sightline from
// casterPos. It builds a NEW set on purpose: the input is usually the
// sensor's live per-tick collision map, which other systems read after the
// SkillSystem (D4: the filter runs before selectTargets, so a blocked
// candidate never consumes a maxTargets slot).
func (s *SkillSystem) losFilter(casterPos phy.Vec2f, set phy.ColliderSet) phy.ColliderSet {
	if len(set) == 0 {
		return set
	}
	visible := make(phy.ColliderSet, len(set))
	for c := range set {
		if s.losVisible(casterPos, c) {
			visible[c] = struct{}{}
		}
	}
	return visible
}
