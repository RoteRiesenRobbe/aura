package core

// Tests for two diagnostics helpers in game.go:
//
//   - printSystems: logs the world's systems in execution order. It must NOT
//     mutate ecs.World's internal slice — Systems() returns the live slice the
//     engine iterates in Update(), already sorted descending by priority
//     (higher priority runs first). A previous ByPriority re-sort here
//     reversed the tick execution order at boot (broke damage numbers and
//     aura-hit VFX).
//   - overloadPercent: tick-load percentage for the overload warning; must not
//     truncate to 100% for any dt > stepMillis (integer division order).
//
// See docs/research-code-quality.md §2.

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
)

// prioritizedSystem is a minimal ecs.System + ecs.Prioritizer stub.
type prioritizedSystem struct {
	priority int
}

func (s *prioritizedSystem) Update(dt float32)        {}
func (s *prioritizedSystem) Remove(e ecs.BasicEntity) {}
func (s *prioritizedSystem) Priority() int            { return s.priority }

func TestPrintSystems_DoesNotChangeExecutionOrder(t *testing.T) {
	g := &game{}
	// Added out of order; the engine sorts descending by priority on add.
	g.World.AddSystem(&prioritizedSystem{priority: -50})
	g.World.AddSystem(&prioritizedSystem{priority: 10})
	g.World.AddSystem(&prioritizedSystem{priority: 0})

	order := func() []int {
		got := make([]int, 0, 3)
		for _, s := range g.World.Systems() {
			got = append(got, s.(*prioritizedSystem).priority)
		}
		return got
	}

	assert.Equal(t, []int{10, 0, -50}, order(), "engine execution order is descending priority")

	g.printSystems()

	assert.Equal(t, []int{10, 0, -50}, order(), "printSystems must not reorder the live systems slice")
}

func TestOverloadPercent_NoTruncationTo100(t *testing.T) {
	// 60ms on a 33ms budget is ~181% load, not 100%.
	assert.Equal(t, int64(181), overloadPercent(60))
	// Exactly on budget is 100%.
	assert.Equal(t, int64(100), overloadPercent(33))
}

// panickingSystem panics on every Update until disarmed.
type panickingSystem struct {
	priority int
	armed    bool
	calls    int
}

func (s *panickingSystem) Update(dt float32) {
	s.calls++
	if s.armed {
		panic("boom")
	}
}
func (s *panickingSystem) Remove(e ecs.BasicEntity) {}
func (s *panickingSystem) Priority() int            { return s.priority }

// countingSystem records that it ran.
type countingSystem struct {
	priority int
	calls    int
}

func (s *countingSystem) Update(dt float32)        { s.calls++ }
func (s *countingSystem) Remove(e ecs.BasicEntity) {}
func (s *countingSystem) Priority() int            { return s.priority }

// A panic in any ECS system used to kill the process and disconnect every
// player: Loop() is `for { g.update(); <-ticker.C }` with no recover anywhere.
// One malformed edge case = full-server outage.
func TestUpdate_RecoversFromSystemPanic(t *testing.T) {
	g := &game{}
	boom := &panickingSystem{priority: 10, armed: true}
	after := &countingSystem{priority: 0}
	g.World.AddSystem(boom)
	g.World.AddSystem(after)

	before := RecoveredPanics()

	assert.NotPanics(t, func() { g.update() }, "a system panic must not escape the tick")

	assert.Equal(t, before+1, RecoveredPanics(), "the panic is counted for telemetry")
	assert.Equal(t, uint64(1), g.Tick, "the tick still advances so clients do not freeze")
	assert.Equal(t, 1, boom.calls)

	// The honest cost of recovering: the rest of the tick is skipped, so the
	// world is left partially updated. Recovery buys availability, not
	// correctness — a sustained panic is still an outage, just a visible one.
	assert.Zero(t, after.calls, "systems after the panicking one do not run this tick")

	// The loop keeps going and fully recovers once the fault clears.
	boom.armed = false
	assert.NotPanics(t, func() { g.update() })
	assert.Equal(t, before+1, RecoveredPanics(), "a healthy tick does not increment the counter")
	assert.Equal(t, uint64(2), g.Tick)
	assert.Equal(t, 1, after.calls, "the rest of the tick runs again once the fault clears")
}

// --- the memorial's seam (plan-ascension.md C3 step 5) ---

// stubGraveyard is the loop-side seam, without a database behind it.
type stubGraveyard struct{ yard persist.Graveyard }

func (s stubGraveyard) Latest() persist.Graveyard { return s.yard }

// ⚑ NIL IS A SUPPORTED WORLD, exactly as it is for the writer and the ascender:
// every test here builds a bare game, and a build with no database must still
// run: it simply has an empty monument, which is also what a world where nobody
// has ascended looks like. Without this the memorial would panic the first time
// a player walked up to the stone in any non-persistent build.
func TestGame_GraveyardIsEmptyWithoutASeam(t *testing.T) {
	g, err := NewGameWith(1)
	require.NoError(t, err)

	yard := g.(*game).Graveyard()
	assert.Empty(t, yard.Names)
	assert.Zero(t, yard.Total)
}

// The seam round-trips: what cmd/aurad installs is what the memorial reads.
// ⚑ This is the pin that keeps the field from being dead code between step 5
// and step 6, the class this plan has already shipped once (C2a's P13).
func TestGame_GraveyardReadsThroughTheInstalledSeam(t *testing.T) {
	g, err := NewGameWith(1)
	require.NoError(t, err)

	sink := stubGraveyard{yard: persist.Graveyard{
		Names: []persist.GraveyardName{{Name: "Aelric", Level: 30, AccountID: 7}},
		Total: 42,
	}}
	g.(sys.PersistenceSink).SetGraveyardNames(sink)

	yard := g.(*game).Graveyard()
	require.Len(t, yard.Names, 1)
	assert.Equal(t, "Aelric", yard.Names[0].Name)
	assert.Equal(t, 30, yard.Names[0].Level)
	assert.Equal(t, int64(7), yard.Names[0].AccountID)
	assert.Equal(t, 42, yard.Total, "the total rides along, so the stone can say what it omits")
}
