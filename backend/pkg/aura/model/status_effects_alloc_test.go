package model

// Allocation pin for the per-tick status-effect reset (idle-overload
// investigation, 2026-07-22). StatusEffectsSystem calls Clear() for every
// status entity on every tick, so re-making the map there cost one allocation
// per entity per tick — with nobody online.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStatusEffectsClear_AllocatesNothing(t *testing.T) {
	s := NewStatusEffects()
	s.Add(StatusEffectDamaged)
	s.Clear() // warm-up: the map exists from here on

	allocs := testing.AllocsPerRun(50, func() {
		s.Add(StatusEffectDamaged)
		s.Clear()
	})

	assert.Zero(t, allocs, "Clear runs per entity per tick — it must not allocate")
}

// TestStatusEffectsClear_ActuallyClears guards the in-place clear against the
// obvious way to get zero allocations by accident: not clearing at all.
func TestStatusEffectsClear_ActuallyClears(t *testing.T) {
	s := NewStatusEffects()
	s.Add(StatusEffectDamaged)
	require.Len(t, s.Effects(), 1)

	s.Clear()
	assert.Empty(t, s.Effects(), "Clear must drop every effect")

	s.Add(StatusEffectDamaged)
	assert.Len(t, s.Effects(), 1, "the map must still be usable after a clear")
}
