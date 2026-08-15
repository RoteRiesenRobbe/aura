package mob

// D10 pins (LoS prototype, docs/plan-prototype-aura-los.md): a mob whose
// target is inside aura reach but behind a blocking prop keeps closing until
// the sightline clears; the stop rule is unchanged when sight is clear, and a
// nil-space mob (tests, direct construction) keeps the pre-LoS behavior.
// Reuses the steering test harness (blockingStatic, tick, fakeAuraPlayer).

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMob_InRangeButSightBlockedKeepsApproaching(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 0.4, Y: 0}, 0.08)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.5, Y: 0} // inside bare-construction reach, behind the blocker
	m.aggroTarget = p
	require.Greater(t, m.aura.Radius+p.radius, float32(0.5),
		"test geometry: the target must start inside aura reach")

	start := m.Body.Position()
	tick(t, m, space)
	require.NotEqual(t, start, m.Body.Position(),
		"an in-range mob without a sightline must keep moving")

	for i := 0; i < 200; i++ {
		if !space.LineBlockedByStatics(m.Body.Position(), p.pos, model.LoSOccluderMask) {
			return // rounded the prop and regained sight
		}
		tick(t, m, space)
	}
	t.Fatalf("mob never regained a sightline; final pos %v", m.Body.Position())
}

func TestMob_InRangeWithClearSightHoldsPosition(t *testing.T) {
	// Control: the stop rule is unchanged when nothing blocks.
	space := phy.NewSpace()
	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.5, Y: 0}
	m.aggroTarget = p

	for i := 0; i < 5; i++ {
		tick(t, m, space)
	}
	assert.Equal(t, phy.VEC2F_ZERO, m.Body.Position(),
		"in range with a clear sightline the mob holds position")
}

func TestMob_NilSpaceKeepsPreLoSStopRule(t *testing.T) {
	m := NewMob(steeringMobDefinition(), 0, nil)
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.5, Y: 0}
	m.aggroTarget = p

	for i := 0; i < 5; i++ {
		require.True(t, m.Update(0))
	}
	assert.Equal(t, phy.VEC2F_ZERO, m.Body.Position(),
		"a nil-space mob in range holds position exactly as before")
}
