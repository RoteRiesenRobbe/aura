package quests

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// repeatableQuest is the shape that makes `running` non-derivable: a completed
// quest that can be accepted again.
//
// ⚑ Its first stage is a DIALOGUE stage, not an objective one, and that is
// forced rather than stylistic: objective thresholds are lifetime totals (D3),
// so re-accepting an objective-only repeatable quest satisfies it on the spot
// and completes it in the same call — Running && Completed would never be
// observable. A quest waiting on an authored edge stays running.
func repeatableQuest() *QuestDefinition {
	q := &QuestDefinition{
		ID: "turnip-chore", Title: "The Turnip Chore", Repeatable: true,
		Stages: []*Stage{
			{ID: "ask", Journal: "Ask the farmer for work."},
			{ID: "done", Journal: "Done."},
		},
	}
	q.NoteDialogueEdgeFrom("ask")
	return q
}

// TestLedgerFlagsRoundTrip is the quest half of chunk 4's acceptance test:
// encode → decode → restore must reproduce the ledger exactly.
func TestLedgerFlagsRoundTrip(t *testing.T) {
	l := testLedger(t, cullQuest(), branchQuest())
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteTalkedTo(farmer)
	require.NoError(t, l.Accept("choice"))
	require.NoError(t, l.AdvanceDialogue("choice", "choose", "a-end"))
	require.NoError(t, l.Accept("wolf-cull"))

	flags, err := EncodeFlags(l)
	require.NoError(t, err)

	restored := testLedger(t, cullQuest(), branchQuest())
	state, err := DecodeFlags(flags)
	require.NoError(t, err)
	restored.Restore(state)

	assert.Equal(t, uint64(2), restored.KillCount(wolf))
	assert.True(t, restored.HasTalkedTo(farmer))
	assert.Equal(t, l.Snapshot(), restored.Snapshot(), "the projected journal must survive a round trip")

	path, running, completed := restored.Progress("wolf-cull")
	assert.Equal(t, []string{"cull"}, path)
	assert.True(t, running)
	assert.False(t, completed)

	// And re-encoding the restored ledger reproduces the same rows, which is
	// what the writer's fingerprint dedupe relies on.
	again, err := EncodeFlags(restored)
	require.NoError(t, err)
	assert.Equal(t, flags, again)
}

// TestLedgerFlagsKeepRunningAndCompletedApart is the trap the schema doc names.
//
// ⚑ `running` is NOT derivable from `completed`. Today `running == !completed`
// holds for every stored entry, but only because no shipped quest is repeatable
// — and Accept explicitly permits re-accepting a completed repeatable one, which
// produces both at once. A derived flag would silently drop a live run the first
// time content turns `repeatable` on, in content, long after the Go that caused
// it.
func TestLedgerFlagsKeepRunningAndCompletedApart(t *testing.T) {
	l := testLedger(t, repeatableQuest())
	require.NoError(t, l.Accept("turnip-chore"))
	require.NoError(t, l.AdvanceDialogue("turnip-chore", "ask", "done")) // terminal
	_, running, completed := l.Progress("turnip-chore")
	require.False(t, running)
	require.True(t, completed)

	require.NoError(t, l.Accept("turnip-chore")) // the second run
	_, running, completed = l.Progress("turnip-chore")
	require.True(t, running, "a re-accepted repeatable quest is running")
	require.True(t, completed, "...and still completed")

	flags, err := EncodeFlags(l)
	require.NoError(t, err)

	restored := testLedger(t, repeatableQuest())
	state, err := DecodeFlags(flags)
	require.NoError(t, err)
	restored.Restore(state)

	_, running, completed = restored.Progress("turnip-chore")
	assert.True(t, running, "the live re-run must survive persistence")
	assert.True(t, completed)
}

// TestEncodeFlagsSkipsUntouchedQuests: an abandoned quest is back to
// not-started (D13) and earns no row — but the rule is `Running || Completed`,
// not "running only", so a completed-then-abandoned quest keeps its row.
func TestEncodeFlagsSkipsUntouchedQuests(t *testing.T) {
	l := testLedger(t, cullQuest(), repeatableQuest())
	require.NoError(t, l.Accept("wolf-cull"))
	require.NoError(t, l.Abandon("wolf-cull"))

	require.NoError(t, l.Accept("turnip-chore"))
	require.NoError(t, l.AdvanceDialogue("turnip-chore", "ask", "done")) // completes it
	require.NoError(t, l.Accept("turnip-chore"))                         // and it is running again
	require.NoError(t, l.Abandon("turnip-chore"))

	flags, err := EncodeFlags(l)
	require.NoError(t, err)
	assert.NotContains(t, flags, FlagQuestPrefix+"wolf-cull", "an abandoned quest is not-started")
	assert.Contains(t, flags, FlagQuestPrefix+"turnip-chore", "completed survives an abandon")
}

// TestEncodeFlagsIsThreeRowsNotSeventy pins the volume decision: the counters
// are ONE JSONB row each, not a row per species. §4 rewrites every flag row on
// every autosave, so a row per species would turn one write into ~70.
func TestEncodeFlagsIsThreeRowsNotSeventy(t *testing.T) {
	l := testLedger(t, cullQuest())
	for id := mobs.MobID(1); id <= 40; id++ {
		l.NoteKill(id)
		l.NoteTalkedTo(id)
	}
	require.NoError(t, l.Accept("wolf-cull"))

	flags, err := EncodeFlags(l)
	require.NoError(t, err)
	assert.Len(t, flags, 3, "two counter rows plus one quest row")
}

// TestEncodeFlagsIsStable: the talked-to set is a Go map, and Go randomises map
// order. An unstable encoding would make the writer's fingerprint see every
// snapshot as dirty and write on every interval forever.
func TestEncodeFlagsIsStable(t *testing.T) {
	l := testLedger(t)
	for id := mobs.MobID(1); id <= 20; id++ {
		l.NoteTalkedTo(id)
	}
	first, err := EncodeFlags(l)
	require.NoError(t, err)
	for i := 0; i < 20; i++ {
		again, err := EncodeFlags(l)
		require.NoError(t, err)
		require.Equal(t, first[FlagTalkedTo], again[FlagTalkedTo])
	}
}

// TestRestoreDoesNotCascade: a load installs settled state. Replaying the
// objective cascade would re-fire journal banners on every login and could
// advance a quest whose content changed under a character who was never there.
func TestRestoreDoesNotCascade(t *testing.T) {
	l := testLedger(t, cullQuest())
	notices := 0
	l.SetNotifier(func(Notice) { notices++ })

	l.Restore(LedgerState{
		KillCounts: map[mobs.MobID]uint64{wolf: 99}, // far past the threshold of 3
		Quests:     map[string]Progress{"wolf-cull": {Path: []string{"cull"}, Running: true}},
	})

	assert.Zero(t, notices, "a load is not a quest event")
	path, running, completed := l.Progress("wolf-cull")
	assert.Equal(t, []string{"cull"}, path, "the stage must not have advanced on load")
	assert.True(t, running)
	assert.False(t, completed)
}

// TestDecodeFlagsIgnoresForeignKeys: character_flags is a shared table, so an
// unrelated flag kind must not make the quest loader fail.
func TestDecodeFlagsIgnoresForeignKeys(t *testing.T) {
	state, err := DecodeFlags(map[string]json.RawMessage{
		"tutorial.seen":   json.RawMessage(`true`),
		FlagTalkedTo:      json.RawMessage(`[7]`),
		"someone.else.is": json.RawMessage(`{"using":"this table"}`),
	})
	require.NoError(t, err)
	assert.Equal(t, []mobs.MobID{7}, state.TalkedTo)
}

// veteranChoreQuest is the shape the N4 baselines exist for: one stage carrying
// both a countable objective and a talk objective, entered by a character who
// has ALREADY done some of both.
func veteranChoreQuest() *QuestDefinition {
	return &QuestDefinition{
		ID: "veteran-chore", Title: "The Veteran's Chore",
		Stages: []*Stage{
			{ID: "work", Journal: "Do the work.", Objectives: []Objective{
				{Kind: ObjectiveKill, Target: wolf, TargetName: "Wolf", Count: 3},
				{Kind: ObjectiveTalkTo, Target: farmer, TargetName: "Farmer", Count: 1},
			}, Next: "report"},
			{ID: "report", Journal: "Report back."},
		},
	}
}

// TestLedgerFlagsCarryTheN4Baselines pins the half that the accounts branch and
// the feel-pass branch each got right on their own and wrong together.
//
// Every objective counts "since this stage started" (N4, reversing D3), and the
// only record of when that was is KillBase/TalkBase on the Progress entry. They
// are STATE, not a cache: nothing recomputes them, because the lifetime counters
// they were subtracted from have moved on.
//
// ⚑ Drop them from the stored shape and this test still passes on the counters
// a fresh character accumulates — it only fails for a VETERAN, which is why the
// fixture pre-loads two kills and a talk before accepting. A reload would hand
// those back as progress: two thirds of the cull done and the farmer already
// spoken to, from a save the player did nothing to earn.
func TestLedgerFlagsCarryTheN4Baselines(t *testing.T) {
	l := testLedger(t, veteranChoreQuest())
	l.NoteKill(wolf)
	l.NoteKill(wolf)
	l.NoteTalkedTo(farmer) // long before the quest existed
	require.NoError(t, l.Accept("veteran-chore"))

	before := l.Snapshot()
	require.Equal(t, []string{"0/3 Wolf slain", "Talk to the Farmer"}, before[0].Objectives,
		"the baseline makes a fresh objective stage unsatisfied by construction")

	flags, err := EncodeFlags(l)
	require.NoError(t, err)
	restored := testLedger(t, veteranChoreQuest())
	state, err := DecodeFlags(flags)
	require.NoError(t, err)
	restored.Restore(state)

	assert.Equal(t, before, restored.Snapshot(), "the baselines must survive the round trip")

	// And they still BITE afterwards: the restored quest needs three fresh kills
	// and a fresh talk, not the lifetime totals it was reloaded with.
	assert.Equal(t, uint64(2), restored.KillCount(wolf), "the lifetime counter is untouched")
	restored.NoteKill(wolf)
	restored.NoteKill(wolf)
	restored.NoteKill(wolf)
	restored.NoteTalkedTo(farmer)
	_, _, completed := restored.Progress("veteran-chore")
	assert.True(t, completed, "three fresh kills and a fresh talk finish it")
}

// TestRestoreRecomposesObjectiveLines: the lines are DERIVED, so they are not
// stored — enter() composes them at stage entry and the credit sites recompose
// them, both of which a load skips. Without the recompose a restored character's
// journal shows a running quest with no objective line at all.
//
// ⚑ It must not become a cascade: TestRestoreDoesNotCascade guards the other
// side of that line, and the two are a pair.
func TestRestoreRecomposesObjectiveLines(t *testing.T) {
	l := testLedger(t, cullQuest())
	l.Restore(LedgerState{
		KillCounts: map[mobs.MobID]uint64{wolf: 5},
		Quests: map[string]Progress{"wolf-cull": {
			Path: []string{"cull"}, Running: true,
			KillBase: map[mobs.MobID]uint64{wolf: 4}, // one kill into the stage
		}},
	})
	snap := l.Snapshot()
	require.Len(t, snap, 1)
	assert.Equal(t, []string{"1/3 Wolf slain"}, snap[0].Objectives,
		"composed from the restored stage and the restored baseline")
}

// TestRestoreSurvivesContentThatMovedUnderTheSave: a quest or stage the content
// no longer authors must leave the lines nil, not fail the load. Content changes
// under saved characters, and a player who cannot log in is the worse outcome.
func TestRestoreSurvivesContentThatMovedUnderTheSave(t *testing.T) {
	l := testLedger(t, cullQuest())
	l.Restore(LedgerState{Quests: map[string]Progress{
		"wolf-cull":    {Path: []string{"a-stage-that-was-retired"}, Running: true},
		"a-lost-quest": {Path: []string{"gone"}, Running: true},
	}})
	for _, e := range l.Snapshot() {
		assert.Nil(t, e.Objectives, "%s: no line rather than a panic", e.QuestID)
	}
}
