package mob

// Stun diminishing returns on a REAL mob (plan-aura-drawbacks.md C2, PO ruling
// D10). The ladder lives in the shared buff store; these legs prove the Mob
// door reports it and that the ccImmune gate sits BEFORE it.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mobStunLength ages the mob through its real per-tick hook until the stun
// is over and reports how long it held.
func mobStunLength(t *testing.T, m *Mob) int {
	t.Helper()
	n := 0
	for m.Stunned() {
		m.ResetTickNumbers()
		n++
		require.Less(t, n, 10_000, "the stun never ended")
	}
	return n
}

func TestStunDR_RealMobLadder(t *testing.T) {
	m := newTestMob()

	require.True(t, m.ApplyStun(stunDoorSource, 80))
	assert.Equal(t, 80, mobStunLength(t, m))
	require.True(t, m.ApplyStun(stunDoorSource, 80))
	assert.Equal(t, 40, mobStunLength(t, m))
	require.True(t, m.ApplyStun(stunDoorSource, 80))
	assert.Equal(t, 20, mobStunLength(t, m))

	assert.False(t, m.ApplyStun(stunDoorSource, 80), "the fourth is refused")
	assert.False(t, m.Stunned())

	for i := 0; i < skills.StunDRResetTicks; i++ {
		m.ResetTickNumbers()
	}
	require.True(t, m.ApplyStun(stunDoorSource, 80), "the window reset the ladder")
	assert.Equal(t, 80, mobStunLength(t, m))
}

// The immunity gate is checked before DR, and a refusal there must not
// advance the ladder: once the species stops being immune, the next stun lands
// in full. A ccImmune mob refusing forever alone would prove only the gate.
func TestStunDR_ACCImmuneRefusalDoesNotAdvanceTheLadder(t *testing.T) {
	def := immuneDefinition()
	m := NewMob(def, 0, nil)
	for i := 0; i < skills.StunDRImmuneAfter+1; i++ {
		require.False(t, m.ApplyStun(stunDoorSource, 80), "immune refuses, attempt %d", i)
	}

	def.Factors.CCImmune = false
	require.True(t, m.ApplyStun(stunDoorSource, 80))
	assert.Equal(t, 80, mobStunLength(t, m), "no refused attempt was a step on the ladder")
}
