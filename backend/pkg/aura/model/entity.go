package model

import (
	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// EntityType is an enum describing the type of the entity
// it is no longer essential in all cases as most of the information
// is in the type itself
type EntityType uint16

// Bodies is a list of physical bodies that may be added to the
// collision engine
type Bodies []phy.DynamicCollider

// BasicEntity is an entity that at least embeds
// the ecs.BasicEntity. Therefore, it can be removed
// from the game if necessary
type BasicEntity interface {
	Basic() ecs.BasicEntity
}

// BodiedEntity is an entity with physical bodies and
// a dynamic position
type BodiedEntity interface {
	BasicEntity
	Position() phy.Vec2f
	SetPosition(phy.Vec2f)
	Bodies() Bodies
}

// Entity is a general game object.
type Entity interface {
	BodiedEntity

	Radius() float32
	AABB() AABB
	Angle() float32
	Type() EntityType
}

// PlaceableEntity is an entity that was
// dynamically placed and might need constant updates
type PlaceableEntity interface {
	Entity
	StatusEntity

	Decayed() bool
	Update(dt float32)
	Item() items.Item
}

type ResourceStock struct {
	Item      items.Item
	Capacity  int
	Available int
}

// ResourceEntity is an entity that can be mined/gathered
type ResourceEntity interface {
	Entity
	Interacter
	StatusEntity

	Update(dt float32)
	Stock() *ResourceStock
	Resource() items.Item
}

type PlaceableResourceEntity interface {
	PlaceableEntity
	ResourceEntity
}

// PropEntity is a hand-placed static world object from the authored zone
// (world foundation chunk 3): a static body + sprite, no gameplay behavior.
type PropEntity interface {
	Entity
}

// Teaching is one ordered skill an NPC grants on approach once the player is at
// least RequiredLevel and does not already know it (plan-npc-teaching.md chunk
// 3). Line is spoken when the grant happens. Def is the skill resolved at zone
// load (world.Teaching.Def) — carrying the resolved definition here, rather than
// re-resolving a name, keeps model/npc from importing world. This mirrors how
// prop.New takes decomposed params instead of the whole zone struct.
type Teaching struct {
	Def           *skills.SkillDefinition
	RequiredLevel uint32
	Line          string
}

// NpcEntity is a peaceful, hand-placed teaching/lore NPC (plan-npc-teaching.md):
// a static visual body that rides the PropEntity/Resource wire path plus a
// DYNAMIC proximity sensor. It is unattackable by construction (no HP, not a
// Combatant). Its dedicated game.addNpcEntity registration adds the visual body
// as static and the sensor as dynamic — Sensor() exposes the latter so the
// plain-Entity path (which registers only Bodies()[0]) never silently drops it.
//
// Teachings/TooLowLine/Lines are the approach payload the NpcSystem reads
// (chunk 3): Teachings are granted in order; a player too low for the next one
// hears TooLowLine and gets nothing further; Lines are the lore/sign-post
// fallback spoken when nothing is taught (a pure guard, or an all-learned sage).
type NpcEntity interface {
	Entity
	Sensor() phy.DynamicCollider
	Teachings() []Teaching
	TooLowLine() string
	Lines() []string
}

// CorpseEntity is a dead player's corpse (atmosphere & recovery chunk 4): a
// non-colliding world marker that persists until the player respawns or their
// dead client disconnects. It rides its own add-path because, unlike props,
// it must be removable — PhysicsSystem.Remove panics on static bodies, so the
// corpse's body registers as dynamic.
type CorpseEntity interface {
	Entity
	IsCorpse()
}

// MobEnity is a mob that usually comes with a mob definition
// and also needs constant updates since it might move/have an AI
type MobEntity interface {
	Entity
	StatusEntity
	Factioned

	MobID() mobs.MobID
	MobDefinition() *mobs.MobDefinition
	Health() vitals.VitalSign
	// MaxHealth is the mob's absolute HP pool (item 11 Phase 1), serialized as
	// the max_health wire field so the client draws health/maxHealth.
	MaxHealth() vitals.VitalSign
	// Velocity() phy.Vec2f
	// SetVelocity(v phy.Vec2f)
	Update(dt float32) bool
	SetAngle(a float32)

	// Skill loadout (Phase 6.1): mobs run on the same SkillSystem as players.
	SkillComponent() *skills.SkillComponent
	AuraCollider() *phy.Circle
	// BurstRadius is the effective radius of a recently fired instant_damage
	// burst (wire burst_radius, drives the burst ring VFX); 0 = none.
	BurstRadius() float32
	// AuraRadius is the effective radius of the active aura, 0 while none is
	// active (wire aura_radius — the client draws the mob's ring from it, so
	// a gated aura is invisible until aggro; mob-depth chunk 3c).
	AuraRadius() float32
	// AuraTickInterval / AuraTickPhase are the active aura's first-effect
	// effective cadence (game ticks) and the accumulator's position within it,
	// both 0 while none is active (wire aura_tick_interval/aura_tick_phase — the
	// client draws the tick indicator; reading a mob's beat to dodge its ticks
	// is the design-critical case; skill-vocab chunk 6).
	AuraTickInterval() int
	AuraTickPhase() int
	// AuraCategories is the active aura's effect-category bitmask, 0 while none
	// is active (wire aura_category — the client colours the aura ring from it,
	// so mobs and players share one colour language; triage item 7).
	AuraCategories() skills.AuraCategory
	// TierRank is the authored mob tier as its wire byte (wire tier — the client
	// draws the portrait frame ring from it; triage item 15).
	TierRank() mobs.TierRank
	// LightRadius is the light emitted by the active aura's light_aura effect,
	// 0 = no light (wire light_radius — the client hole-punches the darkness
	// overlay; atmosphere & recovery chunk 3).
	LightRadius() float32
	// DwellRadius is the bind radius of a campfire respawn anchor, 0 for
	// everything that is not one (wire dwell_radius — the client draws the
	// inner dwell circle from it, so the server's bind factor is the single
	// source; atmosphere & recovery chunk 4).
	DwellRadius() float32

	// DamageTaken is the health lost this tick (VitalSign units), serialized as
	// the floating damage number (roadmap item 11) and reset each tick via
	// ResetTickNumbers (TickAccumulators).
	DamageTaken() vitals.VitalSign

	// CritTaken is the crit-flagged share of DamageTaken (plan-skill-vocab
	// chunk 1, §4.3), serialized as crit_taken so the client pops it big.
	CritTaken() vitals.VitalSign

	// ShieldHP is the current total absorb capacity (plan-skill-vocab
	// chunk 2), serialized as shield_hp — a live value, not a per-tick
	// accumulator.
	ShieldHP() vitals.VitalSign

	// HealReceived is the health restored this tick (VitalSign units),
	// serialized as the floating heal number for a mob-cast heal (mob-depth
	// chunk 8) and reset each tick via ResetTickNumbers.
	HealReceived() vitals.VitalSign

	// AuraHitStyle is the per-tick aura-hit VFX stamped on this entity by a
	// damage aura (item 11 Step 4); serialized as the aura_hit_style wire field
	// and reset each tick via ResetTickNumbers.
	AuraHitStyle() AuraHitStyle
}

// AABB is an alias to not expose transitive dependencies
type AABB phy.AABB
