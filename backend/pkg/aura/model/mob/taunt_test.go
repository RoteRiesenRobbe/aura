package mob

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// --- taunt / detaunt threat seams (mob-depth chunk 7) ---

// ForceThreatToTop sets the source above the current max living threat, so
// retention swings the aggro target onto it next tick (WoW-style taunt with no
// separate target lock — decided v1).
func TestMob_ForceThreatToTop_ExceedsMaxAndBecomesTarget(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	low := newFakeAuraPlayer()
	low.pos = phy.Vec2f{X: 0.3, Y: 0}
	high := newFakeAuraPlayer()
	high.pos = phy.Vec2f{X: 5, Y: 0}
	taunter := newFakeCombatant() // Aligned — enemy to the hostile mob

	m.PlayerTouches(low, model.Damage{HP: 5})
	m.PlayerTouches(high, model.Damage{HP: 20}) // current top

	m.ForceThreatToTop(taunter, 50)

	assert.InDelta(t, 70, m.threat[taunter.basic.ID()].threat, 1e-6,
		"force-to-top = current max (20) + margin (50), strictly above the old top")
	require.True(t, m.Update(0))
	assert.Same(t, taunter, m.aggroTarget,
		"retention swings onto the taunter — it now holds the most threat")
}

// From an empty table the taunter simply becomes the sole entry at the margin.
func TestMob_ForceThreatToTop_EmptyTableSeedsMargin(t *testing.T) {
	m := newTestMob()
	taunter := newFakeCombatant()

	m.ForceThreatToTop(taunter, 50)

	require.True(t, m.HasThreat(taunter.basic.ID()))
	assert.InDelta(t, 50, m.threat[taunter.basic.ID()].threat, 1e-6)
}

// Same faction, dead and nil sources are dropped — the noteThreat gates.
func TestMob_ForceThreatToTop_GatesAlliedDeadAndNilSource(t *testing.T) {
	m := newTestMob() // hostile

	allied := newFakeCombatant()
	allied.faction = model.FactionHostile // same as the mob
	m.ForceThreatToTop(allied, 50)
	assert.False(t, m.HasThreat(allied.basic.ID()), "cannot taunt with an allied source")

	dead := newFakeCombatant()
	dead.healthRatio = 0
	m.ForceThreatToTop(dead, 50)
	assert.False(t, m.HasThreat(dead.basic.ID()), "a dead source is dropped")

	m.ForceThreatToTop(nil, 50) // must not panic
}

// A taunt lands the taunter on the threat table, so the mob-cast harm gate
// (chunk 6.6: aggroSet ∪ HasThreat) grants the right to hit the taunter for
// free — even a passive faction that never had it in its aggro set.
func TestMob_ForceThreatToTop_GrantsHarmRights(t *testing.T) {
	def := testMobDefinition()
	m := NewMob(def, 0, nil) // hostile default: aggro set {aligned} only
	taunter := newFakeCombatant()

	require.False(t, m.HasThreat(taunter.basic.ID()))
	m.ForceThreatToTop(taunter, 50)
	assert.True(t, m.MayHarm(taunter.faction, taunter.basic.ID()),
		"the taunter is on the threat table → MayHarm holds via the dynamic layer")
}

// DropThreat removes exactly the one entry (Fade = single-entry removal).
func TestMob_DropThreat_RemovesEntry(t *testing.T) {
	m := newTestMob()
	a := newFakeAuraPlayer()
	m.PlayerTouches(a, model.Damage{HP: 10})
	require.True(t, m.HasThreat(a.basic.ID()))

	m.DropThreat(a.basic.ID())
	assert.False(t, m.HasThreat(a.basic.ID()))

	m.DropThreat(a.basic.ID()) // idempotent, no panic on missing / nil map
	m.DropThreat(999)
}

// Fade sheds aggro to the next-highest threat: the fader drops their entry, and
// retention picks the remaining threat holder (the tank) next tick.
func TestMob_DropThreat_ShedsToNextHighestThreat(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	fader := newFakeAuraPlayer()
	fader.pos = phy.Vec2f{X: 0.3, Y: 0}
	tank := newFakeAuraPlayer()
	tank.pos = phy.Vec2f{X: 4, Y: 0}

	m.PlayerTouches(tank, model.Damage{HP: 5})
	m.PlayerTouches(fader, model.Damage{HP: 30}) // fader is on top
	require.True(t, m.Update(0))
	require.Same(t, fader, m.aggroTarget)

	m.DropThreat(fader.basic.ID())
	require.True(t, m.Update(0))
	assert.Same(t, tank, m.aggroTarget,
		"aggro sheds to the tank — the fader's threat is gone")
}
