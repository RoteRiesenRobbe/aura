package player

// The player's CC doors (plan-aura-drawbacks.md C2, §3.2/§3.3, PO rulings
// D9/D10, proposals P2/P5). Every leg runs on a player built by the REAL
// constructor: the fake-passes-real-fails trap (sys/self_buff_capabilities_test.go)
// is exactly what a door on a double would hide.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const ccDoorSource = skills.SkillID(210)

func newCCPlayer(t *testing.T) *player {
	t.Helper()
	g := &fakeGame{reg: newStubRegistry(defDamageAura, defHarvest)}
	g.cfg.PlayerConfig = cfg.PlayerConfig{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, BaseHealth: 100}
	return New(g, &fakePlayerClient{}, "cc-probe").(*player)
}

// tickPlayer runs the real per-tick hook that ages the buff store, the combat
// window and the rejection stamp.
func tickPlayer(p *player, n int) {
	for i := 0; i < n; i++ {
		p.ResetTickNumbers()
	}
}

// --- the slow door (§3.2) ---

func TestPlayerSlow_SlowsTheWalkAndLightsThePip(t *testing.T) {
	p := newCCPlayer(t)
	require.Equal(t, float32(1), p.MovementFactor(), "precondition: nothing applied")

	require.True(t, p.ApplySlow(ccDoorSource, 0.4, 5), "a fresh slow reports new")

	assert.InDelta(t, 0.6, p.MovementFactor(), 1e-6)
	assert.NotZero(t, p.AppliedEffects()&skills.AppliedEffectSlow, "the Slow pip bit is on the wire")
	assert.False(t, p.ApplySlow(ccDoorSource, 0.4, 5), "the same fraction again is a refresh")
}

// A4 / §3.2: the target-side stamp. A slowed player is in combat (no regen)
// before the first bite, and a REFRESH stamps too: it is still an act of
// hostility, the applySlowAura caster-side rule.
func TestPlayerSlow_EntersCombatOnApplyAndOnRefresh(t *testing.T) {
	p := newCCPlayer(t)
	require.False(t, p.InCombat(), "precondition")

	require.True(t, p.ApplySlow(ccDoorSource, 0.4, 100_000))
	assert.True(t, p.InCombat(), "a fresh slow enters combat")

	for p.InCombat() {
		tickPlayer(p, 1)
	}
	require.Less(t, p.MovementFactor(), float32(1), "precondition: the slow outlived the combat window")

	require.False(t, p.ApplySlow(ccDoorSource, 0.4, 100_000), "a refresh")
	assert.True(t, p.InCombat(), "…still re-enters combat")
}

// --- GOD (§3.5, A3) ---

func TestPlayerCC_GodRefusesBothDoors(t *testing.T) {
	p := newCCPlayer(t)
	p.SetGodmode(true)
	p.skills.StartUtilityCast(skills.UtilityRecall)
	require.True(t, p.skills.IsCasting(), "precondition: a cast is running")

	assert.False(t, p.ApplySlow(ccDoorSource, 0.4, 30))
	assert.False(t, p.ApplyStun(ccDoorSource, 30))

	assert.Equal(t, float32(1), p.MovementFactor(), "GOD walks at full speed")
	assert.False(t, p.Stunned())
	assert.False(t, p.InCombat(), "a refused CC is no combat entry")
	assert.True(t, p.skills.IsCasting(), "a refused stun cancels nothing")
	_, reason := p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedNone, reason, "a refused stun floats nothing")
}

// --- the stun door (§3.3) ---

// D9 + P2 + P5: a landed stun cancels the running cast (no cooldown consumed,
// that is CancelCast's contract), enters combat, and notes the Stunned reason
// with skill id 0 once so the HUD floats it on the landing snapshot.
func TestPlayerStun_LandingCancelsTheCastEntersCombatAndNotesTheReason(t *testing.T) {
	for _, c := range []struct {
		name  string
		start func(sc *skills.SkillComponent)
	}{
		{"utility cast (Recall)", func(sc *skills.SkillComponent) { sc.StartUtilityCast(skills.UtilityRecall) }},
		{"slot cast", func(sc *skills.SkillComponent) {
			sc.EquipCooldown(0, &skills.SkillDefinition{
				ID: 902, Name: "SlowCast", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
				CooldownTicks: 100, CastTicks: 30,
			}, 1)
			sc.StartCast(0)
		}},
		{"ascension channel", func(sc *skills.SkillComponent) {
			sc.PendingAscension = &skills.AscensionPick{}
			sc.StartUtilityCast(skills.UtilityAscend)
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			p := newCCPlayer(t)
			c.start(p.skills)
			require.True(t, p.skills.IsCasting(), "precondition: a cast is running")

			require.True(t, p.ApplyStun(ccDoorSource, 30))

			assert.True(t, p.Stunned())
			assert.Equal(t, float32(0), p.MovementFactor(), "a stunned player does not move")
			assert.False(t, p.skills.IsCasting(), "D9: the stun cancelled the cast")
			assert.Nil(t, p.skills.PendingAscension, "the ascension pick dies with the channel")
			assert.True(t, p.InCombat(), "P2: a stunned player is in combat")
			id, reason := p.ActivationRejected()
			assert.Equal(t, skills.SkillID(0), id)
			assert.Equal(t, model.ActivationRejectedStunned, reason, "P5: noted as the stun lands")
		})
	}
}

// The client has no dedupe on rejection texts: every snapshot carrying a
// reason floats a new one. So the landing stamp is strictly one-shot: the
// next tick clears it and nothing re-notes it while the stun holds.
func TestPlayerStun_TheLandingReasonIsOneShot(t *testing.T) {
	p := newCCPlayer(t)
	require.True(t, p.ApplyStun(ccDoorSource, 30))
	_, reason := p.ActivationRejected()
	require.Equal(t, model.ActivationRejectedStunned, reason)

	for i := 0; i < 5; i++ {
		tickPlayer(p, 1)
		require.True(t, p.Stunned())
		_, reason = p.ActivationRejected()
		assert.Equal(t, model.ActivationRejectedNone, reason, "tick %d: still held, nothing re-noted", i)
	}
}

func TestPlayerStun_ExpiresOnItsOwn(t *testing.T) {
	p := newCCPlayer(t)
	require.True(t, p.ApplyStun(ccDoorSource, 3))

	for i := 0; i < 3; i++ {
		require.True(t, p.Stunned(), "tick %d: still held", i)
		tickPlayer(p, 1)
	}

	assert.False(t, p.Stunned())
	assert.Equal(t, float32(1), p.MovementFactor(), "an expired stun leaves nothing behind")
}

// D10 on a real player: 100 / 50 / 25 / refused, the window resets, and a
// refused stun does none of the landing's three acts.
func TestPlayerStun_DiminishingReturns(t *testing.T) {
	p := newCCPlayer(t)
	length := func() int {
		n := 0
		for p.Stunned() {
			tickPlayer(p, 1)
			n++
			require.Less(t, n, 10_000)
		}
		return n
	}

	require.True(t, p.ApplyStun(ccDoorSource, 80))
	assert.Equal(t, 80, length())
	require.True(t, p.ApplyStun(ccDoorSource, 80))
	assert.Equal(t, 40, length())
	require.True(t, p.ApplyStun(ccDoorSource, 80))
	assert.Equal(t, 20, length())

	tickPlayer(p, 1) // clear the last landing's stamps
	p.skills.StartUtilityCast(skills.UtilityRecall)
	assert.False(t, p.ApplyStun(ccDoorSource, 80), "the fourth is refused")
	assert.False(t, p.Stunned())
	assert.True(t, p.skills.IsCasting(), "a DR refusal cancels nothing")
	_, reason := p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedNone, reason, "a DR refusal floats nothing")

	tickPlayer(p, skills.StunDRResetTicks)
	require.True(t, p.ApplyStun(ccDoorSource, 80), "the window reset the ladder")
	assert.Equal(t, 80, length())
}
