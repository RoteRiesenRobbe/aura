package mob

// Chase stuck watchdog pins (pathfinding fix, 2026-07-20). Steering commits
// to a tangent detour along prop walls (steering_test.go), but a concave
// pocket can block the tangent on both sides — then the mob must CAMP: hold
// position at the wall, stay aggroed, resume when the target repositions
// (PO decision 2026-07-20: walls are gameplay, a stuck mob glares instead of
// resetting — no aggro-drop/re-aggro loop).

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// campPocket builds a three-prop concave pocket around the origin: blockers
// ahead, above and below (gaps between them smaller than the mob body), open
// only to the west. A mob at the origin chasing an eastern target can neither
// pass nor tangent-slide free — the watchdog's target geometry.
func campPocket(space *phy.Space) {
	blockingStatic(space, phy.Vec2f{X: 1.5, Y: 0}, 1)
	blockingStatic(space, phy.Vec2f{X: 0, Y: 1.5}, 1)
	blockingStatic(space, phy.Vec2f{X: 0, Y: -1.5}, 1)
}

func TestMob_StuckInPocketCampsWithoutJitter(t *testing.T) {
	space := phy.NewSpace()
	campPocket(space)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4, Y: 0} // unreachable: every gap is impassable
	m.aggroTarget = p

	// Warm-up: jam into the pocket and trip the watchdog.
	for i := 0; i < 90; i++ {
		tick(t, m, space)
	}

	// Camped: aggro held, position frozen — no perpetual jiggle at the wall.
	prev := m.Body.Position()
	for i := 0; i < 30; i++ {
		tick(t, m, space)
		pos := m.Body.Position()
		assert.Less(t, pos.Sub(prev).Abs(), float32(1e-3),
			"camped mob must hold still, not jiggle (tick %d)", i)
		prev = pos
	}
	assert.NotNil(t, m.aggroTarget, "camping must keep the aggro, not reset it")
}

func TestMob_CampLiftsWhenTargetMoves(t *testing.T) {
	space := phy.NewSpace()
	campPocket(space)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4, Y: 0}
	m.aggroTarget = p

	for i := 0; i < 90; i++ {
		tick(t, m, space)
	}
	require.True(t, m.camped, "warm-up must end camped")

	// Target repositions to the open side — the camp lifts and the chase
	// resumes through the pocket's opening.
	p.pos = phy.Vec2f{X: -3, Y: 0}
	reach := m.aura.Radius + p.radius
	for i := 0; i < 200; i++ {
		tick(t, m, space)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			return
		}
	}
	t.Fatalf("mob never resumed the chase after the target moved; final pos %v", m.Body.Position())
}

func TestMob_CampRetriesAfterInterval(t *testing.T) {
	space := phy.NewSpace()
	campPocket(space)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4, Y: 0}
	m.aggroTarget = p

	for i := 0; i < 90; i++ {
		tick(t, m, space)
	}
	require.True(t, m.camped, "warm-up must end camped")

	// Even against a static target the camp self-heals: after the retry
	// interval the mob probes again (and re-camps if still blocked).
	m.campTicks = campRetryTicks - 1
	tick(t, m, space)
	assert.False(t, m.camped, "camp must lift for a retry after campRetryTicks")
}
