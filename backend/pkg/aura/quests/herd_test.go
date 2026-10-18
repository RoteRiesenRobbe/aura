package quests

// The herd objective (plan-herding.md D6, D7, R15): a third name over the
// species counters kill and harvest share, credited when a herd animal is
// penned (mob.UpdatePen → NoteKill).

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

const backToThePen = `{
	"id": "back-to-the-pen", "title": "Back to the Pen", "level": 2,
	"stages": [
		{"id": "flock", "journal": "j", "tracker": "{n}/{m} sheep brought back",
		 "objectives": [{"kind": "herd", "species": "Sheep", "count": 6}], "next": "strays"},
		{"id": "strays", "journal": "j",
		 "objectives": [{"kind": "herd", "species": "Baabara", "tracker": "Bring Baabara home"}], "next": "report"},
		{"id": "report", "journal": "j"}
	]
}`

func TestLoad_HerdObjective(t *testing.T) {
	q, err := loadOne(t, backToThePen).Get("back-to-the-pen")
	require.NoError(t, err)

	o := q.Stages[0].Objectives[0]
	assert.Equal(t, ObjectiveHerd, o.Kind)
	assert.Equal(t, mobs.MobID(78), o.Target)
	assert.EqualValues(t, 6, o.Count)
	assert.Equal(t, "Bring Baabara home", q.Stages[1].Objectives[0].Tracker, "a herd objective may reword its own line")
}

func TestLoad_HerdRejections(t *testing.T) {
	stage := func(objective string) string {
		return `{"id": "q", "title": "Q", "level": 1, "stages": [
			{"id": "s", "journal": "j", "objectives": [` + objective + `], "next": "t"},
			{"id": "t", "journal": "done"}]}`
	}
	for name, quest := range map[string]string{
		"a species that is no herd animal": stage(`{"kind": "herd", "species": "Wolf", "count": 1}`),
		"a herd animal without a pen":      stage(`{"kind": "herd", "species": "Deer", "count": 1}`),
		"an npc instead of a species":      stage(`{"kind": "herd", "npc": "Sheep", "count": 1}`),
		"a chance":                         stage(`{"kind": "herd", "species": "Sheep", "chance": 0.5}`),
	} {
		t.Run(name, func(t *testing.T) { loadErr(t, quest) })
	}
}

func herdLedger(t *testing.T) *Ledger {
	t.Helper()
	q, err := loadOne(t, backToThePen).Get("back-to-the-pen")
	require.NoError(t, err)
	l := testLedger(t, q)
	require.NoError(t, l.Accept("back-to-the-pen"))
	return l
}

func TestLedger_HerdCountsPenningsSinceStageEntry(t *testing.T) {
	l := herdLedger(t)
	for i := 0; i < 5; i++ {
		l.NoteKill(78)
	}
	assert.True(t, l.MatchesStage("back-to-the-pen", "flock"))
	views := l.quests["back-to-the-pen"].Views
	require.Len(t, views, 1)
	assert.EqualValues(t, 5, views[0].N, "the stage tracker counts the flock: {n}/{m}")
	assert.Equal(t, []string{"5/6 sheep brought back"}, l.quests["back-to-the-pen"].Objectives)

	l.NoteKill(78)
	assert.True(t, l.MatchesStage("back-to-the-pen", "strays"), "six penned moves the stage")
}

func TestLedger_AStrayTicksItsOwnLine(t *testing.T) {
	l := herdLedger(t)
	l.NoteKill(74) // Baabara penned during the flock stage: does not count later
	for i := 0; i < 6; i++ {
		l.NoteKill(78)
	}
	require.True(t, l.MatchesStage("back-to-the-pen", "strays"))
	assert.Equal(t, []string{"Bring Baabara home"}, l.quests["back-to-the-pen"].Objectives)
	assert.False(t, l.quests["back-to-the-pen"].Views[0].Done)

	l.NoteKill(74)

	path, _, _ := l.Progress("back-to-the-pen")
	assert.Equal(t, "report", path[len(path)-1], "the stray home moves the stage on")
}

func TestLedger_HerdLineWithoutTracker(t *testing.T) {
	l := testLedger(t, &QuestDefinition{
		ID: "pen", Title: "Pen", Level: 1,
		Stages: []*Stage{
			{ID: "s", Journal: "j", Objectives: []Objective{{Kind: ObjectiveHerd, Target: 78, TargetName: "Sheep", Count: 3}}, Next: "t"},
			{ID: "t", Journal: "j"},
		},
	})
	require.NoError(t, l.Accept("pen"))
	l.NoteKill(78)

	assert.Equal(t, []string{"1/3 Sheep brought back"}, l.quests["pen"].Objectives)
}

func TestLedger_APennedStrayIsTickedWhileItsSiblingIsOut(t *testing.T) {
	r := loadOne(t, `{
		"id": "strays", "title": "Strays", "level": 2,
		"stages": [
			{"id": "strays", "journal": "j", "objectives": [
				{"kind": "herd", "species": "Baabara", "tracker": "Bring Baabara home"},
				{"kind": "herd", "species": "Woolliam", "tracker": "Bring Woolliam home"}], "next": "report"},
			{"id": "report", "journal": "j"}
		]
	}`)
	q, err := r.Get("strays")
	require.NoError(t, err)
	l := testLedger(t, q)
	require.NoError(t, l.Accept("strays"))

	l.NoteKill(74)

	assert.Equal(t, []string{"Bring Baabara home ✓", "Bring Woolliam home"}, l.quests["strays"].Objectives,
		"each stray ticks on its own line (R15)")
	assert.True(t, l.quests["strays"].Views[0].Done)
	assert.False(t, l.quests["strays"].Views[1].Done)
}
