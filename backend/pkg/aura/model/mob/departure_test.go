package mob

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// --- entity departure (the disconnect ghost-chase bug) ---
//
// A player who disconnects mid-chase leaves the world through
// game.RemoveEntity, which pulls its shapes out of the physics space but does
// NOT invalidate the mob's latched pointer: HealthRatio() stays above 0 and
// Position() keeps returning the spot it vanished at. Every per-tick escape
// hatch therefore misses — pruneDeadThreat sees a living row, retention
// re-latches the same pointer, and targetWithinAuraReach is permanently true
// once the mob arrives, so the leash never counts. The mob parks on the
// disconnect spot forever, in combat, aura on. ForgetEntity is the id-keyed
// hook that severs it, twinned with EndCharm on the removal fan-out.

func TestMob_ForgetEntity_UnlatchesTheDepartedTargetAndDropsItsThreat(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 5, Y: 0} // far outside the 2.0 sensor: only threat holds it

	m.PlayerTouches(p, model.Damage{HP: 10})
	require.True(t, m.Update(0))
	require.Same(t, p, m.aggroTarget, "the mob is chasing the player")

	m.ForgetEntity(p.basic.ID())

	assert.Nil(t, m.aggroTarget, "the departed target is unlatched immediately")
	assert.False(t, m.HasThreat(p.basic.ID()), "and its threat row is gone")

	require.True(t, m.Update(0))
	assert.Nil(t, m.aggroTarget, "nothing re-latches the ghost on the next tick")
}

// Only the leaver's references are cut: a second player still fighting the mob
// keeps it engaged, and retention swings onto them next tick.
func TestMob_ForgetEntity_KeepsFightingTheOtherAttacker(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	leaver := newFakeAuraPlayer()
	leaver.pos = phy.Vec2f{X: 5, Y: 0}
	stayer := newFakeAuraPlayer()
	stayer.pos = phy.Vec2f{X: 0.5, Y: 0}

	m.PlayerTouches(leaver, model.Damage{HP: 20}) // top of the table
	m.PlayerTouches(stayer, model.Damage{HP: 5})
	require.True(t, m.Update(0))
	require.Same(t, leaver, m.aggroTarget)

	m.ForgetEntity(leaver.basic.ID())

	require.True(t, m.Update(0))
	assert.Same(t, stayer, m.aggroTarget, "retention re-picks the highest surviving threat holder")
	assert.False(t, m.HasThreat(leaver.basic.ID()))
	assert.True(t, m.HasThreat(stayer.basic.ID()), "the rest of the table is untouched")
}

// The support half of the same ghost: withinSensor is pure geometry, so a
// departed patient stays "in range" forever and the healer never releases it.
func TestMob_ForgetEntity_ReleasesADepartedSupportTarget(t *testing.T) {
	m := newTestHealerMob()
	ally := newFakeCombatant()
	ally.faction = model.FactionHostile
	ally.healthRatio = 0.4

	m.supportTarget = ally
	m.selectMode()
	require.Equal(t, modeSupport, m.mode)

	m.ForgetEntity(ally.basic.ID())
	m.selectMode()

	assert.Nil(t, m.supportTarget, "the healer releases a patient that left the world")
	assert.Equal(t, modeIdle, m.mode)
	assert.Zero(t, m.AuraRadius(), "ring off — the heal aura gates back down")
}

// An id the mob holds no reference to is a no-op: the fan-out hands every
// departing entity to every mob, so the common case must cost nothing.
func TestMob_ForgetEntity_UnrelatedIDLeavesEverythingAlone(t *testing.T) {
	m := newTestMob()
	p := newFakeAuraPlayer()
	other := newFakeAuraPlayer()

	m.PlayerTouches(p, model.Damage{HP: 10})
	require.True(t, m.Update(0))
	require.Same(t, p, m.aggroTarget)

	m.ForgetEntity(other.basic.ID())

	assert.Same(t, p, m.aggroTarget)
	assert.True(t, m.HasThreat(p.basic.ID()))
}
