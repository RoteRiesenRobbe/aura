package sys

import (
	"log"
	"math/rand"
	"time"

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
// mob-only heal aura", roadmap.md item 7) will need heal_aura target flags
// plus a vitals abstraction here.
type healCaster interface {
	VitalSigns() *model.PlayerVitalSigns
	StatusEffects() *model.StatusEffects
	MaxHealthFactor() float32
	MaxHealth() vitals.VitalSign
	IsGod() bool
}

// SkillSystem applies active-aura effects and cooldown-skill bursts for every
// tracked entity each tick. The space reference serves the one-shot
// instant_damage queries (resolved Open Question 3: temporary circle, query
// against the last broadphase, drop — never added to the space).
type SkillSystem struct {
	entities []skillEntity
	space    *phy.Space

	// rng feeds the per-hit variance rolls (item 11 Phase 3, decision C4).
	// Free-running by design — reproducibility only matters in tests, which
	// overwrite it with a seeded source.
	rng *rand.Rand
}

func NewSkillSystem(space *phy.Space) *SkillSystem {
	return &SkillSystem{
		space: space,
		rng:   rand.New(rand.NewSource(time.Now().UnixNano())),
	}
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
	s.processCooldowns(e, sc)

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

	// The accumulator counts ticks since the aura became active and grows
	// monotonically (equip and SetActiveAura reset it to 0). Each effect fires
	// independently whenever the count is a multiple of its own interval, so a
	// multi-effect aura (e.g. PaladinAura's fast damage + slow heal) runs each
	// effect on its own cadence — unlike a shared max-interval reset, this is
	// correct regardless of how the intervals relate.
	equip.TickAccumulator++

	collisions := collider.Collisions()
	for _, effect := range equip.Def.Effects {
		if equip.TickAccumulator%effectiveTickInterval(effect, equip.Level) != 0 {
			continue
		}
		switch effect.Type {
		case skills.EffectTypeDamageAura:
			applyDamageAura(e, equip.Level, effect, collisions, s.rng)
		case skills.EffectTypeHealAura:
			applyHealAura(e, equip.Level, effect, collisions, s.rng)
		case skills.EffectTypeSlowAura:
			applySlowAura(equip.Level, effect, collisions)
		case skills.EffectTypeResistAura:
			applyResistAura(e, equip.Def.ID, equip.Level, effect, collisions)
		}
	}
}

// eligibleByTargetFlags builds the standard eligibility predicate shared by
// flag-gated targeted effects (damage_aura/instant_damage, resist_aura): a
// player target is gated by targetsPlayers, every non-player target by
// targetsMobs, and the target must implement Capability (the effect's apply
// interface). skipCaster excludes the caster itself (resist auras reach the
// caster only via targetsSelf). Heal auras keep their own predicate — they
// follow different rules (wounded allies only, never self), not these.
func eligibleByTargetFlags[Capability any](effect skills.EffectDef, casterID uint64, skipCaster bool) func(phy.Collider) bool {
	return func(c phy.Collider) bool {
		usr := c.Shape().UserData
		if usr == nil {
			return false
		}
		if _, isPlayer := usr.(model.PlayerEntity); isPlayer {
			if !effect.TargetsPlayers {
				return false
			}
		} else if !effect.TargetsMobs {
			return false
		}
		if _, ok := usr.(Capability); !ok {
			return false
		}
		if skipCaster {
			if be, ok := usr.(model.BasicEntity); ok && be.Basic().ID() == casterID {
				return false
			}
		}
		return true
	}
}

// applyDamageAura dispatches on the caster type: player and mob auras use
// different Interacter entry points (PlayerTouches vs. MobTouches double
// dispatch), mirroring the two legacy damage paths 1:1.
func applyDamageAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) {
	switch caster := e.(type) {
	case model.PlayerEntity:
		applyPlayerDamageAura(caster, e.AuraCollider().Position(), level, effect, collisions, rng)
	case model.MobEntity:
		applyMobDamageAura(caster, e.AuraCollider().Position(), level, effect, collisions, rng)
	}
}

func applyPlayerDamageAura(caster model.PlayerEntity, casterPos phy.Vec2f, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) {
	damageHP := effect.Damage.HPAt(level)

	// Declarative targeting: the sensor mask pre-filters layers, the flags
	// decide per target class. targetsPlayers=false is the no-friendly-fire
	// rule; everything non-player (mobs, resources) is gated by targetsMobs.
	// No caster skip, matching the damage path's long-standing semantics
	// (heal and resist auras skip self explicitly; damage never did — only
	// relevant if player content ever sets targetsPlayers).
	eligible := eligibleByTargetFlags[model.Interacter](effect, 0, false)

	style := auraHitStyleFor(effect, level)
	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		// Every hit rolls its own variance (item 11 Phase 3); the target's
		// resistance then multiplies the rolled value (decision C3).
		damage := model.Damage{HP: vitals.RollVariance(damageHP, effect.Damage.Variance, rng), Tags: effect.Damage.Tags}
		c.Shape().UserData.(model.Interacter).PlayerTouches(caster, damage)
		noteAuraHit(c, style)
	}
}

// applyMobDamageAura applies a mob's aura to the (mask-filtered) collision set
// via MobTouches. Target discrimination is purely the sensor mask, exactly like
// the legacy mob damage loop; the Factors payload carries both fractions and
// each target picks the one that applies to it. Selector/cap ride on top.
func applyMobDamageAura(caster model.MobEntity, casterPos phy.Vec2f, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) {
	damageHP := effect.Damage.HPAt(level)
	factors := mobs.Factors{
		DamageTags:              effect.Damage.Tags,
		StructureDamageFraction: effect.Damage.StructureDamageFraction,
	}

	eligible := func(c phy.Collider) bool {
		_, ok := c.Shape().UserData.(model.Interacter)
		return ok
	}

	style := auraHitStyleFor(effect, level)
	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		// Per-hit variance roll, same as the player path (item 11 Phase 3).
		factors.Damage = vitals.RollVariance(damageHP, effect.Damage.Variance, rng)
		c.Shape().UserData.(model.Interacter).MobTouches(caster, factors)
		noteAuraHit(c, style)
	}
}

// noteAuraHit stamps the per-tick aura-hit VFX style on a struck target if it
// supports it (item 11 Step 4). Targets that are not AuraHitNotifiers (e.g.
// resources/structures) simply get no hit VFX.
func noteAuraHit(c phy.Collider, style model.AuraHitStyle) {
	if n, ok := c.Shape().UserData.(model.AuraHitNotifier); ok {
		n.NoteAuraHit(style)
	}
}

func applyHealAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) {
	// The self-damage bookkeeping needs player vitals; entities without them
	// (mobs) cannot cast heal auras — skip rather than panic.
	caster, ok := e.(healCaster)
	if !ok {
		return
	}

	healCenterHP := effect.Heal.HPAt(level)
	casterPos := e.AuraCollider().Position()
	casterID := e.Basic().ID()
	healedSomeone := false

	// Eligible = a wounded ally that isn't the caster; the cap then counts only
	// heal-worthy targets (never a slot wasted on a full-health or self entry).
	eligible := func(c phy.Collider) bool {
		other, ok := c.Shape().UserData.(model.PlayerEntity)
		if !ok {
			return false
		}
		if other.Basic().ID() == casterID {
			return false // skip self
		}
		return other.VitalSigns().Health != other.MaxHealth()
	}

	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		// Heals roll per hit like damage does (item 11 Phase 3, decision C1).
		healHP := vitals.HP(vitals.RollVariance(healCenterHP, effect.Heal.Variance, rng))
		other := c.Shape().UserData.(model.PlayerEntity)
		vs := other.VitalSigns()
		before := vs.Health
		vs.Health = vs.Health.AddCapped(healHP, other.MaxHealth())
		other.NoteHealReceived(vs.Health - before) // floating heal number (item 11)
		healedSomeone = true

		// Participation XP (roadmap item 10): a successful heal makes the
		// caster a recent healer of the target for a limited window.
		if healerPE, isPlayer := e.(model.PlayerEntity); isPlayer {
			other.NoteHealedBy(healerPE)
		}
	}

	if healedSomeone && !caster.IsGod() {
		selfHP := vitals.HP(effect.Heal.SelfDamageHP)
		vs := caster.VitalSigns()
		vs.Health = vs.Health.Sub(selfHP)
		caster.StatusEffects().Add(model.StatusEffectDamagedAmbient)
	}
}

// resistBuffable is implemented by entities that can receive transient
// tag-resistance buffs from a resist_aura (mobs and players; item 11 Phase 2).
type resistBuffable interface {
	ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int)
}

// applyResistAura grants the effect's tag-resistance buff to eligible targets
// in range — and, with targetsSelf, to the caster (outside the target cap).
// The buff lifetime is the effect's tick interval + 1, so it always survives
// to the next re-application regardless of cadence, and fades roughly one
// aura cycle after leaving the aura (see skills.ResistBuffs).
func applyResistAura(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	factor := effect.Resist.FactorAt(level)
	ticks := effectiveTickInterval(effect, level) + 1

	if effect.Resist.TargetsSelf {
		if self, ok := e.(resistBuffable); ok {
			self.ApplyResist(source, effect.Resist.Tags, factor, ticks)
		}
	}

	casterPos := e.AuraCollider().Position()
	casterID := e.Basic().ID()

	// The caster is never part of the in-range set (targetsSelf above is the
	// only self path).
	eligible := eligibleByTargetFlags[resistBuffable](effect, casterID, true)

	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		c.Shape().UserData.(resistBuffable).ApplyResist(source, effect.Resist.Tags, factor, ticks)
	}
}

// slowable is implemented by entities whose movement can be slowed by a
// slow_aura (mobs). The slow is transient: it must be re-applied every tick
// the target stays in range, and wears off on its own shortly after.
type slowable interface {
	ApplySlow(fraction float32)
}

// processCooldowns ticks all cooldown slots down and fires cooldown skills:
// players fire on explicit activation requests (input path), mobs fire as
// soon as a cooldown is ready and a valid target is in range (decided 8.2 —
// simple AI; smarter timing belongs to boss scripting later).
func (s *SkillSystem) processCooldowns(e skillEntity, sc *skills.SkillComponent) {
	// Status effects are cleared and re-added every tick; keep the burst VFX
	// flag alive while any cooldown fired within the last burstVFXTicks.
	defer func() {
		se, ok := e.(model.StatusEntity)
		if !ok {
			return
		}
		for _, es := range sc.CooldownSlots {
			if es != nil && es.CdTicks > 0 && es.EffectiveCooldownTicks()-es.CdTicks < skills.BurstVFXTicks {
				se.StatusEffects().Add(model.StatusEffectBurstFired)
				return
			}
		}
	}()

	for _, es := range sc.CooldownSlots {
		if es != nil && es.CdTicks > 0 {
			es.CdTicks--
		}
	}

	if _, isMob := e.(model.MobEntity); isMob {
		for _, es := range sc.CooldownSlots {
			if es == nil || es.CdTicks > 0 {
				continue
			}
			// Only consume the cooldown when the burst actually hit something,
			// so the mob keeps it ready until a target wanders into range.
			if s.fireCooldown(e, es) {
				es.CdTicks = es.EffectiveCooldownTicks()
			}
		}
		return
	}

	// Player path: explicit activations only. Firing into thin air consumes
	// the cooldown — aiming the burst is the player's responsibility.
	for _, slot := range sc.PendingCooldowns {
		es := sc.CooldownSlots[slot]
		if es == nil || es.CdTicks > 0 {
			continue
		}
		s.fireCooldown(e, es)
		es.CdTicks = es.EffectiveCooldownTicks()
	}
	sc.PendingCooldowns = sc.PendingCooldowns[:0]
}

// fireCooldown applies a cooldown skill's effects: instant_damage via a
// temporary query circle at the caster's position, self_heal directly on the
// caster. Reports whether anything was affected.
func (s *SkillSystem) fireCooldown(e skillEntity, es *skills.EquippedSkill) bool {
	hitAny := false
	for _, effect := range es.Def.Effects {
		if effect.Type == skills.EffectTypeSelfHeal {
			// Needs player vitals — mobs cannot self-heal (same deliberate
			// limitation as heal_aura casting).
			caster, ok := e.(healCaster)
			if !ok {
				continue
			}
			healHP := vitals.HP(vitals.RollVariance(selfHealHP(effect.SelfHeal, es.Level, caster.MaxHealth()), effect.SelfHeal.Variance, s.rng))
			vs := caster.VitalSigns()
			before := vs.Health
			vs.Health = vs.Health.AddCapped(healHP, caster.MaxHealth())
			// Floating heal number (item 11): the aura path records this via
			// NoteHealReceived; the self-heal cooldown must too. Only players
			// self-heal, so a PlayerEntity is the expected caster.
			if pe, ok := e.(model.PlayerEntity); ok {
				pe.NoteHealReceived(vs.Health - before)
			}
			hitAny = true
			continue
		}
		if effect.Type != skills.EffectTypeInstantDamage {
			continue
		}

		radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, es.Level)
		query := phy.NewCircle(e.AuraCollider().Position(), radius)
		query.Shape().Mask = model.InstantDamageMask(effect)

		hits := s.space.QueryCircle(query)
		targets := make(phy.ColliderSet, len(hits))
		for _, h := range hits {
			// Never hit the caster's own shapes (a self-targeting flag combo
			// would otherwise burst the caster).
			if usr, ok := h.Shape().UserData.(model.BasicEntity); ok && usr.Basic().ID() == e.Basic().ID() {
				continue
			}
			targets[h] = struct{}{}
		}
		if len(targets) == 0 {
			continue
		}
		hitAny = true

		// Same dispatch and target-flag filtering as the per-tick auras —
		// PlayerTouches feeds participation XP, MobTouches the double dispatch.
		applyDamageAura(e, es.Level, effect, targets, s.rng)
	}
	return hitAny
}

// applySlowAura slows every slowable target in range. The sensor mask
// pre-filters layers per the target flags; entities that cannot be slowed
// (players — no ApplySlow) are skipped.
func applySlowAura(level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	fraction := effect.Slow.FractionAt(level)
	if fraction <= 0 {
		return
	}
	if fraction > 1 {
		fraction = 1
	}
	for c := range collisions {
		if target, ok := c.Shape().UserData.(slowable); ok {
			target.ApplySlow(fraction)
		}
	}
}

// selfHealHP is the self_heal center amount in HP (pre-variance-roll): a
// fraction of the caster's max HP when FractionOfMax is set (the heal
// cooldown scales with max HP), otherwise the flat HealHP. The fraction grows
// by FractionOfMaxPerLevel (absolute) per level.
func selfHealHP(p *skills.SelfHealParams, level int, maxHP vitals.VitalSign) float32 {
	if p.FractionOfMax > 0 {
		frac := skills.Scaled(p.FractionOfMax, p.FractionOfMaxPerLevel, level)
		return frac * float32(maxHP)
	}
	return skills.Scaled(p.HealHP, p.HealHPPerLevel, level)
}

func (s *SkillSystem) Remove(e ecs.BasicEntity) {
	idx := minions.FindBasic(func(i int) model.BasicEntity { return s.entities[i] }, len(s.entities), e)
	if idx >= 0 {
		s.entities = append(s.entities[:idx], s.entities[idx+1:]...)
	}
}
