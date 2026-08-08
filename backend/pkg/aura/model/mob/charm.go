package mob

// Charm (plan-faction-flips chunk 3, D2/D6/D10): a mob fights FOR the player
// who charmed it — full companion behaviour, its own level, for a limited time
// — then reverts to the world mob it was. It is the first consumer of chunk 1's
// allegiance seam: Align() on the way in, RevertFaction() on the way out.
//
// ⚑ Charm keeps THREE questions apart that `owner` used to answer at once
// (§6.1/§6.1b). Only the last two ever look at the charmer:
//
//	whose level do I stand at?          owner   — Level/MaxHealth/PowerScale
//	who gets credit for what I do?      CreditTo() = charmer ?? owner
//	whose signals do I follow?          leader() = charmer ?? owner
//
// Letting the charmer into the first re-opens entity-model chunk 1b and shrinks
// a charmed elite to its charmer's level (L-B/L-M). That is what the pins in
// charm_test.go exist for.

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Charm binds this mob to a charmer for ticks and flips it to the player side.
// The timer lives in the buff store (which is where the client pip comes from);
// the link lives on the mob. Both start here so they cannot start apart.
//
// Align() clears the threat table, which is load-bearing on this edge: the
// charmer is very likely the top-threat entity at cast time, and
// updateEnemyTargeting reads threat FIRST — without the reset the new pet would
// keep chasing the player it can no longer harm (L-A).
//
// CC-immune species refuse it (plan-cc-and-retaliation.md D1), before all
// three of those: no link, no timer to expire later, no faction flip.
func (m *Mob) Charm(by model.PlayerEntity, source skills.SkillID, ticks int) {
	if m.ccImmune() {
		return
	}
	m.charmer = by
	m.buffs.ApplyCharm(source, ticks)
	m.Align()
}

// EndCharm reverts a charmed mob to the allegiance its species authors and
// drops the link — expiry (polled in Update) and the charmer leaving the world
// (D10) both land here.
//
// Inert on a mob that is not charmed, and that matters: the removal fan-out
// calls this on every mob whenever ANY entity leaves the world, and a summon's
// Align() is not charm's to undo.
func (m *Mob) EndCharm() {
	if m.charmer == nil {
		return
	}
	m.charmer = nil
	m.buffs.DropCharm()
	// The empty threat table is what makes "the charm wears off and it turns on
	// you" fall out of ordinary acquisition through the RESTORED mask, with no
	// re-engage code (§4.2).
	m.RevertFaction()
}

// CharmedBy reports whether this mob is charmed by the entity with the given
// id. The removal fan-out holds ecs ids, not player refs — this is the query it
// needs to find whose charm to break.
func (m *Mob) CharmedBy(id uint64) bool {
	return m.charmer != nil && m.charmer.Basic().ID() == id
}

// CreditTo implements model.Credited: who gets the XP, kill credit and drop
// rolls for what this mob does — the charmer while charmed, otherwise the
// summoning owner, nil for a world mob.
//
// ⚑ Deliberately NOT the same question as Owner(). A summon answers the same
// player to both, which is why one field held for so long; a charmed mob
// answers nobody to "whose level am I" and the charmer to this (D2).
func (m *Mob) CreditTo() model.PlayerEntity {
	if m.charmer != nil {
		return m.charmer
	}
	return m.owner
}

// leader is whose combat signals this mob follows and whom it trails — the
// charmer while charmed, otherwise the summoning owner (D6/§6.1b). Every
// owner-read inside companion.go goes through here; the STAT path never does.
func (m *Mob) leader() model.PlayerEntity {
	if m.charmer != nil {
		return m.charmer
	}
	return m.owner
}

// updateCharm reverts the mob the tick its charm timer runs out. Charm is the
// first buff whose expiry has to ACT, and the store has no expiry hook — so the
// mob polls, the same shape ttlTicks already had.
func (m *Mob) updateCharm() {
	if m.charmer != nil && !m.buffs.Charmed() {
		m.EndCharm()
	}
}
