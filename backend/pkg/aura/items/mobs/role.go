package mobs

// Role is the authored actor discriminator (plan-entity-model.md chunk 2): what
// a mob IS, stated once in the definition instead of inferred from what its
// numbers happen to be. Before this, "structure" meant factors.speed <= 0 and
// "follower" meant an owner plus a non-zero velocity — so the only way to
// author a kind was to pick a stat value that implied it, and the ten authored
// structures each carried a dummy body.aggroRadius of 0.1 purely to survive the
// loader.
//
// ⚑ Role is NOT a statement about movement. A stationary creature (a hazard
// that gates its aura on aggro) and a moving structure are both legal — the
// loader takes no view on the combination (PO 2026-07-27). What still reads
// factors.speed is movement itself: whether a mob can walk, wander or patrol.
//
// Role is also orthogonal to the capabilities an actor carries: FireTotem and
// Totem are structures WITH an owner, and an NPC (chunk 3a) is a creature or a
// structure carrying an interaction block, never a role of its own.
type Role string

const (
	// RoleCreature is the default actor: it chases what it aggros and its aura
	// runs only while it has a target.
	RoleCreature Role = "creature"
	// RoleStructure does not chase; its aura IS its behaviour, so the aura
	// stays always-on and needs no aggro target to fire.
	RoleStructure Role = "structure"
	// RoleFollower is owner-centric: it acquires from the owner's combat
	// signals rather than its own sensor, is bounded by the owner tether, and
	// has no leash or evade point. Ownership is a runtime precondition on top
	// of the authored role — an ownerless follower behaves like a creature.
	RoleFollower Role = "follower"
)

// roles is the single source of authorable roles — the tierRanks precedent. A
// role is authorable exactly when this table knows it, and every consumer (the
// JSON loader, the sim harness's MobSpec, the simharness CLI flag) resolves
// through ParseRole so no second list can drift.
var roles = map[string]Role{
	string(RoleCreature):  RoleCreature,
	string(RoleStructure): RoleStructure,
	string(RoleFollower):  RoleFollower,
}

// RoleNames renders the authorable roles for an error message, sorted. Every
// "must be one of ..." string reads from here rather than spelling the list out,
// so adding a role cannot leave a message naming only the old ones — which had
// already happened: the simharness web explorer offered creature/structure only
// and made follower unselectable.
func RoleNames() string {
	return names(roles)
}

// ParseRole resolves an authored role name. Empty means absent, which is
// creature — the default has to be applied by every caller, including the ones
// building definitions directly (tests, the sim harness), or a zero-value
// definition would stop meaning what it means today.
func ParseRole(name string) (Role, bool) {
	if name == "" {
		return RoleCreature, true
	}
	role, ok := roles[name]
	return role, ok
}
