package mob

// Campfire hard safe-zone (playtest-1 feedback Pass A, decision 4, PO
// 2026-07-22): campfires become guaranteed-safe anchors — hostile mobs never
// enter the fire's radius and a chase breaks the moment the target reaches it.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withSafeZone installs a single campfire zone for the duration of a test.
func withSafeZone(t *testing.T, center phy.Vec2f, radius float32) {
	t.Helper()
	SetSafeZones([]SafeZone{{Center: center, Radius: radius}})
	t.Cleanup(func() { SetSafeZones(nil) })
}

func TestMob_ChaseBreaksWhenTargetEntersSafeZone(t *testing.T) {
	withSafeZone(t, phy.VEC2F_ZERO, 1.5)

	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 4, Y: 0})
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3, Y: 0}

	// Aggroed the normal way: a hit seeds threat, retention latches the target.
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))
	require.NotNil(t, m.aggroTarget, "precondition: mob is chasing")

	// The player reaches the fire.
	p.pos = phy.Vec2f{X: 1, Y: 0}
	require.True(t, m.Update(0))

	assert.Nil(t, m.aggroTarget, "target inside the fire: the chase breaks outright")
	assert.False(t, m.HasThreat(p.basic.ID()), "…and the threat table is cleared with it")
}

func TestMob_FindAggroTarget_SkipsTargetsInsideSafeZone(t *testing.T) {
	withSafeZone(t, phy.VEC2F_ZERO, 1.5)

	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 2.5, Y: 0})
	p := newLeveledCombatant(1)
	p.faction = model.FactionAligned
	p.pos = phy.Vec2f{X: 1, Y: 0} // inside the fire, inside the sensor
	sensedBy(m, p, model.LayerPlayerCollision)
	require.NotEmpty(t, m.aggroAura.Collisions())

	assert.Nil(t, m.findAggroTarget(),
		"a player at the fire is never proactively acquired")

	// Steps back out of the ring → acquirable again.
	p.pos = phy.Vec2f{X: 2, Y: 0}
	sensedBy(m, p, model.LayerPlayerCollision)
	assert.Same(t, model.Combatant(p), m.findAggroTarget())
}

func TestMob_MovementNeverEntersSafeZone(t *testing.T) {
	withSafeZone(t, phy.VEC2F_ZERO, 1.5)

	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 1.9, Y: 0})

	// Walk straight at the fire for a while.
	for i := 0; i < 200; i++ {
		m.moveTowards(phy.VEC2F_ZERO)
	}

	d := m.Position().Abs()
	assert.GreaterOrEqual(t, d, 1.5+m.Radius()-1e-4,
		"the mob's BODY stops at the ring; it never steps inside")
}

func TestMob_AlignedMobsIgnoreSafeZones(t *testing.T) {
	// Companions, summons and the campfire fixture itself are aligned — the
	// zone must not lock a player's own pet out of the fire.
	withSafeZone(t, phy.VEC2F_ZERO, 1.5)

	m := newTestMob()
	m.SetFaction(model.FactionAligned)
	m.SetPosition(phy.Vec2f{X: 1.9, Y: 0})

	for i := 0; i < 200; i++ {
		m.moveTowards(phy.VEC2F_ZERO)
	}

	assert.Less(t, m.Position().Abs(), float32(0.1),
		"an aligned mob walks to the fire like a player does")
}

func TestSafeZones_EmptyByDefault(t *testing.T) {
	// The sim harness and every test that never installs zones must see the
	// pre-chunk behavior exactly.
	SetSafeZones(nil)

	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 1, Y: 0})
	for i := 0; i < 100; i++ {
		m.moveTowards(phy.VEC2F_ZERO)
	}

	assert.Less(t, m.Position().Abs(), float32(0.1))
}
