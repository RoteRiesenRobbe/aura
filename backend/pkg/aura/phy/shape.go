package phy

import "fmt"

type ColliderSet map[Collider]struct{}

type Shape struct {
	Mask     int
	Layer    int
	Group    int
	IsSensor bool
	UserData interface{}

	pos Vec2f
	bb  AABB
}

func (c *Shape) String() string {
	return fmt.Sprintf("[ c: %.2f / %.2f, bb: (%shape)]", c.pos.X, c.pos.Y, c.bb.String())
}

type DynamicShape struct {
	Shape

	velocity Vec2f
}

func (s *DynamicShape) Velocity() Vec2f {
	return s.velocity
}

func (s *DynamicShape) SetVelocity(v Vec2f) {
	s.velocity = v
}

type Collider interface {
	Position() Vec2f

	BoundingBox() AABB

	Collisions() ColliderSet

	Shape() *Shape

	updateBB()
	resetCollisions()
	resolveCollisions()
	addCollision(s Collider)

	// double dispatchers
	CollisionResolver
	Intersector
}

type DynamicCollider interface {
	Collider

	SetPosition(p Vec2f)
}

func newColliderShape(pos Vec2f) colliderShape {
	return colliderShape{
		shape:      Shape{pos: pos},
		collisions: make(ColliderSet),
	}
}

func newDynamicColliderShape(pos Vec2f) dynamicColliderShape {
	return dynamicColliderShape{
		colliderShape: colliderShape{
			shape: Shape{
				pos:   pos,
				Layer: 0,
			},
			collisions: make(ColliderSet),
		},
	}
}

type colliderShape struct {
	shape      Shape
	collisions ColliderSet
}

type dynamicColliderShape struct {
	colliderShape
}

func (c *colliderShape) BoundingBox() AABB {
	return c.shape.bb
}

func (c *colliderShape) Position() Vec2f {
	return c.shape.pos
}

func (c *colliderShape) SetPosition(v Vec2f) {
	c.shape.pos = v
}

func (c *colliderShape) Shape() *Shape {
	return &c.shape
}

func (c *colliderShape) Collisions() ColliderSet {
	return c.collisions
}

func (c *colliderShape) addCollision(s Collider) {
	c.collisions[s] = struct{}{}
}

func (c *colliderShape) resetCollisions() {
	if c.collisions == nil {
		c.collisions = make(ColliderSet)
		return
	}
	// clear keeps the buckets — re-making this map for every collider on
	// every tick was ~15% of the idle server's garbage (idle-overload
	// investigation 2026-07-22). Safe because no caller holds on to the map
	// across ticks: every reader (sys/skills, sys/npc, mob aggro, targeting)
	// consumes it within the same tick, and targeting copies what it keeps.
	clear(c.collisions)
}

func (c *colliderShape) resolveFancyCollisions() {
}

func (c *colliderShape) resolveFancyCollision(other Collider) Vec2f {
	// TODO
	return VEC2F_ZERO
}
