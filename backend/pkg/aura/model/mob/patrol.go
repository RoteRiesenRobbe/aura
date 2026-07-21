package mob

// Idle-movement archetypes (mob-depth chunk 5): local wander (5a) and
// ping-pong route patrol (5b), plus the evade return shared by every
// archetype — a mob leaving idle for combat records its position and, once
// combat resets, walks back there before resuming (WoW-style, user decision
// at chunk-5 plan-first). All movement goes through moveTowards, so obstacle
// steering (chunk 4) and slows apply for free.

import (
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// [PLACEHOLDER] idle-movement tuning defaults — the "relaxed living" pace
// (chunk-5 in-game round 1: full-speed patrol and 0.5×/1–4 s wander read as
// frantic). Per-type values live in mob-def factors (idleSpeedFactor,
// idleDwellMin/MaxTicks), per-spawn overrides ride the zone spawn; these are
// the fallbacks when neither says anything.
const (
	// defaultIdleSpeedFactor scales chase speed down for ALL idle movement —
	// wander legs and patrol marching — so full speed stays a readable combat
	// signal. Evade return and walk-home deliberately stay full speed.
	defaultIdleSpeedFactor = 0.4
	// Dwell between wander legs, rolled uniformly per leg (~3–10 s).
	defaultIdleDwellMinTicks = 90
	defaultIdleDwellMaxTicks = 300
	// waypointArrivalRadius is the "reached it" band around waypoints, wander
	// targets and the evade point — an exact-point arrival could orbit
	// forever when steering deflects the last step near a blocker.
	waypointArrivalRadius = 0.3
)

// SetWander configures local wander around anchor (chunk 5a). The anchor is
// the AUTHORED spawn point, never the rolled respawn position — anchoring on
// the roll would compound respawn-band + wander-range into drift off the
// authored spot (gotcha #7).
func (m *Mob) SetWander(anchor phy.Vec2f, radius float32) {
	m.wanderAnchor = anchor
	m.wanderRadius = radius
}

// SetWaypoints configures route patrol (chunk 5b): the mob marches the points
// in order; loop wraps last→first (circling a landmark), otherwise it
// ping-pongs at the ends. Route validity (reachability) is the level
// designer's responsibility — steering is only a safety net.
func (m *Mob) SetWaypoints(points []phy.Vec2f, loop bool) {
	m.waypoints = points
	m.waypointIdx = 0
	m.waypointDir = 1
	m.waypointLoop = loop
}

// SetIdleSpeedFactor overrides the idle-movement pace for this mob instance
// (spawn-level knob; NewMob seeds the type default).
func (m *Mob) SetIdleSpeedFactor(f float32) {
	if f > 0 {
		m.idleSpeedFactor = f
	}
}

// updateIdleMovement is the no-aggro movement dispatch: finish the evade
// return first, then resume the archetype — route patrol, wander, or the
// classic stand-at-spawn (whose walk home this keeps verbatim).
func (m *Mob) updateIdleMovement() {
	if !m.spawnInitialized {
		return
	}
	// Followers (chunk 6) trail their owner instead of any world archetype;
	// they also never set returnPos (noteCombatEntry skips them).
	if m.isFollower() {
		m.updateFollow()
		return
	}
	if m.returnPosSet {
		if !m.arrivedAt(m.returnPos) {
			m.moveTowards(m.returnPos)
			return
		}
		m.returnPosSet = false
	}
	switch {
	case len(m.waypoints) > 0:
		m.updateRoutePatrol()
	case m.wanderRadius > 0:
		m.updateWander()
	default:
		m.moveTowards(m.spawnPosition)
	}
}

// noteCombatEntry records the evade point on the idle→combat transition. A
// re-aggro during the return walk keeps the original point, so the mob always
// resumes from where it left its route/territory.
func (m *Mob) noteCombatEntry() {
	// Followers record no evade point — follow IS their return behavior
	// (chunk 6; the chunk-5 handoff trap).
	if m.isFollower() || m.returnPosSet || !m.spawnInitialized {
		return
	}
	m.returnPos = m.Position()
	m.returnPosSet = true
}

func (m *Mob) arrivedAt(p phy.Vec2f) bool {
	return m.Position().Sub(p).Abs() <= waypointArrivalRadius
}

// updateWander walks leg by leg: amble to the current target at the idle
// speed, dwell, roll the next point.
func (m *Mob) updateWander() {
	if m.wanderTargetSet {
		m.wanderLegTicks--
		if m.wanderLegTicks <= 0 || m.arrivedAt(m.wanderTarget) {
			m.wanderTargetSet = false
			m.dwellTicks = m.rollDwell()
			return
		}
		m.moveTowardsScaled(m.wanderTarget, m.idleSpeedFactor)
		return
	}
	if m.dwellTicks > 0 {
		m.dwellTicks--
		return
	}
	m.pickWanderTarget()
}

// rollDwell rolls the stand time between wander legs from the mob's band.
func (m *Mob) rollDwell() int {
	return m.dwellMinTicks + m.rand.Intn(m.dwellMaxTicks-m.dwellMinTicks+1)
}

// pickWanderTarget rolls a uniform point in the anchor disc (entity-ID-seeded
// RNG, deterministic per mob) and budgets the leg at 2× the straight-line
// ticks + slack — a target rolled against a blocker (steering orbit) can't
// lock the mob; the budget expires into a normal dwell + re-roll.
func (m *Mob) pickWanderTarget() {
	r := m.wanderRadius * float32(math.Sqrt(m.rand.Float64()))
	theta := m.rand.Float64() * 2 * math.Pi
	m.wanderTarget = m.wanderAnchor.Add(phy.Vec2f{
		X: r * float32(math.Cos(theta)),
		Y: r * float32(math.Sin(theta)),
	})
	m.wanderTargetSet = true

	step := m.stepLength() * m.idleSpeedFactor
	if step <= 0 {
		// Unreachable for loader-validated content (stationary mobs cannot
		// wander); guards direct construction from a division by zero.
		m.wanderTargetSet = false
		return
	}
	dist := m.Position().Sub(m.wanderTarget).Abs()
	m.wanderLegTicks = int(2*dist/step) + 30
}

// updateRoutePatrol marches toward the current waypoint at the idle speed and
// advances the index within the arrival band.
func (m *Mob) updateRoutePatrol() {
	if m.arrivedAt(m.waypoints[m.waypointIdx]) {
		m.advanceWaypoint()
	}
	m.moveTowardsScaled(m.waypoints[m.waypointIdx], m.idleSpeedFactor)
}

// advanceWaypoint steps the route index. Loop mode wraps last→first (the
// circling-a-landmark traversal); ping-pong reverses at both ends.
func (m *Mob) advanceWaypoint() {
	if len(m.waypoints) < 2 {
		return
	}
	if m.waypointLoop {
		m.waypointIdx = (m.waypointIdx + 1) % len(m.waypoints)
		return
	}
	next := m.waypointIdx + m.waypointDir
	if next < 0 || next >= len(m.waypoints) {
		m.waypointDir = -m.waypointDir
		next = m.waypointIdx + m.waypointDir
	}
	m.waypointIdx = next
}
