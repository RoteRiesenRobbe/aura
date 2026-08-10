package model

import (
	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

type PlayerVitalSigns struct {
	Health vitals.VitalSign
}

type Stats struct {
	BirthTick uint64
}

type PlayerProgression struct {
	Level      uint32
	Experience uint64
}

// ActivationRejection is the reason a cooldown activation was refused by its
// precondition (plan-skill-vocab chunk 4, §3.5): no cast starts, no cooldown
// is consumed, and the client renders feedback keyed by this value. Grows one
// entry per precondition; serialized as activation_rejected_reason.
//
// The values are the wire enum's (§35 C4b, the status_effects.go pattern) —
// server.fbs is the single authored home, and the client keys its feedback
// text by the same generated names, so a renumber can no longer show the
// wrong message silently.
type ActivationRejection byte

const (
	ActivationRejectedNone     = ActivationRejection(AuraApi.ActivationRejectionNone)
	ActivationRejectedNoAnchor = ActivationRejection(AuraApi.ActivationRejectionNoAnchor) // recall: no campfire anchor bound
	ActivationRejectedNoTarget = ActivationRejection(AuraApi.ActivationRejectionNoTarget) // reserved: revive with no corpse in range (chunk 3)
	// ActivationRejectedNotEnoughResource: the caster cannot pay the skill's
	// resource cost and live (plan-numbers-rewrite D9).
	ActivationRejectedNotEnoughResource = ActivationRejection(AuraApi.ActivationRejectionNotEnoughResource)
	// ActivationRejectedNoCharges: the Camp baseline utility pressed with an
	// empty charge store (plan-downtime.md C2). Not a resource shortfall —
	// utilities are free (D7); the charge is a separate, per-session currency
	// refilled by resting at a real campfire.
	ActivationRejectedNoCharges = ActivationRejection(AuraApi.ActivationRejectionNoCharges)
)

type Players []PlayerEntity

type PlayerEntity interface {
	Entity
	StatusEntity
	Factioned

	Name() string
	VitalSigns() *PlayerVitalSigns
	Viewport() phy.DynamicCollider
	Client() Client
	SetAngle(a float32)

	// LastMoveDir is the caster's last non-zero movement direction (a unit
	// vector), the aim source for dash (plan-skill-vocab chunk 5) — Aura
	// characters have no facing, so movement direction is the only aim. The
	// input path records it; it defaults to a unit vector so a never-moved
	// player still has a dash direction.
	LastMoveDir() phy.Vec2f
	SetLastMoveDir(v phy.Vec2f)

	Update(dt float32)
	OwnedEntities() BasicEntities

	SetGodmode(on bool)
	IsGod() bool
	WasGod() bool

	// SetSpeedCheat sets the dev SPEED command's movement multiplier;
	// 0 (the zero value) or 1 = off. Testing-only, never content-driven.
	SetSpeedCheat(factor float32)
	SpeedCheatFactor() float32

	Config() *cfg.PlayerConfig
	Stats() *Stats
	AddExperience(xp uint64)
	Progression() PlayerProgression
	SetProgression(progression PlayerProgression)
	// AvailableSkillPoints is the unspent skill point count: the budget earned
	// from the player level minus the points bound in the spellbook. Derived
	// each call — free respec means it must always reconcile.
	AvailableSkillPoints() int
	LoseCurrentLevelExperience()
	AuraRadius() float32
	// AuraTickInterval / AuraTickPhase are the active aura's first-effect
	// effective cadence (game ticks) and the accumulator's position within it,
	// both 0 while none is active (wire aura_tick_interval/aura_tick_phase — the
	// client draws the tick indicator; skill-vocab chunk 6).
	AuraTickInterval() int
	AuraTickPhase() int
	// AuraCategories is the active aura's effect-category bitmask, 0 while none
	// is active (wire aura_category — the client colours the aura ring from it;
	// triage item 7).
	AuraCategories() skills.AuraCategory
	// LightRadius is the light emitted by the active aura's light_aura effect,
	// 0 = no light (wire light_radius — the client hole-punches the darkness
	// overlay; atmosphere & recovery chunk 3).
	LightRadius() float32
	// BurstRadius is the effective radius of a recently fired instant_damage
	// burst (wire burst_radius, drives the burst ring VFX); 0 = none.
	BurstRadius() float32
	LevelProgressFraction() float32
	// LevelProgressXP is the absolute counterpart of LevelProgressFraction:
	// XP gained within the current level and the level's total span (wire
	// xp_in_level / xp_for_next_level, the HUD XP-bar text).
	LevelProgressXP() (gained, required uint64)

	// Participation XP (roadmap item 10): healing a player registers the
	// healer for a limited window; mobs read this on death to reward healers
	// of their combat participants.
	NoteHealedBy(healer PlayerEntity)
	RecentHealers() []PlayerEntity

	// Per-tick floating-number sources (roadmap item 11): health lost, and
	// healing / XP received this tick. Serialized once per tick, then reset via
	// ResetTickNumbers (TickAccumulators). NoteHealReceived is called by the
	// SkillSystem when a heal aura lands on this player.
	DamageTaken() vitals.VitalSign
	// CritTaken is the crit-flagged share of DamageTaken (plan-skill-vocab
	// chunk 1, §4.3), serialized as crit_taken so the client pops it big.
	CritTaken() vitals.VitalSign
	// CostPaid is the resource cost charged this tick (round-7 item 7),
	// serialized as cost_paid so the client pops it blue — the spend's own
	// accumulator, deliberately separate from DamageTaken.
	CostPaid() vitals.VitalSign
	// ShieldHP is the current total absorb capacity (plan-skill-vocab
	// chunk 2), serialized as shield_hp — a live value, not a per-tick
	// accumulator.
	ShieldHP() vitals.VitalSign
	// AppliedEffects is the bitmask of buff/debuff kinds currently applied TO
	// this player (wire applied_effects — the client draws the pips from it;
	// the received-status mirror of AuraCategories).
	AppliedEffects() skills.AppliedEffect
	// MovementFactor is this player's transient movement-speed multiplier —
	// speed_burst buffs composed with the strongest slow (skills.Buffs). Read
	// at the movement site (core/input.go), the same shape as the passive
	// MovementSpeedFactor next to it; 1.0 = nothing applied. The mob twin is
	// internal to stepLength, since a mob moves itself.
	MovementFactor() float32
	HealReceived() vitals.VitalSign
	XpGained() uint64
	NoteHealReceived(delta vitals.VitalSign)
	// AuraHitStyle / NoteAuraHit carry the per-tick aura-hit VFX (item 11
	// Step 4); NoteAuraHit is called by the SkillSystem when a damage aura
	// strikes this player, AuraHitStyle is serialized as aura_hit_style.
	AuraHitStyle() AuraHitStyle
	NoteAuraHit(style AuraHitStyle)
	// CampfireBound / NoteCampfireBound carry the per-tick "campfire became
	// the respawn anchor" stamp (chunk 4): the ConnectionStateSystem notes it
	// the tick a dwell completes, serialized as campfire_bound.
	CampfireBound() bool
	NoteCampfireBound()
	// HomeCampfire / DiscoveredCampfires / NoteCampfireState carry the map's
	// campfire markers (plan-world-map.md C2): which fire this character would
	// respawn at, and every fire it has ever dwelled at. The
	// ConnectionStateSystem publishes both together on the two occasions either
	// can change — entering the world, and completing a dwell — and they are
	// serialized into the owner-only GameState table.
	//
	// ⚑ A ONE-SHOT like CampfireBound above, not live state, and the pair is
	// cleared with the per-tick accumulators. The set changes minutes apart; a
	// string vector at 30 Hz for that is the waste this shape avoids.
	HomeCampfire() string
	DiscoveredCampfires() []string
	NoteCampfireState(home string, discovered []string)
	// The Camp baseline utility's charge store (plan-downtime.md C2, D3):
	// per-session, refilled to a level-derived cap by dwelling at a REAL
	// campfire, spent at channel completion. Serialized as camp_charges.
	// Not persisted and not carried through death — only through the
	// reconnect stash.
	CampCharges() int
	SpendCampCharge() bool
	RefillCampCharges()
	SetCampCharges(n int)

	// The reward keys this character's SLOT has spent across its past
	// ascensions (plan-ascension.md D16), stamped from the auth ticket at join
	// beside the spellbook seed. In-memory only and deliberately so: the durable
	// truth is game.bloodline_unlocks, and this is the copy the ascension row
	// source filters on so that a per-tick render never queries a database.
	//
	// ⚑ NOT the same question as "does the spellbook know this skill". A world
	// drop discovers a skill without the bloodline ever having bought it.
	BloodlineUnlocks() []string
	SetBloodlineUnlocks(keys []string)
	// BloodlineAscensions is how many lives this slot has already spent, the
	// same ticket carriage as the keys above and what a `bloodline_ascensions`
	// gate reads (plan-ascension.md D18 tier B).
	BloodlineAscensions() int
	SetBloodlineAscensions(n int)
	// ActivationRejected / NoteActivationRejected carry the per-tick "a
	// cooldown activation was refused by its precondition" stamp
	// (plan-skill-vocab chunk 4, §3.5): the SkillSystem notes it, serialized
	// as activation_rejected_skill_id + activation_rejected_reason.
	ActivationRejected() (skills.SkillID, ActivationRejection)
	NoteActivationRejected(skill skills.SkillID, reason ActivationRejection)
	// Interactable / NoteInteractable carry the per-tick "this conversant is
	// in talking range" stamp (chunk 3b-i): the InteractionSystem re-stamps it
	// from its sensors every tick, nearest offer wins, serialized as
	// interactable_entity_id. The same value validates an incoming Interact,
	// so the badge and the verb can never disagree.
	Interactable() uint64
	NoteInteractable(id uint64, distSq float32)
	// The open conversation (chunk 3b-ii, D16): who the panel belongs to, and
	// the personalised tree streamed with it as GameState.conversation. NOT
	// per-tick state — a session survives ticks and ends only on an explicit
	// condition — while the tree itself is rebuilt every tick, so a row flips to
	// known the snapshot after its grant lands.
	ConversingWith() uint64
	SetConversingWith(id uint64)
	Conversation() *Conversation
	SetConversation(c *Conversation)
	// InCombat reports whether the player is inside the recent-combat window
	// (the same flag that gates out-of-combat regen). The EquipSystem reads it
	// to lock loadout editing in combat.
	InCombat() bool

	// Flight (plan-flight-paths.md C2): campfire-to-campfire fast travel.
	// Flying/FlightDest/FlightArrivalTick feed the Character wire fields.
	// BeginFlight leaves the ground world (the D13 space exit — body, hand
	// and aura sensor out, viewport stays — plus the flight-scale AOI);
	// Ground() is the ONE re-entry, shared by landing and a mid-flight WARP,
	// so a half-restored flyer cannot exist. Validation, the mob forget
	// sweep and the §4.2 input gates are the driving system's job
	// (PlayerInputSystem).
	Flying() bool
	FlightDest() phy.Vec2f
	FlightArrivalTick() uint64
	BeginFlight(space *phy.Space, fromID, toID string, dest phy.Vec2f, startTick uint64)
	FlightPosition(tick uint64) (pos phy.Vec2f, arrived bool)
	Ground()
	// QuestLedger is this character's lifetime quest state (plan-quests.md
	// C1): kill counters increment at the mob's death-reward fan-out,
	// conversants stamp at session open, and the connection-state stash
	// carries it across death and reconnect (L11).
	QuestLedger() *quests.Ledger
	// SetQuestLedger replaces the fresh ledger with a carried one — the
	// death/reconnect restore, mirroring SetSkillComponent.
	SetQuestLedger(l *quests.Ledger)
	SkillComponent() *skills.SkillComponent
	// SetSkillComponent replaces the player's skill component wholesale.
	// Used on respawn to restore the spellbook + loadout the player died with.
	SetSkillComponent(sc *skills.SkillComponent)
	// ApplyRecipeCascade runs combination recipes against the spellbook and
	// discovers any newly-satisfied results (Phase 9). Call after any discovery
	// or skill-level raise.
	ApplyRecipeCascade()
	AuraCollider() *phy.Circle
	// PoolFactor is the FULL pool multiplier — PowerScale() × the max-health
	// passive — not to be confused with DerivedStats.MaxHealthFactor(), which is
	// the passive term alone.
	PoolFactor() float32
	// PowerScale is f(character level) — the global HP-value inflation
	// multiplier (GDD §5, C0). The SkillSystem multiplies the player's
	// HP-side skill output (damage/heal/dot/hot/shield/self-heal/self-cost)
	// by it; never radius, tick rate, or target count.
	PowerScale() float32
	// MaxHealth is the player's absolute HP pool (item 11 Phase 1) =
	// round(baseHealth × PoolFactor); serialized as the max_health wire
	// field so the client draws health/maxHealth.
	MaxHealth() vitals.VitalSign
}

type BasicEntities map[uint64]ecs.BasicEntity

func NewBasicEntities() BasicEntities {
	return make(BasicEntities)
}

func (b BasicEntities) All() []ecs.BasicEntity {
	entities := []ecs.BasicEntity{}
	for _, v := range b {
		entities = append(entities, v)
	}
	return entities
}

func (b BasicEntities) Add(e BasicEntity) {
	b[e.Basic().ID()] = e.Basic()
}

func (b BasicEntities) Remove(e BasicEntity) {
	delete(b, e.Basic().ID())
}

type VitalSignEntity interface {
	BasicEntity
	VitalSigns() *PlayerVitalSigns
}

type PlayerInteraction interface {
	HitMob(m *MobEntity)
	KilledMob(m *MobEntity)
}
