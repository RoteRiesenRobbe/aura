package phy

// Allocation pins for the per-tick broadphase (idle-overload investigation,
// 2026-07-22). The live server logged "Overload! Systems at: N%" a few times a
// minute on a COMPLETELY EMPTY world: the loop allocated ~11 MB/s with zero
// players, forcing a GC every ~350 ms, and on the 2-vCPU box that tail clipped
// the 33 ms tick budget. Every byte came from the broadphase rebuilding its
// state from scratch each tick (grid map, per-collider collision sets) and
// from the mob steering probe.
//
// These pins assert the steady state is allocation-free — not "cheap", zero.
// The first Update still allocates (grid cells, collision sets grow to size);
// what must not repeat is paying for that growth again on every one of the
// 30 ticks per second, forever.

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// allocSpace builds a space that exercises both halves of Update: dynamic
// shapes that move (so cells change between ticks) and statics they collide
// with, spread over several grid cells (gridWidth 10).
func allocSpace() (*Space, []*Circle) {
	s := NewSpace()

	var movers []*Circle
	for i := 0; i < 40; i++ {
		c := NewCircle(Vec2f{X: float32(i) * 0.7, Y: float32(i%7) * 0.5}, 0.4)
		c.Shape().Layer = 1
		c.Shape().Mask = 1
		s.AddShape(c)
		movers = append(movers, c)
	}
	for i := 0; i < 60; i++ {
		st := NewCircle(Vec2f{X: float32(i) * 0.5, Y: float32(i%5) * 0.9}, 0.5)
		st.Shape().Layer = 1
		s.AddStaticShape(st)
	}
	return s, movers
}

func TestSpaceUpdate_SteadyStateAllocatesNothing(t *testing.T) {
	s, movers := allocSpace()

	// Warm up: the first ticks legitimately allocate the grid cells and the
	// collision sets. Steady state starts once those have reached their size.
	for i := 0; i < 8; i++ {
		s.Update()
	}

	// Move the shapes every run so cells genuinely change — a pin that only
	// held for a frozen scene would miss the per-tick grid rebuild.
	var n int
	allocs := testing.AllocsPerRun(30, func() {
		n++
		for i, c := range movers {
			c.SetPosition(Vec2f{X: float32(i)*0.7 + float32(n%3)*0.3, Y: float32(i%7) * 0.5})
		}
		s.Update()
	})

	assert.Zero(t, allocs, "Space.Update must not allocate in steady state — it runs 30×/s forever")
}

func TestQueryCircleStatics_ReusableProbeAllocatesNothing(t *testing.T) {
	s, _ := allocSpace()
	s.Update()

	probe := NewCircle(Vec2f{X: 5, Y: 1}, 1.2)
	probe.Shape().Mask = 1

	// The mob steering probe (model/mob.blockerRepulsion) runs this per mob
	// per tick — the doc comment's "create a circle, query, drop it" one-shot
	// usage is what made it the single largest allocation site on the server.
	var hits []Collider
	allocs := testing.AllocsPerRun(30, func() {
		hits = s.AppendCircleStatics(hits[:0], probe)
	})

	assert.Zero(t, allocs, "AppendCircleStatics must not allocate when the caller reuses the buffer")
	assert.NotEmpty(t, hits, "probe must actually hit statics — an empty result would pass trivially")
}

func TestAppendCircleDynamics_ReusableProbeAllocatesNothing(t *testing.T) {
	s, _ := allocSpace()
	s.Update()

	probe := NewCircle(Vec2f{X: 5, Y: 1}, 1.2)
	probe.Shape().Mask = 1

	// The mob separation probe (model/mob.mobSeparation) runs this per mob per
	// tick, right beside the static one — QueryCircle allocates a `seen` map
	// AND a fresh result slice per call, which is exactly the regression the
	// static twin above exists to avoid.
	var hits []DynamicCollider
	allocs := testing.AllocsPerRun(30, func() {
		hits = s.AppendCircleDynamics(hits[:0], probe)
	})

	assert.Zero(t, allocs, "AppendCircleDynamics must not allocate when the caller reuses the buffer")
	assert.NotEmpty(t, hits, "probe must actually hit bodies — an empty result would pass trivially")
}

// TestAppendCircleDynamics_MatchesQueryCircle keeps the allocation-free
// variant honest: same hits, same de-duplication across grid cells.
func TestAppendCircleDynamics_MatchesQueryCircle(t *testing.T) {
	s, _ := allocSpace()
	s.Update()

	for _, r := range []float32{0.2, 1.2, 4, 25} {
		probe := NewCircle(Vec2f{X: 5, Y: 1}, r)
		probe.Shape().Mask = 1

		want := s.QueryCircle(probe)
		got := s.AppendCircleDynamics(nil, probe)

		assert.ElementsMatch(t, want, got, "radius %v", r)
		assert.Len(t, got, len(want), "radius %v: no duplicates across cells", r)
	}
}

// TestAppendCircleStatics_MatchesQueryCircleStatics keeps the allocation-free
// variant honest: same hits, same de-duplication across grid cells.
func TestAppendCircleStatics_MatchesQueryCircleStatics(t *testing.T) {
	s, _ := allocSpace()
	s.Update()

	for _, r := range []float32{0.2, 1.2, 4, 25} {
		probe := NewCircle(Vec2f{X: 5, Y: 1}, r)
		probe.Shape().Mask = 1

		want := s.QueryCircleStatics(probe)
		got := s.AppendCircleStatics(nil, probe)

		assert.ElementsMatch(t, want, got, "radius %v", r)
		assert.Len(t, got, len(want), "radius %v: no duplicates across cells", r)
	}
}
