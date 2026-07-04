package model

import "github.com/trichner/berryhunter/pkg/api/BerryhunterApi"

const (
	StatusEffectDamaged        = StatusEffect(BerryhunterApi.StatusEffectDamaged)
	StatusEffectYielded        = StatusEffect(BerryhunterApi.StatusEffectYielded)
	StatusEffectFreezing       = StatusEffect(BerryhunterApi.StatusEffectFreezing)
	StatusEffectStarving       = StatusEffect(BerryhunterApi.StatusEffectStarving)
	StatusEffectRegenerating   = StatusEffect(BerryhunterApi.StatusEffectRegenerating)
	StatusEffectDamagedAmbient = StatusEffect(BerryhunterApi.StatusEffectDamagedAmbient)
	StatusEffectBurstFired     = StatusEffect(BerryhunterApi.StatusEffectBurstFired)
)

type (
	StatusEffect  int
	StatusEffects struct {
		effects map[StatusEffect]struct{}
	}
)

func NewStatusEffects() StatusEffects {
	return StatusEffects{
		effects: make(map[StatusEffect]struct{}),
	}
}

func (s *StatusEffects) Clear() {
	s.effects = make(map[StatusEffect]struct{})
}

func (s *StatusEffects) Add(e StatusEffect) {
	s.effects[e] = struct{}{}
}

func (s *StatusEffects) Remove(e StatusEffect) {
	delete(s.effects, e)
}

func (s *StatusEffects) Effects() []StatusEffect {
	e := make([]StatusEffect, 0, len(s.effects))
	for k := range s.effects {
		e = append(e, k)
	}
	return e
}

type StatusEntity interface {
	StatusEffects() *StatusEffects
}

// TickAccumulators is implemented by entities that accumulate per-tick
// floating-number values (damage taken, heal / XP received) for the client's
// floating-number VFX (v1-roadmap item 11). The values are serialized once per
// tick, then reset at the start of the next tick alongside status effects.
type TickAccumulators interface {
	ResetTickNumbers()
}
