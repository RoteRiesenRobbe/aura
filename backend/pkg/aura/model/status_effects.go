package model

import "github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"

// Yielded / Freezing / Starving were the Berryhunter survival vestiges — no
// emitter on either side. They are gone from the wire enum too (§28 Chunk 3),
// leaving gaps 1-3 so no survivor ever renumbers.
const (
	StatusEffectDamaged        = StatusEffect(AuraApi.StatusEffectDamaged)
	StatusEffectRegenerating   = StatusEffect(AuraApi.StatusEffectRegenerating)
	StatusEffectDamagedAmbient = StatusEffect(AuraApi.StatusEffectDamagedAmbient)
	StatusEffectBurstFired     = StatusEffect(AuraApi.StatusEffectBurstFired)
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

// Clear drops every effect. It runs for every status entity on every tick
// (sys/statuseffects), so it clears the map in place instead of re-making it —
// the re-make was the third-largest allocation site in the idle game loop
// (idle-overload investigation 2026-07-22). Safe because the map never
// escapes: Effects() hands out a copy.
func (s *StatusEffects) Clear() {
	if s.effects == nil {
		s.effects = make(map[StatusEffect]struct{})
		return
	}
	clear(s.effects)
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
// floating-number VFX (roadmap item 11). The values are serialized once per
// tick, then reset at the start of the next tick alongside status effects.
type TickAccumulators interface {
	ResetTickNumbers()
}

// AuraHitStyle is the per-tick aura-hit VFX a damage aura stamps on the target
// it strikes (roadmap item 11 Step 4). The SkillSystem picks the style from
// the source aura's effective tick cadence (slow → discrete slash, fast →
// sustained fire) so the aura circle reads as range, not a hit zone. It is a
// transient wire field (ubyte on Mob/Character), reset every tick on the same
// TickAccumulators lifecycle as the floating numbers.
type AuraHitStyle uint8

const (
	AuraHitStyleNone  AuraHitStyle = 0 // not struck this tick
	AuraHitStyleSlash AuraHitStyle = 1 // slow-tick aura → discrete slash
	AuraHitStyleFire  AuraHitStyle = 2 // fast-tick aura → sustained fire/spark
)

// AuraHitNotifier is the minimal interface the SkillSystem needs at the strike
// site to stamp an AuraHitStyle on a struck target for this tick. Kept separate
// from the Interacter damage path on purpose: the SkillSystem knows the source
// aura's cadence, whereas takeDamage knows the post-mitigation amount (the
// floating damage number). The paired AuraHitStyle() getter lives on the
// Mob/Player entity interfaces, where the codec reads it.
type AuraHitNotifier interface {
	NoteAuraHit(style AuraHitStyle)
}
