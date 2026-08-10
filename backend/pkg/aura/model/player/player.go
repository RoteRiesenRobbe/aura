package player

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"log/slog"
	"math"
	"sort"
	"strconv"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/minions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

var _ = model.PlayerEntity(&player{})
var _ = model.Healable(&player{})

func New(g model.Game, c model.Client, name string) model.PlayerEntity {
	e := minions.NewCircleEntity(0.25)

	e.EntityType = model.EntityType(AuraApi.EntityTypeCharacter)
	p := &player{
		BaseEntity:     e,
		client:         c,
		name:           name,
		ownedEntitites: model.NewBasicEntities(),
		config:         &g.Config().PlayerConfig,
		skillDefs:      g.Skills(),
		stats:          model.Stats{BirthTick: g.Ticks()},
		progression:    model.PlayerProgression{Level: 1, Experience: 0},
		statusEffects:  model.NewStatusEffects(),
		// Dash aims along the last movement direction (chunk 5); default to a
		// unit vector so a never-moved player still has a valid dash direction.
		lastMoveDir: phy.Vec2f{X: 1, Y: 0},
	}

	// setup body
	shapeGroup := int(p.ID())
	p.Body.Shape().UserData = p
	p.Body.Shape().Group = shapeGroup
	p.Body.Shape().Layer = int(model.LayerViewportCollision | model.LayerPlayerCollision)
	p.Body.Shape().Mask = int(model.LayerPlayerStaticCollision | model.LayerBorderCollision)

	// setup viewport
	p.viewport = phy.NewBox(e.Body.Position(), phy.Vec2f{X: constant.ViewPortWidth / 2, Y: constant.ViewPortHeight / 2})

	p.viewport.Shape().IsSensor = true
	p.viewport.Shape().Mask = int(model.LayerViewportCollision)
	p.viewport.Shape().Group = shapeGroup

	// Build the XP table now rather than on first use. Encoding reads it for
	// every character in every viewport, so a lazy build would write to one
	// player's table during another player's snapshot — harmless while the
	// loop is single-threaded, and a data race the moment NetSystem fans out
	// (plan-server-performance.md chunk 2). The lazy path stays for players
	// built by struct literal (sim, unit tests).
	p.xpCumulative()

	//--- initialize skill component
	sc, err := initializePlayerSkills(g.Skills())
	if err != nil {
		panic(err)
	}
	p.skills = sc
	p.milestoneUnlocks = g.Config().MilestoneUnlocks
	p.recipes = g.Config().Recipes
	p.adoptQuestLedger(quests.NewLedger(g.Quests()))
	// A fresh spawn starts at level 1 with an otherwise-empty spellbook
	// (triage item 11) — everything beyond the level-1 milestones (Damage, Q4)
	// comes through the discovery paths. The seeding ends in the recipe
	// cascade, so this is also the uniform-discovery call the bare cascade
	// used to be.
	p.applyCreationMilestones()

	//--- setup vital signs
	p.PlayerVitalSigns.Health = p.MaxHealth() // absolute HP (item 11 Phase 1)

	// setup the single aura sensor; SkillSystem resizes it per tick to the
	// active skill's EffectiveRadius (0 while nothing is active)
	aura := phy.NewCircle(e.Body.Position(), 0)
	aura.Shape().IsSensor = true
	aura.Shape().Group = shapeGroup
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerPlayerCollision | model.LayerActionCollision)
	p.aura = aura

	return p
}

//---- player

type player struct {
	name string

	model.BaseEntity
	statusEffects    model.StatusEffects
	newStatusEffects model.StatusEffects

	angle       float32
	lastMoveDir phy.Vec2f
	client      model.Client

	// flight is the campfire-to-campfire fast-travel state
	// (plan-flight-paths.md C2); zero value = on the ground.
	flight flightState

	viewport *phy.Box
	aura     *phy.Circle

	model.PlayerVitalSigns

	config *cfg.PlayerConfig
	// xpTable memoizes the cumulative XP curve — see xpCumulative.
	xpTable []uint64

	ownedEntitites model.BasicEntities

	isGod  bool
	wasGod bool

	// speedCheatFactor is the dev SPEED command's movement multiplier;
	// 0/1 = off (input path treats <= 0 as 1).
	speedCheatFactor float32

	stats       model.Stats
	progression model.PlayerProgression

	skills           *skills.SkillComponent
	milestoneUnlocks []skills.MilestoneUnlock
	recipes          skills.RecipeRegistry

	// skillDefs resolves a spellbook entry to its definition. Needed because
	// the D10 point cost is relative to each skill's own cap, and the
	// spellbook stores levels only (plan-numbers-rewrite L1). Boot-global and
	// immutable, so a rebuilt player (death, reconnect, revive) simply takes it
	// from the game again.
	skillDefs skills.Registry

	// questLedger is the character's lifetime quest state (plan-quests.md C1).
	// Like the skill component it outlives this struct: the connection-state
	// stash carries the pointer across death and reconnect (L11).
	questLedger *quests.Ledger

	// healers inside the participation window (roadmap item 10);
	// lazily initialized by NoteHealedBy
	recentHealers map[uint64]*healerEntry

	// per-tick floating-number accumulators (roadmap item 11): health lost,
	// healing received (VitalSign units), and XP gained this tick; reset each
	// tick by ResetTickNumbers.
	damageTaken  vitals.VitalSign
	critTaken    vitals.VitalSign // crit-flagged share of damageTaken (chunk 1)
	costPaid     vitals.VitalSign // resource cost paid this tick (round-7 item 7)
	healReceived vitals.VitalSign
	xpGained     uint64

	// auraHitStyle is the aura-hit VFX a damage aura stamped on this player this
	// tick (item 11 Step 4); reset each tick alongside the accumulators above.
	auraHitStyle model.AuraHitStyle

	// campfireBound is stamped the tick a campfire dwell completes (chunk 4):
	// the fire became this player's respawn anchor. Reset each tick alongside
	// the accumulators above; drives the client's "bound" feedback.
	campfireBound bool

	// homeCampfire and discoveredCampfires are the map's campfire markers
	// (plan-world-map.md C2), published together by the ConnectionStateSystem
	// on the two occasions either can change: entering the world, and
	// completing a dwell. Reset each tick alongside the accumulators above.
	//
	// ⚑ EMPTY PUBLISHES NOTHING, and that is sound rather than sloppy: the set
	// only grows, so "published empty" can only happen while the client's own
	// set is still empty, and a bind never reverts to unbound inside a session.
	// Absent therefore always means "no change", never "cleared".
	homeCampfire        string
	discoveredCampfires []string

	// campCharges is how many Camp baseline-utility charges this player is
	// holding (plan-downtime.md C2, D3). Deliberately NOT a per-tick
	// accumulator and deliberately NOT persisted: it refills to cap by
	// dwelling at a real campfire, is spent at a channel's completion, and is
	// simply absent from the freshly built player struct a respawn produces —
	// which is how "zeroed on death" is achieved by construction rather than
	// by a reset someone has to remember. Only a reconnect carries it, through
	// the stash.
	campCharges int

	// bloodlineUnlocks is what this character's SLOT has already spent on past
	// ascensions, stamped from the auth ticket at join (plan-ascension.md D16).
	bloodlineUnlocks    []string
	bloodlineAscensions int

	// rejectedSkill/rejectedReason are stamped the tick a cooldown activation
	// is refused by its precondition (plan-skill-vocab chunk 4, §3.5): the
	// SkillSystem notes it, the wire carries it once, reset each tick
	// alongside the accumulators above.
	rejectedSkill  skills.SkillID
	rejectedReason model.ActivationRejection

	// interactableEntityID is the conversant this player can talk to right now
	// (chunk 3b-i); 0 = none. Re-stamped every tick by the InteractionSystem
	// from its sensors and cleared alongside the accumulators above, so it is
	// live state rather than an event — there is no enter/leave bookkeeping to
	// desync. It drives the client's interact badge AND validates the Interact
	// message that badge produces, which is what stops the two disagreeing.
	//
	// interactableDistSq carries the nearest-wins tie-break (L17) here instead
	// of in a per-tick scratch map in the system: where two sensors overlap the
	// stamp must be deterministic or the badge flickers, and doing it with two
	// comparisons on the player keeps the idle loop allocation-free.
	interactableEntityID uint64
	interactableDistSq   float32

	// conversingWith is the actor this player currently has a panel open with
	// (chunk 3b-ii); 0 = none. ⚑ Unlike the stamp above it is NOT a per-tick
	// number and deliberately does not join ResetTickNumbers — a conversation
	// survives across ticks and is ended only by one of the explicit conditions
	// in sys.InteractionSystem (close, range loss, either party entering combat,
	// death, disconnect).
	//
	// conversation is the personalised tree streamed alongside it, rebuilt every
	// tick by the InteractionSystem so a row flips to known the tick after its
	// grant lands. Together they are the whole of the server's session state:
	// where the player IS in the tree is a client concern, because every apply
	// is validated on its own merits rather than on the path taken (D16).
	conversingWith uint64
	conversation   *model.Conversation

	// healthRegen accumulates sub-1-HP out-of-combat regen (item 11 Phase 1):
	// with absolute integer HP the per-tick regen is often < 1 HP, so it is
	// carried here and applied once a whole HP has built up.
	healthRegen float32

	// buffs is the transient status-effect store (effect foundations Step 2):
	// resist_aura buffs and dot debuffs. Aged on the same per-tick lifecycle
	// as the accumulators above; dies with the entity — respawn starts clean
	// (carriedState stashes only progression + SkillComponent).
	buffs skills.Buffs

	// Companion combat signals (mob-depth chunk 6, §3.6): the last mob this
	// player directly damaged (assist) and the last mob that damaged this
	// player (defend), each valid for combatSignalWindowTicks. Aged in
	// ResetTickNumbers alongside the accumulators; die with the entity.
	attackTarget      model.Combatant
	attackTargetTicks int
	attacker          model.Combatant
	attackerTicks     int

	// inCombatTicks is the time-gated in-combat window (atmosphere & recovery
	// chunk 1): stamped to combatRegenGraceTicks by any combat action — taking
	// harm (takeDamage), dealing a harmful effect, or supporting an in-combat
	// ally (both via the SkillSystem's NoteCombatAction) — and aged one per tick
	// in ResetTickNumbers. Passive regen is gated on it being zero. Exit is
	// purely time-based: no proximity/target scan (deliberate WoW divergence —
	// regen may resume while still chased). Dies with the entity.
	inCombatTicks int
}

// combatRegenGraceTicks [PLACEHOLDER] is how long after its last combat action
// a player stays in combat, gating passive regen and loadout editing
// (~3.3 s @ 30 TPS; was 5 s, cut by a third — the equip lock felt too long).
// Deliberately its own constant, not combatSignalWindowTicks (3 s) — a regen
// grace that short would let regen flicker on between hits.
const combatRegenGraceTicks = 100

// combatSignalWindowTicks [PLACEHOLDER] is how long a combat signal stays
// readable by a companion (~3 s) — long enough to bridge aura tick cadences,
// short enough that a companion doesn't chase stale grudges.
const combatSignalWindowTicks = 90

// NoteAttackDealt stamps the assist signal (model.AttackNotifier): called by
// Mob.PlayerTouches on direct hits only (Damage.Source == nil).
func (p *player) NoteAttackDealt(target model.Combatant) {
	p.attackTarget = target
	p.attackTargetTicks = combatSignalWindowTicks
}

// RecentAttackTarget is the assist half of model.CombatSignals: the last mob
// this player directly damaged, nil once expired or dead.
func (p *player) RecentAttackTarget() model.Combatant {
	return liveSignal(p.attackTarget, p.attackTargetTicks)
}

// RecentAttacker is the defend half of model.CombatSignals: the last mob that
// damaged this player, nil once expired or dead.
func (p *player) RecentAttacker() model.Combatant {
	return liveSignal(p.attacker, p.attackerTicks)
}

func liveSignal(c model.Combatant, ticks int) model.Combatant {
	if c == nil || ticks <= 0 || c.HealthRatio() == 0 {
		return nil
	}
	return c
}

// NoteCombatAction stamps the in-combat window (model.CombatActor; atmosphere
// & recovery chunk 1): called on any combat engagement — from takeDamage on
// taking harm, and from the SkillSystem when this player's harmful effect lands
// or it supports an in-combat ally.
func (p *player) NoteCombatAction() {
	p.inCombatTicks = combatRegenGraceTicks
}

// InCombat reports whether the recent-action window is still open
// (model.Combatant); passive regen is gated on it.
func (p *player) InCombat() bool {
	return p.inCombatTicks > 0
}

func (p *player) StatusEffects() *model.StatusEffects {
	return &p.statusEffects
}

func (p *player) poolFactor() float32 {
	// f(level) × (1 + passive bonus), C0: the curve carries inflation, the
	// passive stays relative at every level (Philosophy A, GDD §5).
	// Leveling raises maxHealth; current HP stays and regenerates up.
	// The passive half is DerivedStats' shared formula (chunk 1a) — the mob
	// side of MaxHealth() calls the same method.
	//
	// ⚑ Deliberately NOT called maxHealthFactor: DerivedStats.MaxHealthFactor()
	// is the passive term ALONE, and two same-named methods meaning different
	// things is how the curve gets dropped. Mob.MaxHealth() writes this same
	// product inline; whoever gives *Mob a healCaster-shaped method (sys/skills.go
	// documents that as coming) must return the PRODUCT, not the passive.
	return p.PowerScale() * p.skills.Derived.MaxHealthFactor()
}

// PowerScale is f(character level) — the global HP-value inflation multiplier
// (model.PowerScaled, GDD §5). The SkillSystem multiplies the player's
// HP-side skill output by it; poolFactor rides the same curve.
func (p *player) PowerScale() float32 {
	return float32(p.config.LevelCurve.F(int(p.progression.Level)))
}

// MaxHealth is the player's absolute HP pool (item 11 Phase 1):
// round(baseHealth × poolFactor). Serialized as the max_health wire field.
func (p *player) MaxHealth() vitals.VitalSign {
	return vitals.VitalSign(vitals.HP(float32(p.config.BaseHealth) * p.poolFactor()))
}

// HealthRatio is the current/max health fraction (0..1), read by the
// lowest_health aura selector (roadmap.md item 11).
func (p *player) HealthRatio() float32 {
	maxHP := p.MaxHealth()
	if maxHP == 0 {
		return 0
	}
	return float32(p.PlayerVitalSigns.Health) / float32(maxHP)
}

// takeDamage subtracts absolute HP (item 11 Phase 1). Damage no longer scales
// by poolFactor — a hit removes flat HP regardless of the player's pool.
// The hit's damage tags are carried for tag resistances (Phase 2); players
// have no base resistances, transient resist-aura buffs land in Step 3.
// Returns the "damage dealt" that feeds lifesteal and threat: shield-absorbed
// damage + actual HP lost after clamping — overkill never counts
// (plan-skill-vocab chunk 2, F6 §3.1/9; mirrors the mob site).
func (p *player) takeDamage(damage model.Damage, s model.StatusEffect) vitals.VitalSign {
	// A gated hit (content pass C1) damages only mobs that name its key, and a
	// player has no gateKeys at all — so it never damages a player (defensive;
	// nothing casts gated damage at players under no-PvP).
	if damage.GateKey != "" {
		return 0
	}
	// Tag resistances (Phase 2): resist passives (Derived) and transient
	// resist-aura buffs are distinct sources and stack multiplicatively.
	hp32 := damage.HP *
		skills.ResistMultiplier(damage.Tags, p.skills.Derived.Resistances) *
		p.buffs.ResistMultiplier(damage.Tags)
	// Passive damage reduction (DerivedStats); 100% is the natural cap,
	// clamped inside the shared factor (chunk 1a — the mob takeDamage calls
	// the same method).
	hp32 *= p.skills.Derived.DamageReductionFactor()
	// God short-circuits before the absorb step — god never drains a shield.
	if p.IsGod() {
		return 0
	}
	// A fully resisted hit stays a non-event: no combat stamp, no absorb.
	if vitals.HP(hp32) <= 0 {
		return 0
	}

	// Shield absorb (chunk 2, F6 §3.1/8): post-mitigation damage drains the
	// absorb pools first, the leftover hits HP. The ≤1-point rounding drift
	// between HP(absorbed)+HP(rest) and HP(hp32) is accepted.
	absorbed := vitals.VitalSign(vitals.HP(p.buffs.AbsorbShield(hp32)))
	hp := vitals.HP(hp32 - float32(absorbed))

	h := p.PlayerVitalSigns.Health
	p.PlayerVitalSigns.Health = h.Sub(hp)
	loss := h - p.PlayerVitalSigns.Health // actual loss after clamping
	// The floating-number accumulators show real HP loss only; absorbed
	// damage reads as the shield bar dropping.
	p.damageTaken += loss
	if damage.Crit {
		p.critTaken += loss // crit_taken wire accumulator (chunk 1, §4.3)
	}
	p.StatusEffects().Add(s)
	// Taking harm enters combat (chunk 1): the take-harm direction, stamped
	// at the single damage choke point so every damage-aura and dot tick,
	// mob or PvP, gates regen uniformly. Fully absorbed hits count — being
	// beaten on your shield is combat (§3.1).
	p.NoteCombatAction()
	dealt := absorbed + loss
	// Damage interrupt (chunk 4): dealt > 0 — absorbed hits included —
	// cancels a running cast, but only for skills that opted in
	// (castInterruptedByDamage; the flag check lives on the component).
	if dealt > 0 {
		p.skills.CancelCastOnDamage()
	}
	return dealt
}

// DamageTaken / HealReceived / XpGained expose the per-tick floating-number
// accumulators (roadmap item 11).
func (p *player) DamageTaken() vitals.VitalSign { return p.damageTaken }

// CritTaken is the crit-flagged share of this tick's damage taken (chunk 1,
// §4.3); serialized as the crit_taken wire field so the client pops it big.
func (p *player) CritTaken() vitals.VitalSign    { return p.critTaken }
func (p *player) HealReceived() vitals.VitalSign { return p.healReceived }
func (p *player) XpGained() uint64               { return p.xpGained }

// CostPaid is the resource cost charged this tick (round-7 item 7): the
// damage-taken twin for what the player SPENT — serialized as the cost_paid
// wire field, popped as a blue floating number. NoteCostPaid is called by the
// SkillSystem's chargeCost, the one place a cost leaves the pool.
func (p *player) CostPaid() vitals.VitalSign { return p.costPaid }
func (p *player) NoteCostPaid(paid vitals.VitalSign) {
	p.costPaid += paid
}

// NoteHealReceived records healing applied to this player this tick; the
// SkillSystem calls it when a heal aura lands.
func (p *player) NoteHealReceived(delta vitals.VitalSign) {
	p.healReceived += delta
}

// Heal restores up to hp absolute HP, capped at MaxHealth, records the
// floating heal number, and returns the HP actually restored (model.Healable;
// mob-depth chunk 8). It centralizes the heal write the SkillSystem used to do
// inline, so a heal aura can target players and mobs through one seam.
func (p *player) Heal(hp uint32) vitals.VitalSign {
	before := p.PlayerVitalSigns.Health
	p.PlayerVitalSigns.Health = before.AddCapped(hp, p.MaxHealth())
	healed := p.PlayerVitalSigns.Health - before
	p.NoteHealReceived(healed)
	return healed
}

// AuraHitStyle is the aura-hit VFX stamped on this player this tick (item 11
// Step 4); serialized as the Character aura_hit_style wire field.
func (p *player) AuraHitStyle() model.AuraHitStyle { return p.auraHitStyle }

// CampfireBound reports whether a campfire dwell completed this tick
// (chunk 4); serialized as the Character campfire_bound wire field.
func (p *player) CampfireBound() bool { return p.campfireBound }

// NoteCampfireBound records that a campfire became this player's respawn
// anchor this tick; the ConnectionStateSystem's dwell tracker calls it.
func (p *player) NoteCampfireBound() { p.campfireBound = true }

// HomeCampfire is the spawn point this player would respawn at, published this
// tick; "" when there is nothing to publish. Serialized into the owner-only
// GameState table (plan-world-map.md C2).
func (p *player) HomeCampfire() string { return p.homeCampfire }

// DiscoveredCampfires is the whole set of spawn points this character has
// dwelled at, published this tick; nil when there is nothing to publish.
func (p *player) DiscoveredCampfires() []string { return p.discoveredCampfires }

// NoteCampfireState publishes both to this tick's GameState; the
// ConnectionStateSystem calls it on entering the world and on completing a
// dwell.
//
// ⚑ It does NOT stamp campfireBound. Entering the world republishes the pair
// without anything having been bound just now, and the bound stamp is what pops
// "Bound to campfire" over the character — firing it on every login would be a
// user-visible regression with no bind behind it.
func (p *player) NoteCampfireState(home string, discovered []string) {
	p.homeCampfire = home
	p.discoveredCampfires = discovered
}

// CampCharges is how many Camp charges this player holds (C2); serialized as
// the own-player camp_charges wire field.
func (p *player) CampCharges() int { return p.campCharges }

// BloodlineUnlocks / SetBloodlineUnlocks carry what this slot has already spent
// (plan-ascension.md §12.4 C2a step 3). Set once at join from the ticket.
func (p *player) BloodlineUnlocks() []string { return p.bloodlineUnlocks }

func (p *player) SetBloodlineUnlocks(keys []string) { p.bloodlineUnlocks = keys }

func (p *player) BloodlineAscensions() int { return p.bloodlineAscensions }

func (p *player) SetBloodlineAscensions(n int) { p.bloodlineAscensions = n }

// SpendCampCharge consumes one charge, reporting whether there was one to
// consume. Called at CHANNEL COMPLETION, never at the press (D4): an
// interrupted channel did no work and pays nothing, the R2 shape.
func (p *player) SpendCampCharge() bool {
	if p.campCharges <= 0 {
		return false
	}
	p.campCharges--
	return true
}

// RefillCampCharges tops the store up to this player's level-derived cap
// (D9). To-cap rather than by-one: the fire is the anchor of the loop, so
// leaving it should always mean leaving it full.
func (p *player) RefillCampCharges() {
	if cap := skills.CampChargeCap(int(p.Progression().Level)); p.campCharges < cap {
		p.campCharges = cap
	}
}

// SetCampCharges restores a stashed count on reconnect. The only writer
// besides the two verbs above, and deliberately clamped: the cap can have
// shrunk between the disconnect and the return only if the level did, but a
// clamp costs one comparison and makes the invariant unconditional.
func (p *player) SetCampCharges(n int) {
	if cap := skills.CampChargeCap(int(p.Progression().Level)); n > cap {
		n = cap
	}
	if n < 0 {
		n = 0
	}
	p.campCharges = n
}

// ActivationRejected reports the cooldown activation refused this tick
// (chunk 4, §3.5); zero values = none. Serialized as
// activation_rejected_skill_id + activation_rejected_reason.
func (p *player) ActivationRejected() (skills.SkillID, model.ActivationRejection) {
	return p.rejectedSkill, p.rejectedReason
}

// Interactable reports the conversant this player can talk to this tick
// (chunk 3b-i); 0 = none. Serialized as interactable_entity_id, and compared
// against an incoming Interact to decide whether to honour it.
func (p *player) Interactable() uint64 { return p.interactableEntityID }

// NoteInteractable offers a conversant at squared distance distSq; the nearest
// offer of the tick wins (L17). The InteractionSystem calls it once per actor
// whose sensor holds this player, in whatever order its actor list happens to
// be in — hence the comparison rather than a plain assignment.
func (p *player) NoteInteractable(id uint64, distSq float32) {
	if p.interactableEntityID != 0 && distSq >= p.interactableDistSq {
		return
	}
	p.interactableEntityID = id
	p.interactableDistSq = distSq
}

// ConversingWith reports the actor this player has a panel open with (chunk
// 3b-ii); 0 = none.
func (p *player) ConversingWith() uint64 { return p.conversingWith }

// SetConversingWith opens or ends the session. 0 ends it, and drops the tree
// with it so a stale panel can never outlive its conversation — the client
// closes the panel because the tree left the snapshot, never on its own say-so.
func (p *player) SetConversingWith(id uint64) {
	p.conversingWith = id
	if id == 0 {
		p.conversation = nil
	}
}

// Conversation is the streamed tree; nil = no panel. Serialized as
// GameState.conversation.
func (p *player) Conversation() *model.Conversation { return p.conversation }

// SetConversation replaces the tree. The InteractionSystem rebuilds it every
// tick the session is alive, which is what makes a taught row disappear on the
// snapshot after the grant.
func (p *player) SetConversation(c *model.Conversation) { p.conversation = c }

// NoteActivationRejected records a precondition-refused cooldown activation
// this tick; the SkillSystem calls it.
func (p *player) NoteActivationRejected(skill skills.SkillID, reason model.ActivationRejection) {
	p.rejectedSkill = skill
	p.rejectedReason = reason
}

// NoteAuraHit records the aura-hit VFX style for this tick; the SkillSystem
// calls it when a damage aura strikes this player.
func (p *player) NoteAuraHit(style model.AuraHitStyle) { p.auraHitStyle = style }

// ApplyResist grants a transient tag-resistance buff from a resist aura
// (item 11 Phase 2); re-applied each aura tick, it expires on the same
// per-tick lifecycle as the floating-number accumulators.
// Reports whether the buff was genuinely new rather than a refresh (§5.2).
func (p *player) ApplyResist(source skills.SkillID, tags []string, factor float32, ticks int) bool {
	return p.buffs.ApplyResist(source, tags, factor, ticks)
}

// ApplyDot grants a damage-over-time debuff (effect foundations Step 2); it
// runs its full authored duration independent of re-application, ticked by
// the SkillSystem via DueBuffEvents.
// Reports whether this application ignited the player rather than refreshing a
// burn already running (§5.1).
func (p *player) ApplyDot(source skills.SkillID, dot skills.DotBuff, ticks int) bool {
	return p.buffs.ApplyDot(source, dot, ticks)
}

// ApplyHot grants a heal-over-time buff (plan-skill-vocab chunk 3); it runs its
// full authored duration independent of re-application (the linger that makes a
// hot_aura keep healing after leaving range), ticked by the SkillSystem via
// DueBuffEvents.
// Reports whether the buff was genuinely new rather than a refresh (§5.2).
func (p *player) ApplyHot(source skills.SkillID, hot skills.HotBuff, ticks int) bool {
	return p.buffs.ApplyHot(source, hot, ticks)
}

// ApplyShield grants (or tops up) an absorb pool from a shield effect
// (plan-skill-vocab chunk 2); drained by takeDamage before HP.
// Reports whether the pool was newly granted or a drained one restored (§5.2).
func (p *player) ApplyShield(source skills.SkillID, hp float32, ticks int) bool {
	return p.buffs.ApplyShield(source, hp, ticks)
}

// ApplySpeed grants a movement-speed buff from a speed_burst cooldown (Swift);
// the movement site reads the composed value each tick via MovementFactor.
func (p *player) ApplySpeed(source skills.SkillID, factor float32, ticks int) {
	p.buffs.ApplySpeed(source, factor, ticks)
}

// MovementFactor is this player's transient movement-speed multiplier: speed
// buffs composed with the strongest active slow, 1.0 with nothing applied.
//
// ⚑ This is the first thing that lets a buff touch player movement. Slows have
// been in the store all along but only mobs ever read them (mob.stepLength), so
// a slow_aura pointed at a player was silently inert; going through the shared
// MovementFactor closes that on both sides at once.
func (p *player) MovementFactor() float32 {
	return p.buffs.MovementFactor()
}

// ApplyTickRate grants a haste / tick-slow buff scaling this player's own aura
// cadence (skill-vocab chunk 6); the SkillSystem reads the composed factor each
// tick via TickRateFactor.
func (p *player) ApplyTickRate(source skills.SkillID, factor float32, ticks int) {
	p.buffs.ApplyTickRate(source, factor, ticks)
}

// TickRateFactor is the combined tick_rate multiplier on this player's aura
// cadence (skill-vocab chunk 6); 1.0 = no haste/slow active.
func (p *player) TickRateFactor() float32 {
	return p.buffs.TickRateFactor()
}

// ApplyLifesteal grants a damage-leech buff from a lifesteal_burst cooldown
// (Bloodthirst, R3 / §5.6); the damage site reads the composed value when it
// builds each hit's payload, via LifestealFraction.
func (p *player) ApplyLifesteal(source skills.SkillID, fraction float32, ticks int) {
	p.buffs.ApplyLifesteal(source, fraction, ticks)
}

// LifestealFraction is the share of damage dealt this player's hits currently
// leech back, on top of whatever the firing effect authors; 0 with no burst up.
func (p *player) LifestealFraction() float32 {
	return p.buffs.LifestealFraction()
}

// ShieldHP is the current total absorb capacity across all active pools;
// serialized as the shield_hp wire field. A live value, not a per-tick
// accumulator — no ResetTickNumbers involvement.
func (p *player) ShieldHP() vitals.VitalSign {
	return vitals.VitalSign(vitals.HP(p.buffs.ShieldTotal()))
}

// AppliedEffects is the bitmask of buff/debuff kinds currently applied to this
// player; serialized as the applied_effects wire field. A live value, like
// ShieldHP.
func (p *player) AppliedEffects() skills.AppliedEffect {
	return p.buffs.AppliedEffects()
}

// DueBuffEvents advances and drains this tick's due dot damage and hot heal
// events; called once per tick by the SkillSystem's acting site.
func (p *player) DueBuffEvents() ([]skills.DotHit, []skills.HotEvent) {
	return p.buffs.DueBuffEvents()
}

// ResetTickNumbers clears the per-tick floating-number accumulators and ages
// the transient buff store; called by the StatusEffectsSystem at the start
// of each tick.
func (p *player) ResetTickNumbers() {
	p.damageTaken = 0
	p.critTaken = 0
	p.costPaid = 0
	p.healReceived = 0
	p.xpGained = 0
	p.auraHitStyle = model.AuraHitStyleNone
	p.campfireBound = false
	p.homeCampfire = ""
	p.discoveredCampfires = nil
	p.rejectedSkill = 0
	p.rejectedReason = model.ActivationRejectedNone
	p.interactableEntityID = 0
	p.interactableDistSq = 0
	p.buffs.Tick()
	// Age the companion combat signals (chunk 6); the refs stay until
	// re-stamped, the getters gate on the remaining window.
	if p.attackTargetTicks > 0 {
		p.attackTargetTicks--
	}
	if p.attackerTicks > 0 {
		p.attackerTicks--
	}
	// Age the in-combat window (chunk 1); regen resumes when it hits zero.
	if p.inCombatTicks > 0 {
		p.inCombatTicks--
	}
}

func (p *player) MobTouches(e model.MobEntity, factors mobs.Factors) {
	// Defend signal (chunk 6): any mob hitting this player is "attacking the
	// owner" for its companion, resisted or not.
	if c, ok := e.(model.Combatant); ok {
		p.attacker = c
		p.attackerTicks = combatSignalWindowTicks
	}
	p.retaliate(e)
	dealt := p.takeDamage(model.Damage{HP: factors.Damage, Tags: factors.DamageTags, GateKey: factors.GateKey, Crit: factors.Crit}, model.StatusEffectDamagedAmbient)
	// Mob-cast lifesteal (chunk 1): Factors carries no Source — the mob is
	// always its own recipient.
	model.ApplyLifesteal(dealt, factors.Lifesteal, nil, e)
}

// slowable is the CC door a mob exposes; players carry none (the get-CC'd
// direction stays inert, plan-skill-vocab §3.1), so this is asserted rather
// than required on model.MobEntity. sys/skills.go declares the same shape at
// its own point of use — one method is not a type worth sharing across
// packages.
type slowable interface {
	ApplySlow(source skills.SkillID, fraction float32, ticks int) bool
}

// retaliate is the retaliate_slow passive's trigger (plan-cc-and-retaliation.md
// C2, A4): every mob that damages this player is slowed while the passive is
// equipped. Called from MobTouches, the ONE site both mob→player damage paths
// funnel through — direct damage-aura hits and mob DoT ticks alike, so "every
// mob that hits you" has no hole.
//
// Two behaviour calls live here, both deliberate:
//
//   - It runs BEFORE takeDamage and ignores the result. A fully mitigated hit
//     still retaliates — MobTouches already stamps the attacker for the
//     companion defend signal "resisted or not", and the same reading applies:
//     the mob attacked you, whether or not it got through.
//   - A GOD player does not retaliate. IsGod() short-circuits INSIDE
//     takeDamage, so without this check a cheat-mode player would walk the
//     world slowing everything that brushed them — a playtest artifact, not a
//     feature.
//
// ⚑ The attacker may be a mob that has already died or left the viewport: a DoT
// tick carries its caster's ref, which stays valid by design. ApplySlow on such
// a mob is a harmless no-op, and an attacker with no CC door at all is simply
// skipped.
func (p *player) retaliate(attacker model.MobEntity) {
	r := p.skills.Derived.RetaliateSlow
	if r.Fraction <= 0 || p.IsGod() {
		return
	}
	if target, ok := attacker.(slowable); ok {
		target.ApplySlow(r.Source, r.Fraction, r.Ticks)
	}
}

func (p *player) PlayerTouches(other model.PlayerEntity, damage model.Damage) {
	dealt := p.takeDamage(damage, model.StatusEffectDamagedAmbient)
	model.ApplyLifesteal(dealt, damage.Lifesteal, damage.Source, other)
}

func (p *player) Name() string {
	return p.name
}

// Faction: players are always player-aligned (plan-effect-foundations F8).
func (p *player) Faction() model.Faction {
	return model.FactionAligned
}

func (p *player) Bodies() model.Bodies {
	b := make(model.Bodies, 3)
	b[0] = p.Body
	b[1] = p.viewport
	b[2] = p.aura
	return b
}

func (p *player) VitalSigns() *model.PlayerVitalSigns {
	return &p.PlayerVitalSigns
}

func (p *player) Viewport() phy.DynamicCollider {
	return p.viewport
}

func (p *player) Client() model.Client {
	return p.client
}

func (p *player) Position() phy.Vec2f {
	return p.Body.Position()
}

func (p *player) SetPosition(v phy.Vec2f) {
	p.Body.SetPosition(v)
	p.viewport.SetPosition(v)
	p.aura.SetPosition(v)
}

func (p *player) SetAngle(a float32) {
	p.angle = a
}

func (p *player) Angle() float32 {
	return p.angle
}

// LastMoveDir returns the last non-zero movement direction (a unit vector), the
// aim source for dash (chunk 5). SetLastMoveDir records it from the input path.
func (p *player) LastMoveDir() phy.Vec2f {
	return p.lastMoveDir
}

func (p *player) SetLastMoveDir(v phy.Vec2f) {
	p.lastMoveDir = v
}

func (p *player) Config() *cfg.PlayerConfig {
	return p.config
}

func (p *player) Stats() *model.Stats {
	return &p.stats
}

func (p *player) AddExperience(xp uint64) {
	if xp == 0 {
		return
	}
	previousLevel := p.progression.Level
	if previousLevel < 1 {
		previousLevel = 1
	}
	p.progression.Experience += xp
	p.xpGained += xp // floating XP number (roadmap item 11)

	level := p.levelForExperience(p.progression.Experience)
	if level < 1 {
		level = 1
	}
	p.progression.Level = level
	if level > previousLevel {
		p.PlayerVitalSigns.Health = p.MaxHealth() // heal to (new) full on level-up
		p.applyMilestoneUnlocks(previousLevel+1, level)
	}
}

func (p *player) Progression() model.PlayerProgression {
	return p.progression
}

// AvailableSkillPoints is the unspent point count: the budget the player level
// earns minus the points bound in the spellbook. Derived on every call so free
// respec can never make the numbers drift.
func (p *player) AvailableSkillPoints() int {
	return skills.TotalSkillPoints(p.progression.Level, p.config.SkillPointsPerLevel) - p.skills.SpentPoints(p.skillDefs)
}

func (p *player) SetProgression(progression model.PlayerProgression) {
	if progression.Level < 1 {
		progression.Level = 1
	}
	p.progression = progression
}

func (p *player) LoseCurrentLevelExperience() {
	level := p.progression.Level
	if level < 1 {
		level = 1
	}
	p.progression.Level = level
	p.progression.Experience = p.totalXPForLevel(level)
}

// AuraRadius is the effective radius of the active aura, 0 while nothing is
// active. Serialized as Character.aura_radius so all clients can size the ring.
func (p *player) AuraRadius() float32 {
	slot := p.skills.ActiveAuraSlot
	if slot < 0 || p.skills.AuraSlots[slot] == nil {
		return 0
	}
	return p.skills.AuraSlots[slot].EffectiveRadius()
}

// AuraTickInterval is the active aura's first-effect effective tick interval in
// game ticks (level scaling × this player's tick_rate factor, floored at 1), 0
// while nothing is active. Serialized as Character.aura_tick_interval — the
// client draws the tick indicator from it (skill-vocab chunk 6). First effect =
// the authoring convention for "the defining cadence".
func (p *player) AuraTickInterval() int {
	slot := p.skills.ActiveAuraSlot
	if slot < 0 || p.skills.AuraSlots[slot] == nil {
		return 0
	}
	equip := p.skills.AuraSlots[slot]
	if len(equip.Def.Effects) == 0 || !skills.HasVisibleTickCadence(equip.Def.Effects[0].Type) {
		return 0
	}
	return skills.EffectiveTickInterval(equip.Def.Effects[0], equip.Level, p.buffs.TickRateFactor())
}

// AuraTickPhase is the accumulator's position within the current effective
// interval (skill-vocab chunk 6): the same acc % interval the firing loop uses
// for effect[0], so the indicator beat lands on the actual ticks. 0 while
// nothing is active. Serialized as Character.aura_tick_phase.
func (p *player) AuraTickPhase() int {
	interval := p.AuraTickInterval()
	if interval <= 0 {
		return 0
	}
	return p.skills.AuraSlots[p.skills.ActiveAuraSlot].TickAccumulator % interval
}

// LightRadius is the light emitted by the active aura and equipped light
// passives (max, C2 lift 2), 0 = no light. Serialized as
// Character.light_radius (darkness hole-punch, chunk 3).
func (p *player) LightRadius() float32 {
	return p.skills.LightRadius()
}

// AuraCategories is the active aura's ring-colour bitmask, 0 while none is
// active. Serialized as Character.aura_category — the client colours the ring
// from it instead of matching hardcoded skill IDs (triage item 7).
func (p *player) AuraCategories() skills.AuraCategory {
	return p.skills.AuraCategories()
}

// BurstRadius feeds the Character.burst_radius wire field (burst ring VFX).
func (p *player) BurstRadius() float32 {
	return p.skills.BurstRadius(skills.BurstVFXTicks)
}

func (p *player) LevelProgressFraction() float32 {
	gained, required := p.LevelProgressXP()
	if required == 0 {
		return 1
	}

	fraction := float32(gained) / float32(required)
	if fraction > 1 {
		return 1
	}
	return fraction
}

// LevelProgressXP is the absolute counterpart of LevelProgressFraction: XP
// gained within the current level and the level's total span. Serialized as
// Character.xp_in_level / xp_for_next_level for the HUD's XP-bar text.
func (p *player) LevelProgressXP() (gained, required uint64) {
	level := p.progression.Level
	levelStartXP := p.totalXPForLevel(level)
	levelEndXP := p.totalXPForLevel(level + 1)
	if levelEndXP <= levelStartXP {
		return 0, 0
	}

	required = levelEndXP - levelStartXP
	if p.progression.Experience < levelStartXP {
		return 0, required
	}
	gained = p.progression.Experience - levelStartXP
	if gained > required {
		gained = required
	}
	return gained, required
}

// applyCreationMilestones seeds the spellbook with every level-1 milestone
// (Q4: Damage — the free baseline, GDD §3) and runs the recipe cascade.
// Deliberately SILENT, unlike the level-up path: there is no unlock event to
// announce — the character never existed without these — and the respawn/
// reconnect paths overwrite the spellbook right after New, so a SendUnlock
// here would flash "Level 1 reward" on every death.
//
// A seeded ACTIVE AURA is also pre-equipped into the first free aura slot
// (round-7 follow-up, PO 2026-08-02) — a fresh character should fight without
// a spellbook trip — but deliberately NOT activated: the player's first press
// of "1" switches it on. Only genuinely new characters keep the pre-equip,
// for the same reason the discovery is silent: respawn/reconnect overwrite
// the loadout right after New.
func (p *player) applyCreationMilestones() {
	for _, u := range p.milestoneUnlocks {
		if u.Level <= 1 && !p.skills.HasDiscovered(u.Skill.ID) {
			p.skills.Discover(u.Skill.ID)
			if u.Skill.Category == skills.SkillCategoryActiveAura {
				for slot := range p.skills.AuraSlots {
					if p.skills.AuraSlots[slot] == nil {
						p.skills.EquipAura(slot, u.Skill, 1)
						break
					}
				}
			}
		}
	}
	p.ApplyRecipeCascade()
}

// applyMilestoneUnlocks discovers any skills whose unlock level falls in [from, to].
// Called on level-up; from/to are both inclusive so a multi-level jump catches all entries.
func (p *player) applyMilestoneUnlocks(from, to uint32) {
	for _, u := range p.milestoneUnlocks {
		if u.Level >= from && u.Level <= to && !p.skills.HasDiscovered(u.Skill.ID) {
			p.skills.Discover(u.Skill.ID)
			// Attribute the unlock to the milestone level (plan-unlock-attribution.md).
			p.client.SendUnlock(uint64(u.Skill.ID), "Level "+strconv.Itoa(int(u.Level))+" reward")
			slog.Info("milestone unlock", slog.String("player", p.name), slog.String("skill", u.Skill.Name), slog.Uint64("level", uint64(u.Level)))
		}
	}
	// A milestone discovery can newly satisfy a recipe (Phase 9).
	p.ApplyRecipeCascade()
}

// ApplyRecipeCascade runs the combination recipes against the current spellbook
// and discovers any newly-satisfied results (Phase 9). Call it after any event
// that can newly satisfy a recipe — a milestone/kill discovery or a skill-level
// raise. The client turns each fresh discovery into the unlock glow via its
// spellbook diff, so no wire event is needed.
func (p *player) ApplyRecipeCascade() {
	if p.recipes == nil {
		return
	}
	for _, id := range skills.ApplyRecipes(p.skills, p.recipes) {
		// A combination has no source entity — attribute it generically
		// (plan-unlock-attribution.md).
		p.client.SendUnlock(uint64(id), "Combination discovered")
		slog.Info("combination unlock", slog.String("player", p.name), slog.Int("skillID", int(id)))
	}
}

// initializePlayerSkills builds the peasant-start loadout (content pass C1 →
// triage item 11): a fresh spawn owns NOTHING — no equipped aura, empty
// spellbook, no active aura (ActiveAuraSlot -1). Harvest is now the Farmer's
// first, ungated teaching (api/zones/world.json), so a new player's very first
// act is to walk to the Farmer and learn it; Damage follows at L2. The
// client and wire already tolerate a zero-skill player (empty spellbook, empty
// slots, active aura -1). The registry arg is kept for the construction seam.
func initializePlayerSkills(_ skills.Registry) (*skills.SkillComponent, error) {
	return skills.NewSkillComponent(true), nil
}

func (p *player) experienceForNextLevel(level uint32) uint64 {
	if level < 1 {
		level = 1
	}

	baseXP := float64(p.config.LevelUpXPBase)
	growth := float64(p.config.LevelUpXPGrowthFactor)
	if growth <= 1.0 {
		growth = 1.2
	}

	// WoW-like feel: early levels are quick, later levels ramp up exponentially.
	required := baseXP * math.Pow(growth, float64(level-1))
	if required < 1 {
		required = 1
	}
	return uint64(math.Round(required))
}

// xpTableUncappedLevels is how far the cumulative table reaches when the conf
// sets no maxLevel. Any lookup past it falls back to the summation loop, so
// this is a memory/coverage tradeoff, not a cap.
const xpTableUncappedLevels = 128

// xpCumulative returns the cumulative XP table: index L holds the total XP
// required to REACH level L, so [0] and [1] are both 0 and the slice is
// non-decreasing. Built once per player, on first use.
//
// The curve is a pure function of the conf pair and would ideally be computed
// once per PlayerConfig — but PlayerConfig is built by struct literal in
// several places (sim/world.go, unit tests) with no single construction point
// to hook, and a per-player table is 30 float ops at join for a slice of
// ~250 bytes. The game loop is the only writer, so no lock is needed.
func (p *player) xpCumulative() []uint64 {
	if p.xpTable != nil {
		return p.xpTable
	}
	levels := uint32(p.config.LevelCurve.MaxLevel)
	if levels == 0 {
		levels = xpTableUncappedLevels
	}
	table := make([]uint64, levels+2)
	var total uint64
	for l := uint32(1); l <= levels; l++ {
		total += p.experienceForNextLevel(l)
		table[l+1] = total
	}
	p.xpTable = table
	return table
}

func (p *player) totalXPForLevel(level uint32) uint64 {
	if level <= 1 {
		return 0
	}
	table := p.xpCumulative()
	if int(level) < len(table) {
		return table[level]
	}
	// Past the table's end (uncapped conf only): resume the summation from
	// where the table stops, in the same order, so the uint64 arithmetic —
	// overflow included — is identical to the pre-table loop.
	last := uint32(len(table) - 1)
	total := table[last]
	for l := last; l < level; l++ {
		total += p.experienceForNextLevel(l)
	}
	return total
}

func (p *player) levelForExperience(xp uint64) uint32 {
	// XP accumulates past the cap, but the level (and with it f, skill
	// points, milestones) clamps at the conf maxLevel (C0, GDD §5 linked
	// triple — [WORKING LOCK] 30).
	maxLevel := uint32(p.config.LevelCurve.MaxLevel)

	// The table is non-decreasing, so the level for xp is the largest L with
	// table[L] <= xp — a binary search instead of walking the levels and
	// re-summing the curve at each one.
	table := p.xpCumulative()
	i := sort.Search(len(table), func(i int) bool { return table[i] > xp })
	level := uint32(1)
	if i >= 2 {
		level = uint32(i - 1)
	}
	if maxLevel > 0 && level >= maxLevel {
		return maxLevel
	}
	if i == len(table) {
		// xp runs off the end of the table (uncapped conf, or a zero-XP curve
		// where every entry ties): finish on the original loop.
		return p.levelForExperienceUntabled(xp, maxLevel)
	}
	return level
}

// levelForExperienceUntabled is the pre-table resolution loop, kept verbatim
// for the cases the table cannot answer. totalXPForLevel still serves it, so
// it costs the summation only past the table's end.
func (p *player) levelForExperienceUntabled(xp uint64, maxLevel uint32) uint32 {
	level := uint32(1)
	for {
		if maxLevel > 0 && level >= maxLevel {
			return maxLevel
		}
		next := p.totalXPForLevel(level + 1)
		if xp < next {
			return level
		}
		level++

		// Safety guard for absurd values.
		if level >= 65535 {
			return level
		}
	}
}

func (p *player) SkillComponent() *skills.SkillComponent {
	return p.skills
}

func (p *player) QuestLedger() *quests.Ledger {
	return p.questLedger
}

// SetQuestLedger replaces the freshly-created ledger with a carried one — the
// death/reconnect restore path (plan-quests.md L11), mirroring
// SetSkillComponent below.
func (p *player) SetQuestLedger(l *quests.Ledger) {
	if l != nil {
		p.adoptQuestLedger(l)
	}
}

// adoptQuestLedger takes ownership of a ledger and points its journal pings at
// THIS player's client (chunk C3, D17).
//
// ⚑ Why every owner re-points it, rather than the ledger being born with a
// notifier: the ledger outlives the player struct (L11 — it rides the death and
// reconnect stashes), so a callback captured at birth would keep firing banners
// into a client that has been closed since. Ownership and notification change
// hands together, at the single site where the carry happens.
func (p *player) adoptQuestLedger(l *quests.Ledger) {
	p.questLedger = l
	l.SetNotifier(p.announceJournal)
}

// announceJournal sends the D17 banner for a quest that just moved. Garnish
// only — the journal's durable state rides GameState every tick (L8), so a
// dropped banner costs nothing but the sentence.
func (p *player) announceJournal(n quests.Notice) {
	if p.client == nil {
		return
	}
	text := "Journal updated: " + n.Title
	if n.Completed {
		text = "Quest complete: " + n.Title
	}
	p.client.SendJournal(text)
}

// SetSkillComponent replaces the freshly-initialized skill component with a
// restored one (respawn), preserving the spellbook, equipped loadout and active
// aura the player had at death. The aura sensor created in New is resized to the
// active skill's radius by the SkillSystem on the next tick. An in-flight cast
// is cleared (chunk 4): the component is carried across death, and a cast must
// never survive into the respawned player — this also covers deaths that
// bypass takeDamage (heal-aura self-cost).
func (p *player) SetSkillComponent(sc *skills.SkillComponent) {
	if sc != nil {
		sc.CancelCast()
		p.skills = sc
	}
}

func (p *player) AuraCollider() *phy.Circle {
	return p.aura
}

func (p *player) PoolFactor() float32 {
	return p.poolFactor()
}

func (p *player) OwnedEntities() model.BasicEntities {
	return p.ownedEntitites
}

func (p *player) SetGodmode(on bool) {
	p.isGod = on
	p.wasGod = p.wasGod || on
}

func (p *player) IsGod() bool {
	return p.isGod
}

func (p *player) SetSpeedCheat(factor float32) {
	p.speedCheatFactor = factor
}

func (p *player) SpeedCheatFactor() float32 {
	return p.speedCheatFactor
}

func (p *player) WasGod() bool {
	return p.wasGod
}
