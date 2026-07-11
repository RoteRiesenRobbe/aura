package model

// Faction is the allegiance of a combat entity: players and player-owned
// entities are aligned, mobs default to hostile, and content declares further
// factions in api/factions/ (mob-depth chunk 6.6; IDs assigned by the
// factions registry, whose numeric values this type mirrors). It is an
// ordinary runtime property — future content (charm, decoys) flips it on live
// entities — and deliberately NOT baked into collision layers or derived from
// Go types; the skill flags targetsEnemies/targetsAllies resolve against it
// relative to the caster, and per-faction hostility lists gate proactive
// aggro acquisition only.
type Faction uint8

const (
	FactionAligned Faction = iota // players and player-owned entities
	FactionHostile                // mobs (default)
)

// Bit is the faction's position in an aggro bitmask (mirrors factions.Bit).
func (f Faction) Bit() uint64 { return 1 << f }

// HostilityGate is implemented by combatants whose harm rights are gated
// (mobs; chunk 6.6 in-game fix). Hostility is two-layered: the STATIC layer
// is the declared per-faction aggro set, the DYNAMIC layer is active combat
// (the threat table — retaliation now, taunt in chunk 7, encounter scripts in
// chunk 9). Casters without the gate (players) may harm any different-faction
// target; targeting effects consult the gate through the sys eligibility
// seam, never directly.
type HostilityGate interface {
	// MayHarm reports whether a target of the given faction and entity ID may
	// be harmed. Only consulted for different-faction targets — same-faction
	// protection is the caller's targetsAllies rule.
	MayHarm(f Faction, id uint64) bool
}

// Factioned is implemented by entities that take part in the faction system
// (players and mobs). Flag-gated targeted effects apply to Factioned entities
// only — structures/resources have no allegiance and are reached exclusively
// through their dedicated paths (targetsStructures, harvesting).
type Factioned interface {
	Faction() Faction
}
