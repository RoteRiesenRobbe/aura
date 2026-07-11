package mob

// Behavior pins for the companion follower (mob-depth chunk 6): an owned,
// moving summon follows its owner and acquires targets exclusively from the
// owner's combat signals (§3.6) — never from its aggro sensor (whose mask
// sees the player layer) and never from its own threat table.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// fakeOwner is a fakeAuraPlayer that also serves the companion's owner-centric
// acquisition signals (model.CombatSignals) and records direct-hit stamps
// (model.AttackNotifier).
type fakeOwner struct {
	*fakeAuraPlayer
	attackTarget model.Combatant
	attacker     model.Combatant
	attacksDealt []model.Combatant
}

func (f *fakeOwner) RecentAttackTarget() model.Combatant { return f.attackTarget }
func (f *fakeOwner) RecentAttacker() model.Combatant     { return f.attacker }
func (f *fakeOwner) NoteAttackDealt(target model.Combatant) {
	f.attacksDealt = append(f.attacksDealt, target)
}

func newFakeOwner() *fakeOwner {
	return &fakeOwner{fakeAuraPlayer: newFakeAuraPlayer(), attackTarget: nil, attacker: nil}
}

func companionDefinition() *mobs.MobDefinition {
	def := testMobDefinition()
	def.Name = "Companion"
	return def
}

// newTestCompanion builds an owned, moving mob (= follower) at the origin.
func newTestCompanion(owner *fakeOwner) *Mob {
	m := NewMob(companionDefinition(), 0, nil)
	m.SetFaction(model.FactionAligned)
	m.SetOwner(owner)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	return m
}

func newHostileCombatant(pos phy.Vec2f) *fakeCombatant {
	c := newFakeCombatant()
	c.faction = model.FactionHostile
	c.pos = pos
	return c
}

// --- follow movement ---

func TestMob_FollowerFollowsOwnerAtFullSpeed(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 5, Y: 0}
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	// One full-speed step toward the owner — follow is NOT idle ambling
	// (idleSpeedFactor never applies; the companion must outrun the player).
	assert.InDelta(t, 0.055, m.Position().X, 1e-5,
		"follower steps at full speed toward the owner")
	assert.InDelta(t, 0, m.Position().Y, 1e-5)
}

func TestMob_FollowerHoldsAtFollowDistance(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0} // within companionFollowDistance
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Equal(t, phy.Vec2f{X: 0, Y: 0}, m.Position(),
		"inside the follow ring the companion stands")
}

func TestMob_FollowerStopsOnFollowRingNotOwnerPosition(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 2, Y: 0}
	m := newTestCompanion(owner)

	for i := 0; i < 60; i++ {
		require.True(t, m.Update(0))
	}

	d := m.Position().Sub(owner.pos).Abs()
	assert.InDelta(t, companionFollowDistance, d, 0.06,
		"the companion converges onto the follow ring, not onto the owner")
}

func TestMob_FollowerTeleportsWhenHopelesslyFar(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 30, Y: 0} // beyond companionTeleportDistance
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	d := m.Position().Sub(owner.pos).Abs()
	assert.LessOrEqual(t, d, companionFollowDistance+1e-3,
		"beyond the teleport threshold the companion snaps beside the owner")
}

func TestMob_FollowerStandsWhenOwnerDead(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 5, Y: 0}
	owner.vs.Health = 0
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Equal(t, phy.Vec2f{X: 0, Y: 0}, m.Position(),
		"a companion with a dead owner stands (TTL cleans it up)")
}

// --- acquisition from owner combat signals (§3.6) ---

func TestMob_FollowerAcquiresOwnerAttackTarget(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	target := newHostileCombatant(phy.Vec2f{X: 3, Y: 0})
	owner.attackTarget = target
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Same(t, model.Combatant(target), m.aggroTarget,
		"assist rule: the mob the owner attacked is acquired")
	assert.Equal(t, 0, m.skills.ActiveAuraSlot,
		"acquisition activates the gated aura")
}

func TestMob_FollowerAcquiresOwnerAttacker(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	attacker := newHostileCombatant(phy.Vec2f{X: 0, Y: 3})
	owner.attacker = attacker
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Same(t, model.Combatant(attacker), m.aggroTarget,
		"defend rule: the mob attacking the owner is acquired")
}

func TestMob_FollowerDefendBeatsAssist(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	attacker := newHostileCombatant(phy.Vec2f{X: 0, Y: 3})
	target := newHostileCombatant(phy.Vec2f{X: 3, Y: 0})
	owner.attacker = attacker
	owner.attackTarget = target
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Same(t, model.Combatant(attacker), m.aggroTarget,
		"with both signals present, defending the owner wins")
}

func TestMob_FollowerNoSignalsNoAcquisition(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	m := newTestCompanion(owner)

	for i := 0; i < 10; i++ {
		require.True(t, m.Update(0))
	}

	assert.Nil(t, m.aggroTarget, "no owner signals → pure follow")
	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "aura stays gated while following")
}

func TestMob_FollowerIgnoresStampBeyondTether(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	far := newHostileCombatant(phy.Vec2f{X: 1 + companionTetherRadius + 5, Y: 0})
	owner.attackTarget = far
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget,
		"a stamped target beyond the owner tether is not acquired")
}

func TestMob_FollowerIgnoresDeadStamp(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	dead := newHostileCombatant(phy.Vec2f{X: 3, Y: 0})
	dead.healthRatio = 0
	owner.attackTarget = dead
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget, "a dead stamp target is never acquired")
}

// --- stickiness & drop rules ---

func TestMob_FollowerStickyIgnoresNewStamps(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	first := newHostileCombatant(phy.Vec2f{X: 3, Y: 0})
	owner.attackTarget = first
	m := newTestCompanion(owner)
	require.True(t, m.Update(0))
	require.Same(t, model.Combatant(first), m.aggroTarget)

	second := newHostileCombatant(phy.Vec2f{X: 0, Y: 3})
	owner.attacker = second
	owner.attackTarget = second
	require.True(t, m.Update(0))

	assert.Same(t, model.Combatant(first), m.aggroTarget,
		"the sticky target holds until it dies or leaves the tether")
}

func TestMob_FollowerResumesFollowWhenTargetDies(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	target := newHostileCombatant(phy.Vec2f{X: 3, Y: 0})
	owner.attackTarget = target
	m := newTestCompanion(owner)
	require.True(t, m.Update(0))
	require.Same(t, model.Combatant(target), m.aggroTarget)

	target.healthRatio = 0
	owner.attackTarget = nil
	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget, "a dead target is dropped")
	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "the aura gates off with the drop")
}

func TestMob_FollowerDropsTargetBeyondOwnerTether(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	target := newHostileCombatant(phy.Vec2f{X: 3, Y: 0})
	owner.attackTarget = target
	m := newTestCompanion(owner)
	require.True(t, m.Update(0))
	require.Same(t, model.Combatant(target), m.aggroTarget)

	owner.attackTarget = nil
	target.pos = phy.Vec2f{X: 1 + companionTetherRadius + 5, Y: 0}
	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget,
		"a target beyond the tether-from-owner is dropped (the companion never strays)")
}

func TestMob_FollowerIgnoresOwnThreatTable(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	m := newTestCompanion(owner)

	biter := newHostileCombatant(phy.Vec2f{X: 0, Y: 1})
	m.noteThreat(biter, 50)
	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget,
		"§3.6 is owner-centric: hits on the companion itself never acquire")
}

// --- evade-return skip (the chunk-5 handoff trap) ---

func TestMob_FollowerSkipsEvadeReturn(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 0.5, Y: 0}
	target := newHostileCombatant(phy.Vec2f{X: 6, Y: 0})
	owner.attackTarget = target
	m := newTestCompanion(owner)

	// Fight: acquire and chase away from the start point. Keep the target
	// inside the tether by keeping the owner nearby.
	for i := 0; i < 20; i++ {
		owner.pos = m.Position()
		require.True(t, m.Update(0))
	}
	require.Same(t, model.Combatant(target), m.aggroTarget)
	assert.False(t, m.returnPosSet,
		"a follower records no evade point — follow IS its return behavior")

	// Combat ends; the owner has moved on. The companion must head straight
	// for the owner, never back to where the fight started.
	target.healthRatio = 0
	owner.attackTarget = nil
	owner.pos = phy.Vec2f{X: -8, Y: 0}
	before := m.Position()
	require.True(t, m.Update(0))

	assert.Less(t, m.Position().X, before.X,
		"after the fight the companion moves toward the owner, not an evade point")
}

// --- direct-hit stamping (Mob.PlayerTouches → AttackNotifier) ---

func TestMob_PlayerTouches_StampsDirectHitOnToucher(t *testing.T) {
	m := newTestMob()
	owner := newFakeOwner()

	m.PlayerTouches(owner, model.Damage{HP: 5, Tags: []string{"physical"}})

	require.Len(t, owner.attacksDealt, 1,
		"a direct player hit stamps the toucher's attack signal")
	assert.Same(t, model.Combatant(m), owner.attacksDealt[0])
}

func TestMob_PlayerTouches_SummonSourcedHitDoesNotStamp(t *testing.T) {
	m := newTestMob()
	owner := newFakeOwner()
	summon := newFakeCombatant()

	m.PlayerTouches(owner, model.Damage{HP: 5, Tags: []string{"physical"}, Source: summon})

	assert.Empty(t, owner.attacksDealt,
		"summon-sourced damage is not the owner attacking (Source != nil)")
}
