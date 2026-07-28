package mob

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Calm (plan-faction-flips chunk 2, D7): "out of combat until it is attacked."
// No faction flip — a calmed wolf is still a wolf anyone may damage; it has
// simply stopped swinging.
//
// ⚑ These assert on BEHAVIOUR (does it hold a target, does its aura gate, does
// it move) rather than on the buff store, for the reason the entity-model
// chunks recorded: a populated field is not a working mechanic.

const calmSource = skills.SkillID(62)

// aggroedMob returns a mob that has just been hit by a player standing inside
// its sensor, i.e. one with a live aggro link and its aura switched on.
func aggroedMob(t *testing.T) (*Mob, *fakeAuraPlayer) {
	t.Helper()
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 0.3, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))
	require.NotNil(t, m.aggroTarget, "precondition: the mob is fighting")
	return m, p
}

func TestCalm_DropsTheLiveAggroLink(t *testing.T) {
	// PO 2026-07-28: calm drops the CURRENT target, not just future
	// acquisition — it is the tool you reach for because something is already
	// chewing on you.
	m, _ := aggroedMob(t)

	m.ApplyCalm(calmSource, 100)
	assert.Nil(t, m.aggroTarget, "the link is dropped at cast, not at the next tick")
	assert.True(t, m.Calmed())
}

func TestCalm_AcquiresNothingWhileCalmed(t *testing.T) {
	m, p := aggroedMob(t)
	m.ApplyCalm(calmSource, 100)

	// The player is still standing right there, still in the sensor, still
	// hostile. Twenty ticks of that must not re-acquire.
	for i := 0; i < 20; i++ {
		require.True(t, m.Update(0))
		require.Nil(t, m.aggroTarget, "tick %d: a calmed mob acquires nothing", i)
	}
	assert.Equal(t, -1, m.SkillComponent().ActiveAuraSlot,
		"and its aura gates off for free — no target means modeIdle")
	_ = p
}

func TestCalm_ExpiryRestoresNormalAcquisition(t *testing.T) {
	m, p := aggroedMob(t)
	m.ApplyCalm(calmSource, 3)

	for i := 0; i < 3; i++ {
		m.ResetTickNumbers() // the StatusEffectsSystem hook that ages the buff store
		require.True(t, m.Update(0))
		require.Nil(t, m.aggroTarget, "tick %d: still calmed", i)
	}
	require.False(t, m.Calmed(), "precondition: the calm has run out")

	// Threat is the acquisition path available to a unit test — the sensor
	// needs a physics space this mob is not in. What matters is that expiry
	// leaves NO residue: the very next hit aggros normally.
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))
	assert.NotNil(t, m.aggroTarget, "an expired calm suppresses nothing")
	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot, "and the aura comes back on")
}

func TestCalm_BreaksOnDamageAndRetaliatesTheSameTick(t *testing.T) {
	// §5.4 / L-K: ANY damage breaks calm, the calmer's own aura included. The
	// break is checked ahead of the calm branch on purpose — the hit that broke
	// it has already written its threat row, so retaliation must not cost a
	// tick.
	m, p := aggroedMob(t)
	m.ApplyCalm(calmSource, 1000)
	require.True(t, m.Update(0))
	require.Nil(t, m.aggroTarget)

	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))

	assert.False(t, m.Calmed(), "damage breaks calm")
	assert.NotNil(t, m.aggroTarget, "…and it fights back on the SAME tick, not the next")
	assert.Equal(t, 0, m.SkillComponent().ActiveAuraSlot)
}

func TestCalm_StaysBrokenAfterOneHit(t *testing.T) {
	// The break is a removal, not a suppression: a single hit ends the calm for
	// good, so the mob does not go passive again once the damage stops.
	m, p := aggroedMob(t)
	m.ApplyCalm(calmSource, 1000)
	require.True(t, m.Update(0))
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))

	for i := 0; i < 10; i++ {
		require.True(t, m.Update(0))
	}
	assert.False(t, m.Calmed())
	assert.NotNil(t, m.aggroTarget, "no re-calming itself once the hits stop")
}

func TestCalm_CarriesAnAppliedEffectPip(t *testing.T) {
	// D13's client tell. Presence only — the wire carries no duration.
	m := newTestMob()
	assert.Zero(t, m.AppliedEffects()&skills.AppliedEffectCalm)

	m.ApplyCalm(calmSource, 100)
	assert.NotZero(t, m.AppliedEffects()&skills.AppliedEffectCalm,
		"a calmed mob is visibly calmed")
}

func TestCalm_DoesNotTouchFaction(t *testing.T) {
	// The point of D7 and the reason chunk 2 needs none of chunk 1's seam:
	// calm never flips allegiance, so a calmed wolf is still a wolf anyone may
	// damage — and it must not become player-aligned by accident.
	m, _ := aggroedMob(t)
	before, beforeMask := m.Faction(), m.aggroMask

	m.ApplyCalm(calmSource, 100)
	for i := 0; i < 5; i++ {
		require.True(t, m.Update(0))
	}

	assert.Equal(t, before, m.Faction(), "calm is not an allegiance change")
	assert.Equal(t, beforeMask, m.aggroMask, "and it leaves the authored aggro mask alone")
}

func TestCalm_StopsChasing(t *testing.T) {
	// The visible half: no target means the movement switch in Update finds
	// nothing to walk towards.
	m := newTestMob()
	m.SetPosition(phy.VEC2F_ZERO)
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 3, Y: 0}
	m.PlayerTouches(p, model.Damage{HP: 5})
	require.True(t, m.Update(0))
	require.True(t, m.Update(0))
	chased := m.Position()
	require.Greater(t, chased.X, float32(0), "precondition: it was closing in")

	m.ApplyCalm(calmSource, 100)
	for i := 0; i < 10; i++ {
		require.True(t, m.Update(0))
	}
	// It does not merely stop: with no target it walks home, which is the
	// ordinary resetAggro consequence and reads in-game as the wolf losing
	// interest and wandering off.
	assert.LessOrEqual(t, m.Position().X, chased.X, "a calmed mob never closes the gap")
	assert.InDelta(t, 0, m.Position().X, float64(chased.X), "…it heads back to where it came from")
}
