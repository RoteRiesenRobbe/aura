package mob

// Obstacle-steering pins (mob-depth chunk 4). All movement tests run through
// the real phy.Space broadphase + resolution pipeline, like the prop/InvAABB
// end-to-end pins: steering shapes the step direction, physics resolution
// stays the hard non-penetration guarantee (gotcha #6). Mobs constructed with
// a nil space keep the exact pre-steering straight-line movement — that path
// is pinned by the existing movement tests in mob_test.go.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
)

// steeringMobDefinition is testMobDefinition with an aggro sensor big enough
// that a detour around a blocker never trips the 3b leash countdown
// (target-outside-sensor would reset aggro after ~3 s and end the chase).
func steeringMobDefinition() *mobs.MobDefinition {
	d := testMobDefinition()
	d.Body.AggroRadius = 10
	return d
}

// steeringCowardDefinition flees below half health, sensor widened like above.
func steeringCowardDefinition() *mobs.MobDefinition {
	d := steeringMobDefinition()
	d.Factors.FleeBelowHealthRatio = 0.5
	return d
}

// blockingStatic plants a blocking-prop-like static circle: layer
// MobStaticCollision, exactly what model/prop sets for blocksMovement props.
func blockingStatic(space *phy.Space, pos phy.Vec2f, radius float32) {
	c := phy.NewCircle(pos, radius)
	c.Shape().Layer = int(model.LayerMobStaticCollision)
	space.AddStaticShape(c)
}

// blockingRectStatic plants a blocking rect-prop-like static box (content-pass
// C1 rect-prop lift): layer MobStaticCollision, what model/prop.NewRect sets
// for blocksMovement props.
func blockingRectStatic(space *phy.Space, pos phy.Vec2f, width, height float32) {
	b := phy.NewSolidAABB(pos, width, height)
	b.Shape().Layer = int(model.LayerMobStaticCollision)
	space.AddStaticShape(b)
}

// borderWall plants the world border, layered like core/game.go does.
func borderWall(space *phy.Space, width, height float32) {
	wall := phy.NewInvAABB(phy.VEC2F_ZERO, width, height)
	wall.Shape().Layer = int(model.LayerBorderCollision)
	space.AddStaticShape(wall)
}

// tick runs one full mob+physics step.
func tick(t *testing.T, m *Mob, space *phy.Space) {
	t.Helper()
	require.True(t, m.Update(0))
	space.Update()
}

func TestMob_SteersAroundBlockerReachesTarget(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 2, Y: 0}, 0.5)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4, Y: 0} // dead behind the blocker
	m.aggroTarget = p

	reach := m.aura.Radius + p.radius // 0.75
	for i := 0; i < 200; i++ {
		tick(t, m, space)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			return // rounded the blocker and reached aura reach
		}
	}
	t.Fatalf("mob never reached its target around the blocker; final pos %v", m.Body.Position())
}

func TestMob_SteersAroundRectBlockerReachesTarget(t *testing.T) {
	space := phy.NewSpace()
	blockingRectStatic(space, phy.Vec2f{X: 2, Y: 0}, 1.5, 1) // house across the path

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4.5, Y: 0} // dead behind the house
	m.aggroTarget = p

	reach := m.aura.Radius + p.radius
	for i := 0; i < 300; i++ {
		tick(t, m, space)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			return // rounded the house and reached aura reach
		}
	}
	t.Fatalf("mob never reached its target around the rect blocker; final pos %v", m.Body.Position())
}

func TestMob_TargetInsideRectBlockerHoldsWithoutJitter(t *testing.T) {
	space := phy.NewSpace()
	center := phy.Vec2f{X: 2.5, Y: 0}
	blockingRectStatic(space, center, 3, 2) // stop distance < box: unreachable

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = center // level-design error: target inside the house
	m.aggroTarget = p

	// Warm-up: approach and settle.
	for i := 0; i < 100; i++ {
		tick(t, m, space)
	}

	prev := m.Body.Position()
	for i := 0; i < 100; i++ {
		tick(t, m, space)
		pos := m.Body.Position()
		// Physics holds the mob out of the box: center at least a body radius
		// from the closest face point. (Since the detour-commit the holding
		// pattern orbits the box, so corner contact — radial, not face-axis —
		// is a valid position too.)
		closest := phy.Vec2f{
			X: clampf(pos.X, center.X-1.5, center.X+1.5),
			Y: clampf(pos.Y, center.Y-1, center.Y+1),
		}
		assert.GreaterOrEqual(t, pos.Sub(closest).Abs(), m.Body.Radius-float32(1e-2),
			"must not end up inside the rect blocker (tick %d): %v", i, pos)
		// No jitter: per-tick displacement stays a plausible movement step.
		assert.Less(t, pos.Sub(prev).Abs(), float32(0.15), "teleporty jitter (tick %d)", i)
		prev = pos
	}
}

func TestMob_NoBlockersPathUnchanged(t *testing.T) {
	space := phy.NewSpace()

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.Vec2f{X: 1, Y: 1})
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: -3} // due south
	m.aggroTarget = p

	tick(t, m, space)

	// Nothing in steering range → the step is the exact straight line of the
	// pre-steering movement (bit-identical direction, one velocity step).
	assert.InDelta(t, 1, m.Body.Position().X, 1e-5)
	assert.InDelta(t, float64(1-m.velocity), float64(m.Body.Position().Y), 1e-5)
}

func TestMob_HeadOnBlockerDeflectsConsistently(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 1.5, Y: 0}, 0.5)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3.5, Y: 0} // exact head-on line mob→blocker→target
	m.aggroTarget = p

	reach := m.aura.Radius + p.radius
	reached := false
	for i := 0; i < 200; i++ {
		tick(t, m, space)
		// Exact head-on deflects to a fixed side (left, +y) and must never
		// flip-flop across the line — oscillation would show as y < 0.
		assert.GreaterOrEqual(t, m.Body.Position().Y, float32(-1e-3),
			"deflection side must stay consistent (tick %d)", i)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			reached = true
			break
		}
	}
	assert.True(t, reached, "head-on blocker: mob must round it and reach the target; final pos %v", m.Body.Position())
}

func TestMob_SpawnedOverlappingBlockerEscapes(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 0.4, Y: 0}, 0.5)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO) // body overlaps the blocker from spawn
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3, Y: 0}
	m.aggroTarget = p

	reach := m.aura.Radius + p.radius
	for i := 0; i < 200; i++ {
		tick(t, m, space)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			return
		}
	}
	t.Fatalf("mob spawned inside a blocker never escaped to its target; final pos %v", m.Body.Position())
}

func TestMob_TargetInsideBlockerHoldsWithoutJitter(t *testing.T) {
	space := phy.NewSpace()
	center := phy.Vec2f{X: 2, Y: 0}
	blockingStatic(space, center, 1.2) // stop distance 0.7 < 1.2+0.3: unreachable

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = center // level-design error: target inside the blocker
	m.aggroTarget = p

	// Warm-up: approach and settle into the holding pattern.
	for i := 0; i < 100; i++ {
		tick(t, m, space)
	}

	start := m.Body.Position()
	prev := start
	pathLength := float32(0)
	for i := 0; i < 100; i++ {
		tick(t, m, space)
		pos := m.Body.Position()
		d := pos.Sub(center).Abs()
		// Holds nearby: outside the blocker body, inside steering range.
		assert.Greater(t, d, float32(1.4), "must not grind into the blocker (tick %d)", i)
		assert.Less(t, d, float32(3.3), "must not wander off (tick %d)", i)
		// No jitter: per-tick displacement stays a plausible movement step
		// (velocity + resolution slack), never a teleport.
		assert.Less(t, pos.Sub(prev).Abs(), float32(0.15), "teleporty jitter (tick %d)", i)
		pathLength += pos.Sub(prev).Abs()
		prev = pos
	}
	// ...and it holds by MOVING (circling the blocker), not by vibrating in
	// place jammed against it.
	assert.Greater(t, pathLength, float32(1.0),
		"mob must keep moving around the blocker instead of jamming against it")
}

func TestMob_FleeSteersAroundBlocker(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: -1.5, Y: 0}, 0.5)

	m := NewMob(steeringCowardDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: 0} // flee due west, dead into the blocker
	m.aggroTarget = p
	m.health = 10 // ratio 0.1 < 0.5 → fleeing

	for i := 0; i < 150; i++ {
		tick(t, m, space)
		if m.Body.Position().X < -2.3 {
			return // deflected around the blocker and kept fleeing
		}
	}
	t.Fatalf("fleeing mob never made it past the blocker; final pos %v", m.Body.Position())
}

func TestMob_FleePerpendicularIntoWallSlidesAlongIt(t *testing.T) {
	space := phy.NewSpace()
	borderWall(space, 10, 10)

	m := NewMob(steeringCowardDefinition(), 0, space)
	m.SetPosition(phy.Vec2f{X: 4.5, Y: 0})
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3, Y: 0} // flee due east, perpendicular into the right wall
	m.aggroTarget = p
	m.health = 10

	for i := 0; i < 40; i++ {
		tick(t, m, space)
		assert.LessOrEqual(t, m.Body.Position().X, 5-m.Body.Radius+1e-3, "wall holds (tick %d)", i)
	}

	// Pre-steering this pinned stationary at the wall (per-axis clamp);
	// wall repulsion now deflects the dead-end flee into a slide along it.
	assert.Greater(t, absf(m.Body.Position().Y), float32(0.5),
		"perpendicular flee must deflect into a slide along the wall; final pos %v", m.Body.Position())
}

func TestMob_FleeIntoCornerEscapesAlongEdge(t *testing.T) {
	space := phy.NewSpace()
	borderWall(space, 10, 10)

	m := NewMob(steeringCowardDefinition(), 0, space)
	m.SetPosition(phy.Vec2f{X: 4.5, Y: 4.5})
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3.5, Y: 3.5} // flee diagonally into the (5,5) corner
	m.aggroTarget = p
	m.health = 10

	var prev phy.Vec2f
	lastTenPath := float32(0)
	for i := 0; i < 80; i++ {
		tick(t, m, space)
		pos := m.Body.Position()
		assert.LessOrEqual(t, pos.X, 5-m.Body.Radius+1e-3, "wall holds on x (tick %d)", i)
		assert.LessOrEqual(t, pos.Y, 5-m.Body.Radius+1e-3, "wall holds on y (tick %d)", i)
		if i >= 70 {
			lastTenPath += pos.Sub(prev).Abs()
		}
		prev = pos
	}

	// Pre-steering this converged into the corner clamp point and froze;
	// with wall repulsion the mob deflects and keeps escaping along an edge.
	corner := phy.Vec2f{X: 5 - m.Body.Radius, Y: 5 - m.Body.Radius}
	assert.Greater(t, m.Body.Position().Sub(corner).Abs(), float32(0.5),
		"mob must escape the corner instead of converging into it; final pos %v", m.Body.Position())
	assert.Greater(t, lastTenPath, float32(0.1),
		"mob must still be moving at the end, not pinned")
}

// Two blockers forming a shallow pocket across the chase line (in-game
// finding, 2026-07-11: a mob jittered left-right in place against a
// tree+rock pair, flipping its deflection side every tick — the
// perpendicular-lean side choice is only stable for a SINGLE blocker; with
// two, moving toward one flips the lean back). The side latch commits the
// mob to one way around the cluster.
func TestMob_TwoBlockerPocketNoSideFlipOscillation(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 2, Y: 0.5}, 0.5)
	blockingStatic(space, phy.Vec2f{X: 2, Y: -0.6}, 0.5)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4, Y: 0} // dead behind the pocket
	m.aggroTarget = p

	reach := m.aura.Radius + p.radius
	for i := 0; i < 300; i++ {
		tick(t, m, space)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			return // committed to one side and rounded the cluster
		}
	}
	t.Fatalf("mob never rounded the two-blocker pocket; final pos %v", m.Body.Position())
}

// A prop WALL: two big props with a gap narrower than the mob body, chase
// line dead into the gap (in-game finding, 2026-07-20: density-pass tree
// walls — two wolves jiggled in place at the notch forever). The side latch
// alone is not enough here: once the mob has slid a little, the blend branch
// re-aims it at the gap and it limit-cycles between deflect and blend. The
// detour-commit keeps the latched tangent until fully clear of repulsion, so
// the mob slides along the wall and rounds its end.
func TestMob_PropWallNotchRoundsTheWall(t *testing.T) {
	space := phy.NewSpace()
	blockingStatic(space, phy.Vec2f{X: 2, Y: 1.35}, 1.1)
	blockingStatic(space, phy.Vec2f{X: 2, Y: -1.35}, 1.1) // gap 0.5 < mob diameter

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 4.5, Y: 0} // dead behind the notch
	m.aggroTarget = p

	reach := m.aura.Radius + p.radius
	for i := 0; i < 400; i++ {
		tick(t, m, space)
		if m.Body.Position().Sub(p.pos).Abs() <= reach {
			return // slid along the wall, rounded an end, reached the target
		}
	}
	t.Fatalf("mob never rounded the prop wall; final pos %v", m.Body.Position())
}

func absf(v float32) float32 {
	if v < 0 {
		return -v
	}
	return v
}

func clampf(v, lo, hi float32) float32 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
