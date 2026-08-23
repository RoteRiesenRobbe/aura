package mob

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// Obstacle steering (mob-depth chunk 4): moveTowards and moveAwayFrom compose
// a repulsion from nearby blocking statics into their step direction, so
// chase, walk-home and flee deflect around props and the border wall instead
// of jamming against them. Steering only bends the per-tick step direction —
// stepLength stays the magnitude home, and the physics resolution running
// after movement remains the hard non-penetration guarantee (gotcha #6).

// steeringLookahead [PLACEHOLDER] is how far beyond the mob's body edge a
// blocking static starts to repel (server units). Deliberately small: it only
// needs to bend the path shortly before contact — a large value made mobs
// round props on aura-ring-sized curves and curved virtually every path in a
// prop-dense zone (in-game finding, 2026-07-11; was 1.5).
const steeringLookahead float32 = 0.6

// steeringRepulsionWeight [PLACEHOLDER] scales the summed repulsion against
// the unit-length attraction; > 1 so a close blocker overpowers the pull and
// forces the head-on deflection before the bodies touch.
const steeringRepulsionWeight float32 = 1.5

// mobSeparationWeight [PLACEHOLDER] scales the (unit-clamped) repulsion from
// nearby mob bodies against the unit-length step direction — playtest round 6
// item 3, PO decision 2026-07-26: mob-vs-mob SOFT separation, no hard blocking
// (backlog §34). Deliberately < 1 so separation bends the path and can never
// reverse it, and well below steeringRepulsionWeight: a mob is a much weaker
// reason to turn than a wall.
const mobSeparationWeight float32 = 0.45

// steerClearHoldTicks [PLACEHOLDER] ~⅓ s: how long repulsion must stay zero
// before a committed detour releases. Prop clusters leave zero-repulsion
// slivers between their fields — releasing on a single clear tick re-aimed the
// mob mid-cluster, straight into the next prop (in-game finding, 2026-08-07:
// boars pacing 1–2 u along the campfire camp forever).
const steerClearHoldTicks = 10

// steerSideMemoryTicks [PLACEHOLDER] ~1 s: after a detour releases, a fresh
// head-on within this window reuses the released side instead of the momentary
// lean. The lean is only trustworthy on a first encounter — right after a
// detour it points back the way the mob came, which is the other half of the
// same shuttle (see steerClearHoldTicks).
const steerSideMemoryTicks = 30

// Clearance probing (pathfinding pass 2026-08-23). The repulsion field is
// blind to passability: it reads distance, never "does my body fit", so a
// latched detour marched a mob along a whole prop chain past every body-sized
// opening - repulsion never stays zero for steerClearHoldTicks inside a chain,
// and the release re-test was the only way out. pathClearAlong answers the
// passability question directly, and the latch consults it two ways: a head-on
// with a provably clear line never latches, and a committed detour re-tests
// every gapRetestTicks and releases at the first opening the body fits
// through. The impassable-notch behavior is untouched - a notch fails the
// clearance test, a real gap passes it (the three historical oscillations:
// 2026-07-11 side flip-flop, 2026-07-20 notch jiggle, 2026-08-07 boar shuttle).

// gapClearanceMargin [PLACEHOLDER]: extra body radius the clearance samples
// demand, so a gap the body only just grazes through still reads as blocked -
// squeezing an exact fit against the physics resolution jitters.
const gapClearanceMargin float32 = 0.05

// gapProbeReach [PLACEHOLDER] how far ahead (server units) the clearance
// samples extend. Covers the throat distance at which realistic prop sizes
// first produce a head-on; beyond it the per-tick repulsion takes over anyway.
const gapProbeReach float32 = 3.0

// gapRetestTicks [PLACEHOLDER] ~⅓ s: cadence of the committed detour's
// clearance re-test. Matches steerClearHoldTicks - the latch was already
// tuned to hold at least this long through zero-repulsion slivers.
const gapRetestTicks = 10

// steer bends the desired unit direction around nearby blockers. With no
// space (direct construction, tests) or nothing in steering range it returns
// desired unchanged — movement is then exactly the pre-steering straight line.
//
// Statics and mobs are kept apart on purpose: only statics feed the head-on
// detour latch (see below). Mob separation is blended into the RESULT, so a
// mob can neither set the latch nor hold it — the latch clears on a sustained
// stretch of "no static repulsion" (steerClearHoldTicks), and a mob trailing
// this one would otherwise keep it alive forever and walk it sideways.
func (m *Mob) steer(desired phy.Vec2f) phy.Vec2f {
	if m.space == nil {
		return desired
	}
	rep := m.blockerRepulsion()
	sep := m.mobSeparation()
	if m.steerPrevSideTicks > 0 {
		m.steerPrevSideTicks--
	}
	left := desired.Rot90()
	if rep.X == 0 && rep.Y == 0 {
		if m.steerSide != 0 {
			// Clear-pocket hysteresis: hold the detour through short
			// zero-repulsion slivers inside a prop cluster; only a sustained
			// clear stretch means the cluster is genuinely behind us.
			m.steerClearTicks++
			if m.steerClearTicks < steerClearHoldTicks {
				return left.Mult(m.steerSide)
			}
			// Genuinely released: remember the side briefly, so an immediate
			// next head-on continues the same way around (see the constants).
			m.steerPrevSide = m.steerSide
			m.steerPrevSideTicks = steerSideMemoryTicks
			m.steerSide = 0
		}
		return blendSeparation(desired, sep)
	}
	m.steerClearTicks = 0
	// Detour-commit: while the head-on latch is set, hold the latched tangent
	// EVERY tick until fully clear of repulsion (the rep==0 reset above) — not
	// just on head-on ticks. Falling back to the blended direction the moment
	// the dot turns positive re-aims the mob at the gap it just deflected away
	// from, and against a prop wall it limit-cycles between deflect and blend,
	// jiggling in place at the notch forever (in-game finding, 2026-07-20).
	if m.steerSide != 0 {
		// Committed detour: separation stays out of it, so the tangent is
		// exactly the one the latch was tuned to hold. Every gapRetestTicks
		// the detour re-asks whether the body now fits straight along desired
		// - that is what lets a wall-follower take the first passable opening
		// in the row instead of rounding the far end.
		m.steerGapRetestIn--
		if m.steerGapRetestIn <= 0 {
			m.steerGapRetestIn = gapRetestTicks
			if m.pathClearAlong(desired) {
				m.steerPrevSide = m.steerSide
				m.steerPrevSideTicks = steerSideMemoryTicks
				m.steerSide = 0
				m.steerClearTicks = 0
				return blendSeparation(desired, sep)
			}
		}
		return left.Mult(m.steerSide)
	}

	combined := desired.Add(rep.Mult(steeringRepulsionWeight))
	if combined.Dot(desired) > 0 {
		return blendSeparation(combined.Normalize(), sep)
	}
	// Head-on by field arithmetic - but if the body provably fits straight
	// along desired (flanking props whose repulsion sums backward across a
	// passable gap), walk in and let the physics resolution stay the hard
	// non-penetration guarantee. No latch is set, so the next tick re-decides.
	if m.pathClearAlong(desired) {
		return blendSeparation(desired, sep)
	}
	// Head-on: repulsion cancels the pull or points backward — deflect across
	// the desired line. The side is LATCHED until the mob is fully clear of
	// repulsion: picking it fresh every tick from the momentary lean is only
	// stable against a single blocker — between two blockers (or in a wall
	// corner) each sideways step makes the other side's repulsion dominate
	// and the mob jitters in place, flipping sides forever (in-game finding,
	// 2026-07-11). A side released moments ago wins over the lean: right after
	// a detour the lean points back where the mob came from, and following it
	// shuttles the mob through a prop cluster forever (2026-08-07). Otherwise,
	// first head-on tick: take the lean of the combined vector (it points
	// toward the freer side); exactly on the line, always left.
	switch {
	case m.steerPrevSideTicks > 0:
		m.steerSide = m.steerPrevSide
	case combined.Dot(left) < 0:
		m.steerSide = -1
	default:
		m.steerSide = 1
	}
	m.steerGapRetestIn = gapRetestTicks
	return left.Mult(m.steerSide)
}

// resetSteeringLatch drops the committed detour AND the side memory - the
// full fresh-side-pick reset shared by the chase camp trip and a failed idle
// walk's retry (the latch that froze one attempt otherwise survives into the
// next and replays it move for move).
func (m *Mob) resetSteeringLatch() {
	m.steerSide = 0
	m.steerClearTicks = 0
	m.steerPrevSide = 0
	m.steerPrevSideTicks = 0
}

// pathClearAlong reports whether the mob's body fits along the desired line:
// body-sized samples (plus gapClearanceMargin) every body-radius step out to
// gapProbeReach, against the same statics mask the repulsion probe carries.
// Runs only on would-latch ticks and the committed detour's retest cadence,
// reusing the steering probe and hit buffer - nothing allocates.
func (m *Mob) pathClearAlong(dir phy.Vec2f) bool {
	r := m.Radius()
	if r <= 0 {
		return false
	}
	probe := m.steeringProbe(m.Body.Shape().Mask)
	probe.SetRadius(r + gapClearanceMargin)
	for d := r; d <= gapProbeReach; d += r {
		probe.SetPosition(m.Position().Add(dir.Mult(d)))
		m.steerHits = m.space.AppendCircleStatics(m.steerHits[:0], probe)
		if len(m.steerHits) > 0 {
			return false
		}
	}
	return true
}

// blockerRepulsion sums the repulsion from every blocking static within the
// steering lookahead: radial from circles (blocking props), away from the
// closest face point of solid boxes (rect props), axis-aligned inward from
// the border wall. The probe carries the mob's own collision mask, so a
// static the mob walks through (the boss vs rocks) never repels it.
func (m *Mob) blockerRepulsion() phy.Vec2f {
	probe := m.steeringProbe(m.Body.Shape().Mask)

	var rep phy.Vec2f
	m.steerHits = m.space.AppendCircleStatics(m.steerHits[:0], probe)
	for _, c := range m.steerHits {
		switch o := c.(type) {
		case *phy.Circle:
			rep = rep.Add(m.circleRepulsion(o))
		case *phy.SolidAABB:
			rep = rep.Add(m.boxRepulsion(o))
		case *phy.InvAABB:
			rep = rep.Add(m.wallRepulsion(o))
		}
	}
	return rep
}

// steeringProbe is the reused lookahead circle both steering queries run with,
// re-aimed at the mob's current position and carrying the given mask. Probe
// and hit buffers are per-mob and reused: this runs for every mob on every
// tick it moves — ~50 mobs × 30 Hz with nobody even online — and building them
// per call was the single largest allocation site in the idle game loop
// (idle-overload investigation 2026-07-22, pinned by steering_alloc_test.go).
func (m *Mob) steeringProbe(mask int) *phy.Circle {
	if m.steerProbe == nil {
		m.steerProbe = phy.NewCircle(m.Position(), m.Radius()+steeringLookahead)
	}
	probe := m.steerProbe
	probe.SetPosition(m.Position())
	probe.SetRadius(m.Radius() + steeringLookahead)
	probe.Shape().Mask = mask
	return probe
}

// mobSeparation sums the repulsion from every OTHER mob body within the
// steering lookahead, clamped to unit length — the soft half of "mobs stop
// piling into one unreadable clump" (round 6 item 3).
//
// The query runs on LayerViewportCollision and filters the hits to *Mob
// through UserData, rather than on a mob-body layer bit. There is no such bit:
// Viewport is the only layer every body shares, and an authored collisionLayer
// REPLACES the default wholesale (campfires and totems already do exactly
// that), so a new bit would be silently dropped by the defs most likely to
// need it. The type filter is also what makes the PO's two rejections — no
// player↔player, no player↔mob — structural instead of mask arithmetic a
// future content edit could undo.
func (m *Mob) mobSeparation() phy.Vec2f {
	probe := m.steeringProbe(int(model.LayerViewportCollision))

	var sep phy.Vec2f
	m.steerMobHits = m.space.AppendCircleDynamics(m.steerMobHits[:0], probe)
	for _, c := range m.steerMobHits {
		other, ok := c.Shape().UserData.(*Mob)
		if !ok || other == m {
			continue
		}
		sep = sep.Add(m.mobRepulsion(other))
	}
	// Clamp to unit length: with mobSeparationWeight < 1 that makes it
	// impossible for any number of mobs to out-pull the direction home. A
	// crowd spreads the pack, it never turns a mob around.
	if l := sep.Abs(); l > 1 {
		sep = sep.Div(l)
	}
	return sep
}

// mobRepulsion is circleRepulsion for another mob's body, with one difference
// that matters: the co-located tie-break. circleRepulsion's dead-center
// fallback pushes along the mob's own heading, which is fine against a static
// but WELDS two mobs sharing a point and a heading — they push identically
// forever, and same-point spawns are exactly what the wave and summon paths
// produce (the soft analogue of §34's equal-radius welding).
//
// The pair splits on entity ID into two opposite pushes — the same shape as
// any other pair, so blendSeparation's rotation handles it from there. Both
// mobs derive the split from the pair, so it is symmetric without any shared
// state.
func (m *Mob) mobRepulsion(o *Mob) phy.Vec2f {
	delta := m.Position().Sub(o.Position())
	d := delta.Abs()
	if d < 1e-4 {
		if m.Basic().ID() < o.Basic().ID() {
			return coLocatedNudge
		}
		return coLocatedNudge.Mult(-1)
	}
	w := steeringFalloff(d - m.Radius() - o.Radius())
	return delta.Div(d).Mult(w)
}

// coLocatedNudge is the arbitrary unit direction the lower-ID mob of a
// co-located pair pushes along (see mobRepulsion). Any fixed unit vector
// works — the pair separates within a few ticks and the axis is invisible.
var coLocatedNudge = phy.Vec2f{X: 1, Y: 0}

// blendSeparation folds the mob separation into an already-unit step
// direction. Nothing nearby leaves the direction bit-identical to the
// pre-separation one.
//
// ⚑ A push that lines up with the direction of travel achieves NOTHING on its
// own: steering sets direction, not speed, so a mob walking single file behind
// another is pushed straight backwards and normalizing the blend hands back
// the very same direction. That is the common pack shape, not a corner case —
// a chase converges every mob onto one line. So a perpendicular component
// fades in as the push lines up with the path: none at all when the pair is
// already side by side, full when it is nose to tail. The pair's pushes are
// opposites, so the same rotation sends one left and the other right.
func blendSeparation(dir phy.Vec2f, sep phy.Vec2f) phy.Vec2f {
	if sep.X == 0 && sep.Y == 0 {
		return dir
	}
	sideways := dir.Cross(sep) / sep.Abs() // sine of the angle; dir is unit
	if sideways < 0 {
		sideways = -sideways
	}
	sep = sep.Add(sep.Rot90().Mult(1 - sideways))

	blended := dir.Add(sep.Mult(mobSeparationWeight))
	if blended.AbsSq() < 1e-8 {
		// Unreachable while mobSeparationWeight < 1 and sep is unit-clamped
		// (the sum is at least 1 - weight long) — but Normalize divides by the
		// length with no guard, and a NaN position is unrecoverable.
		return dir
	}
	return blended.Normalize()
}

// circleRepulsion pushes radially away from a blocking circle, weighted by
// the falloff over the body-edge gap.
func (m *Mob) circleRepulsion(o *phy.Circle) phy.Vec2f {
	delta := m.Position().Sub(o.Position())
	d := delta.Abs()
	if d < 1e-4 {
		// Dead-center inside the blocker: no radial direction exists — push
		// along the current heading (a unit vector), like the flee fallback.
		return m.heading
	}
	w := steeringFalloff(d - m.Radius() - o.Radius)
	return delta.Div(d).Mult(w)
}

// boxRepulsion pushes away from the closest point on a solid box (rect
// props), weighted by the falloff over the body-edge gap — circleRepulsion
// with the box's contact point as the effective center.
func (m *Mob) boxRepulsion(o *phy.SolidAABB) phy.Vec2f {
	pos := m.Position()
	delta := pos.Sub(o.ClosestPoint(pos))
	d := delta.Abs()
	if d < 1e-4 {
		// Center inside the box: no outward direction exists — push along the
		// current heading, like circleRepulsion's dead-center fallback.
		return m.heading
	}
	w := steeringFalloff(d - m.Radius())
	return delta.Div(d).Mult(w)
}

// wallRepulsion pushes inward from every border edge within lookahead — the
// steering twin of resolveInvAABB's per-axis clamp; near a corner both axes
// contribute, so corners fall out of the same four lines.
func (m *Mob) wallRepulsion(a *phy.InvAABB) phy.Vec2f {
	pos := m.Position()
	c := a.Position()
	r := m.Radius()

	var rep phy.Vec2f
	rep.X += steeringFalloff((pos.X - r) - (c.X - a.HalfWidth))  // left edge pushes +x
	rep.X -= steeringFalloff((c.X + a.HalfWidth) - (pos.X + r))  // right edge pushes -x
	rep.Y += steeringFalloff((pos.Y - r) - (c.Y - a.HalfHeight)) // bottom edge pushes +y
	rep.Y -= steeringFalloff((c.Y + a.HalfHeight) - (pos.Y + r)) // top edge pushes -y
	return rep
}

// steeringFalloff maps a body-edge gap to a repulsion weight: 1 at contact or
// overlap, linearly down to 0 at steeringLookahead.
func steeringFalloff(gap float32) float32 {
	if gap <= 0 {
		return 1
	}
	if gap >= steeringLookahead {
		return 0
	}
	return 1 - gap/steeringLookahead
}
