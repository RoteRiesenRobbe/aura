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
