package mob

// Behavior pins for the companion follower (mob-depth chunk 6): an owned,
// moving summon follows its owner and acquires targets exclusively from the
// owner's combat signals (§3.6) — never from its aggro sensor (whose mask
// sees the player layer) and never from its own threat table.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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
	def.Role = mobs.RoleFollower // authored since chunk 2, no longer inferred from owner+velocity
	return def
}

// newTestCompanion builds an owned, moving mob (= follower) at the origin.
func newTestCompanion(owner *fakeOwner) *Mob {
	m := NewMob(companionDefinition(), 0, nil)
	m.Align()
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
	// (idleSpeedFactor never applies; the companion must outrun the player). The
	// per-companion hold jitter (item 6) tilts the heading a few degrees off the
	// straight line, so pin the step LENGTH at full speed and the direction as
	// owner-ward (dominant +X) rather than an exact axis-aligned step.
	assert.InDelta(t, 0.055, m.Position().Abs(), 1e-3,
		"follower steps at full speed toward the owner")
	assert.Greater(t, m.Position().X, float32(0.04),
		"…and the step heads toward the owner")
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

// --- per-companion hold jitter (triage item 6, ruling (c)) ---

func TestMob_CompanionJitterIsStableAndPerCompanion(t *testing.T) {
	owner := newFakeOwner()
	a := newTestCompanion(owner)
	b := newTestCompanion(owner)

	// Deterministic: the same companion yields the same offset every call (no
	// rng draw, no time) — required for the sim.
	assert.Equal(t, a.companionHoldAngleOffset(), a.companionHoldAngleOffset(), "offset is stable per tick")
	// Distinct companions (distinct entity ids) get distinct offsets, so
	// siblings don't share a hold point.
	assert.NotEqual(t, a.companionHoldAngleOffset(), b.companionHoldAngleOffset(),
		"consecutive companions hash to different jitter angles")
}

func TestMob_CompanionsSharingBearingDoNotStack(t *testing.T) {
	// Two companions starting at the same point, following the same owner from
	// the same bearing, would collapse onto one hold point without the jitter.
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 2, Y: 0}
	a := newTestCompanion(owner)
	b := newTestCompanion(owner)

	for i := 0; i < 80; i++ {
		require.True(t, a.Update(0))
		require.True(t, b.Update(0))
	}

	assert.Greater(t, a.Position().Sub(b.Position()).Abs(), float32(0.1),
		"the jitter un-stacks siblings that share a follow bearing")
	// Both still hold on the follow ring around the owner.
	assert.InDelta(t, companionFollowDistance, a.Position().Sub(owner.pos).Abs(), 0.1)
	assert.InDelta(t, companionFollowDistance, b.Position().Sub(owner.pos).Abs(), 0.1)
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

// --- aura-reachability gate (hazard fix) ---

// bodiedCombatant is a hostile combatant that also exposes a physical body
// (model.BodiedEntity), so acquisition can inspect its collision layer.
type bodiedCombatant struct {
	*fakeCombatant
	body *phy.Circle
}

func (b *bodiedCombatant) Bodies() model.Bodies    { return model.Bodies{b.body} }
func (b *bodiedCombatant) SetPosition(p phy.Vec2f) { b.pos = p }

func newBodiedHostile(pos phy.Vec2f, layer model.CollisionLayer) *bodiedCombatant {
	body := phy.NewCircle(pos, 0.25)
	body.Shape().Layer = int(layer)
	return &bodiedCombatant{fakeCombatant: newHostileCombatant(pos), body: body}
}

func TestMob_FollowerIgnoresAuraUnreachableTarget(t *testing.T) {
	// A hazard whose body no damage mask sees (the brazier: Viewport-only
	// layer) damages the owner and gets stamped — but the companion's aura
	// could never hit it, so acquiring it would only park the companion in
	// the hazard's aura until it dies.
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	hazard := newBodiedHostile(phy.Vec2f{X: 3, Y: 0}, model.LayerViewportCollision)
	owner.attacker = hazard
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget,
		"an aura-unreachable stamp target is never acquired")
	assert.Equal(t, -1, m.skills.ActiveAuraSlot, "the aura stays gated")
}

func TestMob_FollowerAcquiresAuraReachableBodiedTarget(t *testing.T) {
	// Control: a bodied target on the action layer (a regular hostile mob)
	// intersects the aligned companion's enemy mask and is acquired as usual.
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 1, Y: 0}
	target := newBodiedHostile(phy.Vec2f{X: 3, Y: 0}, model.LayerActionCollision)
	owner.attacker = target
	m := newTestCompanion(owner)

	require.True(t, m.Update(0))

	assert.Same(t, model.Combatant(target), m.aggroTarget,
		"a reachable bodied target is acquired like any other")
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

// --- the medic companion: a follower that also supports (round 3, §31 gap 5) ---
//
// Two early returns used to collide in updateAggro. isFollower() was checked
// first and returned, so a follower carrying a heal aura never reached the
// seek-healer branch: MedicCompanion and ShieldbearerCompanion were shipped
// content that could not do the one thing they exist for. There is only one
// selector now, and the follower branch decides acquisition, not behaviour.

func medicCompanionDefinition() *mobs.MobDefinition {
	def := companionDefinition()
	def.Name = "MedicCompanion"
	def.Skills = []mobs.MobSkill{{Def: testHealAuraSkill(), Level: 1}}
	def.Body.AggroRadius = 3.0 // a real sensor: it looks for the wounded itself
	return def
}

func TestMob_MedicCompanion_HealsAWoundedAllyWhileFollowing(t *testing.T) {
	owner := newFakeOwner()
	m := NewMob(medicCompanionDefinition(), 0, nil)
	m.Align()
	m.SetOwner(owner)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})

	require.True(t, m.isFollower(), "still a follower")
	require.Equal(t, 0, m.supportSlot, "and it carries a support aura")
	require.Equal(t, int(model.LayerCombatants), m.aggroAura.Shape().Mask,
		"the sensor was widened so it can see allies at all")

	ally := newFakeCombatant()
	ally.faction = model.FactionAligned // the owner's side, like the medic
	ally.healthRatio = 0.3
	ally.pos = phy.Vec2f{X: 1.5, Y: 0}

	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	addSensorContact(m, space, ally, model.LayerActionCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	m.updateAggro()

	assert.Same(t, ally, m.supportTarget, "the medic finally sees its patient")
	assert.Equal(t, modeSupport, m.mode)
	assert.Greater(t, m.AuraRadius(), float32(0), "and switches its heal aura on")
}

// A follower with no support aura is unaffected: acquisition still comes purely
// from the owner's combat signals, and nothing new fires.
func TestMob_PlainCompanion_KeepsOwnerSignalAcquisitionOnly(t *testing.T) {
	owner := newFakeOwner()
	m := newTestCompanion(owner)

	assert.Equal(t, -1, m.supportSlot)

	ally := newFakeCombatant()
	ally.faction = model.FactionAligned
	ally.healthRatio = 0.3

	m.updateAggro()

	assert.Nil(t, m.supportTarget, "no support aura → no support target, ever")
	assert.Nil(t, m.aggroTarget, "and no owner signal → nothing acquired")
}

// Align re-derives the sensor mask from the aggro set. A summoned companion
// has its faction set from the caster AFTER construction, so a support widening
// applied only in NewMob would be narrowed straight back — blind medic, no
// error. The widening is part of the derivation for exactly this reason.
func TestMob_Align_KeepsTheSupportSensorWidening(t *testing.T) {
	m := NewMob(medicCompanionDefinition(), 0, nil)
	require.Equal(t, int(model.LayerCombatants), m.aggroAura.Shape().Mask)

	m.Align() // what spawnSummon does

	assert.Equal(t, int(model.LayerCombatants), m.aggroAura.Shape().Mask,
		"a support carrier must still see both combatant layers after re-factioning")
}

// The same call on a damage mob must still narrow to the aggro set — the
// widening is not a blanket "everyone sees everything".
func TestMob_Align_LeavesDamageMobSensorNarrow(t *testing.T) {
	m := newTestMob()

	m.Align()

	assert.Equal(t, aggroSensorMask(m.aggroMask), m.aggroAura.Shape().Mask)
	assert.NotEqual(t, int(model.LayerCombatants), m.aggroAura.Shape().Mask)
}

// A pacifist follower must ignore its owner's combat signals too. The medic has
// no combat aura, so acquiring the owner's attacker would just walk it away from
// the ally it exists to heal, chasing something it cannot hurt (PO 2026-07-25:
// pacifist healers ignore their attacker — followers are not an exception).
func TestMob_MedicCompanion_IgnoresTheOwnersAttacker(t *testing.T) {
	owner := newFakeOwner()
	m := NewMob(medicCompanionDefinition(), 0, nil)
	m.Align()
	m.SetOwner(owner)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	require.True(t, m.isFollower())
	require.True(t, m.isPacifist())

	attacker := newHostileCombatant(phy.Vec2f{X: 1, Y: 0})
	attacker.healthRatio = 1
	owner.attacker = attacker

	m.updateAggro()

	assert.Nil(t, m.aggroTarget,
		"a medic with nothing to fight with must not chase the owner's attacker")
	assert.Equal(t, modeIdle, m.mode, "no ally to support either → idle, keep following")
}
