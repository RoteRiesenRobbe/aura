package sys

// The ascension ceremony's channel (plan-ascension.md §12.4 C2a step 5): the
// ten seconds between picking a reward and losing the character.
//
// ⚑ The channel is the LAST ESCAPE, which is why almost every test here is
// about something NOT happening. Walking away, dying, or a pick that stopped
// being legitimate must all end with the character still alive.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// ascendCastUpdates is one press-processing update plus the full channel.
const ascendCastUpdates = 1 + 300

func ascensionChannelSetup(t *testing.T, gates map[string][]mobs.InteractionCondition) (
	*fakePlayer, *fakeConnState, AscensionSource, *SkillSystem,
) {
	t.Helper()
	g := newFakeGame()
	caster := newFakePlayer()
	caster.level = 30
	space := phy.NewSpace()
	space.Update()
	sk := NewSkillSystem(space, g)
	sk.rng = testRNG()
	sk.AddEntity(caster)

	// The request is accepted, which is the ordinary case: C1's transaction
	// runs off-loop and the loop only observes that it was taken.
	conn := &fakeConnState{ascendResult: true, bound: true}
	sk.SetConnState(conn)
	src := NewAscensionRows(ascension.CatalogOf(
		ascension.Entry{UnlockKey: "EmberWard", Skill: rewardEmber, Conditions: gates["EmberWard"]},
		ascension.Entry{UnlockKey: "FrostShield", Skill: rewardFrost, Conditions: gates["FrostShield"]},
	))
	sk.SetAscensionSource(src)
	return caster, conn, src, sk
}

// --- taking a row starts the ceremony ---------------------------------------

// ⭐ The row source is what starts the channel, because the alternative is a
// second client message that could arrive without a pick behind it.
func TestAscension_TakingARowStartsTheChannel(t *testing.T) {
	caster, conn, src, sk := ascensionChannelSetup(t, nil)

	_, ok := src.ApplyRow(catalogNode(), caster, 1, 0) // FrostShield
	require.True(t, ok)

	assert.True(t, caster.sc.IsCasting(), "the ceremony is a channel, not an instant")
	assert.Equal(t, skills.UtilityAscend, caster.sc.CastingUtility)
	sk.Update(33.0)
	assert.Zero(t, conn.ascendCalls, "the channel is the wind-up: nothing is spent yet")
}

// P7: interruptible by walking away, never by damage. Expressed by NOT setting
// the flag, so this pin is what keeps a later "make casts consistent" pass from
// quietly making the ceremony cancellable by any passing wolf.
func TestAscension_TheChannelIsNotInterruptedByDamage(t *testing.T) {
	def := skills.UtilityByKind(skills.UtilityAscend)
	require.NotNil(t, def)
	assert.False(t, def.CastInterruptedByDamage, "P7: only walking away ends it")
	assert.Equal(t, 300, def.CastTicks, "[PLACEHOLDER] ten seconds, Recall's value")
}

// --- completion --------------------------------------------------------------

func TestAscension_CompletionSpendsTheStashedPick(t *testing.T) {
	caster, conn, src, sk := ascensionChannelSetup(t, nil)
	_, ok := src.ApplyRow(catalogNode(), caster, 1, 0)
	require.True(t, ok)

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}

	assert.False(t, caster.sc.IsCasting())
	assert.Equal(t, 1, conn.ascendCalls, "exactly one request, at completion")
	assert.Equal(t, "FrostShield", conn.ascendKey, "the key the row stashed")
	assert.Nil(t, caster.sc.PendingAscension, "the pick is consumed")
}

// D14: a bloodline with nothing left to learn still ascends, and the empty key
// is what RequestAscension already accepts (C1).
func TestAscension_TheEmptyPickCompletesToo(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"EmberWard":   {{Kind: mobs.ConditionMinLevel, Value: 99}},
		"FrostShield": {{Kind: mobs.ConditionMinLevel, Value: 99}},
	}
	caster, conn, src, sk := ascensionChannelSetup(t, gates)
	_, ok := src.ApplyRow(catalogNode(), caster, ascensionEmptyPickIndex, 0)
	require.True(t, ok)

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}

	assert.Equal(t, 1, conn.ascendCalls)
	assert.Equal(t, "", conn.ascendKey)
}

// --- every way it must NOT happen -------------------------------------------

// ⭐ A NON-NIL STASH IS NOT A VALID PICK. The pick is judged when the row is
// clicked and spent ten seconds later, and a `quest_at_stage` gate can regress
// in between: abandon the quest mid-channel and the reward is no longer earned.
// advanceCast re-checks preconditions at completion for exactly this class.
func TestAscension_APickThatStoppedBeingLegitimateIsRefused(t *testing.T) {
	caster, conn, src, sk := ascensionChannelSetup(t, nil)
	_, ok := src.ApplyRow(catalogNode(), caster, 1, 0)
	require.True(t, ok)

	// The bloodline gains the very reward being channelled for, which is what a
	// regressed gate looks like from the validator's side: no longer takeable.
	caster.bloodline = []string{"FrostShield"}

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}

	assert.Zero(t, conn.ascendCalls, "the completion re-check is what refuses it")
	assert.Nil(t, caster.sc.PendingAscension, "and the stale pick is cleared either way")
}

// --- the site's price, re-judged at completion (plan-ascension-sites.md C1) ---

// ⭐ THE PRICE IS THE SITE'S, AND IT IS ENFORCED WHERE THE LIFE IS SPENT. D1
// retired the global max-level rule, so a stone gated at 25 and a stone gated at
// 30 must lead to different answers for the same player — and the answer is
// given ten seconds after the click, against the live player, because that is
// the only thing that cannot go stale.
//
// One player, two sites, in one test: the negative control the plan asks for.
func TestAscension_OnePlayerTwoSites_ThePriceThatCountsIsTheSitesOwn(t *testing.T) {
	priced := func(level int) *mobs.InteractionNode {
		site := catalogNode()
		site.Conditions = []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: level}}
		return site
	}

	t.Run("the site this character can afford", func(t *testing.T) {
		caster, conn, src, sk := ascensionChannelSetup(t, nil)
		caster.level = 25
		_, ok := src.ApplyRow(priced(25), caster, 1, 0)
		require.True(t, ok)

		for i := 0; i < ascendCastUpdates; i++ {
			sk.Update(33.0)
		}

		assert.Equal(t, 1, conn.ascendCalls, "the stone asked for 25 and got 25")
	})

	t.Run("the site it cannot", func(t *testing.T) {
		caster, conn, src, sk := ascensionChannelSetup(t, nil)
		caster.level = 25
		// The panel would never have opened this node for a level-25 character
		// (applyGrant checks the node gate first). Reaching the row source anyway
		// is what a crafted message looks like, and the ceremony is the second
		// place that refuses it.
		_, ok := src.ApplyRow(priced(30), caster, 1, 0)
		require.True(t, ok)

		for i := 0; i < ascendCastUpdates; i++ {
			sk.Update(33.0)
		}

		assert.Zero(t, conn.ascendCalls, "this stone asks for 30, and nothing else may stand in for that")
		assert.Nil(t, caster.sc.PendingAscension, "and the refused pick is cleared either way")
	})
}

// ⭐ A gate can LAPSE during the ten seconds, and the site's is no different
// from the reward's: reach the stone at the cap, lose the level mid-ceremony
// (the sacrifice-loop equivalent of abandoning the quest a gate names), and the
// character is still standing there afterwards.
func TestAscension_ASitePriceThatLapsesMidChannelRefuses(t *testing.T) {
	caster, conn, src, sk := ascensionChannelSetup(t, nil)
	site := catalogNode()
	site.Conditions = []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 30}}
	_, ok := src.ApplyRow(site, caster, 1, 0)
	require.True(t, ok)

	caster.level = 29 // whatever the price was, it is no longer met

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}

	assert.Zero(t, conn.ascendCalls, "the completion re-judge is what refuses it")
	assert.Nil(t, caster.sc.PendingAscension)
}

// ⛑ FAIL CLOSED. A pick carrying no gate at all is not an ungated site — it is a
// pick nobody priced, which is what a stash branch that forgot the site would
// produce and what a crafted one would carry. It must never ascend.
func TestAscension_APickWithNoPriceIsRefused(t *testing.T) {
	caster, conn, _, sk := ascensionChannelSetup(t, nil)
	caster.sc.PendingAscension = &skills.AscensionPick{Key: "FrostShield"}
	caster.sc.StartUtilityCast(skills.UtilityAscend)

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}

	assert.Zero(t, conn.ascendCalls)
	assert.Nil(t, caster.sc.PendingAscension)
}

// ⚑ Walking away is the escape hatch P7 buys, and it works through the ORDINARY
// cast cancel: movement cancels every cast unconditionally (core/input.go), and
// CancelCast clears the pick with it.
func TestAscension_CancellingTheChannelClearsThePickAndAscendsNobody(t *testing.T) {
	caster, conn, src, sk := ascensionChannelSetup(t, nil)
	_, ok := src.ApplyRow(catalogNode(), caster, 1, 0)
	require.True(t, ok)
	sk.Update(33.0)

	caster.sc.CancelCast() // what walking away does

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}
	assert.Zero(t, conn.ascendCalls)
	assert.Nil(t, caster.sc.PendingAscension)
}

// ⭐ A UTILITY PRESS CANNOT START THE CEREMONY. UseUtility is an argument-free
// global keypress; the client never sends this kind, so one arriving is crafted.
// Dropping it silently is the same stance every other crafted row gets.
//
// ⚑ It is dropped BEFORE the queue's cancel-the-running-cast step, so a crafted
// press cannot be used to interfere with a cast either.
func TestAscension_ACraftedUtilityPressStartsNothing(t *testing.T) {
	caster, conn, _, sk := ascensionChannelSetup(t, nil)

	caster.sc.RequestUtilityCast(skills.UtilityAscend)
	sk.Update(33.0) // the one update that PROCESSES the press

	// ⚑ Asserted here, not after the channel would have elapsed. An earlier
	// draft checked IsCasting() at the end of the full 301 updates, by which
	// time a wrongly-started channel has finished anyway: the test passed with
	// the guard deleted and proved nothing.
	assert.False(t, caster.sc.IsCasting(), "the press must not start a channel at all")
	assert.Nil(t, caster.sc.PendingAscension)
	assert.Empty(t, caster.rejections, "silent, like every other stale or crafted click")

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}
	assert.Zero(t, conn.ascendCalls)
}

// ⭐ And it cannot be used to CANCEL somebody's other cast either, which is what
// the guard's POSITION buys: it sits above the queue's cancel-the-running-cast
// step, so a crafted ascend press is dropped before it can touch anything.
//
// ⚑ Recall is the vehicle rather than another ascension channel, deliberately:
// re-pressing the utility that is already casting is ignored by an older rule,
// so an ascend-on-ascend press cannot tell the guard's presence from its
// absence. A DIFFERENT running cast can.
func TestAscension_ACraftedPressCannotCancelAnotherCast(t *testing.T) {
	caster, _, _, sk := ascensionChannelSetup(t, nil)
	caster.sc.RequestUtilityCast(skills.UtilityRecall)
	sk.Update(33.0)
	require.Equal(t, skills.UtilityRecall, caster.sc.CastingUtility)

	caster.sc.RequestUtilityCast(skills.UtilityAscend)
	sk.Update(33.0)

	assert.True(t, caster.sc.IsCasting(), "the recall survives a crafted ascend press")
	assert.Equal(t, skills.UtilityRecall, caster.sc.CastingUtility)
}

// Without the seam wired there is no world to ascend into, so completion does
// nothing rather than panicking. A sim or a test world is exactly this state.
func TestAscension_NoConnStateMeansNoAscension(t *testing.T) {
	caster, _, src, sk := ascensionChannelSetup(t, nil)
	sk.SetConnState(nil)
	_, ok := src.ApplyRow(catalogNode(), caster, 1, 0)
	require.True(t, ok)

	for i := 0; i < ascendCastUpdates; i++ {
		sk.Update(33.0)
	}
	assert.Nil(t, caster.sc.PendingAscension)
}

// --- ValidatePick, the seam the completion check runs through ----------------

func TestAscensionRows_ValidatePick(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{"Paralyze": ascensionGate(3)}
	src := newAscensionRows(testCatalog(gates))

	assert.True(t, src.ValidatePick(newAscensionLearner(30), "FrostShield"))
	assert.True(t, src.ValidatePick(newAscensionLearner(30), ""), "D14's empty pick is always legitimate")
	assert.False(t, src.ValidatePick(newAscensionLearner(30, "FrostShield"), "FrostShield"),
		"already spent by this bloodline")
	assert.False(t, src.ValidatePick(newAscensionLearner(30), "Paralyze"), "its gate has not passed")
	assert.False(t, src.ValidatePick(newAscensionLearner(30), "NoSuchReward"), "not in the catalog at all")
}
