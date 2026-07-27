package model

import (
	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

type PlayerVitalSigns struct {
	Health vitals.VitalSign
}

type Hand struct {
	Collider phy.DynamicCollider
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
type ActivationRejection byte

const (
	ActivationRejectedNone     ActivationRejection = iota
	ActivationRejectedNoAnchor                     // recall: no campfire anchor bound
	ActivationRejectedNoTarget                     // reserved: revive with no corpse in range (chunk 3)
)

type Players []PlayerEntity

type PlayerEntity interface {
	Entity
	StatusEntity
	Factioned

	Name() string
	VitalSigns() *PlayerVitalSigns
	Viewport() phy.DynamicCollider
	Hand() *Hand
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
	// ShieldHP is the current total absorb capacity (plan-skill-vocab
	// chunk 2), serialized as shield_hp — a live value, not a per-tick
	// accumulator.
	ShieldHP() vitals.VitalSign
	// AppliedEffects is the bitmask of buff/debuff kinds currently applied TO
	// this player (wire applied_effects — the client draws the pips from it;
	// the received-status mirror of AuraCategories).
	AppliedEffects() skills.AppliedEffect
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
	// InCombat reports whether the player is inside the recent-combat window
	// (the same flag that gates out-of-combat regen). The EquipSystem reads it
	// to lock loadout editing in combat.
	InCombat() bool
	SkillComponent() *skills.SkillComponent
	// SetSkillComponent replaces the player's skill component wholesale.
	// Used on respawn to restore the spellbook + loadout the player died with.
	SetSkillComponent(sc *skills.SkillComponent)
	// ApplyRecipeCascade runs combination recipes against the spellbook and
	// discovers any newly-satisfied results (Phase 9). Call after any discovery
	// or skill-level raise.
	ApplyRecipeCascade()
	AuraCollider() *phy.Circle
	MaxHealthFactor() float32
	// PowerScale is f(character level) — the global HP-value inflation
	// multiplier (GDD §5, C0). The SkillSystem multiplies the player's
	// HP-side skill output (damage/heal/dot/hot/shield/self-heal/self-cost)
	// by it; never radius, tick rate, or target count.
	PowerScale() float32
	// MaxHealth is the player's absolute HP pool (item 11 Phase 1) =
	// round(baseHealth × MaxHealthFactor); serialized as the max_health wire
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
