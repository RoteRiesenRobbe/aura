package mob

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
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

// chaseTowards is moveTowards wrapped in the watchdog: it tracks net progress
// per window, freezes into a camp when progress collapses, and lifts the camp
// on target movement or after the retry interval.
func (m *Mob) chaseTowards(target phy.Vec2f) {
	if m.camped {
		m.campTicks++
		if target.Sub(m.campTargetPos).Abs() > campResumeTargetMove ||
			m.campTicks >= campRetryTicks {
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
		m.steerSide = 0 // fresh side pick when the camp lifts
	}
}

// resetChaseWatchdog clears window and camp whenever the mob is not actively
// chasing (no aggro, fleeing, or arrived) — every chase starts fresh.
func (m *Mob) resetChaseWatchdog() {
	m.progressTicks = 0
	m.camped = false
}
