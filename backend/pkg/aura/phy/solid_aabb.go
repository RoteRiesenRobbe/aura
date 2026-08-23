package phy

var _ = Collider(&SolidAABB{})

// SolidAABB is a solid rectangle that pushes dynamic circles *out* of its
// bounds — the mirror of InvAABB, which keeps them inside. It backs
// rectangular static props (houses, gates). Like InvAABB it is a static
// obstacle — always the queried ('other') shape in the broadphase, never the
// querying one, so only intersectWithCircle and resolveCollisionWithCircle
// carry real work; the remaining double-dispatch entry points are unreachable
// for a static body.
//
// ⭐ It is axis-aligned in its OWN frame and may be rotated in the world
// (plan-prop-scale.md C2b). Rotation used to be impossible here, which made a
// rotated House render turned and block upright — the D3 option-(B) lie the PO
// hit in-game the day rotation shipped.
//
// Three things keep the oriented version cheap, and all three are properties of
// THIS shape rather than of boxes in general:
//
//  1. Props are STATIC, so cos/sin are resolved once at construction and the
//     hot path is two multiply-adds, never a trig call.
//  2. Only circles ever hit it, so there is no rect-vs-rect separating-axis
//     test to write — the expensive part of general OBB collision is simply
//     absent here.
//  3. All the geometry funnels through clamp(), so intersection, push-out and
//     the exported ClosestPoint (which is what mob steering uses) are all
//     fixed by orienting one function.
//
// ⚑ At angle 0 cos=1 and sin=0, so every transform below is the exact
// identity — an unrotated prop behaves bit-for-bit as it did before rotation
// existed, which is what makes this safe to land under 807 placements.
type SolidAABB struct {
	CollisionResolver
	dynamicColliderShape

	// half-extents from the center position, along the box's OWN axes
	HalfWidth  float32
	HalfHeight float32

	// orientation, pre-resolved: cos/sin of the world angle in radians.
	// (1, 0) is unrotated.
	cos, sin float32
}

// toLocal maps a WORLD point into the box's frame, where the box is the plain
// axis-aligned rect [-HalfWidth,HalfWidth] x [-HalfHeight,HalfHeight] centered
// on the origin.
func (a *SolidAABB) toLocal(p Vec2f) Vec2f {
	d := p.Sub(a.Position())
	return Vec2f{d.X*a.cos + d.Y*a.sin, -d.X*a.sin + d.Y*a.cos}
}

// toWorldDir maps a LOCAL direction or offset back to world. Deliberately not
// a point transform: every caller below rotates a delta and adds the centre
// itself, and a point version would invite forgetting which one applies.
func (a *SolidAABB) toWorldDir(v Vec2f) Vec2f {
	return Vec2f{v.X*a.cos - v.Y*a.sin, v.X*a.sin + v.Y*a.cos}
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
	// to clients. Plain AABB overlap against this box's world bound. Boxes
	// never physically resolve (Box.resolveCollisions is a no-op), so this
	// only feeds the collision set the NetSystem reads.
	//
	// ⚑ For a rotated box the bound is the enclosing world AABB, so this is
	// CONSERVATIVE — a turned house may start streaming a hair early. That is
	// the right way to be wrong for a visibility sensor, and it is why the
	// widened bound in updateBB needs no narrowphase to match it.
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
//
// ⭐ THE one piece of geometry this shape has. Intersection, push-out and the
// exported ClosestPoint all route through it, so orienting it here is what
// makes a rotated prop block at its drawn angle — mob steering included, since
// boxRepulsion is written in terms of ClosestPoint.
func (a *SolidAABB) clamp(p Vec2f) Vec2f {
	q := a.toLocal(p)
	q.X = clampAxis(q.X, a.HalfWidth)
	q.Y = clampAxis(q.Y, a.HalfHeight)
	return a.Position().Add(a.toWorldDir(q))
}

func clampAxis(v, half float32) float32 {
	if v < -half {
		return -half
	}
	if v > half {
		return half
	}
	return v
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
		// center outside the box — clamp already accounted for the rotation,
		// so this half needs nothing further.
		dist := d.Abs()
		if dist >= c.Radius {
			return VEC2F_ZERO
		}
		return d.Div(dist).Mult(c.Radius - dist)
	}

	// Center inside the box: cheapest ejection along one of the box's OWN
	// axes, computed in local coordinates and rotated back. Picking a WORLD
	// axis here would shove the circle sideways along a face it is nowhere
	// near.
	l := a.toLocal(cp)

	sx := Signum32f(l.X)
	if sx == 0 {
		sx = 1
	}
	sy := Signum32f(l.Y)
	if sy == 0 {
		sy = 1
	}

	// distance to eject along each local axis (out the nearer face + radius)
	ex := a.HalfWidth - abs32f(l.X) + c.Radius
	ey := a.HalfHeight - abs32f(l.Y) + c.Radius

	if ex <= ey {
		return a.toWorldDir(Vec2f{sx * ex, 0})
	}
	return a.toWorldDir(Vec2f{0, sy * ey})
}

// NewSolidAABB builds an UNROTATED solid rect. Kept as its own entry point
// because most callers have no angle and (1, 0) must be exact rather than
// whatever cos(0)/sin(0) round to.
func NewSolidAABB(pos Vec2f, width, height float32) *SolidAABB {
	return newSolidRect(pos, width, height, 1, 0)
}

// NewSolidRotatedAABB builds a solid rect turned by angle radians in world
// space. Static shapes only — the trig is resolved here, once, never per tick.
func NewSolidRotatedAABB(pos Vec2f, width, height, angle float32) *SolidAABB {
	if angle == 0 {
		// Exactness is worth the branch: every prop in the world goes through
		// here at boot and an unrotated one must not pick up cos/sin rounding.
		return NewSolidAABB(pos, width, height)
	}
	return newSolidRect(pos, width, height, cos32f(angle), sin32f(angle))
}

func newSolidRect(pos Vec2f, width, height, cos, sin float32) *SolidAABB {
	a := &SolidAABB{
		HalfWidth:            width / 2,
		HalfHeight:           height / 2,
		cos:                  cos,
		sin:                  sin,
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
//
// ⚑ For a rotated box this is the ENCLOSING world AABB, and it MUST grow: the
// grid otherwise never offers the pair to the narrowphase, and the collider
// silently stops existing at exactly the corners the rotation just swung out.
// At angle 0 the |sin| terms vanish and it is the plain box again.
func (a *SolidAABB) updateBB() {
	pos := a.Position()
	ex := abs32f(a.cos)*a.HalfWidth + abs32f(a.sin)*a.HalfHeight
	ey := abs32f(a.sin)*a.HalfWidth + abs32f(a.cos)*a.HalfHeight
	a.shape.bb = AABB{
		Left:   pos.X - ex,
		Bottom: pos.Y - ey,
		Upper:  pos.Y + ey,
		Right:  pos.X + ex,
	}
}
