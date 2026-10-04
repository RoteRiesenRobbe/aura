package skills

// The buff tray's server half (plan-buff-tray.md C1): the store's revision
// counter the owner-state gate watches, and the projection the wire carries.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- the revision counter (D15) ---

func TestBuffs_RevisionBumpsOnInsertAndOnAnExtendingRefresh(t *testing.T) {
	var b Buffs
	assert.Zero(t, b.Revision(), "the zero value starts at 0")

	b.ApplySlow(7, 0.3, 10)
	assert.Equal(t, uint64(1), b.Revision(), "an insert is a change")

	b.ApplySlow(7, 0.3, 5)
	assert.Equal(t, uint64(1), b.Revision(), "a refresh that does not outlast what is left changes nothing on the wire")

	b.ApplySlow(7, 0.3, 20)
	assert.Equal(t, uint64(2), b.Revision(), "a refresh that extends the stream moves its expiry")

	b.ApplySlow(7, 0.5, 20)
	assert.Equal(t, uint64(3), b.Revision(), "a different strength opens a new stream")
}

// ⛔ THE constraint D15 stands on: Tick() ages every live entry every tick, and
// that aging must NOT count as a change, or the gate resends the whole owner
// block on every tick any buff is alive — worse than the per-tick vector the
// plan rejected. The wire carries an expiry tick, and an expiry does not move
// while a stream ages.
func TestBuffs_RevisionDoesNotBumpWhileALiveEffectAges(t *testing.T) {
	var b Buffs
	b.ApplySlow(7, 0.3, 200)
	rev := b.Revision()

	for i := 0; i < 100; i++ {
		b.Tick()
	}
	assert.Equal(t, rev, b.Revision(), "100 quiet ticks with a live effect must not touch the revision")
	require.Len(t, b.OwnEffects(), 1, "and the effect is still reported")
	assert.Equal(t, 100, b.OwnEffects()[0].Left)
}

func TestBuffs_RevisionBumpsOnEveryRemoval(t *testing.T) {
	// Expiry in Tick().
	var b Buffs
	b.ApplySlow(7, 0.3, 2)
	rev := b.Revision()
	b.Tick()
	assert.Equal(t, rev, b.Revision(), "aging to 1 tick left is not a change")
	b.Tick()
	assert.Equal(t, rev+1, b.Revision(), "the expiry is")
	assert.Empty(t, b.OwnEffects())

	// A stream expiring while its skill keeps another stream: the circle's
	// longest stream can change, so it is a change too.
	b = Buffs{}
	b.ApplyResist(7, []string{"fire"}, 0.5, 1)
	b.ApplyResist(7, []string{"fire"}, 0.8, 5)
	rev = b.Revision()
	b.Tick()
	assert.Equal(t, rev+1, b.Revision(), "one of two streams under a skill expired")

	// An early removal by kind (a calm broken by damage, a charm reverted).
	b = Buffs{}
	b.ApplyCalm(9, 100)
	rev = b.Revision()
	b.DropCalm()
	assert.Equal(t, rev+1, b.Revision(), "DropCalm removed an application")
	b.DropCalm()
	assert.Equal(t, rev+1, b.Revision(), "a drop that removes nothing is not a change")

	// A shield burned down to zero.
	b = Buffs{}
	b.ApplyShield(11, 20, 100)
	rev = b.Revision()
	b.AbsorbShield(5)
	assert.Equal(t, rev, b.Revision(), "a drain is not on the tray's wire (shield_hp carries it)")
	b.AbsorbShield(15)
	assert.Equal(t, rev+1, b.Revision(), "the pool hit zero and the stream was dropped")
	assert.Empty(t, b.OwnEffects())

	// Cleanse.
	b = Buffs{}
	rev = b.Revision()
	b.Cleanse()
	assert.Equal(t, rev, b.Revision(), "cleansing an empty store changes nothing")
	b.ApplySlow(7, 0.3, 100)
	rev = b.Revision()
	b.Cleanse()
	assert.Equal(t, rev+1, b.Revision(), "cleansing a live store does")
}

func TestBuffs_ShieldRefreshThatOnlyRestoresThePoolIsNotARevision(t *testing.T) {
	var b Buffs
	b.ApplyShield(11, 20, 100)
	b.AbsorbShield(5)
	rev := b.Revision()
	b.ApplyShield(11, 20, 50)
	assert.Equal(t, rev, b.Revision(), "the pool refilled but the expiry did not move; shield_hp is live on the wire already")
}

// --- the projection (D11 as amended 2026-10-02, D13 is the client's) ---

func TestBuffs_OwnEffectsEmptyStoreReportsNothing(t *testing.T) {
	var b Buffs
	assert.Empty(t, b.OwnEffects())
}

func TestBuffs_OwnEffectsOneCirclePerSkillWithItsKindsAndLongestStream(t *testing.T) {
	var b Buffs
	b.ApplyResist(7, []string{"fire"}, 0.5, 30)
	b.ApplyResist(7, []string{"fire"}, 0.8, 90) // a weaker, longer stream of the same skill
	b.ApplySlow(7, 0.3, 60)                     // a second kind under the same skill

	got := b.OwnEffects()
	require.Len(t, got, 1, "one circle per skill: streams and kinds fold together")
	e := got[0]
	assert.Equal(t, SkillID(7), e.Skill)
	assert.Nil(t, e.Caster, "no dot stream, so the circle is the skill's shared one")
	assert.Equal(t, EffectKindResist|EffectKindSlow, e.Kinds, "the union of the kinds live under the skill")
	assert.Equal(t, 90, e.Left, "the longest stream's time")
	assert.Equal(t, 90, e.Total)
}

func TestBuffs_OwnEffectsRefreshRefillsTotal(t *testing.T) {
	var b Buffs
	b.ApplySpeed(3, 1.5, 61)
	for i := 0; i < 40; i++ {
		b.Tick()
	}
	e := b.OwnEffects()[0]
	assert.Equal(t, 21, e.Left)
	assert.Equal(t, 61, e.Total, "total is the lifetime this application started with")

	b.ApplySpeed(3, 1.5, 61) // the aura beat: a same-strength refresh
	e = b.OwnEffects()[0]
	assert.Equal(t, 61, e.Left, "the refresh fills the circle again (D2)")
	assert.Equal(t, 61, e.Total)

	b.ApplySpeed(3, 1.5, 10) // a shorter refresh with more left: nothing moves
	e = b.OwnEffects()[0]
	assert.Equal(t, 61, e.Left)
	assert.Equal(t, 61, e.Total)
}

func TestBuffs_OwnEffectsSortedBySkillID(t *testing.T) {
	var b Buffs
	b.ApplySlow(40, 0.3, 10)
	b.ApplySpeed(3, 1.5, 10)
	b.ApplyCalm(12, 10)

	got := b.OwnEffects()
	require.Len(t, got, 3)
	assert.Equal(t, []SkillID{3, 12, 40}, []SkillID{got[0].Skill, got[1].Skill, got[2].Skill},
		"map order is random; the wire wants a stable order")
}

// ⭐ PO 2026-10-02: a dot ticks per caster on the server (round-7 item 6), so
// it draws per caster too — two wolves' Venom Spit are two circles. The
// skill's caster-less kinds (a slow, say) ride in each dot circle's mask
// rather than forming a third circle.
func TestBuffs_OwnEffectsOneCirclePerDotCaster(t *testing.T) {
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 30, Caster: "alice"}, 100)
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 30, Caster: "bob"}, 40)
	b.ApplySlow(5, 0.3, 150) // the same skill also slows; nobody owns a slow

	got := b.OwnEffects()
	require.Len(t, got, 2, "one circle per dot caster, no third circle for the slow")

	assert.Equal(t, "alice", got[0].Caster, "casters in order of first application")
	assert.Equal(t, EffectKindDot|EffectKindSlow, got[0].Kinds, "the shared slow rides in the dot circle's mask")
	assert.Equal(t, 100, got[0].Left, "the wedge is the caster's own dot time, not the shared slow's")
	assert.Equal(t, 100, got[0].Total)

	assert.Equal(t, "bob", got[1].Caster)
	assert.Equal(t, EffectKindDot|EffectKindSlow, got[1].Kinds)
	assert.Equal(t, 40, got[1].Left)

	// Bob's dot expires: his circle goes, alice's stays; the slow still rides.
	for i := 0; i < 40; i++ {
		b.Tick()
	}
	got = b.OwnEffects()
	require.Len(t, got, 1)
	assert.Equal(t, "alice", got[0].Caster)
	assert.Equal(t, EffectKindDot|EffectKindSlow, got[0].Kinds)

	// Alice's dot expires too: the slow falls back to the skill's shared circle.
	for i := 0; i < 60; i++ {
		b.Tick()
	}
	got = b.OwnEffects()
	require.Len(t, got, 1)
	assert.Nil(t, got[0].Caster)
	assert.Equal(t, EffectKindSlow, got[0].Kinds)
	assert.Equal(t, 50, got[0].Left)
}

func TestBuffs_OwnEffectsDotCasterLongestOfTheirOwnStreams(t *testing.T) {
	// One caster, two strengths (a level-up mid-burn): one circle, the longer.
	var b Buffs
	b.ApplyDot(5, DotBuff{HP: 8, Interval: 30, Caster: "alice"}, 30)
	b.ApplyDot(5, DotBuff{HP: 4, Interval: 30, Caster: "alice"}, 90)

	got := b.OwnEffects()
	require.Len(t, got, 1)
	assert.Equal(t, "alice", got[0].Caster)
	assert.Equal(t, 90, got[0].Left)
}

func TestBuffs_OwnEffectsHotIsOneCirclePerSkill(t *testing.T) {
	// Only the strongest hot heals and a refresh hands the stream to the latest
	// caster, so there is nothing per caster to show (PO 2026-10-02).
	var b Buffs
	b.ApplyHot(6, HotBuff{HP: 4, Interval: 30, Caster: "alice"}, 60)
	b.ApplyHot(6, HotBuff{HP: 8, Interval: 30, Caster: "bob"}, 30)

	got := b.OwnEffects()
	require.Len(t, got, 1)
	assert.Nil(t, got[0].Caster)
	assert.Equal(t, EffectKindHot, got[0].Kinds)
	assert.Equal(t, 60, got[0].Left)
}

func TestBuffs_OwnEffectsStunReportsTheDiminishedTotal(t *testing.T) {
	var b Buffs
	require.True(t, b.ApplyStun(8, 60))
	for i := 0; i < 60; i++ {
		b.Tick()
	}
	require.True(t, b.ApplyStun(8, 60), "the second stun lands, halved")
	e := b.OwnEffects()[0]
	assert.Equal(t, EffectKindStun, e.Kinds)
	assert.Equal(t, 30, e.Total, "the lifetime the stream actually started with, after DR")
	assert.Equal(t, 30, e.Left)
}

// Every payload kind maps to exactly one bit and no two share one: a new
// payload cannot be added without a kind (effectKind is on the interface), and
// this keeps anyone from "reusing" a bit the way the pip byte had to.
func TestEffectKind_EveryPayloadHasItsOwnBit(t *testing.T) {
	payloads := []buffPayload{
		&resistPayload{}, &slowPayload{}, &speedPayload{}, &lifestealPayload{},
		&reflectPayload{}, &tickRatePayload{}, &dotPayload{}, &hotPayload{},
		&shieldPayload{}, &calmPayload{}, &stunPayload{}, &charmPayload{},
	}
	seen := map[EffectKind]bool{}
	for _, p := range payloads {
		k := p.effectKind()
		assert.NotZero(t, k)
		assert.Equal(t, k, k&-k, "exactly one bit")
		assert.False(t, seen[k], "no two payloads share a bit")
		seen[k] = true
	}
	assert.Len(t, seen, 12)
}
