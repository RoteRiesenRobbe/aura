package quests

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

const wolf = mobs.MobID(3)
const farmer = mobs.MobID(40)

// cullQuest is the plain two-stage shape: one objective stage, one terminal
// dialogue stage.
func cullQuest() *QuestDefinition {
	return &QuestDefinition{
		ID: "wolf-cull", Title: "The Wolf Cull",
		Stages: []*Stage{
			{ID: "cull", Journal: "Kill wolves.", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, Count: 3}}, Next: "report"},
			{ID: "report", Journal: "Report back."},
		},
	}
}

// branchQuest models D9: a dialogue stage with two outgoing edges authored on
// (future) conversation rows — registered here the way C2's interaction loader
// will register them.
func branchQuest() *QuestDefinition {
	q := &QuestDefinition{
		ID: "choice", Title: "The Choice",
		Stages: []*Stage{
			{ID: "choose", Journal: "Pick a side."},
			{ID: "a-end", Journal: "Sided with A."},
			{ID: "b-end", Journal: "Sided with B."},
		},
	}
	q.NoteDialogueEdgeFrom("choose")
	return q
}

func testLedger(t *testing.T, defs ...*QuestDefinition) *Ledger {
	t.Helper()
	r, err := NewRegistry(defs...)
	require.NoError(t, err)
	return NewLedger(r)
}

func TestLedger_KillCountsAreLifetime(t *testing.T) {
	l := NewLedger(nil) // counters must work with no quest registry at all (sim)
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	assert.Equal(t, uint64(2), l.KillCount(wolf))
	assert.Equal(t, uint64(0), l.KillCount(farmer))
}

func TestLedger_TalkedToIsASet(t *testing.T) {
	l := NewLedger(nil)
	assert.False(t, l.HasTalkedTo(farmer))
	l.NoteTalkedTo(farmer)
	l.NoteTalkedTo(farmer) // not edge-triggered: re-stamping is harmless
	assert.True(t, l.HasTalkedTo(farmer))
}

// D3: a veteran auto-completes on accept — the whole retroactive ruling.
func TestLedger_RetroactiveSatisfactionAtAccept(t *testing.T) {
	l := testLedger(t, cullQuest())
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteKill(wolf)

	require.NoError(t, l.Accept("wolf-cull"))

	path, running, completed := l.Progress("wolf-cull")
	assert.Equal(t, []string{"cull", "report"}, path, "the cascade walks every satisfied stage (L6: the path is stored)")
	assert.False(t, running)
	assert.True(t, completed)
}

func TestLedger_KillsAdvanceARunningQuest(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))

	l.NoteKill(wolf)
	l.NoteKill(wolf)
	path, running, completed := l.Progress("wolf-cull")
	assert.Equal(t, []string{"cull"}, path, "2 of 3 kills: still on the objective stage")
	assert.True(t, running)
	assert.False(t, completed)

	l.NoteKill(wolf)
	path, running, completed = l.Progress("wolf-cull")
	assert.Equal(t, []string{"cull", "report"}, path)
	assert.False(t, running)
	assert.True(t, completed)
}

func TestLedger_TalkToObjectiveAdvances(t *testing.T) {
	l := testLedger(t, &QuestDefinition{
		ID: "meet", Title: "Meet the Farmer",
		Stages: []*Stage{
			{ID: "go", Journal: "Find the farmer.", Objectives: []Objective{{Kind: ObjectiveTalkTo, Target: farmer, Count: 1}}, Next: "done"},
			{ID: "done", Journal: "Met."},
		},
	})
	require.NoError(t, l.Accept("meet"))

	l.NoteTalkedTo(farmer)

	_, _, completed := l.Progress("meet")
	assert.True(t, completed)
}

// A dialogue stage with outgoing edges is NOT terminal: entering it waits for
// an authored row (or the QUEST cheat) instead of completing the quest.
func TestLedger_DialogueStageWithEdgesWaits(t *testing.T) {
	l := testLedger(t, branchQuest())
	require.NoError(t, l.Accept("choice"))

	path, running, completed := l.Progress("choice")
	assert.Equal(t, []string{"choose"}, path)
	assert.True(t, running)
	assert.False(t, completed)
}

// D1/D9: the player's click chooses the edge; the untaken branch is gone.
func TestLedger_BranchEdgesExclusive(t *testing.T) {
	l := testLedger(t, branchQuest())
	require.NoError(t, l.Accept("choice"))

	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))

	path, _, completed := l.Progress("choice")
	assert.Equal(t, []string{"choose", "a-end"}, path)
	assert.True(t, completed)
	assert.Error(t, l.AdvanceDialogue("choice", "choose", "b-end"), "the quest is sealed; the other edge is dead")
}

func TestLedger_AdvanceDialogueValidation(t *testing.T) {
	l := testLedger(t, cullQuest(), branchQuest())
	require.NoError(t, l.Accept("choice"))

	assert.Error(t, l.AdvanceDialogue("no-such-quest", "a", "b"))
	assert.Error(t, l.AdvanceDialogue("choice", "a-end", "b-end"), "from is not the current stage")
	assert.Error(t, l.AdvanceDialogue("choice", "choose", "nowhere"), "to must be a stage of the quest")
	assert.Error(t, l.AdvanceDialogue("wolf-cull", "cull", "report"), "not running at all")

	require.NoError(t, l.Accept("wolf-cull"))
	assert.Error(t, l.AdvanceDialogue("wolf-cull", "cull", "report"),
		"an objective stage advances off its counters, never off a dialogue edge")
}

func TestLedger_OneShotRefusesReOffer(t *testing.T) {
	l := testLedger(t, branchQuest())
	require.NoError(t, l.Accept("choice"))
	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))

	assert.Error(t, l.Accept("choice"), "a finished one-shot stays finished (D13)")
}

func TestLedger_AcceptRefusedWhileRunning(t *testing.T) {
	l := testLedger(t, branchQuest())
	require.NoError(t, l.Accept("choice"))
	assert.Error(t, l.Accept("choice"))
}

func TestLedger_RepeatableReAcceptsAfterCompletion(t *testing.T) {
	q := branchQuest()
	q.Repeatable = true
	l := testLedger(t, q)
	require.NoError(t, l.Accept("choice"))
	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))

	require.NoError(t, l.Accept("choice"))

	path, running, completed := l.Progress("choice")
	assert.Equal(t, []string{"choose"}, path, "a fresh run starts a fresh path")
	assert.True(t, running)
	assert.True(t, completed, "the completed flag records history and never unsets")
}

// D13: abandon clears the path, leaves counters and the completed set, and the
// quest is offerable again — where the standing counters re-complete it
// instantly (the L10 shape C2's lint exists for).
func TestLedger_AbandonClearsPathLeavesCountersReOfferWorks(t *testing.T) {
	l := testLedger(t, cullQuest())
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	require.NoError(t, l.Accept("wolf-cull")) // completes retroactively
	_, _, completed := l.Progress("wolf-cull")
	require.True(t, completed)

	l2 := testLedger(t, cullQuest(), branchQuest())
	require.NoError(t, l2.Accept("choice"))
	require.NoError(t, l2.Accept("wolf-cull"))
	l2.NoteKill(wolf)
	require.NoError(t, l2.Abandon("wolf-cull"))

	path, running, wolfDone := l2.Progress("wolf-cull")
	assert.Empty(t, path, "the stage path (and with it the diary) is gone")
	assert.False(t, running)
	assert.False(t, wolfDone)
	assert.Equal(t, uint64(1), l2.KillCount(wolf), "lifetime counters survive abandon")
	choicePath, choiceRunning, _ := l2.Progress("choice")
	assert.Equal(t, []string{"choose"}, choicePath, "abandoning one quest leaves the others alone")
	assert.True(t, choiceRunning)

	require.NoError(t, l2.Accept("wolf-cull"))
	l2.NoteKill(wolf)
	l2.NoteKill(wolf)
	_, _, wolfDone = l2.Progress("wolf-cull")
	assert.True(t, wolfDone, "re-accepted quest completes against the lifetime counters")
}

func TestLedger_AbandonValidation(t *testing.T) {
	l := testLedger(t, branchQuest())
	assert.Error(t, l.Abandon("choice"), "not running")
	assert.Error(t, l.Abandon("no-such-quest"))

	require.NoError(t, l.Accept("choice"))
	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))
	assert.Error(t, l.Abandon("choice"), "a completed quest cannot be abandoned (D13: completion is forever)")
}

func TestLedger_AcceptUnknownQuest(t *testing.T) {
	l := testLedger(t, cullQuest())
	assert.Error(t, l.Accept("no-such-quest"))

	assert.Error(t, NewLedger(nil).Accept("wolf-cull"), "a nil registry offers nothing")
}

// --- MatchesStage: what a quest_at_stage condition asks (C2, L15) ---

func TestLedger_MatchesStage_NotStarted(t *testing.T) {
	l := testLedger(t, cullQuest())

	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageNotStarted),
		"an untouched quest is not started")
	assert.False(t, l.MatchesStage("wolf-cull", "cull"))
	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageCompleted))

	require.NoError(t, l.Accept("wolf-cull"))
	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageNotStarted),
		"...and stops being once accepted — this is what hides an offer row")
}

// D13: abandoning returns the quest to not-started, so the offer comes back.
func TestLedger_MatchesStage_AbandonedIsNotStarted(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))
	require.NoError(t, l.Abandon("wolf-cull"))

	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageNotStarted))
	assert.False(t, l.MatchesStage("wolf-cull", "cull"))
}

func TestLedger_MatchesStage_CurrentStageOnly(t *testing.T) {
	l := testLedger(t, branchQuest())
	require.NoError(t, l.Accept("choice"))

	assert.True(t, l.MatchesStage("choice", "choose"), "the stage the player is standing on")
	assert.False(t, l.MatchesStage("choice", "a-end"), "not a stage they might reach")

	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))
	assert.False(t, l.MatchesStage("choice", "choose"), "a walked-past stage no longer matches")
}

// ⚑ A completed quest matches `completed` and NOT its terminal stage id, so the
// two are unambiguous: a turn-in row gated on the terminal stage would otherwise
// stay clickable forever after the quest ended.
func TestLedger_MatchesStage_CompletedIsNotItsTerminalStage(t *testing.T) {
	l := testLedger(t, cullQuest())
	for i := 0; i < 3; i++ {
		l.NoteKill(wolf)
	}
	require.NoError(t, l.Accept("wolf-cull"))

	_, running, completed := l.Progress("wolf-cull")
	require.False(t, running)
	require.True(t, completed)

	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageCompleted))
	assert.False(t, l.MatchesStage("wolf-cull", "report"), "completed, not standing on the terminal stage")
	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageNotStarted))
}

// The evaluator calls this per tick per conversing player, so it must tolerate
// the states a fixture or a quest-less world can be in rather than panicking
// somewhere inside a render path.
func TestLedger_MatchesStage_DegradesSafely(t *testing.T) {
	assert.False(t, (*Ledger)(nil).MatchesStage("wolf-cull", mobs.QuestStageNotStarted),
		"a nil ledger fails closed")
	assert.True(t, NewLedger(nil).MatchesStage("wolf-cull", mobs.QuestStageNotStarted),
		"a registry-less ledger has genuinely started nothing")
	assert.False(t, testLedger(t, cullQuest()).MatchesStage("wolf-cull", "no-such-stage"),
		"an unknown stage name matches nothing (the loader rejects one at boot)")
}

func TestLedger_ProgressOfUntouchedQuest(t *testing.T) {
	l := testLedger(t, cullQuest())
	path, running, completed := l.Progress("wolf-cull")
	assert.Empty(t, path)
	assert.False(t, running)
	assert.False(t, completed)
}
