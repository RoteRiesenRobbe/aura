package phy

var _ = Collider(&SolidAABB{})

// SolidAABB is a solid axis-aligned rectangle that pushes dynamic circles
// *out* of its bounds — the mirror of InvAABB, which keeps them inside. It
// backs rectangular static props (houses, gates). Like InvAABB it is a static
// obstacle — always the queried ('other') shape in the broadphase, never the
// querying one, so only intersectWithCircle and resolveCollisionWithCircle
// carry real work; the remaining double-dispatch entry points are unreachable
// for a static body.
type SolidAABB struct {
	CollisionResolver
	dynamicColliderShape

	// half-extents from the center position
	HalfWidth  float32
	HalfHeight float32
}

func (a *SolidAABB) IntersectWith(i Intersector) bool {
	// Reached only if a SolidAABB were a *dynamic* (querying) shape. Props are
	// static, and the Intersector interface has no intersectWithSolidAABB
	// (a SolidAABB only ever meets circles, handled below via
	// intersectWithCircle).
	panic("SolidAABB is a static obstacle and is never the querying shape")
}

func (a *SolidAABB) intersectWithCircle(c *Circle) bool {
	// Circle overlaps the box iff the closest box point to the circle center
	// is strictly within the radius (a center inside the box clamps to
	// itself, distance 0).
	d := c.Position().Sub(a.clamp(c.Position()))
	return d.AbsSq() < c.Radius*c.Radius
}

func (a *SolidAABB) intersectWithBox(b *Box) bool {
	// Reached by dynamic Box queriers — the player/spectator VIEWPORT is a
	// Box, and a blocking rect prop carries the viewport layer so it streams
	// to clients. Both shapes are axis-aligned: plain AABB overlap. Boxes
	// never physically resolve (Box.resolveCollisions is a no-op), so this
	// only feeds the collision set the NetSystem reads.
	return IntersectAabb(&a.shape.bb, &b.Shape().bb)
}

func (a *SolidAABB) intersectWithInvCircle(i *InvCircle) bool {
	panic("not implemented")
}

func (a *SolidAABB) resolveCollisions() {
	// Static obstacle: never the resolving shape. Dynamic shapes resolve
	// against it through resolveCollisionWithCircle.
}

func (a *SolidAABB) resolveCollisionWithCircle(other *Circle) Vec2f {
	return resolveSolidAABB(other, a)
}

// ClosestPoint returns the closest point on (or in) the box to p — a point
// inside the box clamps to itself. Exported for mob steering, which needs the
// contact geometry without re-deriving the box faces.
func (a *SolidAABB) ClosestPoint(p Vec2f) Vec2f {
	return a.clamp(p)
}

// clamp returns the closest point on (or in) the box to p.
func (a *SolidAABB) clamp(p Vec2f) Vec2f {
	pos := a.Position()
	q := p
	if q.X < pos.X-a.HalfWidth {
		q.X = pos.X - a.HalfWidth
	} else if q.X > pos.X+a.HalfWidth {
		q.X = pos.X + a.HalfWidth
	}
	if q.Y < pos.Y-a.HalfHeight {
		q.Y = pos.Y - a.HalfHeight
	} else if q.Y > pos.Y+a.HalfHeight {
		q.Y = pos.Y + a.HalfHeight
	}
	return q
}

// resolveSolidAABB returns the force that pushes circle c clear of the box a.
// Center outside the box: push away from the closest box point until the gap
// equals the radius. Center inside the box: eject along the axis of least
// penetration (deterministic tie-breaks: the Y axis wins only when strictly
// cheaper, positive direction wins on a centered axis).
func resolveSolidAABB(c *Circle, a *SolidAABB) Vec2f {
	cp := c.Position()
	q := a.clamp(cp)

	d := cp.Sub(q)
	if d != VEC2F_ZERO {
		// center outside the box
		dist := d.Abs()
		if dist >= c.Radius {
			return VEC2F_ZERO
		}
		return d.Div(dist).Mult(c.Radius - dist)
	}

	// center inside the box: cheapest axis-aligned ejection
	pos := a.Position()
	dx := cp.X - pos.X
	dy := cp.Y - pos.Y

	sx := Signum32f(dx)
	if sx == 0 {
		sx = 1
	}
	sy := Signum32f(dy)
	if sy == 0 {
		sy = 1
	}

	// distance to eject along each axis (out the nearer face + radius)
	ex := a.HalfWidth - abs32f(dx) + c.Radius
	ey := a.HalfHeight - abs32f(dy) + c.Radius

	if ex <= ey {
		return Vec2f{sx * ex, 0}
	}
	return Vec2f{0, sy * ey}
}

func NewSolidAABB(pos Vec2f, width, height float32) *SolidAABB {
	a := &SolidAABB{
		HalfWidth:            width / 2,
		HalfHeight:           height / 2,
		dynamicColliderShape: newDynamicColliderShape(pos),
	}

	// collide with nothing
	a.Shape().Layer = 0

	a.updateBB()
	return a
}

// updateBB is the box's own extent — unlike InvAABB there is nothing inverted
// here, so the plain bounds work with the broadphase grid (the querying
// circle's bb already includes its radius).
func (a *SolidAABB) updateBB() {
	pos := a.Position()
	a.shape.bb = AABB{
		Left:   pos.X - a.HalfWidth,
		Bottom: pos.Y - a.HalfHeight,
		Upper:  pos.Y + a.HalfHeight,
		Right:  pos.X + a.HalfWidth,
	}
}
