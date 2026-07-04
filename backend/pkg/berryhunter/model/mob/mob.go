package mob

import (
	"log"
	"math/rand"

	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
	"github.com/trichner/berryhunter/pkg/berryhunter/gen"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/constant"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

var _ = model.MobEntity(&Mob{})

var types = func() map[string]model.EntityType {
	t := map[string]model.EntityType{}
	for id, name := range BerryhunterApi.EnumNamesEntityType {
		t[name] = model.EntityType(id)
	}
	return t
}()

func NewMob(d *mobs.MobDefinition, rndPos bool, radius float32, chaseIntoAuraMargin float32) *Mob {
	entityType, ok := types[d.Name]
	if !ok {
		log.Fatalf("Mob type not found: %d/%s", d.ID, d.Name)
	}

	mobBody := phy.NewCircle(phy.VEC2F_ZERO, d.Body.Radius)
	if d.Body.CollisionLayer <= 0 {
		mobBody.Shape().Layer = int(model.LayerViewportCollision | model.LayerActionCollision)
	} else {
		mobBody.Shape().Layer = d.Body.CollisionLayer
	}
	if d.Body.CollisionMask <= 0 {
		mobBody.Shape().Mask = int(model.LayerMobStaticCollision | model.LayerBorderCollision)
	} else {
		mobBody.Shape().Mask = d.Body.CollisionMask
	}

	// Skill loadout: equip every declared skill into consecutive slots of its
	// category (the whole loadout is available so future AI/boss scripts can
	// switch), first aura slot starts active. Mobs have no spellbook.
	sc := skills.NewSkillComponent(false)
	auraCount, passiveCount, cooldownCount := 0, 0, 0
	for _, s := range d.Skills {
		switch s.Def.Category {
		case skills.SkillCategoryPassive:
			if passiveCount >= skills.MaxPassiveSlots {
				log.Printf("mob %s declares more passives than slots (%d); ignoring the rest", d.Name, skills.MaxPassiveSlots)
				continue
			}
			sc.EquipPassive(passiveCount, s.Def, s.Level)
			passiveCount++
		case skills.SkillCategoryActiveAura:
			if auraCount >= skills.MaxAuraSlots {
				log.Printf("mob %s declares more auras than slots (%d); ignoring the rest", d.Name, skills.MaxAuraSlots)
				continue
			}
			sc.EquipAura(auraCount, s.Def, s.Level)
			auraCount++
		case skills.SkillCategoryCooldown:
			if cooldownCount >= skills.MaxCooldownSlots {
				log.Printf("mob %s declares more cooldowns than slots (%d); ignoring the rest", d.Name, skills.MaxCooldownSlots)
				continue
			}
			// Mob AI fires ready cooldowns as soon as a target is in range.
			sc.EquipCooldown(cooldownCount, s.Def, s.Level)
			cooldownCount++
		default:
			log.Printf("mob %s declares skill %s of an unsupported category; ignored", d.Name, s.Def.Name)
		}
	}
	if auraCount > 0 {
		sc.SetActiveAura(0)
	}

	// The single aura sensor. Initial radius/mask come from the active skill
	// so aggro stop distance and the first tick are correct from spawn;
	// SkillSystem re-derives both per tick (aura switching stays possible).
	var auraRadius float32
	auraMask := int(model.LayerNoneCollision)
	if active := sc.AuraSlots[0]; sc.ActiveAuraSlot == 0 && active != nil {
		auraRadius = active.EffectiveRadius()
		auraMask = model.AuraMaskFor(active.Def)
	}
	aura := phy.NewCircle(phy.VEC2F_ZERO, auraRadius)
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = auraMask
	aura.Shape().IsSensor = true

	// AggroRadius is validated > 0 at definition load time.
	aggroAura := phy.NewCircle(phy.VEC2F_ZERO, d.Body.AggroRadius)
	aggroAura.Shape().Layer = int(model.LayerNoneCollision)
	aggroAura.Shape().Mask = int(model.LayerPlayerCollision)
	aggroAura.Shape().IsSensor = true

	base := model.NewBaseEntity(mobBody, entityType)
	rnd := rand.New(rand.NewSource(int64(base.Basic().ID())))
	m := &Mob{
		BaseEntity:       base,
		rand:             rnd,
		heading:          phy.Vec2f{-1, 0},
		health:           vitals.Max,
		definition:       d,
		skills:           sc,
		aura:             aura,
		aggroAura:        aggroAura,
		spawnPosition:    phy.VEC2F_ZERO,
		spawnInitialized: false,
		// TODO use walkingSpeedPerTick from global config
		velocity:            0.055 * d.Factors.Speed,
		chaseIntoAuraMargin: chaseIntoAuraMargin,
		statusEffects:       model.NewStatusEffects(),
	}
	if m.chaseIntoAuraMargin <= 0 {
		m.chaseIntoAuraMargin = 0.05
	}
	m.Body.Shape().UserData = m
	if rndPos {
		m.SetPosition(gen.NewRandomPos(radius))
		m.SetAngle(0)
	}
	return m
}

type Mob struct {
	model.BaseEntity

	definition *mobs.MobDefinition

	health  vitals.VitalSign
	heading phy.Vec2f
	rand    *rand.Rand

	skills    *skills.SkillComponent
	aura      *phy.Circle
	aggroAura *phy.Circle

	velocity         float32
	slowFraction     float32 // transient slow_aura debuff (see ApplySlow)
	slowTicks        int
	aggroTarget      model.PlayerEntity
	spawnPosition    phy.Vec2f
	spawnInitialized bool

	statusEffects       model.StatusEffects
	deathRewardGiven    bool
	chaseIntoAuraMargin float32

	// damageTaken accumulates health lost this tick (VitalSign units) for the
	// floating damage number (v1-roadmap item 11); reset every tick.
	damageTaken vitals.VitalSign

	// auraHitStyle is the aura-hit VFX a damage aura stamped on this mob this
	// tick (item 11 Step 4); reset every tick alongside damageTaken.
	auraHitStyle model.AuraHitStyle

	// combat participants for the death rewards (v1-roadmap item 10),
	// keyed by entity ID; cleared when the mob fully regenerates out of
	// combat (combat reset). Lazily initialized by noteParticipant.
	participants map[uint64]model.PlayerEntity
}

func (m *Mob) StatusEffects() *model.StatusEffects {
	return &m.statusEffects
}

func (m *Mob) Bodies() model.Bodies {
	b := m.BaseEntity.Bodies()
	return append(b, m.aura, m.aggroAura)
}

// BurstRadius feeds the Mob.burst_radius wire field (burst ring VFX).
func (m *Mob) BurstRadius() float32 {
	return m.skills.BurstRadius(skills.BurstVFXTicks)
}

func (m *Mob) SkillComponent() *skills.SkillComponent {
	return m.skills
}

func (m *Mob) AuraCollider() *phy.Circle {
	return m.aura
}

func (m *Mob) MobID() mobs.MobID {
	return m.definition.ID
}

func (m *Mob) MobDefinition() *mobs.MobDefinition {
	return m.definition
}

func (m *Mob) Update(dt float32) bool {
	// Death check before anything else — in particular before out-of-combat
	// regeneration, which would otherwise revive a 0-HP mob that has no aggro
	// target (the former zombie bug: revived with deathRewardGiven latched,
	// never granting XP or drops again).
	if m.health == 0 {
		return false
	}

	// Slow debuffs are transient: the SkillSystem re-applies them each tick
	// the mob stays inside a slow aura; otherwise they wear off here.
	if m.slowTicks > 0 {
		m.slowTicks--
	}

	// Aura damage is applied by the SkillSystem (Phase 6.1); Update only
	// handles aggro, movement, regeneration and death.

	if m.aggroTarget == nil {
		m.aggroTarget = m.findAggroTarget()
	}

	if m.aggroTarget != nil && m.shouldLoseAggro() {
		m.aggroTarget = nil
	}

	if m.aggroTarget != nil {
		if m.shouldApproachAggroTarget() {
			m.moveTowards(m.aggroTarget.Position())
		}
	} else {
		if m.spawnInitialized {
			m.moveTowards(m.spawnPosition)
		}
		// Heal to full in ~2 seconds while out of combat.
		if m.health < vitals.Max {
			m.health = m.health.AddFraction(1.0 / (2 * constant.TicksPerSecond))
		}
		// Back at full health with no aggro = combat over; earlier
		// contributors no longer count as participants for the next fight.
		if m.health == vitals.Max && len(m.participants) > 0 {
			m.participants = nil
		}
	}

	return m.health > 0
}

func (m *Mob) shouldApproachAggroTarget() bool {
	if m.aggroTarget == nil {
		return false
	}

	// Stop once target is already within damage aura, minus a tiny margin.
	// Include player radius because collision is shape-vs-shape.
	stopDistance := m.aura.Radius + m.aggroTarget.Radius() - m.chaseIntoAuraMargin
	if stopDistance < 0 {
		stopDistance = 0
	}
	return m.Position().Sub(m.aggroTarget.Position()).Abs() > stopDistance
}

func (m *Mob) SetPosition(p phy.Vec2f) {
	if !m.spawnInitialized {
		m.spawnPosition = p
		m.spawnInitialized = true
		m.aggroAura.SetPosition(p)
	}
	m.Body.SetPosition(p)
	m.aura.SetPosition(p)
}

func (m *Mob) Angle() float32 {
	// FIXME the angle has to be set when the position is updated
	// => That's where you're wrong kiddo. Vector arithmetic ftw!
	return phy.Vec2f{-1, 0}.AngleBetween(m.heading)
}

func (m *Mob) SetAngle(a float32) {
	m.heading = phy.NewRotMat2f(a).Mult(phy.Vec2f{-1, 0})
}

// ApplySlow slows the mob's movement by the given fraction for the next two
// ticks (SkillSystem runs after mob movement, so the debuff needs to survive
// exactly one movement step; re-application keeps it alive). Stronger slows
// win over weaker ones.
func (m *Mob) ApplySlow(fraction float32) {
	if m.slowTicks == 0 || fraction > m.slowFraction {
		m.slowFraction = fraction
	}
	m.slowTicks = 2
}

func (m *Mob) moveTowards(target phy.Vec2f) {
	if m.velocity <= 0 {
		return
	}

	current := m.Position()
	delta := target.Sub(current)
	distance := delta.Abs()
	if distance < 1e-4 {
		return
	}

	step := m.velocity
	if m.slowTicks > 0 {
		step *= 1 - m.slowFraction
	}
	if distance < step {
		step = distance
	}

	next := current.Add(delta.Div(distance).Mult(step))
	m.SetPosition(next)
}

func (m *Mob) findAggroTarget() model.PlayerEntity {
	var nearest model.PlayerEntity
	bestDistance := float32(0)

	for c := range m.aggroAura.Collisions() {
		usr := c.Shape().UserData
		p, ok := usr.(model.PlayerEntity)
		if !ok {
			continue
		}
		if p.VitalSigns().Health == 0 {
			continue
		}
		d := p.Position().Sub(m.Position()).AbsSq()
		if nearest == nil || d < bestDistance {
			nearest = p
			bestDistance = d
		}
	}

	return nearest
}

func (m *Mob) shouldLoseAggro() bool {
	if m.aggroTarget == nil || !m.spawnInitialized {
		return true
	}
	if m.aggroTarget.VitalSigns().Health == 0 {
		return true
	}
	// Lose aggro only after the mob itself has left its fixed aggro territory.
	return m.Position().Sub(m.spawnPosition).Abs() > m.aggroAura.Radius
}

func (m *Mob) Health() vitals.VitalSign {
	return m.health
}

// HealthRatio is the current/max health fraction (0..1), read by the
// lowest_health aura selector (v1-roadmap.md item 11).
func (m *Mob) HealthRatio() float32 {
	return m.health.Fraction()
}

func (m *Mob) takeDamage(damage float32, s model.StatusEffect) {
	vulnerability := m.definition.Factors.Vulnerability
	if vulnerability == 0 {
		vulnerability = 1
	}

	dmgFraction := damage * vulnerability
	if dmgFraction > 0 {
		before := m.health
		m.health = m.health.SubFraction(dmgFraction)
		m.damageTaken += before - m.health // actual loss after clamping at 0
		m.StatusEffects().Add(s)
	}
}

// DamageTaken is the health lost this tick (VitalSign units); floating damage
// number source (v1-roadmap item 11).
func (m *Mob) DamageTaken() vitals.VitalSign {
	return m.damageTaken
}

// AuraHitStyle is the aura-hit VFX stamped on this mob this tick (item 11
// Step 4); serialized as the mob's aura_hit_style wire field.
func (m *Mob) AuraHitStyle() model.AuraHitStyle {
	return m.auraHitStyle
}

// NoteAuraHit records the aura-hit VFX style for this tick; called by the
// SkillSystem when a damage aura strikes this mob.
func (m *Mob) NoteAuraHit(style model.AuraHitStyle) {
	m.auraHitStyle = style
}

// ResetTickNumbers clears the per-tick floating-number accumulators; called by
// the StatusEffectsSystem at the start of each tick.
func (m *Mob) ResetTickNumbers() {
	m.damageTaken = 0
	m.auraHitStyle = model.AuraHitStyleNone
}

func (m *Mob) MobTouches(e model.MobEntity, factors mobs.Factors) {
	m.takeDamage(factors.DamageFraction, model.StatusEffectDamagedAmbient)
}

func (m *Mob) PlayerTouches(p model.PlayerEntity, damageFraction float32) {
	m.noteParticipant(p)
	m.takeDamage(damageFraction, model.StatusEffectDamagedAmbient)
	m.tryGrantKillRewards()
}

// noteParticipant records a damage contributor for the death rewards.
func (m *Mob) noteParticipant(p model.PlayerEntity) {
	if m.participants == nil {
		m.participants = make(map[uint64]model.PlayerEntity)
	}
	m.participants[p.Basic().ID()] = p
}

// tryGrantKillRewards distributes the death rewards once (v1-roadmap item 10):
// every combat participant — damage contributors plus their recent healers —
// receives the full XP amount; drops go to the last toucher only (the item
// system is scheduled for removal, so no investment there).
func (m *Mob) tryGrantKillRewards() {
	if m.health > 0 || m.deathRewardGiven {
		return
	}
	m.deathRewardGiven = true

	xp := uint64(m.definition.Factors.Experience)
	rewarded := make(map[uint64]bool, len(m.participants))
	for id, p := range m.participants {
		if !rewarded[id] {
			rewarded[id] = true
			m.rewardPlayer(p, xp)
		}
		for _, healer := range p.RecentHealers() {
			hid := healer.Basic().ID()
			if !rewarded[hid] {
				rewarded[hid] = true
				m.rewardPlayer(healer, xp)
			}
		}
	}
}

// rewardPlayer grants one participant their death rewards: the full XP amount
// plus an independent roll on every declared kill unlock (Phase 6.2, unlock
// source #2). Discovery is idempotent; the client-side spellbook diff turns a
// fresh unlock into the glow animation with no extra wire event.
func (m *Mob) rewardPlayer(p model.PlayerEntity, xp uint64) {
	p.AddExperience(xp)
	for _, u := range m.definition.Unlocks {
		if m.rand.Float32() < u.Chance {
			p.SkillComponent().Discover(u.Skill.ID)
		}
	}
	// A kill-drop discovery can newly satisfy a recipe (Phase 9).
	p.ApplyRecipeCascade()
}
