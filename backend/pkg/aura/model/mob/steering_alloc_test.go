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
