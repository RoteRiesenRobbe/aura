package sys

import (
	"log"
	"math"
	"math/rand"
	"time"

	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/minions"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/mob"
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
	model.Factioned
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

	// game serves the spawn effect (mob-depth chunk 1): mob-definition lookup,
	// config, and AddEntity for the summoned mob.
	game model.Game

	// rng feeds the per-hit variance rolls (item 11 Phase 3, decision C4) and
	// the summon-placement direction. Free-running by design — reproducibility
	// only matters in tests, which overwrite it with a seeded source.
	rng *rand.Rand
}

func NewSkillSystem(space *phy.Space, g model.Game) *SkillSystem {
	return &SkillSystem{
		space: space,
		game:  g,
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
	// Acting buff payloads first: dots on this entity deal their due damage
	// (effect foundations Step 2). Pure buff AGING stays on ResetTickNumbers
	// at tick start; acting lives here so the damage lands in the combat
	// slice of the tick, before serialization.
	s.tickDots(e)

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
	if m := model.AuraMaskFor(equip.Def, e.Faction()); collider.Shape().Mask != m {
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
			s.applyHealAura(e, equip.Level, effect, collisions)
		case skills.EffectTypeSlowAura:
			applySlowAura(equip.Def.ID, equip.Level, effect, collisions)
		case skills.EffectTypeResistAura:
			applyResistAura(e, equip.Def.ID, equip.Level, effect, collisions)
		case skills.EffectTypeDotAura:
			applyDotEffect(e, equip.Def.ID, equip.Level, effect, collisions)
		}
	}
}

// dotBuffable is implemented by entities that can carry a damage-over-time
// debuff (players and mobs — the generic buff store).
type dotBuffable interface {
	ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int)
}

// dotCarrier is the entity-side seam the acting site drains each tick.
type dotCarrier interface {
	DueDotHits() []skills.DotHit
}

// applyDotEffect applies the effect's damage-over-time debuff to eligible
// targets; shared by the per-tick dot_aura path (re-application refreshes the
// duration — continuous burn while in range) and the one-shot instant_dot
// cooldown path. Either way the debuff then runs on the target independent
// of the delivery and the caster's presence (skills.Buffs).
func applyDotEffect(e skillEntity, source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	// Owner-level power is frozen into the dot at application time, like the
	// level (mob-depth chunk 1). A world mob's SummonPower is neutral 1.
	hp := effect.Dot.HPAt(level)
	if owned, ok := e.(model.Owned); ok {
		hp *= owned.SummonPower()
	}
	dot := skills.DotBuff{
		HP:       hp,
		Tags:     effect.Dot.Tags,
		Variance: effect.Dot.Variance,
		Interval: effect.Dot.Interval,
		Caster:   e,
	}
	ticks := effect.Dot.DurationTicks()

	// No caster skip, matching the damage path's long-standing semantics
	// (only relevant if content ever sets targetsAllies on a dot).
	eligible := eligibleByTargetFlags[dotBuffable](effect, e.Faction(), 0, false)
	targets := selectTargets(collisions, e.AuraCollider().Position(), effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		c.Shape().UserData.(dotBuffable).ApplyDot(source, dot, ticks)
	}
}

// tickDots deals every dot damage event due on this entity this tick. The
// damage flows through the same Interacter entry points as direct hits, so
// attribution (XP participation, kill credit), damage tags, mitigation,
// floating numbers and death all ride the existing paths. Each event also
// stamps the fire aura-hit VFX — the sustained-burn look; make it
// content-configurable when a non-fire dot ships.
func (s *SkillSystem) tickDots(e skillEntity) {
	carrier, ok := e.(dotCarrier)
	if !ok {
		return
	}
	target, ok := e.(model.Interacter)
	if !ok {
		return
	}
	for _, hit := range carrier.DueDotHits() {
		// Every event rolls its own variance and is mitigated by the
		// target's CURRENT resistances (roll-then-mitigate, per hit).
		damageHP := vitals.RollVariance(hit.HP, hit.Variance, s.rng)
		// An owned summon's dot replays through its owner — checked before
		// the MobEntity case (a totem IS a mob), so burn damage keeps
		// crediting the owner even after the summon is gone. The summon
		// itself rides along as the hit's Source: threat credits it while it
		// lives, and falls back to the owner once it reads dead (chunk 3).
		storedCaster := hit.Caster
		var source model.Combatant
		if owned, ok := storedCaster.(model.Owned); ok && owned.Owner() != nil {
			source, _ = storedCaster.(model.Combatant)
			storedCaster = owned.Owner()
		}
		switch caster := storedCaster.(type) {
		case model.PlayerEntity:
			target.PlayerTouches(caster, model.Damage{HP: damageHP, Tags: hit.Tags, Source: source})
		case model.MobEntity:
			target.MobTouches(caster, mobs.Factors{Damage: damageHP, DamageTags: hit.Tags})
		default:
			continue
		}
		if n, ok := e.(model.AuraHitNotifier); ok {
			n.NoteAuraHit(model.AuraHitStyleFire)
		}
	}
}

// eligibleByTargetFlags builds the standard eligibility predicate shared by
// flag-gated targeted effects (damage_aura/instant_damage, resist_aura): the
// target must be Factioned — players and mobs; structures/resources have no
// allegiance and are reached only through their dedicated paths — with
// same-faction targets gated by targetsAllies and opposing ones by
// targetsEnemies (effect foundations Step 1). The target must also implement
// Capability (the effect's apply interface); skipCaster excludes the caster
// itself (resist auras reach the caster only via targetsSelf). Heal auras
// keep their own predicate — implicit allies with wounded/never-self rules.
func eligibleByTargetFlags[Capability any](effect skills.EffectDef, casterFaction model.Faction, casterID uint64, skipCaster bool) func(phy.Collider) bool {
	return func(c phy.Collider) bool {
		usr := c.Shape().UserData
		if usr == nil {
			return false
		}
		target, ok := usr.(model.Factioned)
		if !ok {
			return false
		}
		if target.Faction() == casterFaction {
			if !effect.TargetsAllies {
				return false
			}
		} else if !effect.TargetsEnemies {
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
// dispatch), mirroring the two legacy damage paths 1:1. An owned summon is
// checked FIRST — it IS a MobEntity, and falling into the mob case would
// silently drop attribution (no XP, no kill credit, no participants): its
// damage routes through PlayerTouches(owner) with the summon's own faction
// and position, scaled by the owner-level power (mob-depth chunk 1).
func applyDamageAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand) {
	if owned, ok := e.(model.Owned); ok && owned.Owner() != nil {
		// The summon rides along as the hit's Source: threat credits the
		// summon itself, XP the owner (mob-depth chunk 3, gotcha #9).
		source, _ := e.(model.Combatant)
		applyPlayerDamageAura(owned.Owner(), source, e.Faction(), e.AuraCollider().Position(), level, effect, collisions, rng, owned.SummonPower())
		return
	}
	switch caster := e.(type) {
	case model.PlayerEntity:
		applyPlayerDamageAura(caster, nil, e.Faction(), e.AuraCollider().Position(), level, effect, collisions, rng, 1)
	case model.MobEntity:
		applyMobDamageAura(caster, e.AuraCollider().Position(), level, effect, collisions, rng)
	}
}

// outputScale is 1 for a direct player cast and the summon's power for an
// owned cast — it multiplies the damage amount only (never CC parameters).
// source is the summon entity on owned casts (threat attribution, chunk 3),
// nil on direct casts — the target then treats the caster as the source.
func applyPlayerDamageAura(caster model.PlayerEntity, source model.Combatant, casterFaction model.Faction, casterPos phy.Vec2f, level int, effect skills.EffectDef, collisions phy.ColliderSet, rng *rand.Rand, outputScale float32) {
	damageHP := effect.Damage.HPAt(level) * outputScale

	// Declarative targeting: the sensor mask pre-filters layers, the faction
	// flags decide per target. targetsAllies=false is the no-friendly-fire
	// rule. No caster skip, matching the damage path's long-standing
	// semantics (heal and resist auras skip self explicitly; damage never
	// did — only relevant if content ever sets targetsAllies on damage).
	eligible := eligibleByTargetFlags[model.Interacter](effect, casterFaction, 0, false)

	style := auraHitStyleFor(effect, level)
	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		// Every hit rolls its own variance (item 11 Phase 3); the target's
		// resistance then multiplies the rolled value (decision C3).
		damage := model.Damage{HP: vitals.RollVariance(damageHP, effect.Damage.Variance, rng), Tags: effect.Damage.Tags, Source: source}
		c.Shape().UserData.(model.Interacter).PlayerTouches(caster, damage)
		noteAuraHit(c, style)
	}
}

// applyMobDamageAura applies a mob's aura to the (mask-filtered) collision set
// via MobTouches. Target discrimination is purely the sensor mask — the
// faction-relative layers plus the placeable layer for targetsStructures —
// NOT eligibleByTargetFlags: structures are unfactioned but must stay
// reachable by mob structure damage. The Factors payload carries both values
// and each target picks the one that applies to it. Selector/cap ride on top.
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

func (s *SkillSystem) applyHealAura(e skillEntity, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	rng := s.rng
	// The self-damage bookkeeping needs player vitals; entities without them
	// (mobs) cannot cast heal auras — skip rather than panic.
	caster, ok := e.(healCaster)
	if !ok {
		return
	}

	healCenterHP := effect.Heal.HPAt(level)
	casterPos := e.AuraCollider().Position()
	casterFaction := e.Faction()
	casterID := e.Basic().ID()
	healedSomeone := false

	// Eligible = a wounded ally (same faction, Step 1) that isn't the caster;
	// the cap then counts only heal-worthy targets (never a slot wasted on a
	// full-health or self entry). The PlayerEntity capability is the vitals
	// access — mob allies need the item-7 vitals abstraction before heals can
	// reach them.
	eligible := func(c phy.Collider) bool {
		usr := c.Shape().UserData
		other, ok := usr.(model.PlayerEntity)
		if !ok {
			return false
		}
		if f, ok := usr.(model.Factioned); !ok || f.Faction() != casterFaction {
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

		// Healer threat (mob-depth chunk 3, §6.3): the actually-healed HP,
		// weighted, lands on every mob in combat with the heal target.
		if healer, ok := e.(model.Combatant); ok {
			s.creditHealerThreat(other.Basic().ID(), healer, float32(vs.Health-before))
		}
	}

	if healedSomeone && !caster.IsGod() {
		selfHP := vitals.HP(effect.Heal.SelfDamageHP)
		vs := caster.VitalSigns()
		vs.Health = vs.Health.Sub(selfHP)
		caster.StatusEffects().Add(model.StatusEffectDamagedAmbient)
	}
}

// healerThreatFactor [PLACEHOLDER] weights healing into threat (§6.3, decided
// 2026-07-10): a landed heal credits the healer with healedHP × factor on
// every mob currently in combat with the heal target.
const healerThreatFactor = 0.5

// threatReceiver is the mob-side crediting seam (concrete *mob.Mob; kept as a
// local interface so fakes can observe the credit in tests).
type threatReceiver interface {
	HasThreat(id uint64) bool
	TargetsEntity(id uint64) bool
	NoteThreat(source model.Combatant, amount float32)
}

// creditHealerThreat lands healer threat (§6.3): every tracked mob in combat
// with the heal target — its threat table holds the healed entity, OR its
// current aggro target IS the healed entity (sensor-acquired combat: a tank
// can hold aggro without ever damaging the mob) — credits the healer. Mobs
// not fighting the target never learn of the heal. Cost is O(entities) per
// heal event, on the heal aura's slow cadence.
func (s *SkillSystem) creditHealerThreat(healedID uint64, healer model.Combatant, healedHP float32) {
	if healedHP <= 0 {
		return
	}
	amount := healedHP * healerThreatFactor
	for _, e := range s.entities {
		if t, ok := e.(threatReceiver); ok && (t.HasThreat(healedID) || t.TargetsEntity(healedID)) {
			t.NoteThreat(healer, amount)
		}
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
	eligible := eligibleByTargetFlags[resistBuffable](effect, e.Faction(), casterID, true)

	targets := selectTargets(collisions, casterPos, effect.Selector, effectiveMaxTargets(effect, level), eligible)
	for _, c := range targets {
		c.Shape().UserData.(resistBuffable).ApplyResist(source, effect.Resist.Tags, factor, ticks)
	}
}

// slowable is implemented by entities whose movement can be slowed by a
// slow_aura (mobs). The slow is transient: it must be re-applied every tick
// the target stays in range, and wears off on its own shortly after (buff
// lifetime = effect tick interval + 1, the aura convention).
type slowable interface {
	ApplySlow(source skills.SkillID, fraction float32, ticks int)
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
		if effect.Type == skills.EffectTypeSpawn {
			if s.spawnSummon(e, es, effect.Spawn) {
				hitAny = true
			}
			continue
		}
		if effect.Type != skills.EffectTypeInstantDamage && effect.Type != skills.EffectTypeInstantDot {
			continue
		}

		radius := skills.Scaled(effect.Radius, effect.RadiusPerLevel, es.Level)
		query := phy.NewCircle(e.AuraCollider().Position(), radius)
		query.Shape().Mask = model.InstantDamageMask(effect, e.Faction())

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
		switch effect.Type {
		case skills.EffectTypeInstantDamage:
			applyDamageAura(e, es.Level, effect, targets, s.rng)
		case skills.EffectTypeInstantDot:
			applyDotEffect(e, es.Def.ID, es.Level, effect, targets)
		}
	}
	return hitAny
}

// Summon placement (mob-depth chunk 1, decision §8.4/6): offset from the
// caster so the spawn is instantly visible (never under the avatar), in a
// random direction, skipping spots blocked by static blockers or the world
// border. All numbers [PLACEHOLDER].
const (
	summonPlacementGap   float32 = 0.3 // clearance between caster and summon bodies
	summonPlacementTries         = 8
)

// spawnSummon fires a spawn effect: builds the referenced mob, aligns it with
// its caster, arms the TTL, applies the two scaling sources (summon-skill
// level → TTL + loadout level; owner player level → bonus HP + power), places
// it offset from the caster and hands it to the game. A spawn always counts
// as a hit — it has no whiff.
func (s *SkillSystem) spawnSummon(e skillEntity, es *skills.EquippedSkill, p *skills.SpawnParams) bool {
	def, err := s.game.Mobs().GetByName(p.MobName)
	if err != nil {
		// Unreachable for loaded content — mobs.RegistryFromFS hard-fails
		// unresolved spawnMob names at boot. Guards direct construction.
		log.Printf("spawn effect: mob %q not found", p.MobName)
		return false
	}

	m := mob.NewMob(def, s.game.Config().MobChaseIntoAuraMargin)
	m.SetFaction(e.Faction())
	m.SetTTLTicks(p.TTLAt(es.Level))
	m.SkillComponent().RaiseLoadoutLevels(es.Level)
	if owner, ok := e.(model.PlayerEntity); ok {
		m.SetOwner(owner)
		ownerLevel := int(owner.Progression().Level)
		if bonus := vitals.HP(p.MaxHealthBonusAt(ownerLevel)); bonus > 0 {
			m.RaiseMaxHealth(bonus)
		}
		m.SetSummonPower(p.PowerAt(ownerLevel))
	}
	m.SetPosition(s.summonPosition(e, m.Radius()))
	s.game.AddEntity(m)
	return true
}

// summonPosition picks the summon's spawn point: up to summonPlacementTries
// random directions on the offset ring (caster radius + summon radius + gap);
// a candidate is blocked when the summon's body would overlap a blocking
// static or poke past the border wall (the InvAABB only intersects circles
// leaving the bounds, so the Border mask doubles as the in-bounds check).
// Everything blocked → the caster's position: visible beats unplaceable.
func (s *SkillSystem) summonPosition(e skillEntity, summonRadius float32) phy.Vec2f {
	casterPos := e.AuraCollider().Position()
	dist := summonRadius + summonPlacementGap
	if ent, ok := e.(model.Entity); ok {
		dist += ent.Radius()
	}

	probe := phy.NewCircle(phy.VEC2F_ZERO, summonRadius)
	probe.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)
	for try := 0; try < summonPlacementTries; try++ {
		angle := s.rng.Float64() * 2 * math.Pi
		offset := phy.Vec2f{X: float32(math.Cos(angle)), Y: float32(math.Sin(angle))}.Mult(dist)
		probe.SetPosition(casterPos.Add(offset))
		if len(s.space.QueryCircleStatics(probe)) == 0 {
			return probe.Position()
		}
	}
	return casterPos
}

// applySlowAura slows every slowable target in range. The sensor mask
// pre-filters layers per the target flags; entities that cannot be slowed
// (players — no ApplySlow) are skipped.
func applySlowAura(source skills.SkillID, level int, effect skills.EffectDef, collisions phy.ColliderSet) {
	fraction := effect.Slow.FractionAt(level)
	if fraction <= 0 {
		return
	}
	if fraction > 1 {
		fraction = 1
	}
	ticks := effectiveTickInterval(effect, level) + 1
	for c := range collisions {
		if target, ok := c.Shape().UserData.(slowable); ok {
			target.ApplySlow(source, fraction, ticks)
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
