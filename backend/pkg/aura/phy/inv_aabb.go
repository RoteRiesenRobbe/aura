package phy

import "log"

var _ = Collider(&InvAABB{})

// InvAABB is an inverted axis-aligned bounding box: a rectangular world border
// that keeps dynamic circles *inside* its bounds (the mirror of InvCircle, which
// keeps them inside a circle). It is a static wall — it is always the queried
// ('other') shape in the broadphase, never the querying one, so only
// intersectWithCircle and resolveCollisionWithCircle carry real work; the
// remaining double-dispatch entry points are unreachable for a static body.
type InvAABB struct {
	CollisionResolver
	dynamicColliderShape

	// half-extents from the center position
	HalfWidth  float32
	HalfHeight float32
}

func (a *InvAABB) IntersectWith(i Intersector) bool {
	// Reached only if an InvAABB were a *dynamic* (querying) shape. The border
	// wall is static, and the Intersector interface has no intersectWithInvAABB
	// (InvAABB only ever meets circles, handled below via intersectWithCircle).
	panic("InvAABB is a static wall and is never the querying shape")
}

func (a *InvAABB) intersectWithCircle(c *Circle) bool {
	// The circle must keep its whole body inside the box, so its center is
	// confined to the box shrunk by the circle radius. It pokes out (needs
	// resolution) when the center leaves that shrunk box on any axis.
	pos := a.Position()
	cp := c.Position()
	left := pos.X - a.HalfWidth + c.Radius
	right := pos.X + a.HalfWidth - c.Radius
	bottom := pos.Y - a.HalfHeight + c.Radius
	top := pos.Y + a.HalfHeight - c.Radius
	return cp.X < left || cp.X > right || cp.Y < bottom || cp.Y > top
}

func (a *InvAABB) intersectWithBox(b *Box) bool {
	log.Printf("Box: %+v", b.Shape().UserData)
	panic("not implemented")
}

func (a *InvAABB) intersectWithInvCircle(i *InvCircle) bool {
	panic("not implemented")
}

func (a *InvAABB) resolveCollisions() {
	// Static border wall: never the resolving shape. Dynamic shapes resolve
	// against it through resolveCollisionWithCircle.
}

func (a *InvAABB) resolveCollisionWithCircle(other *Circle) Vec2f {
	return resolveInvAABB(other, a)
}

// resolveInvAABB returns the force that brings circle c back inside the box a.
// It clamps the circle's center per-axis into the box shrunk by the radius; the
// result has zero, one, or two non-zero components, so edges and corners both
// fall out of the same clamp.
func resolveInvAABB(c *Circle, a *InvAABB) Vec2f {
	pos := a.Position()
	cp := c.Position()

	var force Vec2f

	left := pos.X - a.HalfWidth + c.Radius
	right := pos.X + a.HalfWidth - c.Radius
	if left > right {
		// box narrower than the circle: push toward center (mirrors InvCircle)
		force.X = pos.X - cp.X
	} else if cp.X < left {
		force.X = left - cp.X
	} else if cp.X > right {
		force.X = right - cp.X
	}

	bottom := pos.Y - a.HalfHeight + c.Radius
	top := pos.Y + a.HalfHeight - c.Radius
	if bottom > top {
		force.Y = pos.Y - cp.Y
	} else if cp.Y < bottom {
		force.Y = bottom - cp.Y
	} else if cp.Y > top {
		force.Y = top - cp.Y
	}

	return force
}

func NewInvAABB(pos Vec2f, width, height float32) *InvAABB {
	a := &InvAABB{
		HalfWidth:            width / 2,
		HalfHeight:           height / 2,
		dynamicColliderShape: newDynamicColliderShape(pos),
	}

	// collide with nothing
	a.Shape().Layer = 0

	a.updateBB()
	return a
}

// updateBB gives the wall a bounding box that overrun the play area on every
// side, so a dynamic shape that has drifted just past a boundary still shares a
// broadphase grid cell with the wall and gets corrected. Like InvCircle's
// updateBB this is a deliberate hack — an inverted shape is not really bounded.
func (a *InvAABB) updateBB() {
	pos := a.Position()
	a.shape.bb = AABB{
		Left:   pos.X - a.HalfWidth*2,
		Bottom: pos.Y - a.HalfHeight*2,
		Upper:  pos.Y + a.HalfHeight*2,
		Right:  pos.X + a.HalfWidth*2,
	}
}
