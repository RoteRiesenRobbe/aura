package mob

// A root is a FULL slow (docs/plan-grandfather-knot.md §3.5): EntanglingRoots
// authors instant_slow at slowFraction 1.0, the first content to do so. These
// pin the three things the design leans on — the mob stops, it is NOT a stun
// (it keeps its aura and its cast path), and an immune species walks on.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const rootSource = skills.SkillID(157)

func TestRoot_AFullSlowHoldsTheMob(t *testing.T) {
	m := newTestMob()
	require.Greater(t, m.stepLength(), float32(0), "precondition: the fixture moves")

	require.True(t, m.ApplySlow(rootSource, 1.0, 90))

	assert.Equal(t, float32(0), m.stepLength(), "a rooted mob does not move at all")
	assert.False(t, m.Stunned(), "a root is not a stun: the mob keeps its aura and its casts")
}

func TestRoot_IsRefusedByACCImmuneSpecies(t *testing.T) {
	m := NewMob(immuneDefinition(), 0, nil)
	full := m.stepLength()

	assert.False(t, m.ApplySlow(rootSource, 1.0, 90))
	assert.Equal(t, full, m.stepLength(), "an elite or a boss walks on")
}

func TestRoot_ExpiryRestoresMovement(t *testing.T) {
	m := newTestMob()
	full := m.stepLength()
	m.ApplySlow(rootSource, 1.0, 3)

	for i := range 3 {
		require.Equal(t, float32(0), m.stepLength(), "tick %d: still rooted", i)
		m.ResetTickNumbers() // the StatusEffectsSystem hook that ages the buff store
	}

	assert.Equal(t, full, m.stepLength(), "an expired root leaves nothing behind")
}
