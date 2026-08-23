package mob

// Idle-movement archetype tests (mob-depth chunk 5): local wander, ping-pong
// route patrol, and the WoW-style evade return — a mob that aggros from idle
// records its position and, once combat resets, walks back there before
// resuming its archetype.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// tickIdle advances the mob n idle ticks (no aggro), keeping it alive.
func tickIdle(m *Mob, n int) {
	for i := 0; i < n; i++ {
		m.Update(0)
	}
}

// runUntilNear ticks the mob until it is within dist of target, failing the
// test after maxTicks.
func runUntilNear(t *testing.T, m *Mob, target phy.Vec2f, dist float32, maxTicks int) {
	t.Helper()
	for i := 0; i < maxTicks; i++ {
		if m.Position().Sub(target).Abs() <= dist {
			return
		}
		m.Update(0)
	}
	t.Fatalf("mob never came within %g of %v (at %v after %d ticks)",
		dist, target, m.Position(), maxTicks)
}

// --- 5a local wander ---

func TestMob_WanderStaysWithinRadius(t *testing.T) {
	m := newTestMob()
	anchor := phy.Vec2f{X: 5, Y: 5}
	m.SetPosition(anchor)
	m.SetWander(anchor, 2)

	moved := false
	for i := 0; i < 2000; i++ {
		before := m.Position()
		m.Update(0)
		if m.Position() != before {
			moved = true
		}
		d := m.Position().Sub(anchor).Abs()
		if d > 2+1e-3 {
			t.Fatalf("wanderer left its radius: %g from anchor at tick %d", d, i)
		}
	}
	assert.True(t, moved, "a wanderer must actually move")
}

func TestMob_WanderAnchorsOnGivenAnchorNotSpawnPosition(t *testing.T) {
	// Respawn-within-band rolls a position away from the authored point; the
	// wander disc must stay centered on the authored anchor (gotcha #7), so
	// the mob walks back into it and never drifts around the rolled spot.
	m := newTestMob()
	anchor := phy.Vec2f{X: 0, Y: 0}
	rolled := phy.Vec2f{X: 6, Y: 0} // outside the radius-2 disc
	m.SetPosition(rolled)
	m.SetWander(anchor, 2)

	entered := false
	for i := 0; i < 2000; i++ {
		m.Update(0)
		d := m.Position().Sub(anchor).Abs()
		if d <= 2+1e-3 {
			entered = true
		} else if entered {
			t.Fatalf("wanderer left the anchor disc again: %g at tick %d", d, i)
		}
	}
	assert.True(t, entered, "wanderer must walk into the anchor's disc")
}

func TestMob_WanderDwellsBetweenLegsAtReducedSpeed(t *testing.T) {
	m := newTestMob() // velocity 0.055
	anchor := phy.Vec2f{X: 0, Y: 0}
	m.SetPosition(anchor)
	m.SetWander(anchor, 2)

	movingTicks, idleTicks := 0, 0
	maxStep := float32(0)
	for i := 0; i < 2000; i++ {
		before := m.Position()
		m.Update(0)
		step := m.Position().Sub(before).Abs()
		if step > 0 {
			movingTicks++
			if step > maxStep {
				maxStep = step
			}
		} else {
			idleTicks++
		}
	}
	assert.Greater(t, movingTicks, 0, "wanderer must walk")
	assert.Greater(t, idleTicks, 0, "wanderer must dwell between legs")
	assert.LessOrEqual(t, maxStep, m.velocity*defaultIdleSpeedFactor+1e-6,
		"wander legs amble at the idle speed, never chase speed")
}

// --- 5b route patrol ---

func TestMob_WaypointsTraversePingPong(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	a := phy.Vec2f{X: 1, Y: 0}
	b := phy.Vec2f{X: 2, Y: 0}
	m.SetWaypoints([]phy.Vec2f{a, b}, false)

	// Forward: A then B…
	runUntilNear(t, m, a, waypointArrivalRadius, 200)
	runUntilNear(t, m, b, waypointArrivalRadius, 200)
	// …then ping-pong back to A and forward to B again.
	runUntilNear(t, m, a, waypointArrivalRadius, 200)
	runUntilNear(t, m, b, waypointArrivalRadius, 200)
}

func TestMob_PatrolMarchesAtIdleSpeed(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetWaypoints([]phy.Vec2f{{X: 2, Y: 0}, {X: 4, Y: 0}}, false)

	before := m.Position()
	m.Update(0)
	assert.InDelta(t, m.velocity*defaultIdleSpeedFactor, m.Position().Sub(before).Abs(), 1e-6,
		"a patroller ambles at the idle speed, not chase speed")
}

func TestMob_IdleSpeedFactorFromDefinition(t *testing.T) {
	def := testMobDefinition()
	def.Factors.IdleSpeedFactor = 0.25
	m := NewMob(def, 0, nil)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetWaypoints([]phy.Vec2f{{X: 2, Y: 0}, {X: 4, Y: 0}}, false)

	before := m.Position()
	m.Update(0)
	assert.InDelta(t, m.velocity*0.25, m.Position().Sub(before).Abs(), 1e-6,
		"the mob definition sets the type's idle pace")
}

func TestMob_SetIdleSpeedFactorOverridesDefinition(t *testing.T) {
	def := testMobDefinition()
	def.Factors.IdleSpeedFactor = 0.25
	m := NewMob(def, 0, nil)
	m.SetIdleSpeedFactor(0.8)
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetWaypoints([]phy.Vec2f{{X: 2, Y: 0}, {X: 4, Y: 0}}, false)

	before := m.Position()
	m.Update(0)
	assert.InDelta(t, m.velocity*0.8, m.Position().Sub(before).Abs(), 1e-6,
		"a spawn-level idle speed override beats the type default")
}

func TestMob_DwellBandFromDefinition(t *testing.T) {
	def := testMobDefinition()
	def.Factors.IdleDwellMinTicks = 7
	def.Factors.IdleDwellMaxTicks = 7
	m := NewMob(def, 0, nil)
	assert.Equal(t, 7, m.rollDwell(), "dwell band comes from the definition")

	assert.GreaterOrEqual(t, newTestMob().rollDwell(), defaultIdleDwellMinTicks)
	assert.LessOrEqual(t, newTestMob().rollDwell(), defaultIdleDwellMaxTicks)
}

func TestMob_WaypointsLoopModeWrapsForward(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	a := phy.Vec2f{X: 0, Y: 1}
	b := phy.Vec2f{X: 2, Y: 0}
	c := phy.Vec2f{X: 0, Y: -1}
	m.SetWaypoints([]phy.Vec2f{a, b, c}, true)

	runUntilNear(t, m, a, waypointArrivalRadius, 400)
	runUntilNear(t, m, b, waypointArrivalRadius, 400)
	runUntilNear(t, m, c, waypointArrivalRadius, 400)
	// Loop: after the last point the mob heads straight for the FIRST —
	// ping-pong would revisit b on the way back.
	for i := 0; i < 400; i++ {
		if m.Position().Sub(a).Abs() <= waypointArrivalRadius {
			return
		}
		if i > 20 && m.Position().Sub(b).Abs() <= waypointArrivalRadius {
			t.Fatal("loop traversal must wrap c->a, not ping-pong back through b")
		}
		m.Update(0)
	}
	t.Fatal("mob never wrapped around to the first waypoint")
}

func TestMob_EvadeReturnRunsAtFullSpeed(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetWaypoints([]phy.Vec2f{{X: 2, Y: 0}, {X: 4, Y: 0}}, false)
	tickIdle(m, 5)

	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0, Y: -5}
	m.NoteThreat(p, 10)
	m.Update(0)
	tickIdle(m, 40) // chase away at full speed

	p.vs.Health = 0
	m.Update(0) // combat resets; the return walk starts
	require.True(t, m.returnPosSet)
	before := m.Position()
	m.Update(0)
	assert.InDelta(t, m.velocity, m.Position().Sub(before).Abs(), 1e-6,
		"the evade return RUNS home at full speed (only idle movement ambles)")
}

// --- evade return (WoW-style, user decision at chunk-5 plan-first) ---

func TestMob_ReturnsToAggroPointThenResumesRoute(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	a := phy.Vec2f{X: 1, Y: 0}
	b := phy.Vec2f{X: 2, Y: 0}
	m.SetWaypoints([]phy.Vec2f{a, b}, false)

	// Walk past A, part-way toward B.
	runUntilNear(t, m, a, waypointArrivalRadius, 200)
	tickIdle(m, 5)

	// A sniper hit acquires via threat retention; the mob leaves the route.
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0, Y: -3}
	m.NoteThreat(p, 10)
	m.Update(0)
	require.Same(t, p, m.aggroTarget)
	aggroPoint := m.returnPos
	require.True(t, m.returnPosSet, "leaving idle must record the evade point")
	chase := 0
	for ; m.Position().Sub(p.pos).Abs() > 1; chase++ {
		require.Less(t, chase, 400, "mob must chase toward the target")
		m.Update(0)
	}

	// Target dies → combat resets → mob walks back to the recorded point…
	p.vs.Health = 0
	m.Update(0)
	require.Nil(t, m.aggroTarget)
	runUntilNear(t, m, aggroPoint, waypointArrivalRadius, 400)
	// …and resumes the route toward B (waypoint index kept).
	runUntilNear(t, m, b, waypointArrivalRadius, 400)
}

func TestMob_ReaggroDuringReturnKeepsOriginalReturnPoint(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 0, Y: 0})
	m.SetWaypoints([]phy.Vec2f{{X: 1, Y: 0}, {X: 2, Y: 0}}, false)
	tickIdle(m, 5)

	first := newFakeAuraPlayer()
	first.pos = phy.Vec2f{X: 0, Y: -3}
	m.NoteThreat(first, 10)
	m.Update(0)
	original := m.returnPos
	require.True(t, m.returnPosSet)
	tickIdle(m, 20) // chase away from the route

	// First fight ends; mob starts the return walk.
	first.vs.Health = 0
	m.Update(0)
	tickIdle(m, 5)
	require.True(t, m.returnPosSet, "still returning")

	// Re-aggro mid-return must NOT move the evade point off the route.
	second := newFakeAuraPlayer()
	second.pos = phy.Vec2f{X: 0, Y: 3}
	m.NoteThreat(second, 10)
	m.Update(0)
	require.Same(t, second, m.aggroTarget)
	assert.Equal(t, original, m.returnPos,
		"re-aggro during the return walk keeps the on-route evade point")
}

func TestMob_StationaryMobReturnFallsBackToWalkHome(t *testing.T) {
	// A classic mob (no wander/waypoints) keeps today's behavior: after the
	// evade return it stands at its spawn spot (the two points coincide).
	m := newTestMob()
	spawn := phy.Vec2f{X: 1, Y: 1}
	m.SetPosition(spawn)
	tickIdle(m, 2)

	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 1, Y: -4}
	m.NoteThreat(p, 10)
	m.Update(0)
	tickIdle(m, 30) // chase away

	p.vs.Health = 0
	m.Update(0)
	runUntilNear(t, m, spawn, waypointArrivalRadius, 400)
	tickIdle(m, 50)
	assert.InDelta(t, 0, m.Position().Sub(spawn).Abs(), waypointArrivalRadius+1e-3,
		"classic mob ends up back home and stays")
}

// --- idle-walk stuck budget (steering pass 2026-08-07) ---
// Walk-home and the evade return were the only movement paths with no stuck
// protection at all (chase camps, wander legs expire): a blocked walk paced
// against its obstacle forever — the two-boars-at-the-campfire report.

// tickInSpace is the patrol twin of steering_test.go's tick: one full
// mob+physics step, for idle tests that need real blockers.
func tickInSpace(t *testing.T, m *Mob, space *phy.Space) {
	t.Helper()
	require.True(t, m.Update(0))
	space.Update()
}

// longestStillRun ticks n times and returns the longest run of consecutive
// ticks with zero displacement.
func longestStillRun(t *testing.T, m *Mob, space *phy.Space, n int) int {
	t.Helper()
	longest, still := 0, 0
	for i := 0; i < n; i++ {
		before := m.Position()
		tickInSpace(t, m, space)
		if m.Position() == before {
			still++
			if still > longest {
				longest = still
			}
		} else {
			still = 0
		}
	}
	return longest
}

func TestMob_WalkHomeBlockedPausesInsteadOfPacingForever(t *testing.T) {
	space := phy.NewSpace()
	// Home unreachable by construction (a house dropped on the spawn point):
	// the walk can never arrive, so without a budget the mob paces forever.
	home := phy.Vec2f{X: 3, Y: 0}
	blockingRectStatic(space, home, 2.5, 1.5)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(home) // records the authored spawn
	m.SetPosition(phy.Vec2f{X: -1, Y: 0})
	space.AddShape(m.Body)

	assert.GreaterOrEqual(t, longestStillRun(t, m, space, 900), 60,
		"a blocked walk-home must stand down between attempts, not pace forever")
}

func TestMob_EvadeReturnBlockedPausesBetweenAttempts(t *testing.T) {
	space := phy.NewSpace()
	point := phy.Vec2f{X: 3, Y: 0}
	blockingRectStatic(space, point, 2.5, 1.5)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.Vec2f{X: -6, Y: 0})
	space.AddShape(m.Body)
	// Wander archetype plus a walled-off evade point (combat displacement can
	// strand the point anywhere): the return leg runs first and can never end.
	m.SetWander(phy.Vec2f{X: -6, Y: 0}, 2)
	m.returnPos = point
	m.returnPosSet = true

	assert.GreaterOrEqual(t, longestStillRun(t, m, space, 900), 60,
		"a blocked evade return must stand down between attempts, not pace forever")
}

// --- aggro sensor follows the body (chunk-5 decision) ---

func TestMob_AggroSensorFollowsBody(t *testing.T) {
	m := newTestMob()
	m.SetPosition(phy.Vec2f{X: 1, Y: 1})
	m.SetPosition(phy.Vec2f{X: 4, Y: 2})

	assert.Equal(t, m.Position(), m.aggroAura.Position(),
		"the acquisition sensor travels with the mob (patrollers aggro mid-route)")
}

// A walk home that keeps failing must eventually WARP home (pathfinding pass
// 2026-08-23, the wolf-pile fix): pace-rest-retry alone replays the identical
// jammed walk forever - measured on the live map, ~20% of 12-unit walk-home
// runs never arrived, piling mobs into prop pockets. Each failed budget now
// resets the steering latch (a fresh side pick, like the chase camp's lift),
// and after idleWalkWarpAfterFails failures the mob evade-warps to its target.
func TestMob_BlockedWalkHomeWarpsHomeAfterRepeatedFailures(t *testing.T) {
	space := phy.NewSpace()
	home := phy.VEC2F_ZERO

	// A sealed pen far from home: no honest walk can succeed.
	blockingRectStatic(space, phy.Vec2f{X: 6, Y: 1.5}, 3, 1)
	blockingRectStatic(space, phy.Vec2f{X: 6, Y: -1.5}, 3, 1)
	blockingRectStatic(space, phy.Vec2f{X: 4.5, Y: 0}, 1, 4)
	blockingRectStatic(space, phy.Vec2f{X: 7.5, Y: 0}, 1, 4)

	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(home)                  // records the spawn = walk-home target
	m.SetPosition(phy.Vec2f{X: 6, Y: 0}) // trapped in the pen
	space.AddShape(m.Body)

	for i := 0; i < 2500; i++ {
		tickInSpace(t, m, space)
		if m.Position().Sub(home).Abs() <= waypointArrivalRadius {
			return // warped (or escaped) home
		}
	}
	t.Fatalf("mob never made it home from the sealed pen; final pos %v", m.Position())
}
