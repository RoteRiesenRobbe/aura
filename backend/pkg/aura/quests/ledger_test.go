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
			{ID: "cull", Journal: "Kill wolves.", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, TargetName: "Wolf", Count: 3}}, Next: "report"},
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

// lampQuest is the-lost-lamp's shape: an objective stage that walks into a
// dialogue turn-in stage, which is the only authored quest today that rests on
// TWO running stages. The dialogue edge is what keeps bring_it_back from being
// terminal, exactly as the interaction loader registers it at boot.
func lampQuest() *QuestDefinition {
	q := &QuestDefinition{
		ID: "lamp", Title: "The Lost Lamp",
		Stages: []*Stage{
			{ID: "cull", Journal: "Kill wolves.", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, TargetName: "Wolf", Count: 3}}, Next: "bring_it_back"},
			{ID: "bring_it_back", Journal: "Bring it back."},
			{ID: "lit", Journal: "Lit."},
		},
	}
	q.NoteDialogueEdgeFrom("bring_it_back")
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

// N4/D4 (plan-feel-pass-2.md §4, REVERSING plan-quests.md D3): every objective
// means "since this stage started". Counters stay lifetime — the baseline
// snapshot on the Progress entry is what turns them into per-stage progress.
func TestLedger_KillsBeforeAcceptanceDoNotCredit(t *testing.T) {
	// The old D3 ruling auto-completed a veteran on the spot; that reversal is
	// the point of N4, so the quest must now WAIT for three fresh kills.
	l := testLedger(t, cullQuest())
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteKill(wolf)

	require.NoError(t, l.Accept("wolf-cull"))

	path, running, completed := l.Progress("wolf-cull")
	assert.Equal(t, []string{"cull"}, path, "a veteran no longer auto-completes at accept")
	assert.True(t, running)
	assert.False(t, completed)

	// Fresh kills credit; the pre-acceptance three never do.
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	_, running, completed = l.Progress("wolf-cull")
	assert.True(t, running, "2 of 3 fresh kills")
	l.NoteKill(wolf)
	_, _, completed = l.Progress("wolf-cull")
	assert.True(t, completed, "3 fresh kills complete the stage")
}

func TestLedger_StageOneKillsDoNotCreditStageTwo(t *testing.T) {
	// D4 is per STAGE ENTRY, not per accept: kills during stage 1 do not
	// credit stage 2, even for the same species.
	l := testLedger(t, &QuestDefinition{
		ID: "double-cull", Title: "The Double Cull",
		Stages: []*Stage{
			{ID: "first", Journal: "Kill 2 wolves.", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, TargetName: "Wolf", Count: 2}}, Next: "second"},
			{ID: "second", Journal: "Kill 2 more.", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, TargetName: "Wolf", Count: 2}}, Next: "done"},
			{ID: "done", Journal: "Done."},
		},
	})
	require.NoError(t, l.Accept("double-cull"))

	// Overshoot stage 1 by one kill in the same credit stream: the third kill
	// lands AFTER stage 2 was entered (each NoteKill rechecks), so exactly one
	// of the three credits stage 2.
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteKill(wolf)

	path, running, _ := l.Progress("double-cull")
	assert.Equal(t, []string{"first", "second"}, path)
	assert.True(t, running)
	assert.Equal(t, []string{"1/2 Wolf slain"}, l.quests["double-cull"].Objectives,
		"stage 2 starts from its own entry, with the post-entry kill counted")

	l.NoteKill(wolf)
	_, _, completed := l.Progress("double-cull")
	assert.True(t, completed)
}

func TestLedger_AbandonAndReacceptRebaselines(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))
	l.NoteKill(wolf)
	l.NoteKill(wolf)

	require.NoError(t, l.Abandon("wolf-cull"))
	require.NoError(t, l.Accept("wolf-cull"))

	assert.Equal(t, []string{"0/3 Wolf slain"}, l.quests["wolf-cull"].Objectives,
		"re-accept re-baselines: the previous run's kills stop counting")
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	_, running, _ := l.Progress("wolf-cull")
	assert.True(t, running, "two fresh kills are not three")
}

func TestLedger_TalkToRequiresAFreshTalk(t *testing.T) {
	// D4's second half: an NPC already spoken to must be spoken to AGAIN once
	// the stage is entered — the lifetime set alone no longer satisfies.
	l := testLedger(t, &QuestDefinition{
		ID: "meet-again", Title: "Meet the Farmer Again",
		Stages: []*Stage{
			{ID: "go", Journal: "Find the farmer.", Objectives: []Objective{{Kind: ObjectiveTalkTo, Target: farmer, TargetName: "Farmer", Count: 1}}, Next: "done"},
			{ID: "done", Journal: "Met."},
		},
	})
	l.NoteTalkedTo(farmer) // known from long before the quest

	require.NoError(t, l.Accept("meet-again"))
	_, running, completed := l.Progress("meet-again")
	assert.True(t, running, "the old talk does not satisfy the fresh stage")
	assert.False(t, completed)
	assert.Equal(t, []string{"Talk to the Farmer"}, l.quests["meet-again"].Objectives,
		"no ✓ for a talk that predates the stage")

	l.NoteTalkedTo(farmer) // the fresh talk (a session re-open)
	_, _, completed = l.Progress("meet-again")
	assert.True(t, completed)
}

func TestLedger_TrackerCountsSinceStageEntry(t *testing.T) {
	// The {n} substitution is the third read site (with satisfied and the
	// derived lines): it must show progress since entry, clamped at 0 — never
	// the lifetime total.
	q := cullQuest()
	q.Stages[0].Tracker = "{n}/{m} wolves culled"
	l := testLedger(t, q)
	l.NoteKill(wolf)
	l.NoteKill(wolf)

	require.NoError(t, l.Accept("wolf-cull"))
	assert.Equal(t, []string{"0/3 wolves culled"}, l.quests["wolf-cull"].Objectives)

	l.NoteKill(wolf)
	assert.Equal(t, []string{"1/3 wolves culled"}, l.quests["wolf-cull"].Objectives)
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
	require.NoError(t, l.Accept("wolf-cull"))
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteKill(wolf)
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

	// Re-accept works — and re-baselines (N4): the pre-abandon kill is gone,
	// so completion takes three fresh kills.
	require.NoError(t, l2.Accept("wolf-cull"))
	l2.NoteKill(wolf)
	l2.NoteKill(wolf)
	l2.NoteKill(wolf)
	_, _, wolfDone = l2.Progress("wolf-cull")
	assert.True(t, wolfDone, "re-accepted quest completes on kills since the re-accept")
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
	require.NoError(t, l.Accept("wolf-cull"))
	for i := 0; i < 3; i++ {
		l.NoteKill(wolf)
	}

	_, running, completed := l.Progress("wolf-cull")
	require.False(t, running)
	require.True(t, completed)

	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageCompleted))
	assert.False(t, l.MatchesStage("wolf-cull", "report"), "completed, not standing on the terminal stage")
	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageNotStarted))
}

// ⭐ `running` is the whole in-progress band without naming a stage — the
// sentinel a row uses when it answers a question only a running quest asks
// (intake round 8 item 2). It is deliberately NOT the union of the other two
// negated: conditions are AND-ed with no negation, so a band that spans several
// stages was previously inexpressible except by duplicating the node per stage.
func TestLedger_MatchesStage_Running(t *testing.T) {
	l := testLedger(t, cullQuest())

	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageRunning),
		"an untouched quest is not running")

	require.NoError(t, l.Accept("wolf-cull"))
	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageRunning), "accepted = running")

	for i := 0; i < 3; i++ {
		l.NoteKill(wolf)
	}
	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageRunning),
		"...and stops the moment it completes — this is the whole point of the item")
	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageCompleted))
}

// It spans EVERY running stage, which is the whole difference from naming one.
// The fixture is the-lost-lamp's shape (kill, then walk back and hand it in),
// the quest this item was reported against: a row gated on `running` must
// survive the walk from the objective stage to the turn-in stage.
func TestLedger_MatchesStage_RunningSpansEveryStage(t *testing.T) {
	l := testLedger(t, lampQuest())
	require.NoError(t, l.Accept("lamp"))
	require.True(t, l.MatchesStage("lamp", "cull"))
	assert.True(t, l.MatchesStage("lamp", mobs.QuestStageRunning), "at the objective stage")

	for i := 0; i < 3; i++ {
		l.NoteKill(wolf)
	}
	require.True(t, l.MatchesStage("lamp", "bring_it_back"), "the counters walked it forward")
	assert.True(t, l.MatchesStage("lamp", mobs.QuestStageRunning),
		"still running one stage later — a per-stage gate would have gone dark here")

	require.NoError(t, l.AdvanceDialogue("lamp", "bring_it_back", "lit"))
	assert.False(t, l.MatchesStage("lamp", mobs.QuestStageRunning), "the turn-in ends it")
}

// D13: abandoning returns the quest to not-started, so a row gated on `running`
// goes with it — and comes back if the player re-accepts.
func TestLedger_MatchesStage_AbandonedIsNotRunning(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))
	require.NoError(t, l.Abandon("wolf-cull"))

	assert.False(t, l.MatchesStage("wolf-cull", mobs.QuestStageRunning))
	require.NoError(t, l.Accept("wolf-cull"))
	assert.True(t, l.MatchesStage("wolf-cull", mobs.QuestStageRunning))
}

// The evaluator calls this per tick per conversing player, so it must tolerate
// the states a fixture or a quest-less world can be in rather than panicking
// somewhere inside a render path.
func TestLedger_MatchesStage_DegradesSafely(t *testing.T) {
	assert.False(t, (*Ledger)(nil).MatchesStage("wolf-cull", mobs.QuestStageNotStarted),
		"a nil ledger fails closed")
	assert.True(t, NewLedger(nil).MatchesStage("wolf-cull", mobs.QuestStageNotStarted),
		"a registry-less ledger has genuinely started nothing")
	assert.False(t, (*Ledger)(nil).MatchesStage("wolf-cull", mobs.QuestStageRunning),
		"a nil ledger fails closed for every sentinel, not just the first")
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

// --- the wire projection (chunk C3, §6) ---

func TestSnapshot_CarriesTheWalkedPathAndCompletion(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))

	got := l.Snapshot()
	require.Len(t, got, 1)
	assert.Equal(t, "wolf-cull", got[0].QuestID)
	assert.Equal(t, []string{"cull"}, got[0].Path)
	assert.False(t, got[0].Completed)

	// The counters carry it to the terminal stage; the path is what the journal
	// renders, so both stages must be on it (L6).
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteKill(wolf)

	got = l.Snapshot()
	require.Len(t, got, 1)
	assert.Equal(t, []string{"cull", "report"}, got[0].Path)
	assert.True(t, got[0].Completed)
}

// An abandoned quest is not-started (D13), so it leaves the journal entirely —
// path cleared, no running section entry, and NOT in the completed one.
func TestSnapshot_AbandonedQuestIsAbsent(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))
	require.NoError(t, l.Abandon("wolf-cull"))

	assert.Empty(t, l.Snapshot())
}

// ⚑ Sorted, and that is a requirement rather than tidiness: the client diffs
// this with a view signature (§6), and Go map iteration order is randomised, so
// an unsorted projection would re-render the journal panel ~30×/s and drop
// clicks on the abandon row — the exact hazard the signature exists to prevent.
func TestSnapshot_IsSortedByQuestID(t *testing.T) {
	l := testLedger(t, cullQuest(), branchQuest())
	require.NoError(t, l.Accept("wolf-cull"))
	require.NoError(t, l.Accept("choice"))

	for i := 0; i < 20; i++ {
		got := l.Snapshot()
		require.Len(t, got, 2)
		assert.Equal(t, "choice", got[0].QuestID)
		assert.Equal(t, "wolf-cull", got[1].QuestID)
	}
}

// The overwhelmingly common case today, and the one that runs every tick for
// every player: nothing to send, nothing allocated.
func TestSnapshot_EmptyLedgerAllocatesNothing(t *testing.T) {
	l := NewLedger(nil)
	assert.Nil(t, l.Snapshot())

	allocs := testing.AllocsPerRun(100, func() { l.Snapshot() })
	assert.Zero(t, allocs, "an empty ledger's snapshot must not allocate per tick")
}

// A nil ledger reaches the marshaller in worlds that have no quest state at all
// (fakes, the sim). Failing closed here keeps that from being a per-tick panic.
func TestSnapshot_NilLedgerIsEmpty(t *testing.T) {
	var l *Ledger
	assert.Nil(t, l.Snapshot())
}

// --- the D17 journal notice (chunk C3) ---

func TestNotifier_FiresOncePerLedgerOp(t *testing.T) {
	l := testLedger(t, cullQuest())
	var got []Notice
	l.SetNotifier(func(n Notice) { got = append(got, n) })

	require.NoError(t, l.Accept("wolf-cull"))
	require.Len(t, got, 1, "accepting a quest pings once")
	assert.Equal(t, "wolf-cull", got[0].QuestID)
	assert.Equal(t, "The Wolf Cull", got[0].Title, "the banner needs the title, which only the registry has")
	assert.Equal(t, "cull", got[0].StageID)
	assert.False(t, got[0].Completed)

	// Counting up to the threshold moves nothing until it is met — a banner per
	// kill would be noise, so silence is the assertion here.
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	assert.Len(t, got, 1)

	l.NoteKill(wolf)
	require.Len(t, got, 2, "the kill that satisfies the stage pings")
	assert.True(t, got[1].Completed, "and the cascade to the terminal stage reports completion")
	assert.Equal(t, "report", got[1].StageID)
}

// A retroactive accept can walk several stages in one go (D3 — the veteran who
// auto-completes). That is ONE player action, so it is one banner, reporting
// where the quest ended up.
// A cascade — however many stages it walks — is one player-visible event and
// fires ONE banner, reporting where the quest came to rest. Since N4 the
// cascade lives on the CREDIT path (accept cannot skip a fresh-baselined
// stage any more): the completing kill walks cull → report in one go.
func TestNotifier_ACreditCascadeFiresOnce(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))

	var got []Notice
	l.SetNotifier(func(n Notice) { got = append(got, n) })
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	assert.Empty(t, got, "a counter moving under a holding stage is not a stage event")

	l.NoteKill(wolf)
	require.Len(t, got, 1)
	assert.Equal(t, "report", got[0].StageID)
	assert.True(t, got[0].Completed)
}

// Abandon is a deliberate click in the journal panel the player is already
// looking at (D13), so it needs no banner telling them what they just did.
func TestNotifier_AbandonIsSilent(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))

	var got []Notice
	l.SetNotifier(func(n Notice) { got = append(got, n) })
	require.NoError(t, l.Abandon("wolf-cull"))
	assert.Empty(t, got)
}

// The ledger outlives the player struct (L11), so a ledger with no notifier —
// or one carried between owners — must never panic on a stage entry.
func TestNotifier_UnsetIsHarmless(t *testing.T) {
	l := testLedger(t, cullQuest())
	assert.NotPanics(t, func() { require.NoError(t, l.Accept("wolf-cull")) })
}

// --- objective lines (plan-conversation-journal.md Q2, R2) ---
//
// The server sends the finished line; the client renders it verbatim. Composed
// event-driven and CACHED on the progress entry (L4) — Snapshot only copies.

const turnip = mobs.MobID(9)

func TestObjectiveLines_KillDerived(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))

	got := l.Snapshot()
	require.Len(t, got, 1)
	assert.Equal(t, []string{"0/3 Wolf slain"}, got[0].Objectives)

	l.NoteKill(wolf)
	l.NoteKill(wolf)
	assert.Equal(t, []string{"2/3 Wolf slain"}, l.Snapshot()[0].Objectives)

	// Completion (the §7.1 ruling: current stage only): a finished quest's
	// diary is its record — it carries no objective line at all.
	l.NoteKill(wolf)
	got = l.Snapshot()
	require.True(t, got[0].Completed)
	assert.Empty(t, got[0].Objectives)
}

// A multi-objective stage gets one line per objective, in authored order; a
// satisfied talk_to is ✓-marked, and a counter that keeps climbing while a
// sibling objective holds the stage is capped at its threshold.
func TestObjectiveLines_HarvestAndTalkTo(t *testing.T) {
	l := testLedger(t, &QuestDefinition{
		ID: "chore", Title: "The Chore",
		Stages: []*Stage{
			{ID: "work", Journal: "Work.", Objectives: []Objective{
				{Kind: ObjectiveHarvest, Target: turnip, TargetName: "Turnip", Count: 2},
				{Kind: ObjectiveTalkTo, Target: farmer, TargetName: "Farmer", Count: 1},
			}, Next: "done"},
			{ID: "done", Journal: "Done."},
		},
	})
	require.NoError(t, l.Accept("chore"))
	assert.Equal(t, []string{"0/2 Turnip harvested", "Talk to the Farmer"}, l.Snapshot()[0].Objectives)

	// Three pulled while the farmer waits: lifetime counters keep climbing
	// (D3), the display does not.
	l.NoteKill(turnip)
	l.NoteKill(turnip)
	l.NoteKill(turnip)
	assert.Equal(t, []string{"2/2 Turnip harvested", "Talk to the Farmer"}, l.Snapshot()[0].Objectives)

	l.NoteTalkedTo(farmer)
	assert.True(t, l.Snapshot()[0].Completed)
}

func TestObjectiveLines_TalkToCheckmark(t *testing.T) {
	crier := mobs.MobID(62)
	l := testLedger(t, &QuestDefinition{
		ID: "meet", Title: "Meet",
		Stages: []*Stage{
			{ID: "go", Journal: "Go.", Objectives: []Objective{
				{Kind: ObjectiveTalkTo, Target: farmer, TargetName: "Farmer", Count: 1},
				{Kind: ObjectiveTalkTo, Target: crier, TargetName: "Town Crier", Count: 1},
			}, Next: "back"},
			{ID: "back", Journal: "Back."},
		},
	})
	require.NoError(t, l.Accept("meet"))

	l.NoteTalkedTo(farmer)
	assert.Equal(t, []string{"Talk to the Farmer ✓", "Talk to the Town Crier"},
		l.Snapshot()[0].Objectives, "one done, one open — the stage holds and says which is which")
}

// The authored override (Q2 ruling: {n}/{m} placeholders): tracker wins over
// the derived lines, and the placeholders keep the count live — substituted
// from the stage's first countable objective.
func TestObjectiveLines_TrackerOverride(t *testing.T) {
	q := cullQuest()
	q.Stages[0].Tracker = "Wolves thinned: {n}/{m}"
	l := testLedger(t, q)
	require.NoError(t, l.Accept("wolf-cull"))

	assert.Equal(t, []string{"Wolves thinned: 0/3"}, l.Snapshot()[0].Objectives)

	l.NoteKill(wolf)
	assert.Equal(t, []string{"Wolves thinned: 1/3"}, l.Snapshot()[0].Objectives)
}

// A dialogue stage has nothing derivable — its line exists iff authored. This
// is what Q4's "Return to the crier" trackers will ride.
func TestObjectiveLines_DialogueStage(t *testing.T) {
	plain := testLedger(t, branchQuest())
	require.NoError(t, plain.Accept("choice"))
	assert.Empty(t, plain.Snapshot()[0].Objectives, "no tracker → no line")

	q := branchQuest()
	q.Stages[0].Tracker = "Pick a side."
	tracked := testLedger(t, q)
	require.NoError(t, tracked.Accept("choice"))
	assert.Equal(t, []string{"Pick a side."}, tracked.Snapshot()[0].Objectives)
}

// The line moves when the quest moves: entering the next stage recomposes.
func TestObjectiveLines_FollowTheCurrentStage(t *testing.T) {
	l := testLedger(t, &QuestDefinition{
		ID: "two-step", Title: "Two Steps",
		Stages: []*Stage{
			{ID: "first", Journal: "j", Objectives: []Objective{{Kind: ObjectiveKill, Target: wolf, TargetName: "Wolf", Count: 1}}, Next: "second"},
			{ID: "second", Journal: "j", Objectives: []Objective{{Kind: ObjectiveTalkTo, Target: farmer, TargetName: "Farmer", Count: 1}}, Next: "end"},
			{ID: "end", Journal: "j"},
		},
	})
	require.NoError(t, l.Accept("two-step"))
	assert.Equal(t, []string{"0/1 Wolf slain"}, l.Snapshot()[0].Objectives)

	l.NoteKill(wolf)
	assert.Equal(t, []string{"Talk to the Farmer"}, l.Snapshot()[0].Objectives,
		"the satisfied stage fell through; the line is the NEW current stage's")
}

// ⚑ L4: composition is event-driven, never per tick. Two snapshots with no
// event in between must hand out the SAME cached strings — recomposing in
// Snapshot would be a per-tick allocation on every questing player.
func TestObjectiveLines_SnapshotDoesNotRecompose(t *testing.T) {
	l := testLedger(t, cullQuest())
	require.NoError(t, l.Accept("wolf-cull"))

	first := l.Snapshot()[0].Objectives
	second := l.Snapshot()[0].Objectives
	require.NotEmpty(t, first)
	assert.Same(t, &first[0], &second[0], "same backing array: Snapshot copies the slice header, it does not compose")
}

// --- CanApply: the quest-row show-rule (plan-conversation-journal.md Q1 §4.1 ②) ---

func offerGrantFor(quest string) *mobs.InteractionGrant {
	return &mobs.InteractionGrant{Kind: mobs.GrantOfferQuest, Quest: quest}
}

func advanceGrantFor(quest, from, to string) *mobs.InteractionGrant {
	return &mobs.InteractionGrant{Kind: mobs.GrantAdvanceQuest, Quest: quest, FromStage: from, ToStage: to}
}

// ⭐ R1's headline: an Accept row disappears the moment the quest is running,
// and comes back when an abandon returns it to not-started.
func TestLedger_CanApplyOffer(t *testing.T) {
	l := testLedger(t, branchQuest())
	g := offerGrantFor("choice")

	assert.True(t, l.CanApply(g), "not started → the offer row shows")

	require.NoError(t, l.Accept("choice"))
	assert.False(t, l.CanApply(g), "running → the offer row is gone")

	require.NoError(t, l.Abandon("choice"))
	assert.True(t, l.CanApply(g), "abandoned = not-started (D13), so the offer returns")

	require.NoError(t, l.Accept("choice"))
	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))
	assert.False(t, l.CanApply(g), "a finished one-shot is never re-offered")
}

func TestLedger_CanApplyOffer_RepeatableReturnsAfterCompletion(t *testing.T) {
	q := branchQuest()
	q.Repeatable = true
	l := testLedger(t, q)
	require.NoError(t, l.Accept("choice"))
	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))

	assert.True(t, l.CanApply(offerGrantFor("choice")))
}

// The turn-in half: an advance_quest row shows exactly while its edge is
// walkable — which is what makes a turn-in appear only when it can be taken.
func TestLedger_CanApplyAdvance(t *testing.T) {
	l := testLedger(t, cullQuest(), branchQuest())
	edge := advanceGrantFor("choice", "choose", "a-end")

	assert.False(t, l.CanApply(edge), "not running → no turn-in")

	require.NoError(t, l.Accept("choice"))
	assert.True(t, l.CanApply(edge), "standing on the dialogue stage → the row shows")
	assert.False(t, l.CanApply(advanceGrantFor("choice", "a-end", "b-end")), "wrong from-stage")
	assert.False(t, l.CanApply(advanceGrantFor("choice", "choose", "nowhere")), "destination must exist")

	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))
	assert.False(t, l.CanApply(edge), "completed → the row is gone for good")

	require.NoError(t, l.Accept("wolf-cull"))
	assert.False(t, l.CanApply(advanceGrantFor("wolf-cull", "cull", "report")),
		"an objective stage advances off its counters, never off a row")
}

func TestLedger_CanApplyFailsClosed(t *testing.T) {
	var nilLedger *Ledger
	assert.False(t, nilLedger.CanApply(offerGrantFor("choice")), "a nil ledger refuses rather than panics")

	assert.False(t, NewLedger(nil).CanApply(offerGrantFor("choice")), "no quest content loaded")

	l := testLedger(t, cullQuest())
	assert.False(t, l.CanApply(offerGrantFor("no-such-quest")))
	assert.False(t, l.CanApply(&mobs.InteractionGrant{Kind: mobs.GrantTeachSkill}),
		"a non-quest kind is not this predicate's question")
}

// ⚑ CanApply runs on the PRESENT path, per tick per conversing player, so it
// must be a pure read: Accept's progressOf() creates a map entry, and a
// predicate that did the same would grow the ledger by looking at it.
func TestLedger_CanApplyMutatesNothing(t *testing.T) {
	l := testLedger(t, cullQuest())
	l.CanApply(offerGrantFor("wolf-cull"))
	l.CanApply(advanceGrantFor("wolf-cull", "cull", "report"))
	assert.Empty(t, l.quests, "no progress entry appears from being asked")
	assert.Nil(t, l.Snapshot())
}

// ⚑ L3: the show-rule and the apply-rule must be ONE function. CanApply is
// extracted FROM Accept/AdvanceDialogue, and this sweep is the pin: across
// every quest state, what CanApply promises is exactly what the op does.
func TestLedger_CanApplyAgreesWithTheOps(t *testing.T) {
	states := map[string]func(t *testing.T, l *Ledger){
		"untouched": func(t *testing.T, l *Ledger) {},
		"running":   func(t *testing.T, l *Ledger) { require.NoError(t, l.Accept("choice")) },
		"completed": func(t *testing.T, l *Ledger) {
			require.NoError(t, l.Accept("choice"))
			require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))
		},
		"abandoned": func(t *testing.T, l *Ledger) {
			require.NoError(t, l.Accept("choice"))
			require.NoError(t, l.Abandon("choice"))
		},
	}
	grants := []*mobs.InteractionGrant{
		offerGrantFor("choice"),
		advanceGrantFor("choice", "choose", "a-end"),
		advanceGrantFor("choice", "choose", "b-end"),
	}

	for name, setup := range states {
		t.Run(name, func(t *testing.T) {
			for _, g := range grants {
				l := testLedger(t, branchQuest())
				setup(t, l)
				promised := l.CanApply(g)

				var err error
				switch g.Kind {
				case mobs.GrantOfferQuest:
					err = l.Accept(g.Quest)
				case mobs.GrantAdvanceQuest:
					err = l.AdvanceDialogue(g.Quest, g.FromStage, g.ToStage)
				}
				assert.Equal(t, promised, err == nil,
					"state %q grant %+v: CanApply said %v but the op said %v", name, g, promised, err)
			}
		})
	}
}
