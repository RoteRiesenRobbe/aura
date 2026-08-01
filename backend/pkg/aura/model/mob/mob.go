package mob

import (
	"fmt"
	"log"
	"math/rand"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

var _ = model.MobEntity(&Mob{})
var _ = model.Healable(&Mob{})

// processSalt randomizes every mob's RNG stream per process run so a fresh
// server no longer re-rolls the same HP variance + first drop for the Nth
// spawn on every restart (backlog §27.2.2 — PO-ruled a bug: rolls must be
// random per run). Set once at boot via SeedProcess; left 0 in tests and the
// sim harness, which need determinism (the sim never consumes a mob's internal
// RNG for fight outcomes — sim/world.go pre-rolls HP externally).
var processSalt int64

// SeedProcess sets the per-process salt mixed into every mob's RNG seed. Call
// once at server boot, before any mob spawns; not safe to mutate concurrently
// with live spawns. Mirrors sys.SkillSystem.SeedRNG's boot-vs-deterministic
// split.
func SeedProcess(salt int64) { processSalt = salt }

// defaultMobHealthGainTick is the built-in out-of-combat regen rate: a fraction
// of the mob's max pool per tick, i.e. the full pool in 5 seconds (PO
// 2026-07-26; was 2 s, the value this was hardcoded to before it became a conf
// knob — backlog §27.2.3). THE source of truth for the rate: the conf blocks
// restate it for discoverability and an absent entry resolves back to here
// (SetHealthGainTick), so a retune must move this constant.
//
// Caveat the duration only holds above ~150 HP: vitals.HP floors a positive
// amount at 1 HP, so smaller pools regenerate 1 HP/tick and refill in
// maxHealth/30 seconds regardless of this rate — pinned by
// TestMob_SmallPoolsHealFasterThanTheNominalDuration. The player's identical
// mechanic carries the fraction across ticks instead (player/update.go:49).
const defaultMobHealthGainTick = 1.0 / (5 * constant.TicksPerSecond)

// healthGainTick is the out-of-combat regen rate in the SAME unit as the
// player's game.player.healthGainTick — a fraction of maxHealth per tick — so
// the two mechanics are one vocabulary in two config blocks. Set once at boot
// via SetHealthGainTick; left at the default in tests and the sim harness.
//
// Note the deliberate asymmetry: the player's rate is additionally scaled by
// regenTaper(level) while a mob's is flat. That is one of the divergences
// backlog §31 tracks toward a shared entity stat block.
var healthGainTick float32 = defaultMobHealthGainTick

// SetHealthGainTick sets the out-of-combat regen rate for every mob. Call once
// at server boot, before any mob spawns; not safe to mutate concurrently with
// live spawns. A non-positive value (an absent conf entry) restores the
// built-in default rather than disabling regen — normalized here at the single
// write point, so no read site has to re-check it.
func SetHealthGainTick(fractionPerTick float32) {
	if fractionPerTick <= 0 {
		healthGainTick = defaultMobHealthGainTick
		return
	}
	healthGainTick = fractionPerTick
}

// HealthGainTick is the effective regen rate after normalization — the value a
// boot log should report, since a missing conf entry resolves to the default.
func HealthGainTick() float32 { return healthGainTick }

// defaultMobWalkingSpeedPerTick is the built-in base movement step in world
// units per tick, multiplied by the mob's factors.speed to give its velocity.
// THE source of truth for the rate, exactly like defaultMobHealthGainTick
// above: the conf block restates it and an absent entry resolves back to here.
//
// ⚑ It is deliberately NOT the player's 0.05 (game.player.walkingSpeedPerTick).
// Converging the two is a rename into one vocabulary, never a silent balance
// change — adopting the player's number would make every mob in the game 9%
// slower, and all 50 authored factors.speed values are tuned against this one
// (plan-entity-model.md landmine L1).
const defaultMobWalkingSpeedPerTick float32 = 0.055

// defaultChaseIntoAuraMargin [PLACEHOLDER] is how far past its own aura edge a
// mob closes before it stops (shouldApproach). It must equal the value
// core/gameconf.go normalizes a non-positive game.mobChaseIntoAuraMargin to —
// this fallback only ever fires for callers that pass 0, and until H1a the two
// disagreed 4× (0.05 here vs 0.2 there), so no running mob ever used this one.
const defaultChaseIntoAuraMargin float32 = 0.2

// walkingSpeedPerTick is the base step in the SAME unit and under the SAME
// name as the player's game.player.walkingSpeedPerTick, so the two mechanics
// are one vocabulary in two config blocks (the game.mob.healthGainTick
// precedent, backlog §27.2.3). Set once at boot via SetWalkingSpeedPerTick;
// left at the default in tests and the sim harness.
var walkingSpeedPerTick = defaultMobWalkingSpeedPerTick

// SetWalkingSpeedPerTick sets the base movement step for every mob spawned
// after it. Call once at server boot, before any mob spawns; not safe to
// mutate concurrently with live spawns. A non-positive value (an absent conf
// entry) restores the built-in default rather than freezing every mob —
// normalized here at the single write point.
//
// Note it is consumed at CONSTRUCTION (velocity is stored per mob), unlike
// healthGainTick which is read per tick: changing it mid-run leaves already
// spawned mobs at their old speed.
func SetWalkingSpeedPerTick(unitsPerTick float32) {
	if unitsPerTick <= 0 {
		walkingSpeedPerTick = defaultMobWalkingSpeedPerTick
		return
	}
	walkingSpeedPerTick = unitsPerTick
}

// WalkingSpeedPerTick is the effective base step after normalization — the
// value a boot log should report, since a missing conf entry resolves to the
// default.
func WalkingSpeedPerTick() float32 { return walkingSpeedPerTick }

// mobRNGSeed derives a mob's RNG seed from the process salt and its entity ID.
// The salt shifts the whole sequence per run (per-run randomness); the ID keeps
// streams independent even for mobs constructed in the same instant, so one
// mob's drop rolls never mirror another's. The splitmix64 finalizer decorrelates
// consecutive IDs (which otherwise seed near-identical LCG streams).
func mobRNGSeed(salt int64, id uint64) int64 {
	x := uint64(salt) + id*0x9E3779B97F4A7C15
	x = (x ^ (x >> 30)) * 0xBF58476D1CE4E5B9
	x = (x ^ (x >> 27)) * 0x94D049BB133111EB
	return int64(x ^ (x >> 31))
}

// NewMob builds a mob from its definition. space is the physics space used for
// obstacle steering (mob-depth chunk 4) — nil disables steering (movement is
// pure straight-line geometry, as before the chunk); every production spawn
// site passes the real space.
func NewMob(d *mobs.MobDefinition, chaseIntoAuraMargin float32, space *phy.Space) *Mob {
	// The wire EntityType comes from the def's optional entityType override
	// (chunk 9: throwaway/variant defs reuse existing sprites), falling back to
	// the def name — the pre-chunk-9 rule for all legacy defs.
	entityType, ok := mobs.ResolveEntityType(d.EntityType, d.Name)
	if !ok {
		// Unreachable for registry-loaded defs: the loader validates resolvability
		// at content load (§27.2.1). Reaching here means a def was built outside the
		// loader (a synthetic sim/test def) with an unresolved EntityType — panic so
		// it fails that unit with a stack trace rather than os.Exit-ing the process.
		key := d.EntityType
		if key == "" {
			key = d.Name
		}
		panic(fmt.Sprintf("mob %d/%s: EntityType %q unresolved — def bypassed loader validation", d.ID, d.Name, key))
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
	// The authored role (chunk 2). Absent → creature, re-applied here because a
	// definition built outside the loader (tests, the sim harness) carries the
	// zero value; an unknown one is a def that bypassed loader validation, so it
	// panics like the EntityType above rather than degrading silently into a
	// creature — a wrong role is a wrong behaviour, not a cosmetic default.
	role, ok := mobs.ParseRole(string(d.Role))
	if !ok {
		panic(fmt.Sprintf("mob %d/%s: role %q unknown — def bypassed loader validation", d.ID, d.Name, d.Role))
	}

	// Auras-off-until-aggroed (mob-depth chunk 3c): a creature's aura only runs
	// while it has an aggro target (Update flips it on/off). Structures are
	// exempt: a hazard that does not chase has its aura as its entire behavior,
	// so it stays always-on. ⚑ Authored, not inferred (chunk 2): this used to
	// read `Factors.Speed <= 0`, which made "is a turret" a side effect of a
	// tuning value and forced every structure to carry a dummy aggroRadius.
	if auraCount > 0 && role == mobs.RoleStructure {
		sc.SetActiveAura(0)
	}
	// Role-as-loadout (round 3, support.go): which slot supports and which
	// fights, derived from the loadout's aura CATEGORIES rather than latched as
	// a mob type. Both may be set (a hybrid), both may be absent (a prop mob).
	// Orthogonal to the authored actor role above — that says what it IS, this
	// says what its loadout can DO.
	supportSlot, combatSlot := loadoutSlots(sc)

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

	// Faction + aggro set from the definition (chunk 6.6).
	faction, aggroMask := definitionAllegiance(d)

	// AggroRadius is validated > 0 at definition load time. The sensor's mask
	// follows the aggro set: no mob faction in the set = no action-layer bit =
	// no new broadphase pairs (the chunk-6.6 perf knob); a passive faction's
	// sensor sees nothing at all — unless it has something to say, see
	// refreshSensorMask.
	//
	// SenseRadius, not Body.AggroRadius: an actor has ONE sensor, sized by
	// whichever job needs to see further (chunk 3a, D7). For everything that
	// carries no conversation the two are identical.
	aggroAura := phy.NewCircle(phy.VEC2F_ZERO, d.SenseRadius())
	aggroAura.Shape().Layer = int(model.LayerNoneCollision)
	// Widened below by refreshSensorMask when the loadout carries support.
	aggroAura.Shape().Mask = aggroSensorMask(aggroMask)
	aggroAura.Shape().IsSensor = true

	base := model.NewBaseEntity(mobBody, model.EntityType(entityType))
	rnd := rand.New(rand.NewSource(mobRNGSeed(processSalt, base.Basic().ID())))

	// Baseline HP pool (item 11 Phase 1). A definition without baseMaxHealth
	// falls back to a default so directly-constructed mobs (tests) are never
	// born dead.
	baseMaxHealth := float32(d.Factors.BaseMaxHealth)
	if baseMaxHealth == 0 {
		baseMaxHealth = float32(defaultMobMaxHealth)
	}
	// Spawn HP roll (item 11 Phase 3): variance is a percentage band around the
	// authored pool, fixed for the mob's lifetime. It rides the BASE rather than
	// the curved pool (chunk 1b) so the two compose in either order; vitals.HP's
	// min-1 in MaxHealth keeps even a 1-HP base alive.
	if v := d.Factors.MaxHealthVariance; v > 0 {
		baseMaxHealth = vitals.RollVariance(baseMaxHealth, v, rnd)
	}
	m := &Mob{
		BaseEntity:          base,
		space:               space,
		rand:                rnd,
		heading:             phy.Vec2f{X: -1, Y: 0},
		baseMaxHealth:       baseMaxHealth,
		definition:          d,
		skills:              sc,
		aura:                aura,
		aggroAura:           aggroAura,
		spawnPosition:       phy.VEC2F_ZERO,
		spawnInitialized:    false,
		velocity:            walkingSpeedPerTick * d.Factors.Speed,
		role:                role,
		supportSlot:         supportSlot,
		combatSlot:          combatSlot,
		supportThreshold:    d.Factors.SupportThreshold,
		chaseIntoAuraMargin: chaseIntoAuraMargin,
		statusEffects:       model.NewStatusEffects(),
		faction:             faction,
		aggroMask:           aggroMask,
	}
	// Spawns at full health — MaxHealth is derived, so the pool only exists
	// once the definition and skill component are in place.
	m.health = m.MaxHealth()
	// Unreachable in the running game — every non-test caller passes the value
	// core/gameconf.go has already normalized. It exists for callers that pass
	// 0, and it holds the same number that normalizer does, so there is one
	// chase margin in the codebase rather than two that disagree (H1a).
	if m.chaseIntoAuraMargin <= 0 {
		m.chaseIntoAuraMargin = defaultChaseIntoAuraMargin
	}
	// Absent in the definition → support anything short of full health, which
	// is what the pre-round-3 seek-healer did (validated to [0, 1] at load).
	if m.supportThreshold <= 0 {
		m.supportThreshold = defaultSupportThreshold
	}
	m.refreshSensorMask()
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

	// steerProbe/steerHits/steerMobHits are the steering queries' reused
	// scratch (see steeringProbe): the lookahead circle and one hit buffer per
	// query — statics for blockerRepulsion, mob bodies for mobSeparation —
	// built once per mob instead of once per tick. Never read outside
	// steering.go.
	steerProbe   *phy.Circle
	steerHits    []phy.Collider
	steerMobHits []phy.DynamicCollider

	// chase stuck watchdog (see stuck.go): net-progress window + camp state.
	progressAnchorPos phy.Vec2f
	progressTicks     int
	camped            bool
	campTicks         int
	campTargetPos     phy.Vec2f

	health vitals.VitalSign
	// baseMaxHealth is the mob's pool at the BASELINE curve position, with its
	// lifetime spawn-variance roll already folded in: the authored
	// factors.baseMaxHealth × the roll, unrounded. Everything else about the
	// pool is derived per read by MaxHealth — f(Level) and the max-health
	// passive — because an owned summon's level moves under it (chunk 1b).
	baseMaxHealth float32
	// healthRegen carries the sub-1-HP remainder of out-of-combat regeneration
	// between ticks. Same name, same unit and same reason as the player's
	// (player/update.go): healthGainTick is a fraction of a pool stored as
	// integer HP, so most mobs earn well under 1 HP per tick and rounding each
	// tick in isolation would either lose the regen or — via vitals.HP's min-1
	// floor — pay a whole HP for a fraction of one, which is what used to make
	// every pool under ~150 HP refill far faster than the configured duration.
	healthRegen float32
	heading     phy.Vec2f
	rand        *rand.Rand

	skills    *skills.SkillComponent
	aura      *phy.Circle
	aggroAura *phy.Circle

	velocity         float32
	buffs            skills.Buffs // transient status-effect store: resist/slow/dot (effect foundations Step 2)
	aggroTarget      model.Combatant
	spawnPosition    phy.Vec2f
	spawnInitialized bool

	// conversing is set while at least one player has a panel open with this
	// actor (chunk 3b-ii, D22): it holds position so a patrolling NPC can be
	// stopped and talked to, and resumes its route the moment the last
	// conversation ends. Recomputed every tick by the InteractionSystem with a
	// clear-then-set pass over its slices — a bool rather than a per-tick map,
	// to keep the idle loop allocation-free (fe0044d0).
	//
	// ⚑ One tick stale by construction (L23): InteractionSystem and MobSystem
	// share priority 20, so their order within a tick is registration order, not
	// design. An actor can take one extra 33 ms step after a conversation opens
	// or ends. Build nothing on same-tick ordering here.
	conversing bool

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

	// inCombatTicks is the damage-recency in-combat window (playtest round 3):
	// stamped to combatRegenGraceTicks by any real HP loss and aged one per
	// Update. Deliberately the SAME name, unit and default as the player's
	// (model/player/player.go) — the mob and player combat models are meant to
	// converge (backlog §31), so matching vocabularies now makes that a rename
	// rather than a redesign, exactly as game.mob.healthGainTick did for regen.
	//
	// Unlike the player's, it is stamped only by damage TAKEN, not by damage
	// dealt: a mob holding an aggro target is already in combat through the
	// other half of InCombat, so the dealt half would be redundant. That is why
	// Mob still does not implement model.CombatActor.
	inCombatTicks int

	// leashTicks counts ticks with the target unreachable, out of the aggro
	// sensor and dealing no damage; past leashCountdownTicks the mob resets
	// (3b).
	leashTicks int

	// role is the authored actor discriminator (chunk 2): creature, structure or
	// follower. It answers "what is this", which used to be read off incidental
	// values — a structure by its speed being 0, a follower by having an owner
	// and a non-zero velocity. Orthogonal to the loadout slots below and to
	// ownership: a totem is a structure WITH an owner.
	role mobs.Role

	// Loadout slots (round 3, see support.go). supportSlot/combatSlot are the
	// aura slots this mob would use to support an ally and to fight, −1 when the
	// loadout has none; they replace the old latched `seekHealer` type flag.
	// mode is what it is doing THIS tick, re-derived every tick by selectMode.
	// supportTarget is the wounded ally it is looking after — deliberately its
	// own field, so aggroTarget can go back to meaning only "the enemy I fight".
	supportSlot      int
	combatSlot       int
	supportThreshold float32
	mode             combatMode
	supportTarget    model.Combatant

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
	// rewards.
	//
	// summonPowerPerLevel is the summon skill's authored powerPerOwnerLevel
	// RATE, not the computed multiplier — SummonPower() evaluates it against the
	// owner's CURRENT level so a companion's output tracks its owner exactly as
	// its pool already does (entity-model R5; before this it was stamped once at
	// spawn and a summon that outlived a ding stayed behind forever). 0 means
	// "unset" and reads as neutral 1.
	owner               model.PlayerEntity
	ttlTicks            int
	summonPowerPerLevel float32

	// charmer is the player this mob currently fights for (plan-faction-flips
	// chunk 3, D2/D6), nil for everything else. It is deliberately NOT owner:
	// owner answers "whose level do I stand at", and a charmed mob keeps its
	// own (L-B/L-M — Level() reads the owner's level live since entity-model
	// chunk 1b, so binding here would shrink a charmed elite to its charmer).
	// The two other questions owner used to answer alone are CreditTo() (who
	// gets my XP and kill credit) and leader() (whose combat signals do I
	// follow), and both prefer the charmer.
	//
	// The DURATION is not here: it is a charmPayload in the buff store, so the
	// client pip comes for free. Charm/EndCharm keep the two in step; Update
	// polls for expiry, because charm's expiry has to act.
	charmer model.PlayerEntity

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

// definitionAllegiance derives a mob's authored faction and aggro set from its
// definition. The loader always resolves both (absent key → hostile default);
// the zero-value guard catches directly-constructed definitions (tests) —
// FactionAligned is the zero value, and no authored species is ever aligned
// (items/mobs/definitions.go rejects it by name).
//
// Shared by NewMob and RevertFaction, so a reverted mob lands on exactly the
// allegiance it was born with rather than on the raw definition fields — the
// aligned→hostile rewrite above is precisely the difference.
func definitionAllegiance(d *mobs.MobDefinition) (model.Faction, uint64) {
	if model.Faction(d.Faction) == model.FactionAligned {
		return model.FactionHostile, model.FactionAligned.Bit()
	}
	return model.Faction(d.Faction), d.AggroMask
}

// Align joins the player side: faction aligned, hostile to everything that is
// not. TWO callers today — the spawn effect raising a PLAYER's summon
// (sys/skills.go; a mob caster hands over its own side instead, see
// EnlistUnder) and campfire placement (cmd/aurad) — both immediately after
// NewMob, so the aggro reset below is inert for them.
//
// ⚑ The all-but-aligned mask is a DERIVATION, not a shortcut: it mirrors the
// player's own ungated harm rights (sys/skills.go — a caster without a
// HostilityGate may harm any different-faction target), and sys/skills.go's
// mayHarm depends on it, so every companion, totem and campfire would silently
// lose its harm rights if this were derived from the built-in aligned faction's
// own (retaliation-only) authored mask instead.
//
// This replaces the former general SetFaction(f), whose ^f.Bit() was correct
// for aligned and UNDEFINED for every other destination — it discarded the
// species' authored hostileTo set with nothing logged and nothing failing
// (plan-entity-model.md L2 / plan-faction-flips.md §2). Any further destination
// wants its own named verb, not a resurrected setter.
func (m *Mob) Align() {
	m.faction = model.FactionAligned
	m.aggroMask = ^model.FactionAligned.Bit()
	m.refreshSensorMask()
	// The player is still on a flipped mob's threat table, and
	// updateEnemyTargeting reads highestThreatTarget FIRST — so without this it
	// re-latches as the aggro target and the mob chases menacingly while
	// MayHarm grants it nothing (plan-faction-flips.md §4.2 / L-A).
	m.resetAggro()
}

// RevertFaction returns the mob to the allegiance its species authors — the
// exact faction and aggro mask it was constructed with, read back off the
// definition rather than reconstructed, so no curated hostileTo set can be lost
// in the round trip.
//
// The empty threat table is load-bearing on this edge too: the mob re-acquires
// through its RESTORED authored mask, so "the charm wears off and it turns on
// you" falls out of the ordinary acquisition path with no re-engage code — the
// same property SetFleeOverride relies on.
func (m *Mob) RevertFaction() {
	m.faction, m.aggroMask = definitionAllegiance(m.definition)
	m.refreshSensorMask()
	m.resetAggro()
}

// EnlistUnder makes this mob fight on its summoner's side — the summoner's
// faction AND its reaction table, handed over as one (model.Allegiance). The
// only caller is the spawn effect with a MOB caster; a player caster has no
// aggro set to hand out and gets Align instead.
//
// ⚑ Adopting the faction alone is the L2 defect in miniature: the old
// SetFaction(caster.Faction()) gave an orc's summons "hostile to everything
// that is not orc", so a squad raised at the front would also have hunted the
// wildlife and the townsfolk it walked past. Inheriting the summoner's set is
// both narrower and the thing content actually authored.
func (m *Mob) EnlistUnder(summoner model.Allegiance) {
	m.faction = summoner.Faction()
	m.aggroMask = summoner.AggroMask()
	m.refreshSensorMask()
	m.resetAggro()
}

// AggroMask is the set of factions this mob PROACTIVELY acquires, exposed for
// model.Allegiance. Read-only by design: it is derived from the faction, never
// assigned (see Align / RevertFaction / EnlistUnder).
func (m *Mob) AggroMask() uint64 {
	return m.aggroMask
}

// refreshSensorMask re-derives the aggro sensor's mask from the aggro set, plus
// the support widening. It has to be a derivation rather than a one-off at
// construction: spawnSummon calls Align after NewMob (a companion joins the
// player side), which would otherwise narrow the mask straight back and
// leave every summoned medic blind to the allies it exists to heal.
func (m *Mob) refreshSensorMask() {
	// Any mob carrying a support aura senses fellow COMBATANTS (both body
	// layers) so it can spot wounded allies at aggro range and move to them —
	// its hostility set may be empty (a passive faction), which would otherwise
	// blind its sensor. findWoundedAlly filters down to same-faction wounded.
	// Widened from seek-healers to any support carrier in round 3: a hybrid must
	// see allies AND enemies. The cost is confined to those mobs; every damage
	// mob keeps its narrow aggro-set mask.
	if m.supportSlot >= 0 {
		m.aggroAura.Shape().Mask = int(model.LayerCombatants)
		return
	}
	mask := aggroSensorMask(m.aggroMask)
	// ⚑ A conversant must see players regardless of what it aggros (chunk 3a,
	// L11). An NPC's faction is passive by design, so aggroSensorMask returns
	// LayerNoneCollision for it — the sensor would report nobody and the NPC
	// would be silently mute, with every evaluator test still green. Same
	// shape as the support widening above: the cost is confined to the mobs
	// that need it.
	if m.definition.Interaction != nil {
		mask |= int(model.LayerPlayerCollision)
	}
	m.aggroAura.Shape().Mask = mask
}

// Sensor is the actor's proximity sensor — the SAME circle as its aggro aura,
// because "approach" is aggro for something friendly (chunk 3a). It is already
// registered as a dynamic shape via Bodies(), which is the requirement the
// deleted addNpcEntity existed to satisfy: the broadphase only records
// collisions onto dynamic shapes, so a static sensor would sense nothing.
func (m *Mob) Sensor() phy.DynamicCollider { return m.aggroAura }

// Interaction is the conversation this actor carries, nil for the overwhelming
// majority that carry none. It is the Conversant capability the interaction
// system asserts on — never a type test, so a creature, a structure and a
// follower can each talk without a branch.
func (m *Mob) Interaction() *mobs.Interaction { return m.definition.Interaction }

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

// SetSummonPowerPerLevel sets the summon skill's authored powerPerOwnerLevel
// rate (spawn site only). Deliberately the RATE and not the product: the product
// would freeze the owner's level at spawn.
func (m *Mob) SetSummonPowerPerLevel(perLevel float32) {
	m.summonPowerPerLevel = perLevel
}

// SummonPower is the owner-level damage/heal multiplier (model.Owned),
// evaluated LIVE at the owner's current level — Level() already returns the
// owner's level for an owned mob, so this is the same read the pool and the
// curve make.
//
// ⚑ This was the last half-frozen term in the summon chain (entity-model R5).
// Chunk 1b made the pool and f(L) track the owner live but left this one stamped
// at spawn, so a companion summoned at 9 that survived the ding to 10 stayed
// ~5 % under one summoned at 10, permanently, against PO ruling ② ("levels
// dynamic for every actor"). A summon SPAWNED at a given level is unaffected —
// which is why no battery could see the difference.
//
// The zero value reads as neutral so directly-constructed mobs (tests, world
// spawns) deal authored damage.
func (m *Mob) SummonPower() float32 {
	// The owner check is not redundant with the rate check: without an owner
	// Level() falls back to the mob's own authored curveLevel, so a rate left on
	// an unowned mob would silently scale off the wrong level. Owner-less means
	// neutral, full stop.
	if m.owner == nil || m.summonPowerPerLevel <= 0 {
		return 1
	}
	return skills.Scaled(float32(1), m.summonPowerPerLevel, m.Level())
}

// Level is where this mob stands on f(L) — the mob-side counterpart of the
// player's progression.Level, and the accessor the Actor model was missing:
// the two entity kinds always shared ONE curve, but only the player could say
// which level to evaluate it at (plan-entity-model.md chunk 1a, gap 3).
//
// An OWNED summon stands where its owner stands, read live rather than
// snapshotted at spawn (chunk 1b decision, PO 2026-07-26): a companion that
// keeps fighting while its player levels keeps up, in HP exactly as it already
// did in output. A world mob stands at its authored curveLevel (GDD §5: zone
// number = curve position); below 1 clamps to the baseline, matching Curve.F
// and the loader's default for an unauthored curveLevel. The owner reference
// wins over the authored level outright — no max, no sum: the summon defs are
// authored at the baseline precisely because the owner supplies the level.
func (m *Mob) Level() int {
	if m.owner != nil {
		return int(m.owner.Progression().Level)
	}
	if m.definition.CurveLevel < 1 {
		return 1
	}
	return m.definition.CurveLevel
}

// PowerScale is f(this mob's level) — the same global inflation multiplier the
// player reads (model.PowerScaled, C0): the SkillSystem multiplies this mob's
// skill HP values by it at cast time, so mob-skill JSONs stay
// baseline-authored. Evaluated from the curve at the mob's CURRENT level, so a
// summon's output rides its owner's curve through this one call — which is why
// casterPowerScale no longer multiplies the owner's PowerScale in separately
// (chunk 1b; doing both would apply f(ownerLevel) twice, landmine L3). A
// definition without a curve (hand-built in sim/tests) reads as neutral 1, the
// SummonPower convention.
func (m *Mob) PowerScale() float32 {
	return float32(m.definition.Curve.F(m.Level()))
}

// RestoreToFullHealth fills the pool without counting as a heal (no floating
// number, no heal-received bookkeeping) — the spawn site's tool: a summon is
// constructed before its owner is known, so its pool widens to f(ownerLevel)
// only once SetOwner lands.
func (m *Mob) RestoreToFullHealth() {
	m.health = m.MaxHealth()
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

	// Charm expiry before acquisition, so a reverted mob acquires through its
	// restored authored mask on this very tick (plan-faction-flips chunk 3).
	m.updateCharm()

	// Aura damage is applied by the SkillSystem (Phase 6.1); Update only
	// handles aggro, movement, regeneration and death.

	m.updateAggro()

	// Movement follows the mode's target (round 3): support mode walks to the
	// ALLY it is healing, engage mode to the enemy it is fighting. The
	// health-threshold flee (shouldFlee) is enemy-relative and only applies to
	// engage — a healer at low health does not run away from its patient.
	//
	// Resolved once: highestThreatTarget prunes dead rows as it reads, so it is
	// not a free repeat call.
	var fleeFrom model.Combatant
	if m.mode == modeFlee {
		fleeFrom = m.highestThreatTarget()
	}

	switch {
	case m.mode == modeSupport && m.supportTarget != nil:
		if m.shouldApproach(m.supportTarget) {
			m.chaseTowards(m.supportTarget.Position())
		} else {
			m.resetChaseWatchdog()
		}
	// A pacifist under attack with nobody to support runs from whoever is
	// hitting it (round 5). The threat table is the source for "whoever" —
	// it is already maintained for pacifists (noteThreat gates on faction and
	// liveness, never on pacifism), so this needs no new bookkeeping. With no
	// live threat there is nothing to run from, and it falls through to idle.
	case fleeFrom != nil:
		m.resetChaseWatchdog()
		m.moveAwayFrom(fleeFrom.Position())

	case m.aggroTarget != nil:
		if m.shouldFlee() {
			m.resetChaseWatchdog()
			m.moveAwayFrom(m.aggroTarget.Position())
		} else if m.shouldApproach(m.aggroTarget) {
			m.chaseTowards(m.aggroTarget.Position())
		} else {
			m.resetChaseWatchdog()
		}
	default:
		m.resetChaseWatchdog()
		m.updateIdleMovement()
	}

	// Regeneration gates on COMBAT STATE, not on holding a target (round 3).
	// Those were the same thing until support mode gave a mob a reason to hold
	// a target it is not fighting, and until damage recency gave it a reason to
	// be in combat while holding none — which is the bug that made a lone
	// healer unkillable.
	// A DERIVED pool can shrink under a mob's feet (chunk 1b): an unequipped
	// max-health passive, or an owner who somehow lost a level. Current health
	// is absolute and never rises with the pool, so only this direction needs
	// handling — leaving health above the cap would render as an over-full bar
	// and hand out free effective HP.
	if maxHP := m.MaxHealth(); m.health > maxHP {
		m.health = maxHP
	}

	if !m.InCombat() {
		// Heal out of combat at the configured fraction of the pool per tick
		// (absolute HP, item 11; rate is game.mob.healthGainTick, §27.2.3).
		// The fraction is carried across ticks rather than rounded each tick —
		// see healthRegen — so the rate encodes the same duration whatever the
		// pool size.
		maxHP := m.MaxHealth()
		if m.health < maxHP {
			m.healthRegen += float32(maxHP) * healthGainTick
			if m.healthRegen >= 1 {
				whole := uint32(m.healthRegen)
				m.healthRegen -= float32(whole)
				m.health = m.health.AddCapped(whole, maxHP)
			}
		}
		// Back at full health and out of combat = fight over; earlier
		// contributors no longer count as participants for the next one.
		if m.health >= maxHP && len(m.participants) > 0 {
			m.participants = nil
		}
	}

	// Age the combat window last, so a mob is gated for the full grace after
	// its last hit rather than the grace minus the tick that stamped it.
	if m.inCombatTicks > 0 {
		m.inCombatTicks--
	}

	return m.health > 0
}

// shouldApproach reports whether t is still out of reach of the mob's CURRENT
// aura. Target-agnostic since round 3 so support mode can reuse it: m.aura is
// re-sized every tick from the active slot (sys/skills.go), so a mob that
// switched to a shorter-ranged heal automatically closes the extra distance.
func (m *Mob) shouldApproach(t model.Combatant) bool {
	if t == nil {
		return false
	}

	// Stop once target is already within damage aura, minus a tiny margin.
	// Include player radius because collision is shape-vs-shape.
	stopDistance := m.aura.Radius + t.Radius() - m.chaseIntoAuraMargin
	if stopDistance < 0 {
		stopDistance = 0
	}
	return m.Position().Sub(t.Position()).Abs() > stopDistance
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
// Reports whether the slow was genuinely new rather than a refresh (§5.2).
func (m *Mob) ApplySlow(source skills.SkillID, fraction float32, ticks int) bool {
	return m.buffs.ApplySlow(source, fraction, ticks)
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

// stepLength is this tick's movement distance: base velocity raised by the
// movement-speed passive and scaled by the transient buffs — speed_burst
// against the strongest active slow (shared by chase, walk-home and flee).
//
// ⚑ The passive applies HERE, at the consumption site, not to the stored
// velocity (chunk 1a): velocity is set once at construction, so folding the
// factor in there would freeze whatever loadout the mob spawned with. The
// player's equivalent site (core/input.go) is the same shape, and both read the
// transient half from the same skills.Buffs.MovementFactor.
func (m *Mob) stepLength() float32 {
	return m.velocity * m.skills.Derived.MovementSpeedFactor() * m.buffs.MovementFactor()
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

// combatRegenGraceTicks [PLACEHOLDER] is how long after its last taken damage a
// mob stays in combat, gating out-of-combat regeneration (~3.3 s @ 30 TPS).
// Deliberately the player's constant of the same name and value
// (model/player/player.go) rather than a mob-specific one — see inCombatTicks.
const combatRegenGraceTicks = 100

// updateAggro drives acquisition, threat retention and the state-dependent
// leash (mob-depth chunk 3). Retention: whenever the threat table holds a
// living entry, the highest-threat entity IS the aggro target — the sensor
// only acquires. Acquisition: with an empty table and no latched target, the
// nearest living enemy-faction entity in the aggro sensor is picked; a hit
// from outside the sensor seeds threat and acquires through retention, so
// mobs retaliate against snipers.
// Since round 3 it is a three-step pipeline rather than a chain of early
// returns: pick an enemy (by whichever acquisition strategy fits the mob), pick
// an ally worth supporting, then let selectMode decide which of the two the mob
// acts on. The early returns it replaced skipped everything downstream of them —
// which is why a healer never leashed, never retaliated, never respected the
// campfire safe-zone, and a follower with a heal aura never healed at all.
func (m *Mob) updateAggro() {
	// Calm breaks on ANY damage, from any source, including the calmer's own
	// aura (plan-faction-flips §5.4, PO ruling: calm is a disengage tool, not
	// crowd control). Checked BEFORE the switch on purpose: the damage that
	// broke the calm already wrote its threat row, so clearing the flag here
	// lets updateEnemyTargeting retaliate on the SAME tick. Doing it inside the
	// calm case would swallow the hit and cost a tick of retaliation.
	if m.buffs.Calmed() && m.tookDamage {
		m.buffs.DropCalm()
	}

	switch {
	// A calmed mob acquires nothing and holds no target — it has walked out of
	// the fight. Ahead of the pacifist branch because calm is the stronger
	// statement: a pacifist still supports allies and still flees, a calmed mob
	// does neither. resetAggro every tick (not just on apply) is what keeps
	// threat written by a friendly-fire tick from re-latching a target, and the
	// aura gates off for free — no target means selectMode falls to modeIdle.
	case m.buffs.Calmed():
		m.tookDamage = false
		m.resetAggro()
		m.supportTarget = nil

	// A mob that can support but cannot fight acquires no enemy at all: it has
	// nothing to answer one with (PO 2026-07-25 — pacifist healers ignore their
	// attacker). Note this is now a statement about its LOADOUT, not its type,
	// and it is checked BEFORE the follower branch on purpose: a medic
	// companion is both, and acquiring its owner's attacker would drag it away
	// from the ally it exists to heal to chase something it cannot hurt.
	case m.isPacifist():
		m.tookDamage = false

	// Followers (chunk 6) are owner-centric: acquisition from the owner's
	// combat signals, stickiness bounded by the owner tether — no sensor
	// (its mask sees the player layer), no threat retention (hits on the
	// companion never re-target it, §3.6), no leash (the tether replaces it).
	case m.isFollower():
		m.tookDamage = false
		m.updateCompanionTargeting()

	default:
		m.updateEnemyTargeting()
	}

	// Support acquisition runs for every mob carrying a support aura, follower
	// or not — the collision between the two old early returns is exactly what
	// left MedicCompanion and ShieldbearerCompanion unable to heal. A calmed
	// mob is the one exception: "out of combat" has to mean it stops healing
	// its pack too, or calm would silently keep a support mob fighting the
	// player's fight for it. (No authored calm reaches a support mob today —
	// the wildlife allowlist has none — but leaving it ungated would make that
	// a latent bug rather than a decision.)
	if !m.buffs.Calmed() {
		m.updateSupportTarget()
	}

	m.selectMode()
}

// updateEnemyTargeting is the ordinary sensor+threat acquisition path: the
// pre-round-3 body of updateAggro, unchanged.
func (m *Mob) updateEnemyTargeting() {
	tookDamage := m.tookDamage
	m.tookDamage = false

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

// setAggroTarget latches the enemy this mob fights. Since round 3 it no longer
// touches the active aura: applyMode is the single writer of aura gating, and it
// runs at the end of the same updateAggro, so the end-of-tick state is unchanged
// while the "who I chase" / "what I have switched on" conflation is gone.
func (m *Mob) setAggroTarget(t model.Combatant) {
	if m.aggroTarget == nil {
		m.noteCombatEntry()
	}
	m.aggroTarget = t
}

// resetAggro is the combat reset: target + threat cleared, countdown zeroed —
// walk-home follows from having no target in Update, and the aura gates off
// through applyMode falling to modeIdle.
func (m *Mob) resetAggro() {
	m.aggroTarget = nil
	m.threat = nil
	m.leashTicks = 0
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
	return m.withinSensor(m.aggroTarget)
}

// withinSensor is the target-agnostic form, shared with support retention.
func (m *Mob) withinSensor(t model.Combatant) bool {
	if t == nil {
		return false
	}
	reach := m.aggroAura.Radius + t.Radius()
	return m.Position().Sub(t.Position()).Abs() <= reach
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
	if amount <= 0 {
		return
	}
	if e := m.threatEntryFor(source); e != nil {
		e.threat += amount
	}
}

// threatEntryFor resolves the row to credit for source, creating it — and the
// table — on first credit. It returns nil when source is not creditable at
// all: nil, same-faction, or dead. That gate is shared by every crediting
// path, which is what lets the readers skip re-checking faction on a row that
// is already on the table.
func (m *Mob) threatEntryFor(source model.Combatant) *threatEntry {
	if source == nil {
		return nil
	}
	if source.Faction() == m.faction || source.HealthRatio() == 0 {
		return nil
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
	return e
}

// pruneDeadThreat drops every row whose entity is dead (a TTL-expired summon
// zeroes its health, so stale refs read as dead). The readers that act on a
// row call it first, which is why a threat table shrinks without anyone
// owning a cleanup pass. ThreatSnapshot deliberately does NOT call it: a
// read-only debug dump must not mutate what it is dumping.
func (m *Mob) pruneDeadThreat() {
	for id, e := range m.threat {
		if e.entity.HealthRatio() == 0 {
			delete(m.threat, id)
		}
	}
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
// (chunk 6.6). Gates match noteThreat because both go through
// threatEntryFor: nil, allied and dead sources are dropped, as are
// non-positive margins.
func (m *Mob) ForceThreatToTop(source model.Combatant, margin float32) {
	if margin <= 0 {
		return
	}

	// Current max over living entries. Measured BEFORE the taunter's own row is
	// created: a first-time taunter must not count itself as the bar it has to
	// clear, and a repeat taunter must.
	m.pruneDeadThreat()
	var max float32
	for _, e := range m.threat {
		if e.threat > max {
			max = e.threat
		}
	}

	if e := m.threatEntryFor(source); e != nil {
		e.threat = max + margin
	}
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
// atmosphere & recovery chunk 1) — read by the regen gate and by a healer
// deciding whether an allied mob it heals counts as an in-combat ally.
//
// Two halves, either sufficient (playtest round 3): holding an aggro target,
// OR having taken damage recently. It used to be the first alone, which made
// every mob that cannot acquire a target — a pacifist healer — permanently
// "out of combat" and therefore permanently regenerating, whatever was being
// done to it.
func (m *Mob) InCombat() bool {
	return m.aggroTarget != nil || m.inCombatTicks > 0
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
// faction flips (Align/RevertFaction) don't touch it: friendliness is
// authored on the species, and no summoned species is friendly.
func (m *Mob) FriendlyToPlayers() bool {
	return m.definition.FriendlyToPlayers
}

// highestThreatTarget returns the living top-threat entity, pruning dead
// entries on the way (a TTL-expired summon zeroes its health, so stale refs
// read as dead). Ties break toward the lower entity ID for determinism.
func (m *Mob) highestThreatTarget() model.Combatant {
	m.pruneDeadThreat()

	var best *threatEntry
	var bestID uint64
	for id, e := range m.threat {
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
// max_health wire field so the client draws health/maxHealth. Fully derived,
// the same three factors the player's pool is derived from (chunk 1b):
//
//	baseMaxHealth (authored baseline × lifetime variance roll)
//	  × f(Level)  — inflation, and the whole of a summon's body scaling
//	  × Derived.MaxHealthFactor() — the max-health passive
//
// Every pool cap in this file goes through here, so a wider pool is a real
// pool rather than only a bigger number on the wire. Current health is
// absolute and does NOT move with the pool: a summon whose owner levels grows
// room to regenerate into, exactly like the player's own pool. The shrinking
// direction is clamped in Update.
func (m *Mob) MaxHealth() vitals.VitalSign {
	return vitals.VitalSign(vitals.HP(m.baseMaxHealth * m.PowerScale() * m.skills.Derived.MaxHealthFactor()))
}

// HealthRatio is the current/max health fraction (0..1), read by the
// lowest_health aura selector (roadmap.md item 11).
func (m *Mob) HealthRatio() float32 {
	maxHP := m.MaxHealth()
	if maxHP == 0 {
		return 0
	}
	return float32(m.health) / float32(maxHP)
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
	// A gated hit (content pass C1) is opt-in: a mob that does not name the key
	// in factors.gateKeys was never a valid target — the same non-event as a
	// fully resisted hit. ⚑ D4 moved this OFF the resistance map: "immune to
	// everything except harvest" and "takes half damage from fire" are not the
	// same idea, and writing them in the same words is what made a mistyped tag
	// a silently-inert skill.
	if damage.GateKey != "" && !skills.GateOpensFor(damage.GateKey, m.definition.Factors.GateKeys) {
		return 0
	}
	multiplier := skills.ResistMultiplier(damage.Tags, m.definition.Factors.Resistances) *
		m.buffs.ResistMultiplier(damage.Tags)

	// Passive damage reduction (DerivedStats) — the same shared factor the
	// player's takeDamage applies, in the same position: after resistances,
	// before the non-event check (chunk 1a). Base resistances and a reduction
	// passive are distinct sources and stack multiplicatively.
	hp32 := damage.HP * multiplier * m.skills.Derived.DamageReductionFactor()
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
		// ...and the damage-recency window behind InCombat (round 3). The
		// leash consumes tookDamage once per tick; this one outlives it, so a
		// mob that never retaliates still counts as fighting.
		m.inCombatTicks = combatRegenGraceTicks
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
	m.health = m.health.AddCapped(hp, m.MaxHealth())
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
// Reports whether the buff was genuinely new rather than a refresh (§5.2).
func (m *Mob) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) bool {
	return m.buffs.ApplyResist(source, tags, factor, ticks)
}

// ApplyDot grants a damage-over-time debuff (effect foundations Step 2); it
// runs its full authored duration independent of re-application, ticked by
// the SkillSystem via DueBuffEvents.
// Reports whether this application ignited the mob rather than refreshing a
// burn already running (§5.1).
func (m *Mob) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) bool {
	return m.buffs.ApplyDot(source, dot, ticks)
}

// ApplyHot grants a heal-over-time buff (plan-skill-vocab chunk 3) — mobs can
// be HoT'd by content, the machinery is entity-agnostic; ticked by the
// SkillSystem via DueBuffEvents.
// Reports whether the buff was genuinely new rather than a refresh (§5.2).
func (m *Mob) ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) bool {
	return m.buffs.ApplyHot(source, hot, ticks)
}

// ApplyShield grants (or tops up) an absorb pool from a shield effect
// (plan-skill-vocab chunk 2) — mobs can be shielded by content, the machinery
// is entity-agnostic; drained by takeDamage before HP.
// Reports whether the pool was newly granted or a drained one restored (§5.2).
func (m *Mob) ApplyShield(source skills.SkillID, hp float32, ticks int) bool {
	return m.buffs.ApplyShield(source, hp, ticks)
}

// ApplySpeed grants a movement-speed buff from a speed_burst cooldown; read
// each tick by stepLength via the composed MovementFactor. Mob content can
// carry a sprint of its own, the same way it can carry a self-haste.
func (m *Mob) ApplySpeed(source skills.SkillID, factor float32, ticks int) {
	m.buffs.ApplySpeed(source, factor, ticks)
}

// ApplyTickRate grants a haste / tick-slow buff scaling this mob's own aura
// cadence (skill-vocab chunk 6) — mobs can be hasted/slowed by content, the
// machinery is entity-agnostic; the SkillSystem reads the composed factor each
// tick via TickRateFactor.
func (m *Mob) ApplyTickRate(source skills.SkillID, factor float32, ticks int) {
	m.buffs.ApplyTickRate(source, factor, ticks)
}

// ApplyCalm puts this mob out of combat for ticks (plan-faction-flips chunk 2,
// D7). It drops the CURRENT aggro link, not just future acquisition (PO
// 2026-07-28): calm is the tool you reach for because something is already
// chewing on you, and "prevents acquisition" would do nothing about that.
//
// The countdown lives in the buff store, not in a Mob field, so it ages on the
// existing Tick() and carries its own applied-effect pip.
func (m *Mob) ApplyCalm(source skills.SkillID, ticks int) {
	m.buffs.ApplyCalm(source, ticks)
	m.resetAggro()
}

// Calmed reports whether this mob is currently out of combat by calm.
func (m *Mob) Calmed() bool {
	return m.buffs.Calmed()
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
	lost := m.takeDamage(model.Damage{HP: factors.Damage, Tags: factors.DamageTags, GateKey: factors.GateKey, Crit: factors.Crit}, model.StatusEffectDamagedAmbient)
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
	var names []string
	m.forEachCredited(func(p model.PlayerEntity) { names = append(names, p.Name()) })
	sort.Strings(names)
	return names
}

// forEachCredited visits everyone this mob's death rewards reach, each exactly
// once: every participant plus their recent healers. It is the single
// statement of the credit RULE — tryGrantKillRewards grants against it and
// KillCreditNames names against it, and the two must never disagree about who
// is on the list.
//
// ⚑ Visits in participant-map order, i.e. Go's randomized one. Do not sort
// here: rewardPlayer draws from the mob's RNG per unlock roll, so imposing an
// order would shift that stream on every multi-participant kill. Callers
// needing a stable result sort their own output, as KillCreditNames does.
func (m *Mob) forEachCredited(visit func(model.PlayerEntity)) {
	seen := make(map[uint64]bool, len(m.participants))
	for id, p := range m.participants {
		if !seen[id] {
			seen[id] = true
			visit(p)
		}
		for _, healer := range p.RecentHealers() {
			hid := healer.Basic().ID()
			if !seen[hid] {
				seen[hid] = true
				visit(healer)
			}
		}
	}
}

// NotePresence records a bystander with an active aura as a combat
// participant (chunk P, presence-counts attribution — model.PresenceNoter).
// The gate is P2: presence joins a player fight, it never starts one — the mob
// must be in combat AND already hold ≥1 participant (a player damage-touch, or
// player-credited summon/charm damage via CreditTo, both of which land in
// PlayerTouches). An NPC-vs-NPC fight has participants empty, so standing at
// the army-vs-orc skirmish earns nothing. From here the bystander is an
// ordinary participant (P3): same rewardPlayer fan-out — full XP, kill-unlock
// rolls, the C6 kill-broadcast name — and the same clear-on-full-regen.
func (m *Mob) NotePresence(p model.PlayerEntity) {
	if !m.InCombat() || len(m.participants) == 0 {
		return
	}
	m.noteParticipant(p)
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
	m.forEachCredited(func(p model.PlayerEntity) { m.rewardPlayer(p, xp) })
}

// rewardPlayer grants one participant their death rewards: the full XP amount
// plus an independent roll on every declared kill unlock (Phase 6.2, unlock
// source #2). Discovery is idempotent; the client-side spellbook diff turns a
// fresh unlock into the glow animation with no extra wire event.
func (m *Mob) rewardPlayer(p model.PlayerEntity, xp uint64) {
	p.AddExperience(xp)
	// Quest credit rides the same fan-out as XP credit (plan-quests.md D4) and
	// fires on participation, not XP amount — an experience: 0 harvest species
	// still counts (L13). Keyed by the authored species id (L12).
	p.QuestLedger().NoteKill(m.definition.ID)
	for _, u := range m.definition.Unlocks {
		// The roll is always consumed (RNG stream unchanged); only a genuinely
		// new discovery announces its source (plan-unlock-attribution.md).
		if m.rand.Float32() < u.Chance && !p.SkillComponent().HasDiscovered(u.Skill.ID) {
			p.SkillComponent().Discover(u.Skill.ID)
			p.Client().SendUnlock(uint64(u.Skill.ID), "Dropped by: "+m.dropSourceName())
		}
	}
	// A kill-drop discovery can newly satisfy a recipe (Phase 9).
	p.ApplyRecipeCascade()
}

// dropSourceName is the friendly mob name for a "Dropped by: X" unlock label —
// the CamelCase definition name spaced out (the same derivation the /mobs
// nameplate catalog uses).
func (m *Mob) dropSourceName() string {
	return skills.DeriveDisplayName(m.definition.Name)
}
