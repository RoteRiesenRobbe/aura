package mob

import (
	"log"
	"math/rand"

	"github.com/trichner/berryhunter/pkg/api/BerryhunterApi"
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

func NewMob(d *mobs.MobDefinition, chaseIntoAuraMargin float32) *Mob {
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
		// FactionHostile literal: the Mob struct (with its faction field)
		// is only constructed below; mobs always spawn hostile.
		auraMask = model.AuraMaskFor(active.Def, model.FactionHostile)
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

	// Absolute HP pool (item 11 Phase 1). A definition without maxHealth falls
	// back to a default so directly-constructed mobs (tests) are never born dead.
	maxHealth := vitals.VitalSign(d.Factors.MaxHealth)
	if maxHealth == 0 {
		maxHealth = defaultMobMaxHealth
	}
	// Spawn HP roll (item 11 Phase 3): variance is a percentage band around the
	// authored pool, fixed for the mob's lifetime. vitals.HP's min-1 keeps even
	// a 1-HP base alive.
	if v := d.Factors.MaxHealthVariance; v > 0 {
		maxHealth = vitals.VitalSign(vitals.HP(vitals.RollVariance(float32(maxHealth), v, rnd)))
	}
	m := &Mob{
		BaseEntity:       base,
		rand:             rnd,
		heading:          phy.Vec2f{-1, 0},
		health:           maxHealth,
		maxHealth:        maxHealth,
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
		// Explicit: FactionHostile is not the zero value (FactionAligned is,
		// so players need no stored field).
		faction: model.FactionHostile,
	}
	if m.chaseIntoAuraMargin <= 0 {
		m.chaseIntoAuraMargin = 0.05
	}
	m.Body.Shape().UserData = m
	return m
}

// defaultMobMaxHealth is the fallback HP pool for a mob whose definition omits
// factors.maxHealth (item 11 Phase 1). All shipped mobs set an explicit value;
// this guards direct construction (tests) from a 0-HP (instantly dead) mob.
const defaultMobMaxHealth vitals.VitalSign = 100

type Mob struct {
	model.BaseEntity

	definition *mobs.MobDefinition

	health    vitals.VitalSign
	maxHealth vitals.VitalSign
	heading   phy.Vec2f
	rand      *rand.Rand

	skills    *skills.SkillComponent
	aura      *phy.Circle
	aggroAura *phy.Circle

	velocity         float32
	buffs            skills.Buffs // transient status-effect store: resist/slow/dot (effect foundations Step 2)
	aggroTarget      model.PlayerEntity
	spawnPosition    phy.Vec2f
	spawnInitialized bool

	statusEffects       model.StatusEffects
	deathRewardGiven    bool
	chaseIntoAuraMargin float32

	// faction is the mob's allegiance (plan-effect-foundations F8): hostile by
	// default; future content (charm, player-owned summons) flips it at runtime.
	faction model.Faction

	// Spawned-entity lifecycle (mob-depth chunk 1). owner is the summoning
	// player — nil for world mobs; the ref may go stale on owner death
	// (accepted, §8.4/2). ttlTicks counts down in Update (0 = no TTL);
	// expiry reports death through the normal removal path, granting no kill
	// rewards. summonPower is the owner-level output multiplier (see
	// model.Owned); 0 means "unset" and reads as neutral 1.
	owner       model.PlayerEntity
	ttlTicks    int
	summonPower float32

	// damageTaken accumulates health lost this tick (VitalSign units) for the
	// floating damage number (roadmap item 11); reset every tick.
	damageTaken vitals.VitalSign

	// auraHitStyle is the aura-hit VFX a damage aura stamped on this mob this
	// tick (item 11 Step 4); reset every tick alongside damageTaken.
	auraHitStyle model.AuraHitStyle

	// combat participants for the death rewards (roadmap item 10),
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

// Faction is the mob's current allegiance (hostile unless flipped by content).
func (m *Mob) Faction() model.Faction {
	return m.faction
}

// SetFaction flips the mob's allegiance at runtime — first caller: the spawn
// effect aligning a summon with its caster.
func (m *Mob) SetFaction(f model.Faction) {
	m.faction = f
}

// SetOwner binds the summoning player (spawn site only).
func (m *Mob) SetOwner(o model.PlayerEntity) {
	m.owner = o
}

// Owner is the summoning player, nil for world mobs (model.Owned).
func (m *Mob) Owner() model.PlayerEntity {
	return m.owner
}

// SetTTLTicks arms the spawned-entity lifetime (spawn site only; 0 = none).
func (m *Mob) SetTTLTicks(t int) {
	m.ttlTicks = t
}

// SetSummonPower sets the owner-level output multiplier (spawn site only).
func (m *Mob) SetSummonPower(p float32) {
	m.summonPower = p
}

// SummonPower is the owner-level damage/heal multiplier (model.Owned). The
// zero value reads as neutral so directly-constructed mobs (tests, world
// spawns) deal authored damage.
func (m *Mob) SummonPower() float32 {
	if m.summonPower <= 0 {
		return 1
	}
	return m.summonPower
}

// RaiseMaxHealth grants flat bonus HP on top of the (possibly variance-rolled)
// authored pool — the owner-level body scaling of summons. Current health
// rises with it: summons spawn at full health.
func (m *Mob) RaiseMaxHealth(bonusHP uint32) {
	m.maxHealth = m.maxHealth.Add(bonusHP)
	m.health = m.health.Add(bonusHP)
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

	// TTL countdown for spawned entities (after the death check — an HP death
	// must keep reporting as one). Expiry rides the same removal path as HP
	// death; kill rewards only flow through PlayerTouches, so none are granted.
	if m.ttlTicks > 0 {
		m.ttlTicks--
		if m.ttlTicks == 0 {
			return false
		}
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
		// Heal to full in ~2 seconds while out of combat (absolute HP, item 11).
		if m.health < m.maxHealth {
			regen := vitals.HP(float32(m.maxHealth) / (2 * constant.TicksPerSecond))
			m.health = m.health.AddCapped(regen, m.maxHealth)
		}
		// Back at full health with no aggro = combat over; earlier
		// contributors no longer count as participants for the next fight.
		if m.health == m.maxHealth && len(m.participants) > 0 {
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

// ApplySlow slows the mob's movement by the given fraction (effect
// foundations Step 2: lives in the generic buff store; strongest active slow
// wins in moveTowards). The SkillSystem runs after mob movement, so the
// aura-convention lifetime of tick interval + 1 makes the debuff survive
// exactly one movement step past its last re-application.
func (m *Mob) ApplySlow(source skills.SkillID, fraction float32, ticks int) {
	m.buffs.ApplySlow(source, fraction, ticks)
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
	if slow := m.buffs.SlowFraction(); slow > 0 {
		step *= 1 - slow
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

// MaxHealth is the mob's absolute HP pool (item 11 Phase 1); serialized as the
// max_health wire field so the client draws health/maxHealth.
func (m *Mob) MaxHealth() vitals.VitalSign {
	return m.maxHealth
}

// HealthRatio is the current/max health fraction (0..1), read by the
// lowest_health aura selector (roadmap.md item 11).
func (m *Mob) HealthRatio() float32 {
	if m.maxHealth == 0 {
		return 0
	}
	return float32(m.health) / float32(m.maxHealth)
}

// takeDamage subtracts absolute HP (item 11 Phase 1), scaled by the mob's base
// resistances against the hit's damage tags (Phase 2). A fully resisted hit
// (multiplier 0) does not exist for the mob: no HP loss, no floating number,
// no status effect and thus no hit VFX.
func (m *Mob) takeDamage(damage model.Damage, s model.StatusEffect) {
	multiplier := skills.ResistMultiplier(damage.Tags, m.definition.Factors.Resistances) *
		m.buffs.ResistMultiplier(damage.Tags)

	hp := vitals.HP(damage.HP * multiplier)
	if hp > 0 {
		before := m.health
		m.health = m.health.Sub(hp)
		m.damageTaken += before - m.health // actual loss after clamping at 0
		m.StatusEffects().Add(s)
	}
}

// DamageTaken is the health lost this tick (VitalSign units); floating damage
// number source (roadmap item 11).
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

// ApplyResist grants a transient tag-resistance buff from a resist aura
// (item 11 Phase 2); re-applied each aura tick, it expires on the same
// per-tick lifecycle as the floating-number accumulators.
func (m *Mob) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) {
	m.buffs.ApplyResist(source, tags, factor, ticks)
}

// ApplyDot grants a damage-over-time debuff (effect foundations Step 2); it
// runs its full authored duration independent of re-application, ticked by
// the SkillSystem via DueDotHits.
func (m *Mob) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) {
	m.buffs.ApplyDot(source, dot, ticks)
}

// DueDotHits advances and drains this tick's due dot damage events; called
// once per tick by the SkillSystem's acting site.
func (m *Mob) DueDotHits() []skills.DotHit {
	return m.buffs.DueDotHits()
}

// ResetTickNumbers clears the per-tick floating-number accumulators and ages
// the transient buff store; called by the StatusEffectsSystem at the start
// of each tick.
func (m *Mob) ResetTickNumbers() {
	m.damageTaken = 0
	m.auraHitStyle = model.AuraHitStyleNone
	m.buffs.Tick()
}

func (m *Mob) MobTouches(e model.MobEntity, factors mobs.Factors) {
	m.takeDamage(model.Damage{HP: factors.Damage, Tags: factors.DamageTags}, model.StatusEffectDamagedAmbient)
}

func (m *Mob) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	m.noteParticipant(p)
	m.takeDamage(damage, model.StatusEffectDamagedAmbient)
	m.tryGrantKillRewards()
}

// noteParticipant records a damage contributor for the death rewards.
func (m *Mob) noteParticipant(p model.PlayerEntity) {
	if m.participants == nil {
		m.participants = make(map[uint64]model.PlayerEntity)
	}
	m.participants[p.Basic().ID()] = p
}

// tryGrantKillRewards distributes the death rewards once (roadmap item 10):
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
