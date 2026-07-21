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
