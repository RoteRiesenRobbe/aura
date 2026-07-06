package core

// Tests for two diagnostics helpers in game.go:
//
//   - ByPriority: sorts systems ascending by ecs.Prioritizer priority for the
//     "enabled systems" boot log (printSystems).
//   - overloadPercent: tick-load percentage for the overload warning; must not
//     truncate to 100% for any dt > stepMillis (integer division order).
//
// See docs/research-code-quality.md §2.

import (
	"sort"
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

func TestByPriority_SortsAscending(t *testing.T) {
	systems := ByPriority{
		&prioritizedSystem{priority: 10},
		&prioritizedSystem{priority: -50},
		&prioritizedSystem{priority: 0},
	}

	sort.Sort(systems)

	got := make([]int, 0, len(systems))
	for _, s := range systems {
		got = append(got, s.(*prioritizedSystem).priority)
	}
	assert.Equal(t, []int{-50, 0, 10}, got)
}

func TestOverloadPercent_NoTruncationTo100(t *testing.T) {
	// 60ms on a 33ms budget is ~181% load, not 100%.
	assert.Equal(t, int64(181), overloadPercent(60))
	// Exactly on budget is 100%.
	assert.Equal(t, int64(100), overloadPercent(33))
}
