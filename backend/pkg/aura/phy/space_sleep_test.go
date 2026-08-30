package phy

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// SleepShape's contract (plan-world-scale.md S3/D5): the shape leaves the space
// — no query finds it, no rebuild re-inserts it — WITHOUT paying RemoveShape's
// global purge sweep.
func TestSpace_SleepShape_DropsTheShapeFromEveryQuery(t *testing.T) {
	s := NewSpace()

	watcher := NewCircle(Vec2f{0, 0}, 2)
	watcher.Shape().IsSensor = true
	watcher.Shape().Mask = 1
	watcher.Shape().Layer = 0

	sleeper := NewCircle(Vec2f{0.5, 0}, 0.25)
	sleeper.Shape().Layer = 1
	sleeper.Shape().Mask = 0

	s.AddShape(watcher)
	s.AddShape(sleeper)
	s.Update()
	require.Contains(t, watcher.Collisions(), Collider(sleeper), "fixture: the watcher sees it awake")

	s.SleepShape(sleeper)

	// The load-bearing half: the very next rebuild cannot re-derive it, because
	// it is no longer in s.shapes to be re-inserted into the grid.
	s.Update()
	assert.NotContains(t, watcher.Collisions(), Collider(sleeper),
		"a sleeping shape must be gone from every collision set after the next rebuild")
	assert.Empty(t, sleeper.Collisions(),
		"and it must hold no references of its own — otherwise it pins whatever it overlapped")
}

// The wake half: AddShape puts it back, and one rebuild is all it takes to be
// findable again. This is what makes the sleep/wake pair reversible, and it
// pins the one-tick lag setDormant documents (in the space, not yet in the grid
// until the next Update).
func TestSpace_SleepShape_WakeRestoresTheShape(t *testing.T) {
	s := NewSpace()

	watcher := NewCircle(Vec2f{0, 0}, 2)
	watcher.Shape().IsSensor = true
	watcher.Shape().Mask = 1
	watcher.Shape().Layer = 0

	sleeper := NewCircle(Vec2f{0.5, 0}, 0.25)
	sleeper.Shape().Layer = 1
	sleeper.Shape().Mask = 0

	s.AddShape(watcher)
	s.AddShape(sleeper)
	s.Update()
	s.SleepShape(sleeper)
	s.Update()
	require.NotContains(t, watcher.Collisions(), Collider(sleeper), "fixture: asleep")

	s.AddShape(sleeper) // wake

	s.Update()
	assert.Contains(t, watcher.Collisions(), Collider(sleeper),
		"a woken shape must be visible to the very next rebuild")
}

// Sleeping one shape must not disturb anything else in the space — the same
// scoping guarantee RemoveShape carries.
func TestSpace_SleepShape_LeavesOtherOverlapsIntact(t *testing.T) {
	s := NewSpace()

	stay := NewCircle(Vec2f{0, 0}, 1)
	other := NewCircle(Vec2f{0.4, 0}, 1)
	sleeper := NewCircle(Vec2f{0.5, 0}, 1)
	for _, c := range []*Circle{stay, other, sleeper} {
		c.Shape().IsSensor = true
		c.Shape().Layer = 1
		c.Shape().Mask = 1
		s.AddShape(c)
	}
	s.Update()
	require.Contains(t, stay.Collisions(), Collider(other))

	s.SleepShape(sleeper)
	s.Update()

	assert.Contains(t, stay.Collisions(), Collider(other), "unrelated overlaps survive")
	assert.NotContains(t, stay.Collisions(), Collider(sleeper))
}
