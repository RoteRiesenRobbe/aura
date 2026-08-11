package quests

// Cross-validation between the two registries (plan-quests.md C2): the quest
// references authored on conversation rows.
//
// ⚑ Why this is a separate pass and not part of the mob loader: mobs load BEFORE
// quests, because quest objectives resolve species NAMES against the mob registry
// (L12). So at the moment mapToInteraction runs, no quest exists to check
// against. This pass runs once both registries stand — which is also the only
// point at which terminality is knowable at all, since a stage is terminal iff
// NOTHING anywhere advances out of it.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// fakeConversants is the slice of mobs.Registry this pass reads.
type fakeConversants []*mobs.MobDefinition

func (f fakeConversants) Mobs() []*mobs.MobDefinition { return f }

// conversant wraps grants into the smallest mob carrying one node with one
// option, which is the shape every quest row has.
func conversant(name string, opt mobs.InteractionOption) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		Name: name,
		Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{{
			ID:      "root",
			Lines:   []string{"hello"},
			Options: []mobs.InteractionOption{opt},
		}}},
	}
}

func offerRow(quest string) mobs.InteractionOption {
	return mobs.InteractionOption{Text: "I'll help.", Grants: []mobs.InteractionGrant{
		{Kind: mobs.GrantOfferQuest, Quest: quest, Line: "Then go."},
	}}
}

func advanceRow(quest, from, to string, extra ...mobs.InteractionGrant) mobs.InteractionOption {
	grants := []mobs.InteractionGrant{
		{Kind: mobs.GrantAdvanceQuest, Quest: quest, FromStage: from, ToStage: to, Line: "My thanks."},
	}
	return mobs.InteractionOption{Text: "Here you are.", Grants: append(grants, extra...)}
}

// threeStage is the quest shape C4 authors: an objective stage, a dialogue stage
// that waits for a turn-in row, and a terminal stage.
func threeStage() *QuestDefinition {
	return &QuestDefinition{
		ID: "pelts", Title: "Pelts",
		Stages: []*Stage{
			{ID: "hunt", Journal: "Hunt wolves.", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, Count: 3}}, Next: "turn_in"},
			{ID: "turn_in", Journal: "Bring the pelts back."},
			{ID: "done", Journal: "Done."},
		},
	}
}

func crossValidate(t *testing.T, defs []*QuestDefinition, mobDefs ...*mobs.MobDefinition) ([]string, error) {
	t.Helper()
	qr, err := NewRegistry(defs...)
	require.NoError(t, err)
	return CrossValidate(fakeConversants(mobDefs), qr)
}

func TestCrossValidate_AcceptsAWellFormedQuest(t *testing.T) {
	warnings, err := crossValidate(t, []*QuestDefinition{threeStage()},
		conversant("Farmer", offerRow("pelts")),
		conversant("Hermit", advanceRow("pelts", "turn_in", "done")))

	require.NoError(t, err)
	assert.Empty(t, warnings)
}

func TestCrossValidate_RejectsAnUnknownQuest(t *testing.T) {
	_, err := crossValidate(t, []*QuestDefinition{threeStage()},
		conversant("Farmer", offerRow("no-such-quest")))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "no-such-quest")
	assert.Contains(t, err.Error(), "Farmer")
}

func TestCrossValidate_RejectsUnknownStages(t *testing.T) {
	for _, edge := range [][2]string{{"nowhere", "done"}, {"turn_in", "nowhere"}} {
		_, err := crossValidate(t, []*QuestDefinition{threeStage()},
			conversant("Hermit", advanceRow("pelts", edge[0], edge[1])))

		require.Error(t, err, "%v", edge)
		assert.Contains(t, err.Error(), "nowhere")
	}
}

// An objective stage advances off the lifetime counters, so a row claiming to
// move it would be a second, silent way out of the same stage.
func TestCrossValidate_RejectsAdvancingOutOfAnObjectiveStage(t *testing.T) {
	_, err := crossValidate(t, []*QuestDefinition{threeStage()},
		conversant("Hermit", advanceRow("pelts", "hunt", "done")))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "hunt")
}

// ⭐ The pass's real job: terminality is DERIVED, not authored (C1's shape
// decision ①). A dialogue stage is terminal iff nothing in the world advances out
// of it, which is knowable only after every row has been seen.
func TestCrossValidate_RegistersDialogueEdgesSoMidQuestStagesWait(t *testing.T) {
	q := threeStage()
	require.True(t, q.IsTerminal(q.Stage("turn_in")),
		"before any row is registered, a bare dialogue stage looks terminal")

	_, err := crossValidate(t, []*QuestDefinition{q},
		conversant("Hermit", advanceRow("pelts", "turn_in", "done")))
	require.NoError(t, err)

	assert.False(t, q.IsTerminal(q.Stage("turn_in")),
		"a row advances out of it, so entering it must WAIT, not complete the quest")
	assert.True(t, q.IsTerminal(q.Stage("done")), "and the stage nothing leaves still ends the quest")
}

// D9's proof, at load: two NPCs advancing the SAME stage to different ends is
// content, not a feature — so it must simply validate.
func TestCrossValidate_AcceptsTwoTurnInNPCsWithDifferentEnds(t *testing.T) {
	q := &QuestDefinition{
		ID: "choice", Title: "The Choice",
		Stages: []*Stage{
			{ID: "choose", Journal: "Pick a side."},
			{ID: "a-end", Journal: "Sided with A."},
			{ID: "b-end", Journal: "Sided with B."},
		},
	}

	_, err := crossValidate(t, []*QuestDefinition{q},
		conversant("Captain", advanceRow("choice", "choose", "a-end",
			mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 200, Line: "for the city"})),
		conversant("Shaman", advanceRow("choice", "choose", "b-end",
			mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 300, Line: "for the grove"})))

	require.NoError(t, err)
	assert.False(t, q.IsTerminal(q.Stage("choose")))
	assert.True(t, q.IsTerminal(q.Stage("a-end")))
	assert.True(t, q.IsTerminal(q.Stage("b-end")))
}

// L10's second half, which only this pass can see: abandoning leaves the lifetime
// counters standing, so an objective stage re-completes the instant the quest is
// re-accepted. Any grant_xp on a NON-terminal edge is therefore loopable — and
// the completed set, which abandon never touches, is what protects a terminal one.
func TestCrossValidate_RejectsGrantXPOnANonTerminalEdge(t *testing.T) {
	q := threeStage()
	// A fourth stage after `done` makes the turn_in → done edge non-terminal.
	q.Stages = append(q.Stages, &Stage{ID: "epilogue", Journal: "One last thing."})

	_, err := crossValidate(t, []*QuestDefinition{q},
		conversant("Hermit", advanceRow("pelts", "turn_in", "done",
			mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 250, Line: "take this"})),
		conversant("Farmer", advanceRow("pelts", "done", "epilogue")))

	require.Error(t, err)
	assert.Contains(t, err.Error(), "grant_xp")
}

func TestCrossValidate_AcceptsGrantXPOnATerminalEdge(t *testing.T) {
	_, err := crossValidate(t, []*QuestDefinition{threeStage()},
		conversant("Hermit", advanceRow("pelts", "turn_in", "done",
			mobs.InteractionGrant{Kind: mobs.GrantXP, XP: 250, Line: "take this"})))

	assert.NoError(t, err, "completion is protected by the completed set, which abandon never clears")
}

// --- quest_at_stage conditions ---

func conditionalConversant(name string, cond mobs.InteractionCondition) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		Name: name,
		Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{
			{ID: "gated", Conditions: []mobs.InteractionCondition{cond}, Lines: []string{"back already?"}},
			{ID: "root", Lines: []string{"hello"}},
		}},
	}
}

func TestCrossValidate_AcceptsQuestConditions(t *testing.T) {
	for _, stage := range []string{
		"turn_in", mobs.QuestStageNotStarted, mobs.QuestStageCompleted, mobs.QuestStageRunning,
	} {
		_, err := crossValidate(t, []*QuestDefinition{threeStage()},
			conditionalConversant("Farmer", mobs.InteractionCondition{
				Kind: mobs.ConditionQuestAtStage, Quest: "pelts", Stage: stage,
			}))
		assert.NoError(t, err, stage)
	}
}

func TestCrossValidate_RejectsAConditionOnAnUnknownQuestOrStage(t *testing.T) {
	cases := []mobs.InteractionCondition{
		{Kind: mobs.ConditionQuestAtStage, Quest: "no-such-quest", Stage: "turn_in"},
		{Kind: mobs.ConditionQuestAtStage, Quest: "pelts", Stage: "no-such-stage"},
	}
	for _, cond := range cases {
		_, err := crossValidate(t, []*QuestDefinition{threeStage()},
			conditionalConversant("Farmer", cond))
		require.Error(t, err, "%+v", cond)
	}
}

// A minLevel condition is none of this pass's business, and must not be dragged
// into it by a shared code path.
func TestCrossValidate_IgnoresNonQuestConditions(t *testing.T) {
	_, err := crossValidate(t, []*QuestDefinition{threeStage()},
		conditionalConversant("Farmer", mobs.InteractionCondition{Kind: mobs.ConditionMinLevel, Value: 10}))
	assert.NoError(t, err)
}

// --- dead content: warned about, not refused ---

// A quest nobody offers cannot be started in play (D11: quests start at
// conversants). It is a WARNING rather than a boot failure on purpose: the QUEST
// cheat drives a quest before its rows exist, which is exactly how C4 iterates.
func TestCrossValidate_WarnsAboutAQuestNobodyOffers(t *testing.T) {
	warnings, err := crossValidate(t, []*QuestDefinition{threeStage()},
		conversant("Hermit", advanceRow("pelts", "turn_in", "done")))

	require.NoError(t, err)
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "pelts")
}

// A dialogue stage no row leaves and that is not the quest's end is a dead end
// the player walks into and cannot leave — the counters never fire there, because
// a dialogue stage has no objectives.
func TestCrossValidate_WarnsAboutAnUnreachableDialogueDeadEnd(t *testing.T) {
	q := threeStage()
	q.Stages = append(q.Stages, &Stage{ID: "orphan", Journal: "Nothing leads out."})

	warnings, err := crossValidate(t, []*QuestDefinition{q},
		conversant("Farmer", offerRow("pelts")),
		conversant("Hermit", advanceRow("pelts", "turn_in", "done")))

	require.NoError(t, err)
	assert.Empty(t, warnings, "an unreferenced terminal stage is a legal branch end, not a defect")
}

// A conversant carrying no interaction at all must not trip the walk.
func TestCrossValidate_SkipsMobsWithoutAnInteraction(t *testing.T) {
	_, err := crossValidate(t, []*QuestDefinition{threeStage()},
		&mobs.MobDefinition{Name: "Wolf"},
		conversant("Farmer", offerRow("pelts")))
	assert.NoError(t, err)
}
