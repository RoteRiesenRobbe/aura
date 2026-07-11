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

// NewMob builds a mob from its definition. space is the physics space used for
// obstacle steering (mob-depth chunk 4) — nil disables steering (movement is
// pure straight-line geometry, as before the chunk); every production spawn
// site passes the real space.
func NewMob(d *mobs.MobDefinition, chaseIntoAuraMargin float32, space *phy.Space) *Mob {
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
	// switch). Mobs have no spellbook.
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
	// Auras-off-until-aggroed (mob-depth chunk 3c): a moving mob's aura only
	// runs while it has an aggro target (Update flips it on/off). Stationary
	// mobs (speed 0 — totems, braziers) are exempt: a hazard that cannot
	// chase has its aura as its entire behavior, so it stays always-on.
	auraAlwaysOn := d.Factors.Speed <= 0
	if auraCount > 0 && auraAlwaysOn {
		sc.SetActiveAura(0)
	}

	// The single aura sensor, pre-sized from slot 0 even while the aura
	// starts gated: the chase stop distance is correct from the first aggro
	// tick. SkillSystem re-derives radius/mask per tick while a slot is
	// active (aura switching stays possible); an inactive slot applies no
	// effects, so the sized sensor is inert until aggro.
	var auraRadius float32
	auraMask := int(model.LayerNoneCollision)
	if first := sc.AuraSlots[0]; first != nil {
		auraRadius = first.EffectiveRadius()
		// FactionHostile literal: the Mob struct (with its faction field)
		// is only constructed below; mobs always spawn hostile.
		auraMask = model.AuraMaskFor(first.Def, model.FactionHostile)
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
		space:            space,
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
		auraAlwaysOn:        auraAlwaysOn,
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

	// space enables obstacle steering (chunk 4): moveTowards/moveAwayFrom
	// query it for nearby blocking statics and compose repulsion into the
	// step direction. nil = no steering (tests, direct construction).
	space *phy.Space

	// steerSide latches the head-on deflection side (+1 left / -1 right,
	// 0 = unset) while the mob is continuously within repulsion range —
	// re-picking per tick flip-flops between two blockers (see steer).
	steerSide float32

	health    vitals.VitalSign
	maxHealth vitals.VitalSign
	heading   phy.Vec2f
	rand      *rand.Rand

	skills    *skills.SkillComponent
	aura      *phy.Circle
	aggroAura *phy.Circle

	velocity         float32
	buffs            skills.Buffs // transient status-effect store: resist/slow/dot (effect foundations Step 2)
	aggroTarget      model.Combatant
	spawnPosition    phy.Vec2f
	spawnInitialized bool

	// Threat table (mob-depth chunk 3a): entity-keyed combat targeting,
	// credited with post-mitigation HP from observed hits (§6.3). Deliberately
	// separate from participants — threat is targeting (cleared on leash
	// reset), participants is XP attribution (cleared on full regen);
	// unifying them would couple XP rules to targeting rules (gotcha #4).
	// Lazily initialized by noteThreat.
	threat map[uint64]*threatEntry

	// tookDamage marks a real HP loss since the last Update — set by
	// takeDamage (which runs in the SkillSystem phase, after mob updates) and
	// consumed by updateAggro's in-combat check one tick later (chunk 3b).
	tookDamage bool

	// leashTicks counts ticks with the target unreachable, out of the aggro
	// sensor and dealing no damage; past leashCountdownTicks the mob resets
	// (3b).
	leashTicks int

	// auraAlwaysOn exempts stationary mobs from aura gating (chunk 3c).
	auraAlwaysOn bool

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

// AuraRadius is the effective radius of the active aura, 0 while nothing is
// active — mirrors player.AuraRadius. Serialized as Mob.aura_radius so the
// client draws the ring only while the aura runs (chunk 3c; retires the
// hand-synced damageAuraRadiusMeters frontend constant).
func (m *Mob) AuraRadius() float32 {
	slot := m.skills.ActiveAuraSlot
	if slot < 0 || m.skills.AuraSlots[slot] == nil {
		return 0
	}
	return m.skills.AuraSlots[slot].EffectiveRadius()
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
	// death; kill rewards only flow through PlayerTouches, so none are
	// granted. Health is zeroed so stale threat-table refs to the removed
	// summon read as dead and get pruned (chunk 3a).
	if m.ttlTicks > 0 {
		m.ttlTicks--
		if m.ttlTicks == 0 {
			m.health = 0
			return false
		}
	}

	// Aura damage is applied by the SkillSystem (Phase 6.1); Update only
	// handles aggro, movement, regeneration and death.

	m.updateAggro()

	if m.aggroTarget != nil {
		if m.shouldFlee() {
			m.moveAwayFrom(m.aggroTarget.Position())
		} else if m.shouldApproachAggroTarget() {
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

	step := m.stepLength()
	if distance < step {
		step = distance
	}

	dir := m.steer(delta.Div(distance))
	m.SetPosition(current.Add(dir.Mult(step)))
}

// moveAwayFrom is the flee movement mode (mob-depth chunk 2): the inverse of
// the chase vector, same step length. No arrival clamp — there is no "arriving"
// at away. Blockers and the border wall deflect the flee via steer (chunk 4);
// without a space the InvAABB's per-axis clamp still makes an angled flee
// slide along the boundary and a perpendicular one pin stationary.
func (m *Mob) moveAwayFrom(threat phy.Vec2f) {
	if m.velocity <= 0 {
		return
	}

	current := m.Position()
	delta := current.Sub(threat)
	distance := delta.Abs()

	var dir phy.Vec2f
	if distance < 1e-4 {
		// Threat exactly on top of the mob: no away direction exists — keep
		// running along the current heading (a unit vector) instead of freezing.
		dir = m.heading
	} else {
		dir = delta.Div(distance)
	}

	m.SetPosition(current.Add(m.steer(dir).Mult(m.stepLength())))
}

// stepLength is this tick's movement distance: base velocity reduced by the
// strongest active slow (shared by chase, walk-home and flee).
func (m *Mob) stepLength() float32 {
	step := m.velocity
	if slow := m.buffs.SlowFraction(); slow > 0 {
		step *= 1 - slow
	}
	return step
}

// shouldFlee reports the flee trigger (mob-depth chunk 2): a definition-level
// cowardice threshold (factors.fleeBelowHealthRatio, 0 = never) with health
// strictly below it. The trigger stays generic — chunk 3d re-points the flee
// *direction* at the threat table without touching it. There is no explicit
// exit hysteresis: a fleeing mob leaves its territory, loses aggro and
// regenerates on the walk home, so the next acquisition starts above the
// threshold.
func (m *Mob) shouldFlee() bool {
	threshold := m.definition.Factors.FleeBelowHealthRatio
	return threshold > 0 && m.HealthRatio() < threshold
}

// leashCountdownTicks [PLACEHOLDER] is the out-of-combat grace before an
// aggroed mob gives up (mob-depth chunk 3b): while in combat — target within
// aura reach, still inside the aggro sensor, or damage taken — there is no
// leash at all (replaces the fixed territory-radius check); the countdown
// only runs once the target is unreachable AND out of sight, and expiry
// resets aggro, threat and the active aura.
const leashCountdownTicks = 90 // ~3 s

// updateAggro drives acquisition, threat retention and the state-dependent
// leash (mob-depth chunk 3). Retention: whenever the threat table holds a
// living entry, the highest-threat entity IS the aggro target — the sensor
// only acquires. Acquisition: with an empty table and no latched target, the
// nearest living enemy-faction entity in the aggro sensor is picked; a hit
// from outside the sensor seeds threat and acquires through retention, so
// mobs retaliate against snipers.
func (m *Mob) updateAggro() {
	tookDamage := m.tookDamage
	m.tookDamage = false

	if target := m.highestThreatTarget(); target != nil {
		m.setAggroTarget(target)
	} else if m.aggroTarget != nil && m.aggroTarget.HealthRatio() == 0 {
		m.resetAggro()
	}

	if m.aggroTarget == nil {
		if target := m.findAggroTarget(); target != nil {
			m.setAggroTarget(target)
		}
		return
	}

	// State-dependent leash (3b): in combat there is none; the countdown only
	// runs while the target is unreachable, out of the sensor and not hitting
	// back — expiring it while the sensor still sees the target would just
	// re-acquire next tick (visible as a 1-tick aura flicker every ~3 s).
	if tookDamage || m.targetWithinAuraReach() || m.targetWithinSensor() {
		m.leashTicks = 0
		return
	}
	m.leashTicks++
	if m.leashTicks > leashCountdownTicks {
		m.resetAggro()
	}
}

func (m *Mob) setAggroTarget(t model.Combatant) {
	m.aggroTarget = t
	m.setAuraActive(true)
}

// resetAggro is the combat reset: target + threat cleared, countdown zeroed,
// aura deactivated (3c) — walk-home and out-of-combat regen follow from
// aggroTarget == nil in Update.
func (m *Mob) resetAggro() {
	m.aggroTarget = nil
	m.threat = nil
	m.leashTicks = 0
	m.setAuraActive(false)
}

// setAuraActive flips the active aura with aggro (mob-depth chunk 3c).
// Idempotent per state — SetActiveAura resets the tick accumulator, so it
// must only run on an actual transition. auraAlwaysOn mobs never gate.
func (m *Mob) setAuraActive(on bool) {
	if m.auraAlwaysOn {
		return
	}
	if on {
		if m.skills.ActiveAuraSlot < 0 && m.skills.AuraSlots[0] != nil {
			m.skills.SetActiveAura(0)
		}
	} else if m.skills.ActiveAuraSlot >= 0 {
		m.skills.SetActiveAura(-1)
	}
}

// targetWithinAuraReach reports whether the aggro target overlaps the mob's
// aura circle — the "dealing damage" half of the in-combat definition (3b).
// Raw reach, no chase margin: the stop distance sits just inside it.
func (m *Mob) targetWithinAuraReach() bool {
	if m.aggroTarget == nil {
		return false
	}
	reach := m.aura.Radius + m.aggroTarget.Radius()
	return m.Position().Sub(m.aggroTarget.Position()).Abs() <= reach
}

// targetWithinSensor reports whether the aggro target still overlaps the
// aggro sensor — "can the mob see its target". Geometric twin of the sensor
// overlap so it needs no physics step; the target is already faction- and
// liveness-checked.
func (m *Mob) targetWithinSensor() bool {
	if m.aggroTarget == nil {
		return false
	}
	reach := m.aggroAura.Radius + m.aggroTarget.Radius()
	return m.Position().Sub(m.aggroTarget.Position()).Abs() <= reach
}

// findAggroTarget acquires the nearest living enemy-faction entity in the
// aggro sensor (chunk 3a: faction-aware — summons ride the player collision
// layer, so totems/companions are acquired with no sensor/mask change).
func (m *Mob) findAggroTarget() model.Combatant {
	var nearest model.Combatant
	bestDistance := float32(0)

	for c := range m.aggroAura.Collisions() {
		usr := c.Shape().UserData
		target, ok := usr.(model.Combatant)
		if !ok {
			continue
		}
		if target.Faction() == m.faction || target.HealthRatio() == 0 {
			continue
		}
		d := target.Position().Sub(m.Position()).AbsSq()
		if nearest == nil || d < bestDistance {
			nearest = target
			bestDistance = d
		}
	}

	return nearest
}

// threatEntry holds one threat-table row: the accumulated threat plus the
// entity ref for position/liveness reads.
type threatEntry struct {
	entity model.Combatant
	threat float32
}

// noteThreat credits threat against source (chunk 3a). The amount is
// post-mitigation HP (§6.3, decided 2026-07-10); allied, dead and empty
// credits are dropped, so a faction gate never needs re-checking on read.
func (m *Mob) noteThreat(source model.Combatant, amount float32) {
	if source == nil || amount <= 0 {
		return
	}
	if source.Faction() == m.faction || source.HealthRatio() == 0 {
		return
	}
	if m.threat == nil {
		m.threat = make(map[uint64]*threatEntry)
	}
	id := source.Basic().ID()
	e := m.threat[id]
	if e == nil {
		e = &threatEntry{entity: source}
		m.threat[id] = e
	}
	e.threat += amount
}

// NoteThreat is the exported crediting seam for threat that does not arrive
// as a hit on this mob: healer threat (§6.3), later taunt effects (chunk 7).
func (m *Mob) NoteThreat(source model.Combatant, amount float32) {
	m.noteThreat(source, amount)
}

// HasThreat reports whether the entity is on this mob's threat table — the
// healer-crediting filter ("in combat with the healed target", §6.3).
func (m *Mob) HasThreat(id uint64) bool {
	_, ok := m.threat[id]
	return ok
}

// TargetsEntity reports whether this mob's current aggro target is the given
// entity — the sensor-acquired half of "in combat with" (§6.3): a target can
// hold aggro without any threat entry by never damaging the mob.
func (m *Mob) TargetsEntity(id uint64) bool {
	return m.aggroTarget != nil && m.aggroTarget.Basic().ID() == id
}

// highestThreatTarget returns the living top-threat entity, pruning dead
// entries on the way (a TTL-expired summon zeroes its health, so stale refs
// read as dead). Ties break toward the lower entity ID for determinism.
func (m *Mob) highestThreatTarget() model.Combatant {
	var best *threatEntry
	var bestID uint64
	for id, e := range m.threat {
		if e.entity.HealthRatio() == 0 {
			delete(m.threat, id)
			continue
		}
		if best == nil || e.threat > best.threat || (e.threat == best.threat && id < bestID) {
			best = e
			bestID = id
		}
	}
	if best == nil {
		return nil
	}
	return best.entity
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
// no status effect and thus no hit VFX. Returns the actual HP lost after
// clamping — the post-mitigation threat credit (chunk 3a).
func (m *Mob) takeDamage(damage model.Damage, s model.StatusEffect) vitals.VitalSign {
	multiplier := skills.ResistMultiplier(damage.Tags, m.definition.Factors.Resistances) *
		m.buffs.ResistMultiplier(damage.Tags)

	hp := vitals.HP(damage.HP * multiplier)
	if hp <= 0 {
		return 0
	}
	before := m.health
	m.health = m.health.Sub(hp)
	loss := before - m.health // actual loss after clamping at 0
	m.damageTaken += loss
	if loss > 0 {
		m.tookDamage = true // in-combat signal for the leash (chunk 3b)
	}
	m.StatusEffects().Add(s)
	return loss
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
	lost := m.takeDamage(model.Damage{HP: factors.Damage, Tags: factors.DamageTags}, model.StatusEffectDamagedAmbient)
	// Mob-vs-mob hits build threat too; noteThreat's faction gate keeps
	// hostile-vs-hostile splash (boss aura on a brazier) off the table.
	if source, ok := e.(model.Combatant); ok {
		m.noteThreat(source, float32(lost))
	}
}

func (m *Mob) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	m.noteParticipant(p)
	lost := m.takeDamage(damage, model.StatusEffectDamagedAmbient)
	// Threat credits the hit's source entity — a summon builds its own threat
	// while XP rides the toucher (chunk 3a, gotcha #9; the stores stay
	// separate). A dot whose summon has expired falls back to the toucher:
	// the burn keeps pulling threat somewhere real.
	source := damage.Source
	if source == nil || source.HealthRatio() == 0 {
		source, _ = p.(model.Combatant)
	}
	m.noteThreat(source, float32(lost))
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
