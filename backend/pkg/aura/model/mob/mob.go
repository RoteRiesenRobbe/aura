package mob

import (
	"log"
	"math/rand"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

var _ = model.MobEntity(&Mob{})
var _ = model.Healable(&Mob{})

var types = func() map[string]model.EntityType {
	t := map[string]model.EntityType{}
	for id, name := range AuraApi.EnumNamesEntityType {
		t[name] = model.EntityType(id)
	}
	return t
}()

// NewMob builds a mob from its definition. space is the physics space used for
// obstacle steering (mob-depth chunk 4) — nil disables steering (movement is
// pure straight-line geometry, as before the chunk); every production spawn
// site passes the real space.
func NewMob(d *mobs.MobDefinition, chaseIntoAuraMargin float32, space *phy.Space) *Mob {
	// The wire EntityType comes from the def's optional entityType override
	// (chunk 9: throwaway/variant defs reuse existing sprites), falling back
	// to the def name — the pre-chunk-9 rule for all legacy defs.
	lookup := d.EntityType
	if lookup == "" {
		lookup = d.Name
	}
	entityType, ok := types[lookup]
	if !ok {
		log.Fatalf("Mob type not found: %d/%s", d.ID, lookup)
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
	// A moving mob whose primary aura is a heal aura is a seek-healer (chunk 8):
	// it acquires wounded ALLIES the way a damage mob acquires enemies, so its
	// aura gates on/off with that acquisition (updateHealerTargeting). It spawns
	// aura-gated (moving mob) exactly like a damage mob; only the acquisition
	// target and the sensor mask (below) differ.
	seekHealer := !auraAlwaysOn && auraCount > 0 && firstAuraHeals(sc)

	// The single aura sensor, pre-sized from slot 0 even while the aura
	// starts gated: the chase stop distance is correct from the first aggro
	// tick. SkillSystem re-derives radius/mask per tick while a slot is
	// active (aura switching stays possible); an inactive slot applies no
	// effects, so the sized sensor is inert until aggro.
	var auraRadius float32
	auraMask := int(model.LayerNoneCollision)
	if first := sc.AuraSlots[0]; first != nil {
		auraRadius = first.EffectiveRadius()
		auraMask = model.AuraMaskFor(first.Def)
	}
	aura := phy.NewCircle(phy.VEC2F_ZERO, auraRadius)
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = auraMask
	aura.Shape().IsSensor = true

	// Faction + aggro set from the definition (chunk 6.6). The loader always
	// resolves both (absent key → hostile default); the zero-value guard
	// catches directly-constructed definitions (tests) — FactionAligned is the
	// zero value, and no authored species is ever aligned.
	faction := model.Faction(d.Faction)
	aggroMask := d.AggroMask
	if faction == model.FactionAligned {
		faction = model.FactionHostile
		aggroMask = model.FactionAligned.Bit()
	}

	// AggroRadius is validated > 0 at definition load time. The sensor's mask
	// follows the aggro set: no mob faction in the set = no action-layer bit =
	// no new broadphase pairs (the chunk-6.6 perf knob); a passive faction's
	// sensor sees nothing at all.
	aggroAura := phy.NewCircle(phy.VEC2F_ZERO, d.Body.AggroRadius)
	aggroAura.Shape().Layer = int(model.LayerNoneCollision)
	sensorMask := aggroSensorMask(aggroMask)
	// A seek-healer senses fellow COMBATANTS (both body layers) so it can spot
	// wounded allies at aggro range and move to them — its hostility set may be
	// empty (a passive faction), which would otherwise blind its sensor.
	// findWoundedAlly filters the collisions down to same-faction wounded.
	if seekHealer {
		sensorMask = int(model.LayerCombatants)
	}
	aggroAura.Shape().Mask = sensorMask
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
		heading:          phy.Vec2f{X: -1, Y: 0},
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
		seekHealer:          seekHealer,
		chaseIntoAuraMargin: chaseIntoAuraMargin,
		statusEffects:       model.NewStatusEffects(),
		faction:             faction,
		aggroMask:           aggroMask,
	}
	if m.chaseIntoAuraMargin <= 0 {
		m.chaseIntoAuraMargin = 0.05
	}
	// Idle pacing from the definition, global defaults when unset (validated
	// at registry load: factor in (0, 1], min <= max).
	m.idleSpeedFactor = d.Factors.IdleSpeedFactor
	if m.idleSpeedFactor <= 0 {
		m.idleSpeedFactor = defaultIdleSpeedFactor
	}
	m.dwellMinTicks = d.Factors.IdleDwellMinTicks
	m.dwellMaxTicks = d.Factors.IdleDwellMaxTicks
	if m.dwellMaxTicks <= 0 {
		m.dwellMinTicks = defaultIdleDwellMinTicks
		m.dwellMaxTicks = defaultIdleDwellMaxTicks
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

	// steerProbe/steerHits are blockerRepulsion's reused scratch (see there):
	// the lookahead circle and its hit buffer, built once per mob instead of
	// once per tick. Never read outside blockerRepulsion.
	steerProbe *phy.Circle
	steerHits  []phy.Collider

	// chase stuck watchdog (see stuck.go): net-progress window + camp state.
	progressAnchorPos phy.Vec2f
	progressTicks     int
	camped            bool
	campTicks         int
	campTargetPos     phy.Vec2f

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

	// Idle-movement archetypes (mob-depth chunk 5, patrol.go). The wander
	// anchor is the AUTHORED spawn point (gotcha #7), set via SetWander;
	// waypoints is the ping-pong patrol route (SetWaypoints). returnPos is
	// the evade point: the mob's position when it left idle for combat —
	// after a combat reset it walks back there before resuming its archetype.
	wanderAnchor    phy.Vec2f
	wanderRadius    float32
	wanderTarget    phy.Vec2f
	wanderTargetSet bool
	wanderLegTicks  int
	dwellTicks      int

	waypoints    []phy.Vec2f
	waypointIdx  int
	waypointDir  int
	waypointLoop bool

	// Idle pacing (chunk-5 pacing rework): idleSpeedFactor scales wander legs
	// AND patrol marching (evade return / walk-home stay full speed);
	// dwellMin/MaxTicks is the wander stand-time band. Seeded from the mob
	// definition in NewMob (global defaults when unset); the speed factor is
	// per-spawn overridable via SetIdleSpeedFactor.
	idleSpeedFactor float32
	dwellMinTicks   int
	dwellMaxTicks   int

	returnPos    phy.Vec2f
	returnPosSet bool

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

	// seekHealer marks a moving mob whose primary aura is a heal aura (chunk 8).
	// It reacts to wounded ALLIES the way a damage mob reacts to enemies: its
	// aggro sensor senses fellow combatants (LayerCombatants), it acquires the
	// most-wounded ally in range as its aggro target, chases it at full speed
	// and its heal aura gates on/off with that acquisition (updateHealerTargeting).
	seekHealer bool

	// Encounter-controller seams (chunk 9): invulnerable gates takeDamage
	// into a non-event (9b); fleeOverride forces the flee movement mode
	// regardless of health AND suspends the leash countdown so the threat
	// table survives a scripted flee phase (9e). Both are toggled by an
	// encounter script, never by autonomous mob behavior.
	invulnerable bool
	fleeOverride bool

	statusEffects       model.StatusEffects
	deathRewardGiven    bool
	chaseIntoAuraMargin float32

	// faction is the mob's allegiance (plan-effect-foundations F8, widened to
	// content factions in chunk 6.6): hostile by default; content declares
	// species factions, and summoning flips it at runtime. aggroMask is the
	// bitmask of faction IDs this mob PROACTIVELY acquires in its sensor —
	// retaliation, flee and damage eligibility stay faction-inequality.
	faction   model.Faction
	aggroMask uint64

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

	// critTaken is the crit-flagged share of damageTaken (plan-skill-vocab
	// chunk 1, §4.3), wire crit_taken; reset every tick alongside it.
	critTaken vitals.VitalSign

	// healReceived accumulates health restored this tick (VitalSign units) for
	// the floating heal number of a mob-cast heal (mob-depth chunk 8); mirrors
	// damageTaken and resets every tick alongside it.
	healReceived vitals.VitalSign

	// auraHitStyle is the aura-hit VFX a damage aura stamped on this mob this
	// tick (item 11 Step 4); reset every tick alongside damageTaken.
	auraHitStyle model.AuraHitStyle

	// dwellRadius is the campfire bind radius (chunk 4), 0 for every mob that
	// is not a respawn anchor; set post-construction by cmd/aurad.
	dwellRadius float32

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

// AuraTickInterval is the active aura's first-effect effective tick interval in
// game ticks (level scaling × this mob's tick_rate factor, floored at 1), 0
// while nothing is active — mirrors player.AuraTickInterval. Serialized as
// Mob.aura_tick_interval; reading a mob's beat to dodge its ticks is the
// design-critical use case (skill-vocab chunk 6).
func (m *Mob) AuraTickInterval() int {
	slot := m.skills.ActiveAuraSlot
	if slot < 0 || m.skills.AuraSlots[slot] == nil {
		return 0
	}
	equip := m.skills.AuraSlots[slot]
	if len(equip.Def.Effects) == 0 || !skills.HasVisibleTickCadence(equip.Def.Effects[0].Type) {
		return 0
	}
	return skills.EffectiveTickInterval(equip.Def.Effects[0], equip.Level, m.buffs.TickRateFactor())
}

// AuraTickPhase is the accumulator's position within the current effective
// interval — mirrors player.AuraTickPhase (skill-vocab chunk 6). Serialized as
// Mob.aura_tick_phase; 0 while nothing is active.
func (m *Mob) AuraTickPhase() int {
	interval := m.AuraTickInterval()
	if interval <= 0 {
		return 0
	}
	return m.skills.AuraSlots[m.skills.ActiveAuraSlot].TickAccumulator % interval
}

// TickRateFactor is the combined tick_rate multiplier on this mob's own aura
// cadence (skill-vocab chunk 6); 1.0 = no haste/slow active.
func (m *Mob) TickRateFactor() float32 {
	return m.buffs.TickRateFactor()
}

// LightRadius is the light emitted by the active aura and any light passives
// in the loadout (max, C2 lift 2) — mirrors player.LightRadius. Serialized as
// Mob.light_radius (darkness hole-punch, chunk 3; the campfire's big light
// coexisting with its small heal ring is why this is not folded into
// AuraRadius).
func (m *Mob) LightRadius() float32 {
	return m.skills.LightRadius()
}

// AuraCategories is the active aura's ring-colour bitmask, 0 while none is
// active — mirrors player.AuraCategories. Serialized as Mob.aura_category, so a
// mob's ring reads the same colour language as a player's (triage item 7).
func (m *Mob) AuraCategories() skills.AuraCategory {
	return m.skills.AuraCategories()
}

// TierRank is the authored tier as its wire byte, driving the client's portrait
// frame ring (triage item 15). Serialized as Mob.tier.
func (m *Mob) TierRank() mobs.TierRank {
	return m.definition.Rank()
}

// DwellRadius is the bind radius of a campfire respawn anchor, 0 for every
// other mob. Set post-construction by cmd/aurad (heal radius ×
// sys.CampfireDwellRadiusFactor) and serialized as Mob.dwell_radius — the
// client draws the inner dwell circle from it, so the bind factor lives
// server-side only (chunk 4).
func (m *Mob) DwellRadius() float32 {
	return m.dwellRadius
}

func (m *Mob) SetDwellRadius(r float32) {
	m.dwellRadius = r
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
// effect aligning a summon with its caster. A flipped mob's aggro set becomes
// hostile-to-all-others (findAggroTarget's equality skip still protects the
// new own faction); the sensor mask follows.
func (m *Mob) SetFaction(f model.Faction) {
	m.faction = f
	m.aggroMask = ^f.Bit()
	m.aggroAura.Shape().Mask = aggroSensorMask(m.aggroMask)
}

// aggroSensorMask derives the aggro sensor's collision mask from the aggro
// set: the aligned faction lives on the player body layer (players plus the
// player-layer summon trick), every mob faction on the action layer.
func aggroSensorMask(aggroMask uint64) int {
	mask := model.LayerNoneCollision
	if aggroMask&model.FactionAligned.Bit() != 0 {
		mask |= model.LayerPlayerCollision
	}
	if aggroMask&^model.FactionAligned.Bit() != 0 {
		mask |= model.LayerActionCollision
	}
	return int(mask)
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

// PowerScale is the def-derived tier+baseline scale f(curveLevel)
// (model.PowerScaled, C0): the SkillSystem multiplies this mob's skill HP
// values by it at cast time, so mob-skill JSONs stay baseline-authored. The
// zero value (hand-built definitions in sim/tests) reads as neutral, the
// SummonPower convention.
func (m *Mob) PowerScale() float32 {
	if m.definition.PowerScale <= 0 {
		return 1
	}
	return m.definition.PowerScale
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
			m.resetChaseWatchdog()
			m.moveAwayFrom(m.aggroTarget.Position())
		} else if m.shouldApproachAggroTarget() {
			m.chaseTowards(m.aggroTarget.Position())
		} else {
			m.resetChaseWatchdog()
		}
	} else {
		m.resetChaseWatchdog()
		m.updateIdleMovement()
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
	}
	m.Body.SetPosition(p)
	m.aura.SetPosition(p)
	// The acquisition sensor travels with the body (chunk 5): a patroller
	// aggros whatever it walks past, matching the mob-centered leash check
	// (targetWithinSensor). Before chunk 5 the sensor was latched to the
	// spawn position (territorial acquisition).
	m.aggroAura.SetPosition(p)
}

func (m *Mob) Angle() float32 {
	// FIXME the angle has to be set when the position is updated
	// => That's where you're wrong kiddo. Vector arithmetic ftw!
	return phy.Vec2f{X: -1, Y: 0}.AngleBetween(m.heading)
}

func (m *Mob) SetAngle(a float32) {
	m.heading = phy.NewRotMat2f(a).Mult(phy.Vec2f{X: -1, Y: 0})
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
	m.moveTowardsScaled(target, 1)
}

// moveTowardsScaled is moveTowards with a speed scale — wander ambles at a
// fraction of chase speed (chunk 5); everything else passes 1.
func (m *Mob) moveTowardsScaled(target phy.Vec2f, speedScale float32) {
	if m.velocity <= 0 {
		return
	}

	current := m.Position()
	delta := target.Sub(current)
	distance := delta.Abs()
	if distance < 1e-4 {
		return
	}

	step := m.stepLength() * speedScale
	if distance < step {
		step = distance
	}

	dir := m.steer(delta.Div(distance))
	m.moveTo(current.Add(dir.Mult(step)))
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

	m.moveTo(current.Add(m.steer(dir).Mult(m.stepLength())))
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
	if m.fleeOverride {
		return true
	}
	threshold := m.definition.Factors.FleeBelowHealthRatio
	return threshold > 0 && m.HealthRatio() < threshold
}

// SetFleeOverride forces the flee movement mode regardless of health
// (encounter-controller chunk 9e) — the scripted-flee seam ("the boss runs
// while spawning adds"). While on, the leash countdown is suspended too:
// a scripted flee deliberately outruns sensor and aura range, and expiring
// the leash there would resetAggro and wipe the threat table — the roadmap
// requires threat retained throughout so the boss re-engages correctly the
// moment the script drops the override (retention re-targets the highest
// living threat every tick; no re-engage code needed).
func (m *Mob) SetFleeOverride(on bool) {
	m.fleeOverride = on
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

	// Followers (chunk 6) are owner-centric: acquisition from the owner's
	// combat signals, stickiness bounded by the owner tether — no sensor
	// (its mask sees the player layer), no threat retention (hits on the
	// companion never re-target it, §3.6), no leash (the tether replaces it).
	if m.isFollower() {
		m.updateCompanionTargeting()
		return
	}

	// Seek-healers (chunk 8) acquire wounded ALLIES, not enemies: no threat
	// table, no sensor-enemy acquisition — the ally-sensing sensor + a wounded-
	// ally pick drive the same aggroTarget/aura-gate/chase machinery.
	if m.seekHealer {
		m.updateHealerTargeting()
		return
	}

	// Campfire hard safe-zone (Pass A, decision 4): a target that reaches the
	// fire breaks the chase outright — threat cleared, aura off, walk home.
	// Checked BEFORE retention, so the cleared table cannot re-latch the same
	// target on this tick; findAggroTarget skips in-zone targets, so nothing
	// re-acquires until they step back out.
	if m.aggroTarget != nil && m.blockedBySafeZone(m.aggroTarget.Position()) {
		m.resetAggro()
	}

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
	// A scripted flee (9e) counts as in combat for its whole duration — the
	// encounter owns the disengage, see SetFleeOverride.
	if tookDamage || m.fleeOverride || m.targetWithinAuraReach() || m.targetWithinSensor() {
		m.leashTicks = 0
		return
	}
	m.leashTicks++
	if m.leashTicks > leashCountdownTicks {
		m.resetAggro()
	}
}

func (m *Mob) setAggroTarget(t model.Combatant) {
	if m.aggroTarget == nil {
		m.noteCombatEntry()
	}
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

// findAggroTarget acquires the nearest living entity in the aggro sensor
// whose faction is in the mob's aggro set (chunk 3a faction-aware acquisition,
// gated per faction in chunk 6.6). A faction outside the set is seen but
// never proactively acquired — it still retaliates through the threat table
// when hit.
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
		if m.aggroMask&target.Faction().Bit() == 0 {
			continue
		}
		if m.blockedBySafeZone(target.Position()) {
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

// ForceThreatToTop credits source above the current max living threat, so
// retention (highestThreatTarget) swings the aggro target onto it next tick —
// the taunt primitive (mob-depth chunk 7, decided: force-to-top, no separate
// target lock). margin is the head start above the old top; because it lands
// on the table, MayHarm grants the mob the right to hit the taunter for free
// (chunk 6.6). Gates match noteThreat: nil, allied, dead and non-positive
// sources are dropped.
func (m *Mob) ForceThreatToTop(source model.Combatant, margin float32) {
	if source == nil || margin <= 0 {
		return
	}
	if source.Faction() == m.faction || source.HealthRatio() == 0 {
		return
	}
	if m.threat == nil {
		m.threat = make(map[uint64]*threatEntry)
	}

	// Current max over living entries (pruning dead on the way, like retention).
	var max float32
	for id, e := range m.threat {
		if e.entity.HealthRatio() == 0 {
			delete(m.threat, id)
			continue
		}
		if e.threat > max {
			max = e.threat
		}
	}

	id := source.Basic().ID()
	e := m.threat[id]
	if e == nil {
		e = &threatEntry{entity: source}
		m.threat[id] = e
	}
	e.threat = max + margin
}

// DropThreat removes exactly one threat entry — the Fade / detaunt primitive
// (mob-depth chunk 7, decided: single-entry removal). Retention re-picks the
// next-highest threat holder next tick; if the table empties, the current
// aggro target stays latched (Fade sheds to a tank, no-op solo — accepted v1).
// Also drops the mob's dynamic harm right on that entity until it acts again
// (chunk 6.6 MayHarm), which is the point of shedding aggro.
func (m *Mob) DropThreat(id uint64) {
	delete(m.threat, id)
}

// TargetsEntity reports whether this mob's current aggro target is the given
// entity — the sensor-acquired half of "in combat with" (§6.3): a target can
// hold aggro without any threat entry by never damaging the mob.
func (m *Mob) TargetsEntity(id uint64) bool {
	return m.aggroTarget != nil && m.aggroTarget.Basic().ID() == id
}

// InCombat reports whether this mob is currently engaged (model.Combatant;
// atmosphere & recovery chunk 1). A mob's combat state is simply "has an aggro
// target" — read by a healer deciding whether an allied mob it heals counts as
// an in-combat ally.
func (m *Mob) InCombat() bool {
	return m.aggroTarget != nil
}

// ThreatRow is one read-only threat-table row for the THREAT debug cheat
// (chunk 9).
type ThreatRow struct {
	Entity model.Combatant
	Threat float32
}

// ThreatSnapshot returns the living threat entries sorted descending (ties:
// lower entity ID first, matching retention's tiebreak) plus the current
// aggro target's entity ID (0 = none) — the THREAT debug cheat's read-only
// dump. Dead entries are skipped, not pruned.
func (m *Mob) ThreatSnapshot() ([]ThreatRow, uint64) {
	rows := make([]ThreatRow, 0, len(m.threat))
	for _, e := range m.threat {
		if e.entity.HealthRatio() == 0 {
			continue
		}
		rows = append(rows, ThreatRow{Entity: e.entity, Threat: e.threat})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Threat != rows[j].Threat {
			return rows[i].Threat > rows[j].Threat
		}
		return rows[i].Entity.Basic().ID() < rows[j].Entity.Basic().ID()
	})
	var targetID uint64
	if m.aggroTarget != nil {
		targetID = m.aggroTarget.Basic().ID()
	}
	return rows, targetID
}

// MayHarm implements model.HostilityGate (chunk 6.6 in-game fix): a mob may
// harm a different-faction target iff its faction is in the declared aggro
// set (static layer) OR the target is on the threat table (dynamic layer —
// whoever hurt me is fair game, which keeps retaliation working for passive
// factions and gives taunt harm rights for free). Neutral factions can no
// longer splash each other into fights neither could start, and a pure
// hazard (brazier, set {aligned}) never burns mobs that could never hurt it
// back — the two 2026-07-11 in-game findings.
func (m *Mob) MayHarm(f model.Faction, id uint64) bool {
	return m.aggroMask&f.Bit() != 0 || m.HasThreat(id)
}

// FriendlyToPlayers implements model.PlayerFriendly (§9 lift 6, C5): the
// species' faction flag, read by the sys damage-eligibility seam. Runtime
// faction flips (SetFaction — summons) don't touch it: friendliness is
// authored on the species, and no summoned species is friendly.
func (m *Mob) FriendlyToPlayers() bool {
	return m.definition.FriendlyToPlayers
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

// SetInvulnerable toggles conditional damage immunity (encounter-controller
// chunk 9b) — an encounter-script seam, e.g. "the boss is immune while its
// guards live". See the takeDamage gate for the exact non-event semantics.
func (m *Mob) SetInvulnerable(on bool) {
	m.invulnerable = on
}

func (m *Mob) Invulnerable() bool {
	return m.invulnerable
}

// takeDamage subtracts absolute HP (item 11 Phase 1), scaled by the mob's base
// resistances against the hit's damage tags (Phase 2). A fully resisted hit
// (multiplier 0) does not exist for the mob: no HP loss, no floating number,
// no status effect and thus no hit VFX. Returns the "damage dealt":
// shield-absorbed damage + actual HP lost after clamping — the
// post-mitigation threat credit (chunk 3a, widened to absorbs per §4.2(a))
// and the lifesteal base (F6 §3.1/9).
func (m *Mob) takeDamage(damage model.Damage, s model.StatusEffect) vitals.VitalSign {
	// Conditional immunity (encounter-controller chunk 9b): while set, every
	// hit is a non-event exactly like a fully resisted tag — no HP loss, no
	// floating number, no combat signal, no status effect, and no threat
	// (credited from the returned loss). Accepted v1 leaks, deliberate:
	// the sys aura-hit VFX still stamps at its call sites (a hit ring with
	// no damage number reads as "immune" feedback), and PlayerTouches
	// records the attacker as an XP participant before this gate (they did
	// participate). Zero threat accrues while immune — post-lift targeting
	// starts at sensor acquisition; revisit for the real boss content.
	if m.invulnerable {
		return 0
	}
	// Gated hits (content pass C1) are opt-in: without an explicit base
	// entry for one of the hit's tags the mob was never a valid target —
	// same non-event as a fully resisted hit.
	if damage.Gated && !skills.GateOpensFor(damage.Tags, m.definition.Factors.Resistances) {
		return 0
	}
	multiplier := skills.ResistMultiplier(damage.Tags, m.definition.Factors.Resistances) *
		m.buffs.ResistMultiplier(damage.Tags)

	hp32 := damage.HP * multiplier
	// A fully resisted hit stays a non-event: no combat signal, no absorb.
	if vitals.HP(hp32) <= 0 {
		return 0
	}
	// Shield absorb (chunk 2, F6 §3.1/8): post-mitigation damage drains the
	// absorb pools first, the leftover hits HP. The ≤1-point rounding drift
	// between HP(absorbed)+HP(rest) and HP(hp32) is accepted.
	absorbed := vitals.VitalSign(vitals.HP(m.buffs.AbsorbShield(hp32)))
	hp := vitals.HP(hp32 - float32(absorbed))

	before := m.health
	m.health = m.health.Sub(hp)
	loss := before - m.health // actual loss after clamping at 0
	// The floating-number accumulators show real HP loss only; absorbed
	// damage reads as the shield bar dropping.
	m.damageTaken += loss
	if damage.Crit {
		m.critTaken += loss // crit_taken wire accumulator (chunk 1, §4.3)
	}
	dealt := absorbed + loss // "damage dealt", F6 §3.1/9 — feeds threat + lifesteal
	if dealt > 0 {
		// In-combat signal for the leash (chunk 3b); widened to dealt in
		// chunk 2 — being beaten on your shield is combat (§3.1).
		m.tookDamage = true
	}
	m.StatusEffects().Add(s)
	return dealt
}

// DamageTaken is the health lost this tick (VitalSign units); floating damage
// number source (roadmap item 11).
func (m *Mob) DamageTaken() vitals.VitalSign {
	return m.damageTaken
}

// CritTaken is the crit-flagged share of this tick's damage taken (chunk 1,
// §4.3); serialized as the crit_taken wire field so the client pops it big.
func (m *Mob) CritTaken() vitals.VitalSign {
	return m.critTaken
}

// Heal restores up to hp absolute HP, capped at maxHealth, records the
// floating heal number, and returns the HP actually restored (model.Healable;
// mob-depth chunk 8) — the mob side of the heal-aura target lift, mirroring the
// player's Heal. A dead mob (health 0) is not revived by a heal aura: the
// eligibility predicate never selects a zero-ratio target, and AddCapped on a
// live pool is the only path here.
func (m *Mob) Heal(hp uint32) vitals.VitalSign {
	before := m.health
	m.health = m.health.AddCapped(hp, m.maxHealth)
	healed := m.health - before
	m.healReceived += healed
	return healed
}

// HealReceived is the health restored this tick (VitalSign units); floating
// heal number source for mob-cast heals (mob-depth chunk 8).
func (m *Mob) HealReceived() vitals.VitalSign {
	return m.healReceived
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
// the SkillSystem via DueBuffEvents.
func (m *Mob) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) {
	m.buffs.ApplyDot(source, dot, ticks)
}

// ApplyHot grants a heal-over-time buff (plan-skill-vocab chunk 3) — mobs can
// be HoT'd by content, the machinery is entity-agnostic; ticked by the
// SkillSystem via DueBuffEvents.
func (m *Mob) ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) {
	m.buffs.ApplyHot(source, hot, ticks)
}

// ApplyShield grants (or tops up) an absorb pool from a shield effect
// (plan-skill-vocab chunk 2) — mobs can be shielded by content, the machinery
// is entity-agnostic; drained by takeDamage before HP.
func (m *Mob) ApplyShield(source skills.SkillID, hp float32, ticks int) {
	m.buffs.ApplyShield(source, hp, ticks)
}

// ApplyTickRate grants a haste / tick-slow buff scaling this mob's own aura
// cadence (skill-vocab chunk 6) — mobs can be hasted/slowed by content, the
// machinery is entity-agnostic; the SkillSystem reads the composed factor each
// tick via TickRateFactor.
func (m *Mob) ApplyTickRate(source skills.SkillID, factor float32, ticks int) {
	m.buffs.ApplyTickRate(source, factor, ticks)
}

// ShieldHP is the current total absorb capacity across all active pools;
// serialized as the shield_hp wire field. A live value, not a per-tick
// accumulator — no ResetTickNumbers involvement.
func (m *Mob) ShieldHP() vitals.VitalSign {
	return vitals.VitalSign(vitals.HP(m.buffs.ShieldTotal()))
}

// AppliedEffects is the bitmask of buff/debuff kinds currently applied to this
// mob; serialized as the applied_effects wire field. A live value, like
// ShieldHP.
func (m *Mob) AppliedEffects() skills.AppliedEffect {
	return m.buffs.AppliedEffects()
}

// DueBuffEvents advances and drains this tick's due dot damage and hot heal
// events; called once per tick by the SkillSystem's acting site.
func (m *Mob) DueBuffEvents() ([]skills.DotHit, []skills.HotEvent) {
	return m.buffs.DueBuffEvents()
}

// ResetTickNumbers clears the per-tick floating-number accumulators and ages
// the transient buff store; called by the StatusEffectsSystem at the start
// of each tick.
func (m *Mob) ResetTickNumbers() {
	m.damageTaken = 0
	m.critTaken = 0
	m.healReceived = 0
	m.auraHitStyle = model.AuraHitStyleNone
	m.buffs.Tick()
}

func (m *Mob) MobTouches(e model.MobEntity, factors mobs.Factors) {
	lost := m.takeDamage(model.Damage{HP: factors.Damage, Tags: factors.DamageTags, Gated: factors.Gated, Crit: factors.Crit}, model.StatusEffectDamagedAmbient)
	// Mob-cast lifesteal (chunk 1): Factors carries no Source — the mob is
	// always its own recipient.
	model.ApplyLifesteal(lost, factors.Lifesteal, nil, e)
	// Mob-vs-mob hits build threat too; noteThreat's faction gate keeps
	// same-faction splash off the table.
	if source, ok := e.(model.Combatant); ok {
		m.noteThreat(source, float32(lost))
	}
	// A mob killing blow settles the death like a player one (chunk 6.6):
	// recorded participants get their rewards even when a frontline mob
	// strikes last, and a kill with NO participants latches deathRewardGiven
	// so a player poking the corpse afterwards earns nothing.
	m.tryGrantKillRewards()
}

func (m *Mob) PlayerTouches(p model.PlayerEntity, damage model.Damage) {
	m.noteParticipant(p)
	lost := m.takeDamage(damage, model.StatusEffectDamagedAmbient)
	// Lifesteal heal-back (chunk 1, F6 §3.1/9): the living Source (a summon
	// leeches for itself, §4.2) else the toucher, from the dealt amount.
	model.ApplyLifesteal(lost, damage.Lifesteal, damage.Source, p)
	// Threat credits the hit's source entity — a summon builds its own threat
	// while XP rides the toucher (chunk 3a, gotcha #9; the stores stay
	// separate). A dot whose summon has expired falls back to the toucher:
	// the burn keeps pulling threat somewhere real.
	source := damage.Source
	if source == nil || source.HealthRatio() == 0 {
		source, _ = p.(model.Combatant)
	}
	m.noteThreat(source, float32(lost))
	// Assist signal for the toucher's companion (chunk 6, §3.6): a direct
	// player hit — Source nil, so summon damage replaying through the owner
	// never counts as "the owner attacked".
	if damage.Source == nil {
		if n, ok := p.(model.AttackNotifier); ok {
			n.NoteAttackDealt(m)
		}
	}
	m.tryGrantKillRewards()
}

// KillCreditNames lists everyone this mob's death rewards reach — damage
// participants plus their recent healers, deduped and sorted (the C6
// server-wide kill broadcast reads it in OnMobDeath, where the participant
// map is still intact: it clears on full regen, never on death).
func (m *Mob) KillCreditNames() []string {
	seen := make(map[uint64]bool, len(m.participants))
	var names []string
	for id, p := range m.participants {
		if !seen[id] {
			seen[id] = true
			names = append(names, p.Name())
		}
		for _, healer := range p.RecentHealers() {
			hid := healer.Basic().ID()
			if !seen[hid] {
				seen[hid] = true
				names = append(names, healer.Name())
			}
		}
	}
	sort.Strings(names)
	return names
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
