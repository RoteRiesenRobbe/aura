package mob

// Behaviour pins for the authored role discriminator (plan-entity-model.md
// chunk 2). Each one authors a role that CONTRADICTS what the old inference
// would have read off the numbers, so it fails against the speed/velocity
// reads and passes against the role. Nothing here asserts on the role field
// itself — the point is which behaviour the mob gets.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// A structure's aura IS its behaviour, so it runs with no aggro target — and
// that must follow from the authored role, not from the mob being too slow to
// chase. Speed 0.7 here is what the old `Factors.Speed <= 0` read got wrong.
func TestMob_StructureAuraIsAlwaysOnEvenWhenItCanWalk(t *testing.T) {
	def := testMobDefinition()
	def.Role = mobs.RoleStructure
	def.Factors.Speed = 0.7
	m := NewMob(def, 0, nil)

	require.True(t, m.Update(0))

	require.Nil(t, m.aggroTarget, "nothing to fight — the gate would be shut")
	assert.Equal(t, 0, m.skills.ActiveAuraSlot,
		"a structure's aura never gates, however fast it could walk")
}

// The inverse, and D3's legal config: a stationary CREATURE gates its aura on
// aggro like any other creature. Under the old read, speed 0 alone made it a
// turret.
func TestMob_StationaryCreatureStillGatesItsAura(t *testing.T) {
	def := testMobDefinition() // role absent → creature
	def.Factors.Speed = 0
	m := NewMob(def, 0, nil)

	require.True(t, m.Update(0))

	assert.Equal(t, -1, m.skills.ActiveAuraSlot,
		"a creature with no target has no aura running, stationary or not")
}

// Following is what a FOLLOWER does, not what any owned mob that happens to be
// able to move does. FireTotem and Totem are the live case: structures with an
// owner (chunk 2 content migration), and role and ownership are orthogonal.
func TestMob_OwnedStructureDoesNotFollowItsOwner(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 5, Y: 0}
	def := testMobDefinition()
	def.Role = mobs.RoleStructure
	def.Factors.Speed = 0.7 // it COULD walk; a structure does not
	m := NewMob(def, 0, nil)
	m.Align()
	m.SetOwner(owner)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})

	require.True(t, m.Update(0))

	assert.Equal(t, phy.Vec2f{X: 0, Y: 0}, m.Position(),
		"a totem stays where it was planted")
}

// Same for an owned creature: a summon is not a follower unless it is authored
// as one.
func TestMob_OwnedCreatureDoesNotFollowItsOwner(t *testing.T) {
	owner := newFakeOwner()
	owner.pos = phy.Vec2f{X: 5, Y: 0}
	def := testMobDefinition() // role absent → creature
	m := NewMob(def, 0, nil)
	m.Align()
	m.SetOwner(owner)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})

	require.True(t, m.Update(0))

	assert.Equal(t, phy.Vec2f{X: 0, Y: 0}, m.Position(),
		"an owned creature keeps the world archetype — walk home, not walk to owner")
}

// D4: the authored role states the intent, ownership is the runtime
// precondition. An ownerless follower has nothing to follow or acquire from, so
// it degrades to ordinary creature behaviour rather than standing inert.
func TestMob_OwnerlessFollowerFallsBackToCreatureBehaviour(t *testing.T) {
	def := testMobDefinition()
	def.Role = mobs.RoleFollower
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0}) // the first SetPosition IS the spawn point
	m.SetPosition(phy.Vec2f{X: 3, Y: 0}) // …and this displaces it from home

	require.True(t, m.Update(0))

	assert.Less(t, m.Position().X, float32(3),
		"no owner to follow — it walks home like any creature would")
}
