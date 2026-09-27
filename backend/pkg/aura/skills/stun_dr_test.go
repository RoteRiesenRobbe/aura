package skills

// Stun diminishing returns (plan-aura-drawbacks.md C2, PO ruling D10,
// 2026-09-27): the WoW ladder, for every entity, stuns only. Successive stuns
// land at 100 %, 50 %, 25 % of the requested duration and the fourth is
// refused; the ladder resets once StunDRResetTicks have passed since the last
// LANDED stun ended with no new stun landing. It lives in the shared store so
// players and mobs follow one rule; the real-entity legs live beside each door.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stunLength ticks the store until the stun is over and reports how many ticks
// it held. Bounded, so a stun that never ends fails instead of hanging.
func stunLength(t *testing.T, b *Buffs) int {
	t.Helper()
	n := 0
	for b.Stunned() {
		b.Tick()
		n++
		require.Less(t, n, 10_000, "the stun never ended")
	}
	return n
}

func TestStunDR_LadderHalvesThenRefuses(t *testing.T) {
	var b Buffs

	require.True(t, b.ApplyStun(stunSource, 80))
	assert.Equal(t, 80, stunLength(t, &b), "the first stun lands in full")

	require.True(t, b.ApplyStun(stunSource, 80))
	assert.Equal(t, 40, stunLength(t, &b), "the second lands at half")

	require.True(t, b.ApplyStun(stunSource, 80))
	assert.Equal(t, 20, stunLength(t, &b), "the third lands at a quarter")

	assert.False(t, b.ApplyStun(stunSource, 80), "the fourth is refused: immune")
	assert.False(t, b.Stunned(), "a refused stun leaves nothing behind")
}

// The ladder is per ENTITY, not per source: a different skill does not get a
// fresh 100 %.
func TestStunDR_IsSharedAcrossSources(t *testing.T) {
	var b Buffs
	require.True(t, b.ApplyStun(stunSource, 80))
	stunLength(t, &b)

	require.True(t, b.ApplyStun(stunSource+1, 80))
	assert.Equal(t, 40, stunLength(t, &b))
}

func TestStunDR_NeverBelowOneTick(t *testing.T) {
	var b Buffs
	require.True(t, b.ApplyStun(stunSource, 2))
	stunLength(t, &b)
	require.True(t, b.ApplyStun(stunSource, 2))
	stunLength(t, &b)

	require.True(t, b.ApplyStun(stunSource, 2), "2 >> 2 is 0, still a landed stun")
	assert.Equal(t, 1, stunLength(t, &b), "floored at one tick")
}

func TestStunDR_ResetsAfterTheWindow(t *testing.T) {
	t.Run("one tick short keeps the ladder", func(t *testing.T) {
		var b Buffs
		require.True(t, b.ApplyStun(stunSource, 80))
		stunLength(t, &b)
		for i := 0; i < StunDRResetTicks-1; i++ {
			b.Tick()
		}
		require.True(t, b.ApplyStun(stunSource, 80))
		assert.Equal(t, 40, stunLength(t, &b))
	})
	t.Run("the full window resets it", func(t *testing.T) {
		var b Buffs
		require.True(t, b.ApplyStun(stunSource, 80))
		stunLength(t, &b)
		for i := 0; i < StunDRResetTicks; i++ {
			b.Tick()
		}
		require.True(t, b.ApplyStun(stunSource, 80))
		assert.Equal(t, 80, stunLength(t, &b))
	})
}

// The window counts from when the stun ENDED, not from when it landed: a stun
// longer than the window must not reset the ladder while it is still holding.
func TestStunDR_WindowCountsFromTheEndOfTheStun(t *testing.T) {
	var b Buffs
	require.True(t, b.ApplyStun(stunSource, StunDRResetTicks+60))
	stunLength(t, &b)

	require.True(t, b.ApplyStun(stunSource, 80))
	assert.Equal(t, 40, stunLength(t, &b), "no time passed since the long stun ended")
}

// A refused (immune) application must not restart the window, or a stunner
// hammering an immune target would keep it immune forever.
func TestStunDR_ARefusalDoesNotRestartTheWindow(t *testing.T) {
	var b Buffs
	for i := 0; i < 3; i++ {
		require.True(t, b.ApplyStun(stunSource, 10))
		stunLength(t, &b)
	}
	half := StunDRResetTicks / 2
	for i := 0; i < half; i++ {
		b.Tick()
	}
	require.False(t, b.ApplyStun(stunSource, 10), "precondition: immune")
	for i := 0; i < StunDRResetTicks-half; i++ {
		b.Tick()
	}

	require.True(t, b.ApplyStun(stunSource, 80), "the window ran from the last LANDED stun")
	assert.Equal(t, 80, stunLength(t, &b))
}

// A re-application from the same source while the stun is live is a new
// application on the ladder; the stream still only extends, never shortens.
func TestStunDR_ALiveReapplicationCountsOnTheLadder(t *testing.T) {
	var b Buffs
	require.True(t, b.ApplyStun(stunSource, 80))
	require.True(t, b.ApplyStun(stunSource, 80), "lands at 40, which does not shorten the live 80")
	assert.Equal(t, 80, stunLength(t, &b))

	require.True(t, b.ApplyStun(stunSource, 80))
	assert.Equal(t, 20, stunLength(t, &b), "the live re-application was step two")
	assert.False(t, b.ApplyStun(stunSource, 80))
}

// Slows are never on the ladder, in either direction.
func TestStunDR_SlowsAreUntouched(t *testing.T) {
	var b Buffs
	for i := 0; i < 5; i++ {
		b.ApplySlow(stunSource, 0.5, 3)
	}
	require.True(t, b.ApplyStun(stunSource, 80))
	assert.Equal(t, 80, stunLength(t, &b), "five slows did not advance the ladder")

	for i := 0; i < 3; i++ {
		b.ApplyStun(stunSource, 10)
		stunLength(t, &b)
	}
	b.ApplySlow(stunSource+1, 0.5, 3)
	assert.Equal(t, float32(0.5), b.SlowFraction(), "an immune-to-stun entity still takes a slow")
}
