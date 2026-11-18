package sys

// The ascension ceremony (plan-ascension-ceremony.md AC1): a gift pick is only
// remembered, the summary lists it, and the summary's Confirm is the one thing
// that starts the channel.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// inCeremony wraps step nodes in a ceremony the way the loader does
// (mobs.mapCeremony) and returns its summary, which carries the first step's
// gate.
func inCeremony(steps ...*mobs.InteractionNode) *mobs.InteractionNode {
	summary := &mobs.InteractionNode{ID: mobs.CeremonySummaryNodeID, Gate: steps[0].Gate,
		Rows: mobs.RowSourceAscensionSummary}
	c := &mobs.Ceremony{Steps: steps, Summary: summary}
	summary.Ceremony = c
	for _, s := range steps {
		s.Ceremony = c
	}
	return summary
}

// pickAndConfirm is the walk the client makes: a gift row, then the summary's
// Confirm.
func pickAndConfirm(t *testing.T, src RowSource, step *mobs.InteractionNode, p learner, option int) bool {
	t.Helper()
	summary := inCeremony(step)
	if _, ok := src.ApplyRow(step, p, option, 0); !ok {
		return false
	}
	_, ok := src.ApplyRow(summary, p, summaryConfirmIndex, 0)
	return ok
}

func confirmRow(rows []model.ConversationOption) (model.ConversationOption, bool) {
	for _, r := range rows {
		if r.OptionIndex == summaryConfirmIndex && !r.Locked {
			return r, true
		}
	}
	return model.ConversationOption{}, false
}

func walledGates() map[string]mobs.Gate {
	wall := mobs.Gate{Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 99}}}
	return map[string]mobs.Gate{"EmberWard": wall, "FrostShield": wall, "Paralyze": wall}
}

// --- a pick is only remembered ---------------------------------------------

// ⭐ L3: the gift click no longer starts the channel. A click that still
// channelled would ascend with a half draft.
func TestCeremony_AGiftPickStartsNothing(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNode()
	inCeremony(step)

	reply, ok := src.ApplyRow(step, p, 1, 0) // FrostShield
	require.True(t, ok)

	assert.Equal(t, "Frost Shield it is.", reply, "no promise of a channel that has not started")
	assert.False(t, p.sc.IsCasting())
	assert.Nil(t, p.sc.PendingAscension, "nothing is stashed before Confirm")
	assert.Equal(t, []skills.StepPick{{Step: step.ID, Kind: string(mobs.RowSourceAscensionCatalog), Key: "FrostShield"}},
		p.CeremonyDraft().Picks)
}

// D4: Back and re-pick simply overwrite, one entry per step.
func TestCeremony_RePickingAStepOverwritesItsPick(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNode()
	inCeremony(step)

	_, ok := src.ApplyRow(step, p, 1, 0)
	require.True(t, ok)
	_, ok = src.ApplyRow(step, p, 0, 0) // EmberWard
	require.True(t, ok)

	require.Len(t, p.CeremonyDraft().Picks, 1)
	assert.Equal(t, "EmberWard", p.CeremonyDraft().Picks[0].Key)
}

// The gift rows lead to the summary, and lose the countdown the summary's
// Confirm now carries (D6).
func TestCeremony_GiftRowsLeadToTheSummaryWithNoCountdown(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	step := catalogNode()
	inCeremony(step)

	rows := src.PresentRows(step, newAscensionLearner(30))
	require.NotEmpty(t, rows)
	for _, r := range rows {
		assert.Equal(t, mobs.CeremonySummaryNodeID, r.Next, r.Text)
		assert.Zero(t, r.ConfirmSeconds, r.Text)
	}

	// The empty pick too (D14), with a reply that promises nothing.
	rows = NewAscensionRows(testCatalog(walledGates())).PresentRows(step, newAscensionLearner(30))
	empty, ok := rowByText(rows, "take no reward")
	require.True(t, ok)
	assert.Equal(t, mobs.CeremonySummaryNodeID, empty.Next)
	assert.Zero(t, empty.ConfirmSeconds)
	assert.Equal(t, "No gift, then.", empty.Reply)

	// A locked row leads nowhere.
	for _, r := range rows {
		if r.Locked {
			assert.Empty(t, r.Next, r.Text)
		}
	}
}

// --- the summary --------------------------------------------------------------

func TestCeremony_TheSummaryListsThePickThenConfirm(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNode()
	summary := inCeremony(step)

	// Before a pick there is nothing to confirm.
	assert.Empty(t, src.PresentRows(summary, p), "no line and no Confirm for an empty draft")

	_, ok := src.ApplyRow(step, p, 1, 0)
	require.True(t, ok)
	rows := src.PresentRows(summary, p)
	require.Len(t, rows, 2)

	line := rows[0]
	assert.True(t, line.Locked, "a summary line is inert")
	assert.Equal(t, "Gift: Frost Shield", line.Text)
	assert.Equal(t, "conversation.ascend.summary.gift", line.TextKey)
	assert.Equal(t, uint16(rewardFrost.ID), line.SkillID, "the client words it from the id")

	confirm := rows[1]
	assert.Equal(t, uint8(summaryConfirmIndex), confirm.OptionIndex)
	assert.NotEqual(t, model.ConversationNoGrant, confirm.GrantIndex, "the client must send it")
	assert.Equal(t, uint8(ascensionConfirmSeconds), confirm.ConfirmSeconds, "the countdown moved here")
	assert.False(t, confirm.Locked)
}

// An exhausted bloodline still ascends, and the summary says so (AC1's look).
func TestCeremony_TheEmptyPickReadsAsNoGift(t *testing.T) {
	src := NewAscensionRows(testCatalog(walledGates()))
	p := newAscensionLearner(30)
	step := catalogNode()
	summary := inCeremony(step)

	_, ok := src.ApplyRow(step, p, ascensionEmptyPickIndex, 0)
	require.True(t, ok)
	rows := src.PresentRows(summary, p)
	require.Len(t, rows, 2)
	assert.Equal(t, "Gift: none", rows[0].Text)
	assert.Equal(t, "conversation.ascend.summary.no-gift", rows[0].TextKey)
	assert.Zero(t, rows[0].SkillID)
}

// --- Confirm -----------------------------------------------------------------

func TestCeremony_ConfirmStashesTheDraftAndStartsTheChannel(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNode()
	step.Gate = mobs.Gate{Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 30}}}
	step.BonusLooks = []string{"elder"}

	require.True(t, pickAndConfirm(t, src, step, p, 1))

	assert.Equal(t, skills.UtilityAscend, p.sc.CastingUtility)
	pick := p.sc.PendingAscension
	require.NotNil(t, pick)
	assert.Equal(t, []skills.StepPick{{Step: step.ID, Kind: string(mobs.RowSourceAscensionCatalog), Key: "FrostShield"}},
		pick.Picks)
	assert.Equal(t, step.Gate, pick.Gate, "the stone's price rides along, mode and all")
	assert.Equal(t, []string{"elder"}, pick.BonusLooks, "the stone's bonus still rides the stash (C5b)")
}

// Confirm refuses an empty draft: a crafted summary click with nothing picked
// is not the empty pick.
func TestCeremony_ConfirmRefusesADraftWithNoGift(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	summary := inCeremony(catalogNode())

	_, ok := src.ApplyRow(summary, p, summaryConfirmIndex, 0)
	assert.False(t, ok)
	assert.False(t, p.sc.IsCasting())
	assert.Nil(t, p.sc.PendingAscension)
}

func TestCeremony_ConfirmRefusesAnyOtherIndex(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNode()
	summary := inCeremony(step)
	_, ok := src.ApplyRow(step, p, 1, 0)
	require.True(t, ok)

	for _, index := range []int{0, 1, 253, 255} {
		_, ok := src.ApplyRow(summary, p, index, 0)
		assert.False(t, ok, "index %d", index)
	}
	assert.False(t, p.sc.IsCasting())
}

// ⭐ D9 at Confirm: a pick that stopped standing between its click and the
// Confirm is refused, and the summary stops offering Confirm in the same breath
// (present and apply agree, L24).
func TestCeremony_APickSpentBeforeConfirmIsRefused(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNode()
	summary := inCeremony(step)
	_, ok := src.ApplyRow(step, p, 1, 0)
	require.True(t, ok)

	p.bloodline = []string{"FrostShield"} // spent elsewhere in the meantime

	_, offered := confirmRow(src.PresentRows(summary, p))
	assert.False(t, offered, "no Confirm for a pick that no longer stands")
	_, ok = src.ApplyRow(summary, p, summaryConfirmIndex, 0)
	assert.False(t, ok)
	assert.Nil(t, p.sc.PendingAscension)
}

// ⭐ Confirm judges THIS stone's list, not the catalog: a drafted key the
// stone does not offer is refused even though the catalog holds it.
func TestCeremony_ConfirmRefusesAKeyThisStoneDoesNotOffer(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	step := catalogNodeOffering("EmberWard")
	summary := inCeremony(step)
	p.CeremonyDraft().Set(skills.StepPick{Step: step.ID, Kind: string(step.Rows), Key: "FrostShield"})

	_, ok := src.ApplyRow(summary, p, summaryConfirmIndex, 0)
	assert.False(t, ok)
	assert.Nil(t, p.sc.PendingAscension)
}

// The empty pick stands only while nothing is pickable: a reward that opened
// up after the empty pick was drafted refuses it at Confirm.
func TestCeremony_TheEmptyPickIsRefusedOnceSomethingIsPickable(t *testing.T) {
	gates := map[string]mobs.Gate{
		"EmberWard":   {Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 31}}},
		"FrostShield": walledGates()["FrostShield"],
		"Paralyze":    walledGates()["Paralyze"],
	}
	src := NewAscensionRows(testCatalog(gates))
	p := newAscensionLearner(30)
	step := catalogNode()
	summary := inCeremony(step)
	_, ok := src.ApplyRow(step, p, ascensionEmptyPickIndex, 0)
	require.True(t, ok)

	p.level = 31 // EmberWard opens

	_, ok = src.ApplyRow(summary, p, summaryConfirmIndex, 0)
	assert.False(t, ok)
}

// --- steps that offer nothing are skipped (D5) --------------------------------

// fakeStep is a second step kind for the skip rule; the gift step always
// offers at least its empty pick, so it can never be the one skipped.
type fakeStep struct{ rows []model.ConversationOption }

const fakeStepKind mobs.RowSourceKind = "fake_step"

func (f *fakeStep) PresentRows(*mobs.InteractionNode, learner) []model.ConversationOption {
	return append([]model.ConversationOption(nil), f.rows...)
}
func (f *fakeStep) ApplyRow(node *mobs.InteractionNode, p learner, option, _ int) (string, bool) {
	p.CeremonyDraft().Set(skills.StepPick{Step: node.ID, Kind: string(node.Rows), Key: "x"})
	return "", true
}
func (f *fakeStep) stillPickable(*mobs.InteractionNode, learner, string) bool { return true }
func (f *fakeStep) validate(learner, string) bool                             { return true }
func (f *fakeStep) grant(string, *persist.AscensionRequest)                   {}
func (f *fakeStep) summaryLine(index int, key string) model.ConversationOption {
	return model.ConversationOption{OptionIndex: uint8(index), Locked: true, Text: "Fake: " + key}
}

func TestCeremony_AStepThatOffersNothingIsSkipped(t *testing.T) {
	c := newAscensionCeremony(newAscensionRows(testCatalog(nil)))
	empty, offering := &fakeStep{}, &fakeStep{rows: []model.ConversationOption{{Text: "a look"}}}
	gift := catalogNode()
	gift.ID = "gift"
	skipped := &mobs.InteractionNode{ID: "skipped", Rows: fakeStepKind}
	gated := &mobs.InteractionNode{ID: "gated", Rows: fakeStepKind,
		Gate: mobs.Gate{Conditions: []mobs.InteractionCondition{{Kind: mobs.ConditionMinLevel, Value: 99}}}}
	look := &mobs.InteractionNode{ID: "look", Rows: fakeStepKind}
	summary := inCeremony(gift, skipped, gated, look)
	p := newAscensionLearner(30)

	// One fake kind cannot be both empty and offering, so it routes per node.
	c.steps[fakeStepKind] = &routedStep{by: map[string]ceremonyStep{
		"skipped": empty, "gated": offering, "look": offering}}

	rows := c.PresentRows(gift, p)
	require.NotEmpty(t, rows)
	assert.Equal(t, "look", rows[0].Next, "an empty step and a gated step are both skipped")

	rows = c.PresentRows(look, p)
	assert.Equal(t, mobs.CeremonySummaryNodeID, rows[0].Next, "the last shown step leads to the summary")

	_, ok := c.ApplyRow(gift, p, 1, 0)
	require.True(t, ok)
	_, ok = c.ApplyRow(look, p, 0, 0)
	require.True(t, ok)
	lines := c.PresentRows(summary, p)
	require.Len(t, lines, 3, "two lines (gift, look) and Confirm: skipped steps leave no line")
	assert.Equal(t, "Gift: Frost Shield", lines[0].Text)
	assert.Equal(t, "Fake: x", lines[1].Text)
}

// routedStep dispatches the fake kind per node id.
type routedStep struct{ by map[string]ceremonyStep }

func (r *routedStep) PresentRows(n *mobs.InteractionNode, p learner) []model.ConversationOption {
	return r.by[n.ID].PresentRows(n, p)
}
func (r *routedStep) ApplyRow(n *mobs.InteractionNode, p learner, o, g int) (string, bool) {
	return r.by[n.ID].ApplyRow(n, p, o, g)
}
func (r *routedStep) stillPickable(n *mobs.InteractionNode, p learner, k string) bool {
	return r.by[n.ID].stillPickable(n, p, k)
}
func (r *routedStep) validate(p learner, k string) bool       { return true }
func (r *routedStep) grant(string, *persist.AscensionRequest) {}
func (r *routedStep) summaryLine(i int, k string) model.ConversationOption {
	return (&fakeStep{}).summaryLine(i, k)
}

// --- completion (D9) ------------------------------------------------------------

func TestCeremony_CompletionBuildsTheGrantsFromEveryPick(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	p := newAscensionLearner(30)
	req, ok := src.CompleteAscension(p, &skills.AscensionPick{Picks: []skills.StepPick{
		{Step: "catalog", Kind: string(mobs.RowSourceAscensionCatalog), Key: "FrostShield"},
	}})
	require.True(t, ok)
	assert.Equal(t, "FrostShield", req.UnlockKey)
}

func TestCeremony_CompletionRefusesAStashWithNoPicks(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	_, ok := src.CompleteAscension(newAscensionLearner(30), &skills.AscensionPick{})
	assert.False(t, ok, "a stash nobody confirmed fails closed")
	_, ok = src.CompleteAscension(newAscensionLearner(30), nil)
	assert.False(t, ok)
}

func TestCeremony_CompletionRefusesAnUnknownKind(t *testing.T) {
	src := NewAscensionRows(testCatalog(nil))
	_, ok := src.CompleteAscension(newAscensionLearner(30), &skills.AscensionPick{Picks: []skills.StepPick{
		{Step: "x", Kind: "nobody", Key: "FrostShield"},
	}})
	assert.False(t, ok)
}
