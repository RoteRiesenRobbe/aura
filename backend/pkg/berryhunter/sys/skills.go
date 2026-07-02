package sys

import (
	"log"
	"log/slog"

	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
)

// skillEntity is the minimal interface SkillSystem requires.
// Satisfied by PlayerEntity (and later MobEntity) once they expose the methods below.
// VitalSigns/StatusEffects/MaxHealthFactor/IsGod are needed only for heal self-damage.
//
// AuraCollider is the entity's single aura sensor. It returns the concrete
// *phy.Circle (not phy.DynamicCollider) because the SkillSystem resizes it to
// the active skill's EffectiveRadius — there is deliberately no collider per
// equipped skill, since exactly one aura is active at a time.
//
// For this step all tracked entities are players. The type assertion to model.PlayerEntity
// inside applyDamageAura (required by the Interacter API) is transitional — Phase 6 will
// revisit when mobs are also tracked.
type skillEntity interface {
	model.BasicEntity
	SkillComponent() *skills.SkillComponent
	AuraCollider() *phy.Circle
	VitalSigns() *model.PlayerVitalSigns
	StatusEffects() *model.StatusEffects
	MaxHealthFactor() float32
	IsGod() bool
}

// SkillSystem applies active-aura effects for every tracked entity each tick.
// It runs in parallel with the existing hardcoded aura system during Phase 2;
// effects will double until Phase 2.4 removes the old path.
type SkillSystem struct {
	entities []skillEntity
	logTick  int
}

func NewSkillSystem() *SkillSystem {
	return &SkillSystem{}
}

func (*SkillSystem) Priority() int {
	return -65
}

func (s *SkillSystem) New(w *ecs.World) {
	log.Println("SkillSystem nominal")
}

func (s *SkillSystem) AddEntity(e skillEntity) {
	s.entities = append(s.entities, e)
}

func (s *SkillSystem) Update(dt float32) {
	for _, e := range s.entities {
		s.processEntity(e)
	}

	s.logTick++
	if s.logTick >= 30 {
		slog.Debug("[SkillSystem] tick", slog.Int("entities", len(s.entities)))
		s.logTick = 0
	}
}

func (s *SkillSystem) processEntity(e skillEntity) {
	sc := e.SkillComponent()
	slot := sc.ActiveAuraSlot
	if slot < 0 {
		return
	}
	equip := sc.AuraSlots[slot]
	if equip == nil {
		return
	}

	// Keep the single aura sensor sized to the active skill. The SkillSystem
	// runs after physics resolution, so a new radius takes effect on the next
	// tick's collisions — consistent with the accumulator reset on switch,
	// which already defers the first effect application anyway.
	collider := e.AuraCollider()
	if r := equip.EffectiveRadius(); collider.Radius != r {
		collider.SetRadius(r)
	}

	equip.TickAccumulator++

	collisions := collider.Collisions()
	for _, effect := range equip.Def.Effects {
		if equip.TickAccumulator >= effect.TickInterval {
			switch effect.Type {
			case skills.EffectTypeDamageAura:
				applyDamageAura(e, equip.Level, effect, collisions)
			case skills.EffectTypeHealAura:
				applyHealAura(e, equip.Level, effect, collisions)
			}
		}
	}

	// Reset after all effects have been checked for this tick.
	maxInterval := 1
	for _, effect := range equip.Def.Effects {
		if effect.TickInterval > maxInterval {
			maxInterval = effect.TickInterval
		}
	}
	if equip.TickAccumulator >= maxInterval {
		equip.TickAccumulator = 0
	}
}

func applyDamageAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	// PlayerTouches requires a model.PlayerEntity first argument.
	// All tracked entities are players in this phase; revisit in Phase 3 for mobs.
	caster, ok := e.(model.PlayerEntity)
	if !ok {
		return
	}

	fraction := effectDamageFraction(effect, level)

	for c := range collisions {
		usr := c.Shape().UserData
		if usr == nil {
			continue
		}
		if _, isPlayer := usr.(model.PlayerEntity); isPlayer {
			continue // no friendly fire
		}
		r, ok := usr.(model.Interacter)
		if !ok {
			continue
		}
		r.PlayerTouches(caster, fraction)
	}
}

func applyHealAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	healFrac := effectHealFraction(effect, level)
	healedSomeone := false

	for c := range collisions {
		usr := c.Shape().UserData
		if usr == nil {
			continue
		}
		other, ok := usr.(model.PlayerEntity)
		if !ok {
			continue
		}
		if other.Basic().ID() == e.Basic().ID() {
			continue // skip self
		}
		vs := other.VitalSigns()
		if vs.Health == vitals.Max {
			continue
		}
		vs.Health = vs.Health.AddFraction(healFrac)
		healedSomeone = true
	}

	if healedSomeone && !e.IsGod() {
		selfFrac := effect.SelfDamageFraction / e.MaxHealthFactor()
		vs := e.VitalSigns()
		vs.Health = vs.Health.SubFraction(selfFrac)
		e.StatusEffects().Add(model.StatusEffectDamagedAmbient)
	}
}

// effectDamageFraction scales the base damage fraction by skill level.
// Mirrors: config.DamageAuraDamageFraction + (level-1)*config.DamageAuraLevelGainFraction
func effectDamageFraction(e skills.EffectDef, level int) float32 {
	return e.DamageFraction + float32(level-1)*e.DamageFractionPerLevel
}

// effectHealFraction scales the base heal fraction by skill level.
// Mirrors: config.HealAuraHealTickFraction + (level-1)*config.HealAuraLevelGainFraction
func effectHealFraction(e skills.EffectDef, level int) float32 {
	return e.HealFraction + float32(level-1)*e.HealFractionPerLevel
}

func (s *SkillSystem) Remove(e ecs.BasicEntity) {
	idx := minions.FindBasic(func(i int) model.BasicEntity { return s.entities[i] }, len(s.entities), e)
	if idx >= 0 {
		s.entities = append(s.entities[:idx], s.entities[idx+1:]...)
	}
}
