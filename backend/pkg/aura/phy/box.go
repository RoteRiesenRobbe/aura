package phy

// Box represents a simple axis-aligned box
type Box struct {
	CollisionResolver
	dynamicColliderShape

	// the vector pointing from the center (pos) to the upper right corner
	extent Vec2f
}

func (b *Box) IntersectWith(i Intersector) bool {
	return i.intersectWithBox(b)
}

func (b *Box) intersectWithBox(box *Box) bool {
	return IntersectAabb(&b.shape.bb, &box.shape.bb)
}

func (b *Box) intersectWithCircle(circle *Circle) bool {
	return true
}

func (b *Box) intersectWithInvCircle(circle *InvCircle) bool {
	// return true
	panic("Box collisions not implemented")
}

var _ = DynamicCollider(&Box{})

func (b *Box) resolveCollisions() {
}

func (b *Box) resolveCollsionWith(c CollisionResolver) Vec2f {
	// double dispatching
	panic("Box collisions not implemented")
}

func (b *Box) resolveCollisionWithCircle(circle *Circle) Vec2f {
	panic("implement me")
}

func (b *Box) resolveCollisionWithBox(box *Box) Vec2f {
	panic("implement me")
}

func NewBox(pos, extent Vec2f) *Box {
	b := &Box{
		extent:               extent,
		dynamicColliderShape: newDynamicColliderShape(pos),
	}

	b.updateBB()
	return b
}

// SetExtent resizes the box around its current position (plan-flight-paths.md
// §4.3: the flyer's viewport grows for the duration of a flight). The bounding
// box follows immediately, exactly like SetPosition-then-rebuild would — the
// space's per-tick rebuild re-reads it either way.
func (b *Box) SetExtent(extent Vec2f) {
	b.extent = extent
	b.updateBB()
}

// Extent is the vector from the center to the upper-right corner.
func (b *Box) Extent() Vec2f {
	return b.extent
}

// Stabs the shape and returns true if the point lies on the shape
func (b *Box) StabQuery(p Vec2f) bool {
	return b.shape.bb.StabQuery(p)
}

// Stabs the shape and returns true if the point lies on the shape
func (b *Box) ImpaleQuery(s Segment) float32 {
	panic("Not implemented :(")
}

// updates the bounding box according to the size and position of this box
func (b *Box) updateBB() {
	lower := b.shape.pos.Sub(b.extent)
	upper := b.shape.pos.Add(b.extent)

	b.shape.bb = AABB{lower.X, lower.Y, upper.Y, upper.X}
}
