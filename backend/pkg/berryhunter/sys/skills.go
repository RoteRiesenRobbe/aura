package sys

import (
	"log"

	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// skillEntity is the minimal interface SkillSystem requires; players and mobs
// both satisfy it.
//
// AuraCollider is the entity's single aura sensor. It returns the concrete
// *phy.Circle (not phy.DynamicCollider) because the SkillSystem resizes it to
// the active skill's EffectiveRadius and re-derives its collision mask via
// model.AuraMaskFor — there is deliberately no collider per equipped skill,
// since exactly one aura is active at a time.
type skillEntity interface {
	model.BasicEntity
	SkillComponent() *skills.SkillComponent
	AuraCollider() *phy.Circle
}

// healCaster holds the additional capabilities the heal-aura self-damage
// bookkeeping needs. Players satisfy it; mobs do not (no PlayerVitalSigns) —
// a heal effect on an entity without these capabilities is skipped. This is a
// deliberate limitation: mob support behaviors ("move to allied mobs with a
// mob-only heal aura", v1-roadmap.md item 7) will need heal_aura target flags
// plus a vitals abstraction here.
type healCaster interface {
	VitalSigns() *model.PlayerVitalSigns
	StatusEffects() *model.StatusEffects
	MaxHealthFactor() float32
	IsGod() bool
}

// SkillSystem applies active-aura effects for every tracked entity each tick.
type SkillSystem struct {
	entities []skillEntity
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

	// Keep the single aura sensor sized and targeted per the active skill.
	// The SkillSystem runs after physics resolution, so a new radius/mask
	// takes effect on the next tick's collisions — consistent with the
	// accumulator reset on switch, which already defers the first effect
	// application anyway.
	collider := e.AuraCollider()
	if r := equip.EffectiveRadius(); collider.Radius != r {
		collider.SetRadius(r)
	}
	if m := model.AuraMaskFor(equip.Def); collider.Shape().Mask != m {
		collider.Shape().Mask = m
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

// applyDamageAura dispatches on the caster type: player and mob auras use
// different Interacter entry points (PlayerTouches vs. MobTouches double
// dispatch), mirroring the two legacy damage paths 1:1.
func applyDamageAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	switch caster := e.(type) {
	case model.PlayerEntity:
		applyPlayerDamageAura(caster, level, effect, collisions)
	case model.MobEntity:
		applyMobDamageAura(caster, level, effect, collisions)
	}
}

func applyPlayerDamageAura(caster model.PlayerEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	fraction := effectDamageFraction(effect, level)

	for c := range collisions {
		usr := c.Shape().UserData
		if usr == nil {
			continue
		}
		// Declarative targeting: the sensor mask pre-filters layers, the flags
		// decide per target class. targetsPlayers=false is the no-friendly-fire
		// rule; everything non-player (mobs, resources) is gated by targetsMobs.
		if _, isPlayer := usr.(model.PlayerEntity); isPlayer {
			if !effect.TargetsPlayers {
				continue
			}
		} else if !effect.TargetsMobs {
			continue
		}
		r, ok := usr.(model.Interacter)
		if !ok {
			continue
		}
		r.PlayerTouches(caster, fraction)
	}
}

// applyMobDamageAura applies a mob's aura to everything in the (mask-filtered)
// collision set via MobTouches. Target discrimination is purely the sensor
// mask, exactly like the legacy mob damage loop; the Factors payload carries
// both fractions and each target picks the one that applies to it.
func applyMobDamageAura(caster model.MobEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	factors := mobs.Factors{
		DamageFraction:          effectDamageFraction(effect, level),
		StructureDamageFraction: effect.StructureDamageFraction,
	}

	for c := range collisions {
		usr := c.Shape().UserData
		if usr == nil {
			continue
		}
		r, ok := usr.(model.Interacter)
		if !ok {
			continue
		}
		r.MobTouches(caster, factors)
	}
}

func applyHealAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	// The self-damage bookkeeping needs player vitals; entities without them
	// (mobs) cannot cast heal auras — skip rather than panic.
	caster, ok := e.(healCaster)
	if !ok {
		return
	}

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

		// Participation XP (v1-roadmap item 10): a successful heal makes the
		// caster a recent healer of the target for a limited window.
		if healerPE, isPlayer := e.(model.PlayerEntity); isPlayer {
			other.NoteHealedBy(healerPE)
		}
	}

	if healedSomeone && !caster.IsGod() {
		selfFrac := effect.SelfDamageFraction / caster.MaxHealthFactor()
		vs := caster.VitalSigns()
		vs.Health = vs.Health.SubFraction(selfFrac)
		caster.StatusEffects().Add(model.StatusEffectDamagedAmbient)
	}
}

// effectDamageFraction scales the base damage fraction by skill level.
func effectDamageFraction(e skills.EffectDef, level int) float32 {
	return e.DamageFraction + float32(level-1)*e.DamageFractionPerLevel
}

// effectHealFraction scales the base heal fraction by skill level.
func effectHealFraction(e skills.EffectDef, level int) float32 {
	return e.HealFraction + float32(level-1)*e.HealFractionPerLevel
}

func (s *SkillSystem) Remove(e ecs.BasicEntity) {
	idx := minions.FindBasic(func(i int) model.BasicEntity { return s.entities[i] }, len(s.entities), e)
	if idx >= 0 {
		s.entities = append(s.entities[:idx], s.entities[idx+1:]...)
	}
}
