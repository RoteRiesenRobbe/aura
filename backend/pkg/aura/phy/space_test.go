package phy

import (
	"fmt"
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
)

type testCaseCircle struct {
	x, y, r float32
}

func TestSpace_AddShape(t *testing.T) {
	circles := []testCaseCircle{
		{10, 10, 5},
		{1, 1, 1},
		{7, 10, 3},
	}

	s := NewSpace()
	for _, c := range circles {
		shape := NewCircle(Vec2f{c.x, c.y}, c.r)
		s.AddShape(shape)
	}
	assert.Equal(t, len(circles), len(s.shapes), "Shapes added")

	fmt.Printf("Grid:\n%s\n", s)

	// found := shape.getAt(shape.grid, 1, 1)
	// assert.Equal(t, 1, len(found), "Find a shape")

	s.Update()

	fmt.Printf("Collisions:\n")
	for c := range s.shapes {
		for collsions := range c.Collisions() {
			fmt.Printf("%+v collides with %+v\n", c, collsions)
		}
	}
}

func TestSpace_QueryCircle(t *testing.T) {
	s := NewSpace()

	inRange := NewCircle(Vec2f{1, 0}, 1)
	inRange.Shape().Layer = 0b01
	outOfRange := NewCircle(Vec2f{50, 50}, 1)
	outOfRange.Shape().Layer = 0b01
	wrongLayer := NewCircle(Vec2f{0, 1}, 1)
	wrongLayer.Shape().Layer = 0b10

	s.AddShape(inRange)
	s.AddShape(outOfRange)
	s.AddShape(wrongLayer)
	s.Update() // builds the broadphase grid the query reuses

	query := NewCircle(Vec2f{0, 0}, 2)
	query.Shape().Mask = 0b01

	hits := s.QueryCircle(query)

	assert.Len(t, hits, 1)
	assert.Contains(t, hits, DynamicCollider(inRange))
}

func TestSpace_QueryCircle_BeforeFirstUpdate(t *testing.T) {
	s := NewSpace()
	query := NewCircle(Vec2f{0, 0}, 2)
	query.Shape().Mask = 0b01

	assert.Empty(t, s.QueryCircle(query))
}

func BenchmarkSpace_Update(b *testing.B) {
	s := NewSpace()
	for i := 0; i < b.N; i++ {
		x := float32(rand.Intn(100))
		y := float32(rand.Intn(100))
		r := float32(1 + rand.Intn(3))
		shape := NewCircle(Vec2f{x, y}, r)
		s.AddShape(shape)
	}

	b.ResetTimer()
	s.Update()
}

func TestSpace_AddStaticShape(t *testing.T) {
}

func TestSpace_QueryCircleStatics(t *testing.T) {
	// The static grid is filled at AddStaticShape time, so — unlike
	// QueryCircle — no Update is needed before querying.
	s := NewSpace()

	inRange := NewCircle(Vec2f{1, 0}, 1)
	inRange.Shape().Layer = 0b01
	outOfRange := NewCircle(Vec2f{50, 50}, 1)
	outOfRange.Shape().Layer = 0b01
	wrongLayer := NewCircle(Vec2f{0, 1}, 1)
	wrongLayer.Shape().Layer = 0b10

	s.AddStaticShape(inRange)
	s.AddStaticShape(outOfRange)
	s.AddStaticShape(wrongLayer)

	query := NewCircle(Vec2f{0, 0}, 2)
	query.Shape().Mask = 0b01

	hits := s.QueryCircleStatics(query)

	assert.Len(t, hits, 1)
	assert.Contains(t, hits, Collider(inRange))
}

func TestSpace_QueryCircleStatics_InvAABBBorder(t *testing.T) {
	// The border wall intersects a circle only when it pokes OUTSIDE the box,
	// so a Border-masked query doubles as an out-of-bounds check for free.
	s := NewSpace()
	wall := NewInvAABB(VEC2F_ZERO, 60, 40)
	wall.Shape().Layer = 0b01
	s.AddStaticShape(wall)

	inside := NewCircle(Vec2f{0, 0}, 1)
	inside.Shape().Mask = 0b01
	assert.Empty(t, s.QueryCircleStatics(inside), "fully inside the bounds = no wall overlap")

	poking := NewCircle(Vec2f{29.5, 0}, 1) // right edge at x=30; the circle reaches 30.5
	poking.Shape().Mask = 0b01
	assert.Len(t, s.QueryCircleStatics(poking), 1, "poking past the boundary hits the wall")
}

// floor32f must be a real floor, not a truncation. int(f) rounds toward zero,
// which collapses the two cell columns either side of an axis into one
// double-width bucket: the world is centred on the origin, so cell 0 covered
// (-10, 10) and the centre cell was 4x the area of every other one. Since
// bruteIntersectShapes is O(k^2) per cell, that cell paid ~16x the pair tests
// at equal density. Bucketing stayed monotone either way, so this never lost
// a collision — it only wasted work.
func TestFloor32f_FloorsTowardNegativeInfinity(t *testing.T) {
	cases := []struct {
		in   float32
		want int
	}{
		{0, 0},
		{0.9, 0},
		{1, 1},
		{1.5, 1},
		{-0.1, -1},
		{-0.9, -1},
		{-1, -1},
		{-1.5, -2},
		{-2, -2},
	}
	for _, c := range cases {
		assert.Equal(t, c.want, floor32f(c.in), "floor32f(%v)", c.in)
	}
}

// The regression this fixes, stated in grid terms: a shape just left of the
// origin and one just right of it must land in different cells.
func TestFloor32f_OriginCellIsNotDoubleWidth(t *testing.T) {
	left := floor32f(-5 / float32(gridWidth))
	right := floor32f(5 / float32(gridWidth))
	assert.NotEqual(t, left, right, "cells either side of the origin must differ")
	assert.Equal(t, -1, left)
	assert.Equal(t, 0, right)
}
