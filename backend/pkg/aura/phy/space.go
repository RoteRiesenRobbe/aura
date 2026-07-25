package phy

import (
	"bytes"
	"fmt"
	"math"
)

type (
	dynamicShapes []DynamicCollider
	shapeSet      map[DynamicCollider]struct{}
)

type (
	colliderGrid        map[Vec2i][]Collider
	dynamicColliderGrid map[Vec2i][]DynamicCollider
)

const gridWidth = 10

// floor32f is a math.Floor(f) for float32 to int.
//
// This must floor, not truncate: the world is centred on the origin, so
// negative coordinates are ordinary, and int(f) rounding toward zero mapped
// both (-10, 0) and [0, 10) onto cell 0 — a double-width bucket on each axis
// and a quadruple-area cell where they cross. Bucketing stayed monotone, so
// no collision was ever missed; the cost was purely the O(k^2) per-cell
// brute force paying ~16x on the busiest cell in the world.
func floor32f(f float32) int {
	return int(math.Floor(float64(f)))
}

// NewSpace initializes a new Space
func NewSpace() *Space {
	return &Space{
		shapes:     make(shapeSet),
		gridStatic: make(colliderGrid),
	}
}

// Space represents a set of dynamic and static dynamicShapes that may collide
type Space struct {
	// list of all dynamic dynamicShapes
	shapes shapeSet

	// grid for dynamic bodies
	grid map[Vec2i][]DynamicCollider

	// grid for static bodies
	gridStatic colliderGrid

	radius float32
}

// getAt returns the list of dynamicShapes in a chunk
// Note: x and y are chunk coordinates, e.g. floor(X/gridWith)
func (s *Space) getStaticAt(x, y int) []Collider {
	return s.gridStatic[Vec2i{x, y}]
}

// Update runs collision detection over all boxes
func (s *Space) Update() {
	// Reuse the grid and its per-cell slices instead of re-making them: this
	// runs 30×/s forever, and rebuilding it from scratch was ~20% of the idle
	// server's garbage (idle-overload investigation 2026-07-22, pinned by
	// space_alloc_test.go). Truncating to [:0] keeps the capacity; the tail is
	// cleared so cells stop pinning shapes that were removed since last tick.
	if s.grid == nil {
		s.grid = make(dynamicColliderGrid)
	} else {
		for v, cell := range s.grid {
			clear(cell[:cap(cell)])
			s.grid[v] = cell[:0]
		}
	}

	// reset all collisions and dynamic bodies
	for shape := range s.shapes {
		shape.resetCollisions()
		shape.updateBB()
		s.insert(shape)
	}

	// iterate over all chunks and brute force collisions
	for v, list := range s.grid {

		// add static objects if there are any relevant
		staticList := s.gridStatic[v]
		s.bruteIntersectShapes(staticList, list)
	}

	// reset all collisions and dynamic bodies
	for shape := range s.shapes {
		shape.resolveCollisions()
	}
}

// bruteIntersectShapes calculates collisions of a slice of dynamicShapes
// with brute force
func (s *Space) bruteIntersectShapes(statics []Collider, shapes []DynamicCollider) {
	n := len(shapes)
	// go over all dynamic shapes
	for i := 0; i < n; i++ {
		current := shapes[i]
		// check if any other dynamic shape collides
		for j := i + 1; j < n; j++ {
			other := shapes[j]

			cbb := current.BoundingBox()
			obb := other.BoundingBox()
			if !IntersectAabb(&cbb, &obb) {
				continue
			}

			ca := ArbiterShapes(current, other)
			oa := ArbiterShapes(other, current)
			if !(ca || oa) {
				continue
			}

			if !current.IntersectWith(other) {
				continue
			}

			if ca {
				current.addCollision(other)
			}
			if oa {
				other.addCollision(current)
			}
		}

		for j := 0; j < len(statics); j++ {
			other := statics[j]

			cbb := current.BoundingBox()
			obb := other.BoundingBox()
			if !IntersectAabb(&cbb, &obb) {
				continue
			}

			if !ArbiterShapes(current, other) {
				continue
			}

			if !current.IntersectWith(other) {
				continue
			}

			current.addCollision(other)
		}
	}
}

// QueryCircle returns all dynamic colliders that intersect the given circle
// and whose layer matches the circle's mask. It reuses the broadphase grid of
// the last Update — the query circle itself is never added to the space, and
// no collider records a collision. Intended for one-shot area effects
// (instant_damage skills): create a circle, query, drop it.
func (s *Space) QueryCircle(c *Circle) []DynamicCollider {
	c.updateBB()
	bb := c.BoundingBox()

	seen := make(map[DynamicCollider]struct{})
	var hits []DynamicCollider

	for x := floor32f(bb.Left / gridWidth); x <= floor32f(bb.Right/gridWidth); x++ {
		for y := floor32f(bb.Bottom / gridWidth); y <= floor32f(bb.Upper/gridWidth); y++ {
			for _, other := range s.grid[Vec2i{x, y}] {
				if _, ok := seen[other]; ok {
					continue
				}
				seen[other] = struct{}{}

				obb := other.BoundingBox()
				if !IntersectAabb(&bb, &obb) {
					continue
				}
				if !ArbiterShapes(c, other) {
					continue
				}
				if !c.IntersectWith(other) {
					continue
				}
				hits = append(hits, other)
			}
		}
	}
	return hits
}

// QueryCircleStatics is QueryCircle's static-side twin: all static colliders
// (blocking props, the border wall) that intersect the given circle and whose
// layer matches the circle's mask. The static grid is built at AddStaticShape
// time, so no Update is required first. Intended for one-shot placement
// checks (spawn-effect offset placement): create a circle, query, drop it.
// On a per-tick path use AppendCircleStatics instead — this one allocates a
// fresh result slice per call.
func (s *Space) QueryCircleStatics(c *Circle) []Collider {
	return s.AppendCircleStatics(nil, c)
}

// AppendCircleStatics is QueryCircleStatics without the per-call garbage: it
// appends the hits to dst and returns the extended slice, so a caller on a
// per-tick path can hand back its own buffer (buf[:0]) and allocate nothing.
// Duplicates are suppressed only among the hits appended by THIS call — a
// static straddling several grid cells is still reported once.
func (s *Space) AppendCircleStatics(dst []Collider, c *Circle) []Collider {
	c.updateBB()
	bb := c.BoundingBox()

	start := len(dst)

	for x := floor32f(bb.Left / gridWidth); x <= floor32f(bb.Right/gridWidth); x++ {
		for y := floor32f(bb.Bottom / gridWidth); y <= floor32f(bb.Upper/gridWidth); y++ {
			for _, other := range s.gridStatic[Vec2i{x, y}] {
				obb := other.BoundingBox()
				if !IntersectAabb(&bb, &obb) {
					continue
				}
				if !ArbiterShapes(c, other) {
					continue
				}
				if !c.IntersectWith(other) {
					continue
				}
				// Cell-straddle de-dup by linear scan rather than a `seen`
				// map: a probe spans a handful of cells and hits a handful of
				// statics, and the map was pure garbage on the hot path.
				if containsCollider(dst[start:], other) {
					continue
				}
				dst = append(dst, other)
			}
		}
	}
	return dst
}

func containsCollider(list []Collider, c Collider) bool {
	for _, other := range list {
		if other == c {
			return true
		}
	}
	return false
}

// AddShape appends a new shape to the existing ones
func (s *Space) AddShape(c DynamicCollider) {
	s.shapes[c] = struct{}{}
}

// RemoveShape removes a shape from the existing ones
func (s *Space) RemoveShape(c DynamicCollider) {
	delete(s.shapes, c)
}

// AddStaticShape adds a static shape
// Important: static dynamicShapes cannot be moved nor removed
func (s *Space) AddStaticShape(c Collider) {
	c.updateBB()
	s.insertStatic(c)
}

// insert inserts a new shape into the specified grid.
func (s *Space) insert(c DynamicCollider) {
	bb := c.BoundingBox()

	for x := floor32f(bb.Left / gridWidth); x <= floor32f(bb.Right/gridWidth); x++ {
		for y := floor32f(bb.Bottom / gridWidth); y <= floor32f(bb.Upper/gridWidth); y++ {
			s.insertAt(Vec2i{x, y}, c)
		}
	}
}

// insertAt inserts a shape at the specified x/y chunk coordinates
func (s *Space) insertAt(p Vec2i, v DynamicCollider) {
	list := s.grid[p]
	if list == nil {
		list = make([]DynamicCollider, 0, 4)
	}
	list = append(list, v)
	s.grid[p] = list
}

// insert inserts a new static shape into the specified grid.
// Note: static shapes may never be removed
func (s *Space) insertStatic(c Collider) {
	bb := c.BoundingBox()

	for x := floor32f(bb.Left / gridWidth); x <= floor32f(bb.Right/gridWidth); x++ {
		for y := floor32f(bb.Bottom / gridWidth); y <= floor32f(bb.Upper/gridWidth); y++ {
			s.insertStaticAt(Vec2i{x, y}, c)
		}
	}
}

// insertStaticAt inserts a static shape at the specified x/y chunk coordinates
func (s *Space) insertStaticAt(p Vec2i, v Collider) {
	list := s.gridStatic[p]
	if list == nil {
		list = make([]Collider, 0, 4)
	}
	list = append(list, v)
	s.gridStatic[p] = list
}

// String simple string representation of a space
func (s *Space) String() string {
	var buffer bytes.Buffer

	for v, list := range s.grid {

		buffer.WriteString(fmt.Sprintf("%02d-%02d: %+v", v.X, v.Y, list))
		buffer.WriteString("\t ")
		buffer.WriteString("\n")
	}

	return buffer.String()
}
