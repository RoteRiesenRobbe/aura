package mob

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Chase stuck watchdog (pathfinding fix, 2026-07-20): steering commits to a
// tangent detour along walls (see steer), but authored geometry can still
// trap a chaser — a concave prop pocket blocks the tangent on both sides.
// The watchdog measures net chase progress over a short window; when it
// collapses the mob CAMPS: it holds position at the wall and keeps its aggro
// (PO decision 2026-07-20: walls are gameplay — a stuck mob glares, it does
// not reset; dropping aggro would loop home→re-aggro→stuck and hand players
// a wall-shaped off-switch). A camp lifts when the target repositions or
// after a retry interval.

// stuckWindowTicks [PLACEHOLDER] is the progress-measurement window, ~1 s at
// 30 TPS — long enough that one wall-jam tick never trips it, short enough
// that a stuck mob settles before it reads as broken.
const stuckWindowTicks = 30

// stuckProgressFraction [PLACEHOLDER]: net displacement below this fraction
// of the window's free-run distance reads as stuck. Detour slides move at
// full step speed (chord ≈ arc at prop scale), so wall-following and the
// unreachable-target orbit never trip it; a jam nets ~0.
const stuckProgressFraction float32 = 0.25

// campResumeTargetMove [PLACEHOLDER]: target displacement that lifts a camp
// — the target has repositioned, so the blocked approach line is stale.
const campResumeTargetMove float32 = 1.0

// campRetryTicks [PLACEHOLDER] ~5 s: a camped mob probes again even against
// a static target, so camps self-heal (moving props, knockback, despawns).
const campRetryTicks = 150

// campForceLeashTicks [PLACEHOLDER] ~30 s: cumulative camped time in one
// engagement after which the mob force-leashes even though the target is
// still inside the aggro sensor (PO ruling 2026-08-23, softening 2026-07-20's
// eternal camp: the sensor sees through walls since the LoS cut, so a
// wolf-vs-cornered-prey standoff otherwise never ends and mobs pile up).
// Real fights never accumulate this - progress, damage taken or aura reach
// all reset the clock - so "the stuck mob glares" stays true for any player
// actually fighting it.
const campForceLeashTicks = 900

// forceLeashIgnoreTicks [PLACEHOLDER] ~30 s: how long a force-leashed target
// stays unacquirable. Without it the sensor re-latches the same target on the
// next tick and the standoff restarts; retaliation (threat) still overrides.
const forceLeashIgnoreTicks = 900

// chaseTowards is moveTowards wrapped in the watchdog: it tracks net progress
// per window, freezes into a camp when progress collapses, and lifts the camp
// on target movement or after the retry interval.
func (m *Mob) chaseTowards(target phy.Vec2f) {
	if m.camped {
		m.campTicks++
		m.campEngagementTicks++
		if target.Sub(m.campTargetPos).Abs() > campResumeTargetMove {
			// The target repositioned: a genuinely new approach line, so the
			// standoff clock starts over - a moving fight never force-leashes.
			// A retry-interval lift keeps the clock: the standoff's shape is
			// camp → slide a little on retry → re-camp, and resetting here
			// (or on the retry's progress window) is what let it run forever.
			m.camped = false
			m.progressTicks = 0
			m.campEngagementTicks = 0
			return
		}
		if m.campTicks >= campRetryTicks {
			m.camped = false
			m.progressTicks = 0
		}
		return
	}

	if m.progressTicks == 0 {
		m.progressAnchorPos = m.Position()
	}
	m.moveTowards(target)
	m.progressTicks++
	if m.progressTicks < stuckWindowTicks {
		return
	}
	m.progressTicks = 0

	expected := m.stepLength() * stuckWindowTicks
	if expected <= 0 {
		return // immobile mob: no movement expected, nothing to watch
	}
	if m.Position().Sub(m.progressAnchorPos).Abs() < expected*stuckProgressFraction {
		m.camped = true
		m.campTicks = 0
		m.campTargetPos = target
		// Fresh side pick when the camp lifts: the committed detour is what
		// failed to make progress, so neither the latch nor the side memory
		// may survive into the retry.
		m.resetSteeringLatch()
	}
}

// resetChaseWatchdog clears window and camp whenever the mob is not actively
// chasing (no aggro, fleeing, or arrived) — every chase starts fresh.
func (m *Mob) resetChaseWatchdog() {
	m.progressTicks = 0
	m.camped = false
	m.campEngagementTicks = 0
}
