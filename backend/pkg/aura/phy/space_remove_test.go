package phy

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A shape removed from the space must vanish from every OTHER shape's
// collision set immediately — not at the next Update.
//
// ⚑ The dangling-reference bug this pins (disconnect ghost-chase, 2026-08-04):
// RemoveShape used to only drop the shape from s.shapes, leaving it in the sets
// its partners had been given by the last Update. Nothing reads a set twice
// within one tick, so that looked safe — but removal happens LATE in the tick
// (NetSystem, priority -100, spots the dead socket) while mob aggro
// acquisition runs EARLY in the next one, before PhysicsSystem rebuilds. That
// one stale read let a mob re-acquire a player who had already left the world,
// and re-acquiring is permanent: the ghost reads as alive at a frozen position,
// so the leash never counts down and the mob parks there for good.
func TestSpace_RemoveShape_PurgesTheShapeFromItsPartnersCollisionSets(t *testing.T) {
	s := NewSpace()

	stay := NewCircle(Vec2f{0, 0}, 1)
	leave := NewCircle(Vec2f{0.5, 0}, 1) // overlapping
	for _, c := range []*Circle{stay, leave} {
		c.Shape().IsSensor = true
		c.Shape().Layer = 1
		c.Shape().Mask = 1
		s.AddShape(c)
	}

	s.Update()
	require.Contains(t, stay.Collisions(), Collider(leave), "the two overlap to begin with")

	s.RemoveShape(leave)

	assert.NotContains(t, stay.Collisions(), Collider(leave),
		"a removed shape must not linger in a surviving shape's collision set")
	assert.Empty(t, leave.Collisions(), "and the removed shape drops its own references")
}

// ⚑ The asymmetric case, which is the REAL one: overlap is recorded per
// direction (ArbiterShapes is Mask & Layer, checked each way independently), so
// a sensor watching a body records the body while the body records nothing. The
// removed shape therefore cannot name the shapes that point at it, and a purge
// that walks only its own set silently misses every watcher.
//
// That is exactly the mob aggro sensor over a player body — the pair that
// stranded the wolves.
func TestSpace_RemoveShape_PurgesFromAOneWayWatcher(t *testing.T) {
	s := NewSpace()

	sensor := NewCircle(Vec2f{0, 0}, 2) // sees bodies; nothing sees it
	sensor.Shape().IsSensor = true
	sensor.Shape().Mask = 1
	sensor.Shape().Layer = 0

	body := NewCircle(Vec2f{0.5, 0}, 0.25) // seen; watches nothing
	body.Shape().Layer = 1
	body.Shape().Mask = 0

	s.AddShape(sensor)
	s.AddShape(body)
	s.Update()

	require.Contains(t, sensor.Collisions(), Collider(body), "the sensor sees the body")
	require.Empty(t, body.Collisions(), "and the body sees nothing back — the asymmetry")

	s.RemoveShape(body)

	assert.NotContains(t, sensor.Collisions(), Collider(body),
		"the watcher must lose the removed body even though the body never knew about it")
}

// The survivor keeps everything it still legitimately touches: the purge is
// scoped to the removed shape, not a blanket reset of its partners.
func TestSpace_RemoveShape_LeavesOtherOverlapsIntact(t *testing.T) {
	s := NewSpace()

	stay := NewCircle(Vec2f{0, 0}, 1)
	other := NewCircle(Vec2f{0.4, 0}, 1)
	leave := NewCircle(Vec2f{0.5, 0}, 1)
	for _, c := range []*Circle{stay, other, leave} {
		c.Shape().IsSensor = true
		c.Shape().Layer = 1
		c.Shape().Mask = 1
		s.AddShape(c)
	}

	s.Update()
	require.Contains(t, stay.Collisions(), Collider(other))

	s.RemoveShape(leave)

	assert.Contains(t, stay.Collisions(), Collider(other), "unrelated overlaps survive the purge")
	assert.NotContains(t, stay.Collisions(), Collider(leave))
}
