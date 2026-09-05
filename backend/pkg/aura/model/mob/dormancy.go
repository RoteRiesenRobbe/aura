package mob

import "github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"

// Mob dormancy (plan-world-scale.md S3): a mob that nothing player-controlled
// is near stops thinking AND stops existing in the physics space, which lifts
// both halves of plan-test-world.md's F3 — mob.Update and Space.Update's
// per-tick walk over every one of its ~3 collision shapes.
//
// This file holds only what the MOB knows: whether it is currently asleep, and
// whether its own state is quiet enough to be frozen. The wake volume, the
// wake-source set and the space surgery all live in sys.MobSystem, which is
// where the world's positions are.
//
// ⚑ D3's criteria are not a checklist of nice-to-haves — they are what makes
// dormancy SAFE. Mob.Update opens with the death check, then the TTL countdown,
// then charm expiry, and NONE of those is AI (see Update's own comments). A
// naive "skip idle mobs" gate breaks all three. Pristine closes them
// structurally instead of by enumeration: full health means a dormant mob
// cannot be sitting at 0 HP waiting to die, and everything carrying a TTL or a
// charm is refused outright. If a criterion below is ever relaxed, those three
// bugs come back — re-read Update before touching it.

// Dormant reports whether this mob is currently asleep: its Update is skipped
// and its shapes are out of the physics space.
func (m *Mob) Dormant() bool { return m.dormant }

// SetDormant records the sleep state. The caller (sys.MobSystem) owns the
// matching space surgery — this only flips the flag, so the two can never be
// set from different places.
func (m *Mob) SetDormant(v bool) { m.dormant = v }

// PlayerControlled reports whether a player is behind this mob's actions — a
// summon, totem or companion (owner) or a charmed world mob (charmer).
//
// It is the D4 half of dormancy: such a mob is itself a WAKE SOURCE, because a
// totem planted away from its owner must still wake what it is standing next
// to. Without that, D5 would let a totem's aura tick straight through a
// sleeping mob (L2) — D4 is not a nicety, it is what makes leaving the physics
// space legal at all.
func (m *Mob) PlayerControlled() bool {
	return m.owner != nil || m.charmer != nil
}

// Pristine reports whether nothing is in flight that freezing this mob would
// strand (plan-world-scale.md D3). Every clause is a thing that would otherwise
// stop advancing while the mob sleeps.
//
// ⚑ Allocation-free by construction: it runs per candidate mob per evaluation
// and the idle loop is allocation-audited (fe0044d0). Buffs.Empty and
// StatusEffects.Empty exist for exactly this reason — len(Effects()) would
// build a slice per mob per tick.
func (m *Mob) Pristine() bool {
	// Owned and charmed entities are refused outright: they expire, the world
	// does not author them, and they are wake sources themselves (D3/D4).
	if m.owner != nil || m.charmer != nil {
		return false
	}
	// Anything with a countdown must keep counting.
	if m.ttlTicks > 0 {
		return false
	}
	// Structures — campfires, braziers, totems — are excluded deliberately and
	// narrowly. Their aura IS their whole behaviour (it never gates, see
	// applyMode), several are respawn anchors or quest fixtures, and there are
	// a few dozen of them against ~15 000 wild spawns, so sleeping them buys
	// nothing measurable and risks a whole class of bugs. Revisit only if
	// content ever authors structures in bulk.
	if m.role == mobs.RoleStructure {
		return false
	}
	// A conversation holds the actor in place (D22); vanishing mid-dialogue is
	// not a thing dormancy gets to do.
	if m.conversing {
		return false
	}
	// Encounter-script seams: a scripted phase is running, whatever the mob's
	// health says.
	if m.invulnerable || m.fleeOverride {
		return false
	}
	// Combat, in all three of the ways the mob tracks it: a held enemy or a
	// damage-recency window (InCombat), a support patient, and the threat table
	// that outlives both.
	if m.InCombat() || m.supportTarget != nil || len(m.threat) > 0 {
		return false
	}
	if m.mode != modeIdle {
		return false
	}
	// Full health — the clause that structurally closes the death check, and
	// the one that keeps L3 (a dormant mob does not regenerate) to a mob that
	// had nothing to regenerate.
	if m.health != m.MaxHealth() {
		return false
	}
	// Nothing applied and nothing transient: dots, slows, shields, hots and
	// stuns all have to keep aging, and a status effect means something
	// happened this tick.
	return m.buffs.Empty() && m.statusEffects.Empty()
}
