package sys

// The ascension catalog as conversation rows (plan-ascension.md §12.4 C2a
// step 3): the first real RowSource, and the one the whole loop is reached
// through.

import (
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

var (
	rewardFrost    = &skills.SkillDefinition{ID: 137, Name: "FrostShield", MaxLevel: 5}
	rewardParalyze = &skills.SkillDefinition{ID: 140, Name: "Paralyze", MaxLevel: 5}
	rewardEmber    = &skills.SkillDefinition{ID: 141, Name: "EmberWard", MaxLevel: 5}
)

// testCatalog builds a catalog in All()'s guaranteed order (sorted by unlock
// key), so a test can name an index and mean it: EmberWard 0, FrostShield 1,
// Paralyze 2.
func testCatalog(gates map[string][]mobs.InteractionCondition) ascension.Catalog {
	return ascension.CatalogOf(
		ascension.Entry{UnlockKey: "EmberWard", Skill: rewardEmber, Conditions: gates["EmberWard"]},
		ascension.Entry{UnlockKey: "FrostShield", Skill: rewardFrost, Conditions: gates["FrostShield"]},
		ascension.Entry{UnlockKey: "Paralyze", Skill: rewardParalyze, Conditions: gates["Paralyze"]},
	)
}

func newAscensionLearner(level uint32, spent ...string) *fakeLearner {
	l := newLearner(level)
	l.bloodline = spent
	return l
}

func rowByText(rows []model.ConversationOption, needle string) (model.ConversationOption, bool) {
	for _, r := range rows {
		if strings.Contains(r.Text, needle) {
			return r, true
		}
	}
	return model.ConversationOption{}, false
}

// --- what the list contains -------------------------------------------------

// ⭐ THE FILTER READS SPENT UNLOCK KEYS, NOT THE SPELLBOOK, and this is the pin
// for §12.1 finding 4. FrostShield is a Troll drop: a player can know it from
// the world without their bloodline ever having bought it, and filtering on
// HasDiscovered would hide a reward they are still owed. The two are different
// questions about the same skill.
func TestAscensionRows_FiltersOnSpentKeysNotTheSpellbook(t *testing.T) {
	src := newAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	p.sc.Discover(rewardFrost.ID) // learned in the world, never bought

	rows := src.PresentRows(mobs.RowSourceAscensionCatalog, p)

	_, found := rowByText(rows, "Frost Shield")
	assert.True(t, found, "a skill learned in the world is not a spent unlock")
}

func TestAscensionRows_OmitsWhatThisBloodlineAlreadySpent(t *testing.T) {
	src := newAscensionRows(testCatalog(nil))

	rows := src.PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30, "FrostShield"))

	_, found := rowByText(rows, "Frost Shield")
	assert.False(t, found, "P4: a taken entry leaves this bloodline's catalog forever")
	_, found = rowByText(rows, "Paralyze")
	assert.True(t, found)
}

// ⭐ The index is the entry's position in All(), the boot-stable sorted list,
// NOT its position in the filtered list. A filtered list renumbers itself every
// time the bloodline spends something, so a row's index would name a different
// reward after every ascension.
func TestAscensionRows_IndicesAreCatalogPositionsAndSurviveFiltering(t *testing.T) {
	src := newAscensionRows(testCatalog(nil))

	rows := src.PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30, "EmberWard"))

	frost, ok := rowByText(rows, "Frost Shield")
	require.True(t, ok)
	assert.EqualValues(t, 1, frost.OptionIndex, "FrostShield is All()[1] whether or not EmberWard is spent")
	paralyze, ok := rowByText(rows, "Paralyze")
	require.True(t, ok)
	assert.EqualValues(t, 2, paralyze.OptionIndex)
}

// ⭐ §12.7 finding 1: 255 means "navigation row" to the client and
// Conversation.ts refuses to SEND such a row, so a pickable row carrying the
// sentinel is walked locally and never reaches the server. Every Go test on the
// path stays green while the feature dead-ends inside the panel.
func TestAscensionRows_NoRowCarriesTheNoGrantSentinel(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"Paralyze": {{Kind: mobs.ConditionMinLevel, Value: 99}},
	}
	rows := newAscensionRows(testCatalog(gates)).PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30))

	require.NotEmpty(t, rows)
	for _, r := range rows {
		assert.NotEqual(t, model.ConversationNoGrant, r.GrantIndex,
			"row %q would never be sent by the client", r.Text)
	}
}

func TestAscensionRows_ServesNothingForAKindItDoesNotOwn(t *testing.T) {
	src := newAscensionRows(testCatalog(nil))

	assert.Nil(t, src.PresentRows(mobs.RowSourceKind("graveyard"), newAscensionLearner(30)))
	_, ok := src.ApplyRow(mobs.RowSourceKind("graveyard"), newAscensionLearner(30), 0, 0)
	assert.False(t, ok)
}

// --- gates (D18) ------------------------------------------------------------

func TestAscensionRows_AFailingGateLocksTheRowAndNamesIt(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"Paralyze": {{Kind: mobs.ConditionMinLevel, Value: 25}},
	}
	rows := newAscensionRows(testCatalog(gates)).PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(12))

	row, ok := rowByText(rows, "Paralyze")
	require.True(t, ok, "a gated entry is SHOWN locked, never hidden (D18)")
	assert.True(t, row.Locked)
	assert.Contains(t, row.Text, "25", "the gate is named")
	assert.Contains(t, row.Text, "12", "...and its progress")
	assert.Empty(t, row.Reply, "a locked row is inert and says nothing when clicked")
}

func TestAscensionRows_APassingGateIsAnOrdinaryPickableRow(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"Paralyze": {{Kind: mobs.ConditionMinLevel, Value: 25}},
	}
	rows := newAscensionRows(testCatalog(gates)).PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30))

	row, ok := rowByText(rows, "Paralyze")
	require.True(t, ok)
	assert.False(t, row.Locked)
	assert.NotEmpty(t, row.Reply)
}

// --- D14: the empty pick ----------------------------------------------------

// ⭐ An exhausted catalog STILL ASCENDS, so something has to present that row.
// It sits at a fixed index precisely because it is the one row whose position
// must not depend on how much content exists.
func TestAscensionRows_TheEmptyPickRowIsOfferedEvenWithNothingLeft(t *testing.T) {
	src := newAscensionRows(ascension.CatalogOf())

	rows := src.PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30))

	require.Len(t, rows, 1)
	assert.EqualValues(t, ascensionEmptyPickIndex, rows[0].OptionIndex)
	assert.False(t, rows[0].Locked)
}

// ⚑ P1 is the whole entry price, so a bloodline whose every remaining entry is
// LOCKED can still ascend. Hiding the row there would make max level not the
// whole price after all.
func TestAscensionRows_TheEmptyPickRowSurvivesAnAllLockedCatalog(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"EmberWard":   {{Kind: mobs.ConditionMinLevel, Value: 99}},
		"FrostShield": {{Kind: mobs.ConditionMinLevel, Value: 99}},
		"Paralyze":    {{Kind: mobs.ConditionMinLevel, Value: 99}},
	}
	rows := newAscensionRows(testCatalog(gates)).PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30))

	require.Len(t, rows, 4, "three locked rows plus the empty pick")
	assert.EqualValues(t, ascensionEmptyPickIndex, rows[3].OptionIndex)
	assert.False(t, rows[3].Locked)
}

// ⚑ The all-locked catalog is the venue on purpose: the empty pick is offered
// only when nothing is pickable, so applying it against a catalog with a real
// choice on screen would be applying a row that was never presented.
func TestAscensionRows_ApplyingTheEmptyPickStashesTheEmptyKey(t *testing.T) {
	src := newAscensionRows(testCatalog(map[string][]mobs.InteractionCondition{
		"EmberWard":   {{Kind: mobs.ConditionMinLevel, Value: 99}},
		"FrostShield": {{Kind: mobs.ConditionMinLevel, Value: 99}},
		"Paralyze":    {{Kind: mobs.ConditionMinLevel, Value: 99}},
	}))
	p := newAscensionLearner(30)

	_, ok := src.ApplyRow(mobs.RowSourceAscensionCatalog, p, ascensionEmptyPickIndex, 0)

	require.True(t, ok)
	require.NotNil(t, p.sc.PendingAscension)
	assert.Equal(t, "", *p.sc.PendingAscension, "RequestAscension takes \"\" as the empty pick (C1)")
}

// --- apply ------------------------------------------------------------------

func TestAscensionRows_ApplyStashesTheValidatedPick(t *testing.T) {
	src := newAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)

	reply, ok := src.ApplyRow(mobs.RowSourceAscensionCatalog, p, 1, 0) // FrostShield

	require.True(t, ok)
	assert.NotEmpty(t, reply)
	require.NotNil(t, p.sc.PendingAscension)
	assert.Equal(t, "FrostShield", *p.sc.PendingAscension)
}

func TestAscensionRows_ApplyRefusalsLeaveNothingStashed(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"Paralyze": {{Kind: mobs.ConditionMinLevel, Value: 99}},
	}
	for _, tc := range []struct {
		name   string
		player *fakeLearner
		option int
	}{
		{"an index past the catalog", newAscensionLearner(30), 7},
		{"a negative index", newAscensionLearner(30), -1},
		{"an entry this bloodline already spent", newAscensionLearner(30, "FrostShield"), 1},
		{"an entry whose gate has not passed", newAscensionLearner(30), 2},
		{"the empty pick while a real choice is on screen", newAscensionLearner(30), ascensionEmptyPickIndex},
	} {
		t.Run(tc.name, func(t *testing.T) {
			src := newAscensionRows(testCatalog(gates))

			_, ok := src.ApplyRow(mobs.RowSourceAscensionCatalog, tc.player, tc.option, 0)

			assert.False(t, ok)
			assert.Nil(t, tc.player.sc.PendingAscension, "a refused pick must never be left stashed")
		})
	}
}

// ⭐ The property the optimistic panel depends on, over the real source rather
// than a fake: everything shown can be taken, with the reply the panel already
// spoke, and everything locked is inert on both ends.
func TestAscensionRows_PresentAndApplyCannotDisagree(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{
		"EmberWard": {{Kind: mobs.ConditionMinLevel, Value: 20}},
		"Paralyze":  {{Kind: mobs.ConditionMinLevel, Value: 99}},
	}

	for _, level := range []uint32{1, 19, 20, 30} {
		for _, spent := range [][]string{nil, {"FrostShield"}, {"EmberWard", "FrostShield", "Paralyze"}} {
			rows := newAscensionRows(testCatalog(gates)).
				PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(level, spent...))

			for _, row := range rows {
				taker := newAscensionLearner(level, spent...)
				reply, ok := newAscensionRows(testCatalog(gates)).
					ApplyRow(mobs.RowSourceAscensionCatalog, taker, int(row.OptionIndex), int(row.GrantIndex))

				where := fmt.Sprintf("level %d, spent %v, row %q", level, spent, row.Text)
				if row.Locked {
					assert.False(t, ok, "%s: a locked row is inert", where)
					assert.Empty(t, row.Reply, "%s: the panel has nothing to speak for it", where)
					continue
				}
				require.True(t, ok, "%s: a presented row must always be acceptable", where)
				assert.Equal(t, row.Reply, reply, "%s: the panel already said this", where)
			}
		}
	}
}

// --- bloodline_ascensions at the evaluator (D18 tier B, C2a step 4) ---

func ascensionGate(n int) []mobs.InteractionCondition {
	return []mobs.InteractionCondition{{Kind: mobs.ConditionBloodlineAscensions, Value: n}}
}

func TestConditionsPass_BloodlineAscensions(t *testing.T) {
	for _, tc := range []struct {
		have, want int
		pass       bool
	}{
		{have: 0, want: 3, pass: false},
		{have: 2, want: 3, pass: false},
		{have: 3, want: 3, pass: true},
		{have: 9, want: 3, pass: true},
	} {
		p := newAscensionLearner(30)
		p.ascensions = tc.have
		assert.Equal(t, tc.pass, conditionsPass(ascensionGate(tc.want), p),
			"%d ascensions against a gate of %d", tc.have, tc.want)
	}
}

// ⭐ THE TIER-B PATH END TO END AT THE PANEL: a veteran-only reward is locked
// for a first life and pickable for a third, with the count named and its
// progress composed per player. C3 authors exactly this shape.
func TestAscensionRows_AVeteranGateLocksAndThenOpens(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{"Paralyze": ascensionGate(3)}

	first := newAscensionLearner(30)
	first.ascensions = 1
	row, ok := rowByText(newAscensionRows(testCatalog(gates)).
		PresentRows(mobs.RowSourceAscensionCatalog, first), "Paralyze")
	require.True(t, ok, "a gated entry is shown locked, never hidden")
	assert.True(t, row.Locked)
	assert.Contains(t, row.Text, "1/3", "the gate names its progress for this bloodline")

	veteran := newAscensionLearner(30)
	veteran.ascensions = 3
	row, ok = rowByText(newAscensionRows(testCatalog(gates)).
		PresentRows(mobs.RowSourceAscensionCatalog, veteran), "Paralyze")
	require.True(t, ok)
	assert.False(t, row.Locked, "the third ascension opens it")
	assert.NotEmpty(t, row.Reply)
}

// The refusal half: a locked veteran row cannot be taken by a crafted message
// either, because ApplyRow re-runs the same judgement.
func TestAscensionRows_AVeteranGateRefusesTheUntakeable(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{"Paralyze": ascensionGate(3)}
	p := newAscensionLearner(30)
	p.ascensions = 1

	_, ok := newAscensionRows(testCatalog(gates)).ApplyRow(mobs.RowSourceAscensionCatalog, p, 2, 0)

	assert.False(t, ok)
	assert.Nil(t, p.sc.PendingAscension)
}

// --- D21: the countdown confirm rides the row (C2a step 6) ------------------

// ⭐ Only a TAKEABLE row asks for a confirmation. A locked row is inert on both
// ends, so a countdown in front of it would be friction with nothing behind it.
func TestAscensionRows_TakeableRowsCarryTheConfirmCountdown(t *testing.T) {
	gates := map[string][]mobs.InteractionCondition{"Paralyze": ascensionGate(3)}
	rows := newAscensionRows(testCatalog(gates)).
		PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30))

	pick, ok := rowByText(rows, "Frost Shield")
	require.True(t, ok)
	assert.EqualValues(t, ascensionConfirmSeconds, pick.ConfirmSeconds,
		"an irreversible pick is held behind a countdown (D21)")

	locked, ok := rowByText(rows, "Paralyze")
	require.True(t, ok)
	assert.Zero(t, locked.ConfirmSeconds, "a locked row is inert; nothing to confirm")
}

// D14's row spends the character too, so it is held behind the same countdown.
func TestAscensionRows_TheEmptyPickIsHeldBehindTheCountdownToo(t *testing.T) {
	rows := newAscensionRows(ascension.CatalogOf()).
		PresentRows(mobs.RowSourceAscensionCatalog, newAscensionLearner(30))

	require.Len(t, rows, 1)
	assert.EqualValues(t, ascensionConfirmSeconds, rows[0].ConfirmSeconds)
}

// ⚑ Every OTHER row in the game stays at 0, which is what makes the field's
// default the "take it immediately" every existing conversation relies on.
func TestPresentOptions_OrdinaryRowsAskForNoConfirmation(t *testing.T) {
	rows := rowsOf(t, present(teachingInteraction([]string{"hi"},
		namedGrant(1, "Torch", 1, "light")), newLearner(10), noRows), "root")

	require.NotEmpty(t, rows)
	for _, r := range rows {
		assert.Zero(t, r.ConfirmSeconds, "row %q", r.Text)
	}
}
