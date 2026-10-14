package sys

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
)

// --- plan-quest-giver-markers.md C2: what a giver shows over its head ---

const giverID = mobs.MobID(40)

// leveledQuest is a single-stage-offerable quest of the pelts shape at a level.
func leveledQuest(id string, level int) *quests.QuestDefinition {
	q := &quests.QuestDefinition{
		ID: id, Title: id, Level: level,
		Stages: []*quests.Stage{
			{ID: stageHunt, Journal: "Hunt.", Next: stageTurn,
				Objectives: []quests.Objective{{Kind: quests.ObjectiveKill, Target: 3, Count: 2}}},
			{ID: stageTurn, Journal: "Report."},
			{ID: stageDone, Journal: "Done."},
		},
	}
	q.NoteDialogueEdgeFrom(stageTurn)
	return q
}

func offerOf(quest string) mobs.InteractionGrant {
	return mobs.InteractionGrant{Kind: mobs.GrantOfferQuest, Quest: quest}
}

func turnInOf(quest string) mobs.InteractionGrant {
	return mobs.InteractionGrant{Kind: mobs.GrantAdvanceQuest, Quest: quest, FromStage: stageTurn, ToStage: stageDone}
}

// giver is a conversant whose root carries one option per grant list.
func giver(options ...[]mobs.InteractionGrant) *mobs.MobDefinition {
	node := mobs.InteractionNode{ID: "root", Lines: []string{"Hello."}}
	for _, gs := range options {
		node.Options = append(node.Options, mobs.InteractionOption{Text: "row", Grants: gs})
	}
	return &mobs.MobDefinition{ID: giverID, Name: "Giver", Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{node}}}
}

func markersFor(p *fakeLearner, defs ...*mobs.MobDefinition) []model.QuestMarker {
	return QuestMarkers(defs, p, curve.DefaultKillXP())
}

func onlyMarker(t *testing.T, ms []model.QuestMarker) model.QuestMarker {
	t.Helper()
	require.Len(t, ms, 1)
	assert.Equal(t, giverID, ms[0].Mob)
	return ms[0]
}

func killHunt(p *fakeLearner) {
	p.ledger.NoteKill(3)
	p.ledger.NoteKill(3)
}

// The whole lifecycle on one giver: `!` → grey `?` → yellow `?` → nothing.
func TestQuestMarkers_FollowTheQuestThroughItsLife(t *testing.T) {
	def := giver([]mobs.InteractionGrant{offerOf(questID)}, []mobs.InteractionGrant{turnInOf(questID)})
	q := leveledQuest(questID, 3)
	p := newQuestLearner(t, 2, q)

	m := onlyMarker(t, markersFor(p, def))
	assert.Equal(t, model.QuestMarkerOffer, m.Kind)
	assert.Equal(t, 3, m.Level, "the `!` carries the quest's level")

	require.NoError(t, p.ledger.Accept(questID))
	m = onlyMarker(t, markersFor(p, def))
	assert.Equal(t, model.QuestMarkerInProgress, m.Kind, "accepted and hunting: the grey `?`")
	assert.Equal(t, 0, m.Level)

	killHunt(p)
	assert.Equal(t, model.QuestMarkerTurnIn, onlyMarker(t, markersFor(p, def)).Kind, "at the report stage: the yellow `?`")

	require.NoError(t, p.ledger.AdvanceDialogue(questID, stageTurn, stageDone))
	assert.Empty(t, markersFor(p, def), "turned in: nothing left to show")
}

// D8: a takeable turn-in outranks an offer on the same NPC.
func TestQuestMarkers_TurnInBeatsOffer(t *testing.T) {
	def := giver([]mobs.InteractionGrant{offerOf("other")}, []mobs.InteractionGrant{turnInOf(questID)})
	p := newQuestLearner(t, 1, leveledQuest(questID, 1), leveledQuest("other", 1))
	require.NoError(t, p.ledger.Accept(questID))
	killHunt(p)
	assert.Equal(t, model.QuestMarkerTurnIn, onlyMarker(t, markersFor(p, def)).Kind)
}

// D8: an offer outranks a grey `?`.
func TestQuestMarkers_OfferBeatsInProgress(t *testing.T) {
	def := giver([]mobs.InteractionGrant{offerOf("other")}, []mobs.InteractionGrant{turnInOf(questID)})
	p := newQuestLearner(t, 1, leveledQuest(questID, 1), leveledQuest("other", 4))
	require.NoError(t, p.ledger.Accept(questID))
	m := onlyMarker(t, markersFor(p, def))
	assert.Equal(t, model.QuestMarkerOffer, m.Kind)
	assert.Equal(t, 4, m.Level)
}

// D8: with several offers the `!` takes the lowest NON-trivial level, and only
// when every offer is trivial (grey) the lowest of all.
func TestQuestMarkers_SeveralOffersTakeTheLowestNonTrivialLevel(t *testing.T) {
	def := giver([]mobs.InteractionGrant{offerOf("a")}, []mobs.InteractionGrant{offerOf("b")}, []mobs.InteractionGrant{offerOf("c")})
	defs := []*quests.QuestDefinition{leveledQuest("a", 1), leveledQuest("b", 5), leveledQuest("c", 18)}

	// Player 10: the gray distance is 5 + 10/10 = 6, so level 1 (Δ -9) is
	// trivial and level 5 (Δ -5) is not.
	assert.Equal(t, 5, onlyMarker(t, markersFor(newQuestLearner(t, 10, defs...), def)).Level)
	// Player 30: gray distance 8, so 1 and 5 are trivial and 18 (Δ -12) too.
	assert.Equal(t, 1, onlyMarker(t, markersFor(newQuestLearner(t, 30, defs...), def)).Level,
		"all trivial: the lowest, which the client draws grey")
}

// A turn-in row's TRAILING offer_quest (Eliza's dinner turn-in hands over the
// next quest) is a reward inside the bundle, never the row's lead grant.
func TestQuestMarkers_ATrailingOfferIsNotAnExclamation(t *testing.T) {
	def := giver([]mobs.InteractionGrant{turnInOf(questID), offerOf("next")})
	p := newQuestLearner(t, 1, leveledQuest(questID, 1), leveledQuest("next", 1))
	assert.Empty(t, markersFor(p, def), "nothing running: the turn-in row is hidden, so is its reward")

	require.NoError(t, p.ledger.Accept(questID))
	killHunt(p)
	assert.Equal(t, model.QuestMarkerTurnIn, onlyMarker(t, markersFor(p, def)).Kind)
}

// Rows count only when the panel can REACH them from the entry node, which is
// how the player meets them; present() also serialises visible nodes nothing
// leads to.
func TestQuestMarkers_OnlyRowsReachableFromTheEntryNode(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Hello."}, Options: []mobs.InteractionOption{{Text: "Work?", Next: "work"}}},
		{ID: "work", Lines: []string{"Pelts."}, Options: []mobs.InteractionOption{{Text: "Yes", Grants: []mobs.InteractionGrant{offerOf(questID)}}}},
		{ID: "orphan", Lines: []string{"Never reached."}, Options: []mobs.InteractionOption{{Text: "Yes", Grants: []mobs.InteractionGrant{offerOf("other")}}}},
	}}
	def := &mobs.MobDefinition{ID: giverID, Name: "Giver", Interaction: in}
	p := newQuestLearner(t, 1, leveledQuest(questID, 2), leveledQuest("other", 1))

	m := onlyMarker(t, markersFor(p, def))
	assert.Equal(t, model.QuestMarkerOffer, m.Kind, "an offer one node down still marks the giver")
	assert.Equal(t, 2, m.Level, "the orphan node's offer is not counted")
}

// D11: the grey `?` is on the NPC who finishes the quest, not the one who gave
// it: two finishers of one branch both show it, and an unrelated NPC does not.
func TestQuestMarkers_InProgressMarksEveryFinisherOnly(t *testing.T) {
	q := leveledQuest(questID, 1)
	q.Stages = append(q.Stages, &quests.Stage{ID: "done-b", Journal: "Done otherwise."})
	finisherA := giver([]mobs.InteractionGrant{turnInOf(questID)})
	finisherB := giver([]mobs.InteractionGrant{{Kind: mobs.GrantAdvanceQuest, Quest: questID, FromStage: stageTurn, ToStage: "done-b"}})
	finisherB.ID = 41
	bystander := giver([]mobs.InteractionGrant{offerOf("other")})
	bystander.ID = 42

	p := newQuestLearner(t, 1, q, leveledQuest("other", 1))
	require.NoError(t, p.ledger.Accept(questID))
	require.NoError(t, p.ledger.Accept("other"))

	ms := markersFor(p, finisherA, finisherB, bystander)
	require.Len(t, ms, 2)
	assert.Equal(t, model.QuestMarker{Mob: giverID, Kind: model.QuestMarkerInProgress, Quests: []string{questID}}, ms[0])
	assert.Equal(t, model.QuestMarker{Mob: 41, Kind: model.QuestMarkerInProgress, Quests: []string{questID}}, ms[1])
}

// A mob with no interaction, or a conversant with nothing quest-shaped, shows
// nothing; a missing ledger fails closed.
func TestQuestMarkers_NothingToShow(t *testing.T) {
	p := newQuestLearner(t, 1, leveledQuest(questID, 1))
	assert.Empty(t, markersFor(p, &mobs.MobDefinition{ID: 7, Name: "Wolf"}))
	assert.Empty(t, markersFor(p, giver([]mobs.InteractionGrant{namedGrant(1, "Torch", 0, "here")})))

	def := giver([]mobs.InteractionGrant{offerOf(questID)})
	assert.Empty(t, markersFor(newLearner(1), def), "no ledger: fail closed")
}

// plan-quest-giver-markers.md D4: the offer row carries its quest's level, so
// the panel can tint it; every other row (the turn-in included) carries 0.
func TestPresent_OfferRowCarriesTheQuestLevel(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{{
		ID: "root", Lines: []string{"Hello."},
		Options: []mobs.InteractionOption{
			{Text: "I'll do it.", Grants: []mobs.InteractionGrant{offerOf("other")}},
			{Text: "Here.", Grants: []mobs.InteractionGrant{turnInOf(questID)}},
			{Text: "Bye."},
		},
	}}}
	p := newQuestLearner(t, 1, leveledQuest(questID, 1), leveledQuest("other", 6))
	require.NoError(t, p.ledger.Accept(questID))
	killHunt(p)

	rows := rowsOf(t, present(in, p, noRows, noTravel), "root")
	require.Len(t, rows, 3)
	assert.EqualValues(t, 6, rows[0].QuestLevel, "the offer row")
	assert.EqualValues(t, 0, rows[1].QuestLevel, "the turn-in row is not tinted")
	assert.EqualValues(t, 0, rows[2].QuestLevel, "a navigation row")
}

// The world map's hover lists every quest a giver's marker covers, so the
// marker names them whatever its kind: the steps to take here now, then the
// offers (trivial ones too), then the quests this NPC finishes later. Each
// quest once, a trailing reward offer never.
func TestQuestMarkers_NameEveryQuestTheGiverCovers(t *testing.T) {
	def := giver(
		[]mobs.InteractionGrant{offerOf("easy")},
		[]mobs.InteractionGrant{turnInOf(questID), offerOf("reward")},
		[]mobs.InteractionGrant{offerOf("hard")},
		[]mobs.InteractionGrant{{Kind: mobs.GrantAdvanceQuest, Quest: "running", FromStage: stageTurn, ToStage: stageDone}},
	)
	p := newQuestLearner(t, 10,
		leveledQuest(questID, 10), leveledQuest("reward", 10), leveledQuest("running", 10),
		leveledQuest("easy", 1), leveledQuest("hard", 12))
	require.NoError(t, p.ledger.Accept(questID))
	require.NoError(t, p.ledger.Accept("running"))
	killHunt(p) // both accepted quests hunt the same target: questID AND running are at the report

	m := onlyMarker(t, markersFor(p, def))
	assert.Equal(t, model.QuestMarkerTurnIn, m.Kind)
	assert.Equal(t, []string{questID, "running", "easy", "hard"}, m.Quests)
}

// An in-progress giver names the quest it finishes.
func TestQuestMarkers_InProgressNamesItsQuest(t *testing.T) {
	def := giver([]mobs.InteractionGrant{turnInOf(questID)})
	p := newQuestLearner(t, 1, leveledQuest(questID, 1))
	require.NoError(t, p.ledger.Accept(questID))
	assert.Equal(t, []string{questID}, onlyMarker(t, markersFor(p, def)).Quests)
}
