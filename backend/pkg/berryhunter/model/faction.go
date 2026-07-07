package model

// Faction is the binary allegiance of a combat entity (plan-effect-foundations
// F8): players and player-owned entities are aligned, mobs are hostile. It is
// an ordinary runtime property — future content (charm, summons, decoys) flips
// it on live entities — and deliberately NOT baked into collision layers or
// derived from Go types; the skill flags targetsEnemies/targetsAllies resolve
// against it relative to the caster.
type Faction uint8

const (
	FactionAligned Faction = iota // players and player-owned entities
	FactionHostile                // mobs (default)
)

// Factioned is implemented by entities that take part in the faction system
// (players and mobs). Flag-gated targeted effects apply to Factioned entities
// only — structures/resources have no allegiance and are reached exclusively
// through their dedicated paths (targetsStructures, harvesting).
type Factioned interface {
	Faction() Faction
}
