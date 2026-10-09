package quests

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-region-identity.md R2: the `reach` objective is done when the player
// stands inside its region while the stage is current (D5), alone in its stage
// (D6), tracked as "Go to {title}" (D7).

const farm = "reinhards-farm"

// roadQuest is the eliza-sends-me shape: reach a region, then a dialogue stage
// turned in by a row, then the terminal stage.
func roadQuest() *QuestDefinition {
	q := &QuestDefinition{
		ID: "road", Title: "The Road",
		Stages: []*Stage{
			{ID: "road", Journal: "Walk.", Objectives: []Objective{{Kind: ObjectiveReach, Region: farm, TargetName: "Reinhard's Farm", Count: 1}}, Next: "meet"},
			{ID: "meet", Journal: "Talk.", Tracker: "Talk to Reinhard"},
			{ID: "done", Journal: "Done."},
		},
	}
	q.NoteDialogueEdgeFrom("meet")
	return q
}

func TestLoad_ReachObjective(t *testing.T) {
	r := loadOne(t, `{"id": "road", "title": "The Road", "stages": [
		{"id": "road", "journal": "Walk.", "objectives": [{"kind": "reach", "region": "reinhards-farm"}], "next": "done"},
		{"id": "done", "journal": "Done."}]}`)
	q, err := r.Get("road")
	require.NoError(t, err)
	o := q.Stage("road").Objectives[0]
	assert.Equal(t, ObjectiveReach, o.Kind)
	assert.Equal(t, farm, o.Region)
	assert.Equal(t, uint64(1), o.Count)
	assert.Equal(t, farm, o.TargetName, "the title arrives at BindRegions; until then the id stands in")
}

func TestLoad_ReachRejections(t *testing.T) {
	stage := func(objectives string) string {
		return `{"id": "q", "title": "Q", "stages": [
			{"id": "s", "journal": "j", "objectives": [` + objectives + `], "next": "t"},
			{"id": "t", "journal": "done"}]}`
	}
	for name, tc := range map[string]struct{ quest, want string }{
		"no region":      {stage(`{"kind": "reach"}`), "reach names a region"},
		"species":        {stage(`{"kind": "reach", "region": "a", "species": "Wolf"}`), "reach names a region, not a species or an npc"},
		"npc":            {stage(`{"kind": "reach", "region": "a", "npc": "Farmer"}`), "reach names a region, not a species or an npc"},
		"count":          {stage(`{"kind": "reach", "region": "a", "count": 2}`), "a reach objective takes no count"},
		"chance":         {stage(`{"kind": "reach", "region": "a", "chance": 0.5}`), "a chance rides a kill/harvest objective"},
		"not alone":      {stage(`{"kind": "reach", "region": "a"}, {"kind": "kill", "species": "Wolf"}`), "a reach objective must be its stage's only objective"},
		"region on kill": {stage(`{"kind": "kill", "species": "Wolf", "region": "a"}`), "only a reach objective names a region"},
	} {
		err := loadErr(t, tc.quest)
		assert.Contains(t, err.Error(), tc.want, name)
	}
}

// {n}/{m} count a kill/harvest objective; a reach stage has none to count.
func TestLoad_ReachStageTrackerCannotCount(t *testing.T) {
	err := loadErr(t, `{"id": "q", "title": "Q", "stages": [
		{"id": "s", "journal": "j", "tracker": "{n}/{m}", "objectives": [{"kind": "reach", "region": "a"}], "next": "t"},
		{"id": "t", "journal": "done"}]}`)
	assert.Contains(t, err.Error(), "no kill/harvest objective to count")
}

func TestLedger_ReachArrivingLaterAdvances(t *testing.T) {
	l := testLedger(t, roadQuest())
	assert.Empty(t, l.ReachTargets(), "no running reach stage, nothing to check")
	require.NoError(t, l.Accept("road"))
	assert.Equal(t, []string{farm}, l.ReachTargets())
	assert.Equal(t, []string{"Go to Reinhard's Farm"}, l.Snapshot()[0].Objectives)

	l.NoteReached("elsewhere")
	path, _, _ := l.Progress("road")
	assert.Equal(t, []string{"road"}, path, "another region moves nothing")

	rev := l.Revision()
	l.NoteReached(farm)
	path, running, _ := l.Progress("road")
	assert.Equal(t, []string{"road", "meet"}, path)
	assert.True(t, running)
	assert.Greater(t, l.Revision(), rev, "a stage entered is a save trigger")
	assert.Empty(t, l.ReachTargets(), "the dialogue stage has no reach target")
	assert.Equal(t, []string{"Talk to Reinhard"}, l.Snapshot()[0].Objectives)

	l.NoteReached(farm)
	path, _, _ = l.Progress("road")
	assert.Equal(t, []string{"road", "meet"}, path, "a second arrival is not a second advance")
}

// D5: standing there when the stage starts counts. The stage is never
// satisfied off counters, so the next arrival report (the next tick) moves it.
func TestLedger_ReachIsNeverSatisfiedByCounters(t *testing.T) {
	l := testLedger(t, roadQuest())
	require.NoError(t, l.Accept("road"))
	l.NoteKill(wolf)
	l.NoteTalkedTo(farmer)
	path, _, _ := l.Progress("road")
	assert.Equal(t, []string{"road"}, path)
}

func TestLedger_ReachAbandonClearsTheTarget(t *testing.T) {
	l := testLedger(t, roadQuest())
	require.NoError(t, l.Accept("road"))
	require.NoError(t, l.Abandon("road"))
	assert.Empty(t, l.ReachTargets())
	l.NoteReached(farm)
	_, running, _ := l.Progress("road")
	assert.False(t, running, "an abandoned quest does not move on arrival")
}

// Two running quests to one region: one arrival advances both.
func TestLedger_ReachTwoQuestsOneRegion(t *testing.T) {
	other := roadQuest()
	other.ID = "road-two"
	l := testLedger(t, roadQuest(), other)
	require.NoError(t, l.Accept("road"))
	require.NoError(t, l.Accept("road-two"))
	assert.Equal(t, []string{farm}, l.ReachTargets(), "one region, listed once")
	l.NoteReached(farm)
	for _, id := range []string{"road", "road-two"} {
		path, _, _ := l.Progress(id)
		assert.Equal(t, []string{"road", "meet"}, path, id)
	}
}

// A reload mid-stage restores the target from the stage the quest rests on:
// nothing new is persisted (D6).
func TestLedger_ReachSurvivesAReload(t *testing.T) {
	l := testLedger(t, roadQuest())
	require.NoError(t, l.Accept("road"))
	flags, err := EncodeFlags(l)
	require.NoError(t, err)

	restored := testLedger(t, roadQuest())
	state, err := DecodeFlags(flags)
	require.NoError(t, err)
	restored.Restore(state)
	assert.Equal(t, []string{farm}, restored.ReachTargets())
	assert.Equal(t, l.Snapshot(), restored.Snapshot())

	restored.NoteReached(farm)
	path, _, _ := restored.Progress("road")
	assert.Equal(t, []string{"road", "meet"}, path)
}

func TestLedger_ReachAnAuthoredTrackerWins(t *testing.T) {
	q := roadQuest()
	q.Stages[0].Tracker = "Find the farm east of home"
	l := testLedger(t, q)
	require.NoError(t, l.Accept("road"))
	assert.Equal(t, []string{"Find the farm east of home"}, l.Snapshot()[0].Objectives)
}

// The boot pass after zones load: every reach region must be listed and drawn,
// and the objective takes the listed title.
func TestBindRegions(t *testing.T) {
	r, err := NewRegistry(roadQuest())
	require.NoError(t, err)
	titles := map[string]string{farm: "Reinhard's Farm"}

	warnings, err := BindRegions(r, titles, map[string]bool{farm: true})
	require.NoError(t, err)
	assert.Empty(t, warnings)
	q, _ := r.Get("road")
	assert.Equal(t, "Reinhard's Farm", q.Stage("road").Objectives[0].TargetName)

	_, err = BindRegions(r, map[string]string{}, map[string]bool{farm: true})
	require.Error(t, err)
	assert.Contains(t, err.Error(), `quest "road" stage "road": reach names region "reinhards-farm", which api/regions/regions.json does not list`)

	// Undrawn is a warning: the debug zone set draws none of the shipped places.
	warnings, err = BindRegions(r, titles, map[string]bool{})
	require.NoError(t, err)
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "which no loaded zone draws")
}
