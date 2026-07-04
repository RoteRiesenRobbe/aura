package model

import (
	"github.com/EngoEngine/ecs"
	"github.com/trichner/berryhunter/pkg/berryhunter/cfg"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/model/vitals"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

type PlayerVitalSigns struct {
	Satiety         vitals.VitalSign
	BodyTemperature vitals.VitalSign
	Health          vitals.VitalSign
}

type Hand struct {
	Collider phy.DynamicCollider
	Item     items.Item
}

type Stats struct {
	BirthTick uint64
}

type PlayerProgression struct {
	Level      uint32
	Experience uint64
}

type Players []PlayerEntity

type PlayerEntity interface {
	Entity
	StatusEntity

	Name() string
	VitalSigns() *PlayerVitalSigns
	Viewport() phy.DynamicCollider
	Hand() *Hand
	Client() Client
	SetAngle(a float32)

	Update(dt float32)
	OwnedEntities() BasicEntities

	SetGodmode(on bool)
	IsGod() bool
	WasGod() bool

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
	// BurstRadius is the effective radius of a recently fired instant_damage
	// burst (wire burst_radius, drives the burst ring VFX); 0 = none.
	BurstRadius() float32
	LevelProgressFraction() float32

	// Participation XP (v1-roadmap item 10): healing a player registers the
	// healer for a limited window; mobs read this on death to reward healers
	// of their combat participants.
	NoteHealedBy(healer PlayerEntity)
	RecentHealers() []PlayerEntity

	// Per-tick floating-number sources (v1-roadmap item 11): health lost, and
	// healing / XP received this tick. Serialized once per tick, then reset via
	// ResetTickNumbers (TickAccumulators). NoteHealReceived is called by the
	// SkillSystem when a heal aura lands on this player.
	DamageTaken() vitals.VitalSign
	HealReceived() vitals.VitalSign
	XpGained() uint64
	NoteHealReceived(delta vitals.VitalSign)
	SkillComponent() *skills.SkillComponent
	// SetSkillComponent replaces the player's skill component wholesale.
	// Used on respawn to restore the spellbook + loadout the player died with.
	SetSkillComponent(sc *skills.SkillComponent)
	AuraCollider() *phy.Circle
	MaxHealthFactor() float32
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
