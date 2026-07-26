package mob

// Allocation pin for obstacle steering (idle-overload investigation,
// 2026-07-22). blockerRepulsion runs for every mob on every tick it moves —
// on the live world that is ~50 mobs × 30 Hz, wandering with nobody online.
// It used to build a fresh probe circle and a fresh result slice (plus the
// de-dup map inside QueryCircleStatics) per call, which made it the single
// largest allocation site in the idle game loop.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

func TestBlockerRepulsion_AllocatesNothing(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 1.2, Y: 0}, 0.5)
	blockingRectStatic(space, phy.Vec2f{X: 0, Y: 1.4}, 1, 1)
	borderWall(space, 40, 40)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	space.Update()

	// Warm-up call: the per-mob probe and result buffer are built once.
	require.NotEqual(t, phy.VEC2F_ZERO, m.blockerRepulsion(), "test setup must actually repel")

	allocs := testing.AllocsPerRun(50, func() {
		m.blockerRepulsion()
	})

	assert.Zero(t, allocs, "blockerRepulsion runs per mob per tick — it must not allocate")
}

// TestSteer_AllocatesNothing covers the whole per-tick steering path including
// the mob separation query (round 6 item 3). Its dynamic-side counterpart to
// AppendCircleStatics had to be written for exactly this pin: phy.QueryCircle
// allocates a `seen` map and a fresh result slice per call, and this runs per
// mob per tick right beside the static query.
func TestSteer_AllocatesNothing(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 1.2, Y: 0}, 0.5)
	borderWall(space, 40, 40)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)

	// Neighbours inside the separation probe, so the mob half does real work.
	for _, p := range []phy.Vec2f{{X: 0.3, Y: 0.2}, {X: -0.2, Y: 0.4}} {
		other := NewMob(steeringMobDefinition(), 0, space)
		other.SetPosition(p)
		space.AddShape(other.Body)
	}
	space.Update()

	desired := phy.Vec2f{X: 1, Y: 0}
	// Warm-up: the per-mob probe and both hit buffers are built once.
	require.NotEqual(t, phy.VEC2F_ZERO, m.mobSeparation(), "test setup must actually separate")
	m.steer(desired)

	allocs := testing.AllocsPerRun(50, func() {
		m.steer(desired)
	})

	assert.Zero(t, allocs, "steer runs per mob per tick — it must not allocate")
}
