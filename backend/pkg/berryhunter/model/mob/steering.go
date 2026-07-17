package mob

import (
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
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

// steer bends the desired unit direction around nearby blockers. With no
// space (direct construction, tests) or nothing in steering range it returns
// desired unchanged — movement is then exactly the pre-steering straight line.
func (m *Mob) steer(desired phy.Vec2f) phy.Vec2f {
	if m.space == nil {
		return desired
	}
	rep := m.blockerRepulsion()
	if rep.X == 0 && rep.Y == 0 {
		m.steerSide = 0 // clear of everything: the next obstruction re-picks
		return desired
	}

	combined := desired.Add(rep.Mult(steeringRepulsionWeight))
	if combined.Dot(desired) > 0 {
		return combined.Normalize()
	}
	// Head-on: repulsion cancels the pull or points backward — deflect across
	// the desired line. The side is LATCHED until the mob is fully clear of
	// repulsion: picking it fresh every tick from the momentary lean is only
	// stable against a single blocker — between two blockers (or in a wall
	// corner) each sideways step makes the other side's repulsion dominate
	// and the mob jitters in place, flipping sides forever (in-game finding,
	// 2026-07-11). First head-on tick: take the lean of the combined vector
	// (it points toward the freer side); exactly on the line, always left.
	left := desired.Rot90()
	if m.steerSide == 0 {
		if combined.Dot(left) < 0 {
			m.steerSide = -1
		} else {
			m.steerSide = 1
		}
	}
	return left.Mult(m.steerSide)
}

// blockerRepulsion sums the repulsion from every blocking static within the
// steering lookahead: radial from circles (blocking props), away from the
// closest face point of solid boxes (rect props), axis-aligned inward from
// the border wall. The probe carries the mob's own collision mask, so a
// static the mob walks through (the boss vs rocks) never repels it.
func (m *Mob) blockerRepulsion() phy.Vec2f {
	probe := phy.NewCircle(m.Position(), m.Radius()+steeringLookahead)
	probe.Shape().Mask = m.Body.Shape().Mask

	var rep phy.Vec2f
	for _, c := range m.space.QueryCircleStatics(probe) {
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
