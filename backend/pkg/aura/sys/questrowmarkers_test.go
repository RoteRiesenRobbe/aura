package sys

// plan-dialogue-quest-icons.md QI1: every presented row wears the marker the
// NPC's head would wear if that row were the whole conversation (D2).

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
)

// hermitShaped is the two-row quest shape (plan-quest-dialogue.md D11) with
// every kind of neighbour a quest row has: a lore leaf, a locked gate, a row
// pointing back at root and a row-source node.
func hermitShaped() *mobs.Interaction {
	running := mobs.Gate{Conditions: []mobs.InteractionCondition{
		{Kind: mobs.ConditionQuestAtStage, Quest: questID, Stage: mobs.QuestStageRunning},
	}}
	completed := mobs.Gate{Conditions: []mobs.InteractionCondition{
		{Kind: mobs.ConditionQuestAtStage, Quest: questID, Stage: mobs.QuestStageCompleted},
	}}
	return &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Hello."}, Options: []mobs.InteractionOption{
			{Text: "Anything?", Next: "offer"},
			{Text: "About the pelts...", Next: "progress"},
			{Text: "Tell me more.", Next: "lore"},
			{Text: "Later", Next: "veteran", LockedWhenGated: true},
			{Text: "Your wares?", Next: "wares"},
		}},
		{ID: "offer", Lines: []string{"Pelts."}, Options: []mobs.InteractionOption{
			{Text: "I'll do it.", Grants: []mobs.InteractionGrant{offerOf(questID)}},
			{Text: "Something else?", Next: "root"},
		}},
		{ID: "progress", Gate: running, Lines: []string{"Well?"}, Options: []mobs.InteractionOption{
			{Text: "Here they are.", Grants: []mobs.InteractionGrant{turnInOf(questID)}},
			{Text: "I am on it."},
		}},
		{ID: "lore", Lines: []string{"Wolves."}},
		{ID: "veteran", Gate: completed, Lines: []string{"Thanks."}},
		{ID: "wares", Rows: "graveyard", Lines: []string{"Nothing."}},
	}}
}

// markerRows maps each presented row's text, on one node, to its marker.
func markerRows(t *testing.T, c *model.Conversation, nodeID string) map[string]model.QuestMarkerKind {
	t.Helper()
	out := map[string]model.QuestMarkerKind{}
	for _, r := range rowsOf(t, c, nodeID) {
		out[r.Text] = r.QuestMarker
	}
	return out
}

func TestQuestRowMarkers_FollowTheQuestDownTheTree(t *testing.T) {
	in := hermitShaped()
	p := newQuestLearner(t, 2, leveledQuest(questID, 3))
	src := stubRows{kind: "graveyard", text: "A grave row"}

	// Offered: the leading row and the Accept both wear the `!` and its level.
	c := present(in, p, src, noTravel)
	root := rowsOf(t, c, "root")
	assert.Equal(t, model.QuestMarkerOffer, root[0].QuestMarker, "the leading row")
	assert.EqualValues(t, 3, root[0].QuestLevel, "the leading row carries the `!` tint's level (D3)")
	accept := rowsOf(t, c, "offer")[0]
	assert.Equal(t, model.QuestMarkerOffer, accept.QuestMarker, "the Accept row")
	assert.EqualValues(t, 3, accept.QuestLevel)
	assert.Equal(t, model.QuestMarkerNone, markerRows(t, c, "offer")["Something else?"],
		"a row pointing back at root never inherits the NPC's marker (D2 guard)")
	marks := markerRows(t, c, "root")
	assert.Equal(t, model.QuestMarkerNone, marks["Tell me more."], "a lore row")
	assert.Equal(t, model.QuestMarkerNone, marks["Your wares?"], "a row into a row-source node")
	for _, r := range rowsOf(t, c, "root") {
		if r.Locked {
			assert.Equal(t, model.QuestMarkerNone, r.QuestMarker, "a locked row is inert")
		}
	}
	for _, r := range rowsOf(t, c, "wares") {
		assert.Equal(t, model.QuestMarkerNone, r.QuestMarker, "a row-source node's rows (M landmine 3)")
	}

	// Running, still hunting: the progress row is grey although its hand-in is hidden (L2).
	require.NoError(t, p.ledger.Accept(questID))
	c = present(in, p, src, noTravel)
	marks = markerRows(t, c, "root")
	assert.Equal(t, model.QuestMarkerInProgress, marks["About the pelts..."])
	assert.Equal(t, model.QuestMarkerNone, marks["Anything?"], "the offer is taken")
	assert.Equal(t, model.QuestMarkerNone, markerRows(t, c, "progress")["I am on it."])
	for _, r := range rowsOf(t, c, "root") {
		assert.Zero(t, r.QuestLevel, "%q: no offer, no level", r.Text)
	}

	// The hand-in is walkable: yellow on both levels.
	killHunt(p)
	c = present(in, p, src, noTravel)
	assert.Equal(t, model.QuestMarkerTurnIn, markerRows(t, c, "root")["About the pelts..."])
	progress := markerRows(t, c, "progress")
	assert.Equal(t, model.QuestMarkerTurnIn, progress["Here they are."])
	assert.Equal(t, model.QuestMarkerNone, progress["I am on it."])
	// The guard's real test: root now leads to a yellow `?`, and a row pointing
	// back at root must still not wear it.
	assert.Equal(t, model.QuestMarkerNone, markerRows(t, c, "offer")["Something else?"],
		"a row pointing back at root never inherits the NPC's marker (D2 guard)")
}

// D2.3: one row leading to both an offer and a hand-in shows the hand-in.
func TestQuestRowMarkers_TurnInBeatsOfferBeneathOneRow(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Hello."}, Options: []mobs.InteractionOption{{Text: "Work?", Next: "work"}}},
		{ID: "work", Lines: []string{"Both."}, Options: []mobs.InteractionOption{
			{Text: "Take", Grants: []mobs.InteractionGrant{offerOf("other")}},
			{Text: "Hand in", Grants: []mobs.InteractionGrant{turnInOf(questID)}},
		}},
	}}
	p := newQuestLearner(t, 1, leveledQuest(questID, 1), leveledQuest("other", 4))
	require.NoError(t, p.ledger.Accept(questID))
	killHunt(p)

	row := rowsOf(t, present(in, p, noRows, noTravel), "root")[0]
	assert.Equal(t, model.QuestMarkerTurnIn, row.QuestMarker)
}

// A trailing offer_quest in a turn-in bundle (Eliza's dinner) is a reward: the
// row and the row leading to it stay turn-in, untinted.
func TestQuestRowMarkers_ATrailingOfferStaysATurnIn(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Hello."}, Options: []mobs.InteractionOption{{Text: "Dinner?", Next: "dinner"}}},
		{ID: "dinner", Lines: []string{"Well?"}, Options: []mobs.InteractionOption{
			{Text: "Here.", Grants: []mobs.InteractionGrant{turnInOf(questID), offerOf("next")}},
		}},
	}}
	p := newQuestLearner(t, 1, leveledQuest(questID, 1), leveledQuest("next", 5))
	require.NoError(t, p.ledger.Accept(questID))
	killHunt(p)

	c := present(in, p, noRows, noTravel)
	for _, node := range []string{"root", "dinner"} {
		row := rowsOf(t, c, node)[0]
		assert.Equal(t, model.QuestMarkerTurnIn, row.QuestMarker, node)
		assert.Zero(t, row.QuestLevel, node)
	}
}

// Q2: a leading row covering several offers tints its `!` by the lowest level.
func TestQuestRowMarkers_SeveralOffersTakeTheLowestLevel(t *testing.T) {
	in := &mobs.Interaction{Nodes: []mobs.InteractionNode{
		{ID: "root", Lines: []string{"Hello."}, Options: []mobs.InteractionOption{{Text: "Work?", Next: "work"}}},
		{ID: "work", Lines: []string{"Two."}, Options: []mobs.InteractionOption{
			{Text: "A", Grants: []mobs.InteractionGrant{offerOf("a")}},
			{Text: "B", Grants: []mobs.InteractionGrant{offerOf("b")}},
		}},
	}}
	p := newQuestLearner(t, 1, leveledQuest("a", 5), leveledQuest("b", 2))

	row := rowsOf(t, present(in, p, noRows, noTravel), "root")[0]
	assert.Equal(t, model.QuestMarkerOffer, row.QuestMarker)
	assert.EqualValues(t, 2, row.QuestLevel)
}

// ⭐ The invariant pin (§6, Q1): the head marker and the entry node's rows are
// two derivations of one fact. Against the REAL content, at every quest state
// a fixture player can be put in, the head's `!` / yellow `?` is the best row
// stamp on the entry node, and a grey row never sits under a bare head.
//
// ⚑ It reads the EMBEDDED content: `make -C backend cp-defs` after an api/ edit,
// and `-count=1` (a content edit does not invalidate the test cache).
func TestContent_RowMarkersAgreeWithTheHeadMarker(t *testing.T) {
	mr, qr := contentRegistries(t)

	var conversants []*mobs.MobDefinition
	for _, m := range mr.Mobs() {
		if m.Interaction != nil {
			conversants = append(conversants, m)
		}
	}
	require.NotEmpty(t, conversants)

	// The states: nothing taken, then per quest: just accepted, and parked at
	// every stage some conversant hands it in from.
	states := []quests.LedgerState{{}}
	advances, _ := questSites(mr, mobs.GrantAdvanceQuest)
	for _, q := range qr.All() {
		states = append(states, quests.LedgerState{Quests: map[string]quests.Progress{
			q.ID: {Path: []string{q.Stages[0].ID}, Running: true},
		}})
		for _, s := range advances {
			if s.grant.Quest == q.ID && s.grant.FromStage != q.Stages[0].ID {
				states = append(states, quests.LedgerState{Quests: map[string]quests.Progress{
					q.ID: {Path: []string{q.Stages[0].ID, s.grant.FromStage}, Running: true},
				}})
			}
		}
	}

	rank := map[model.QuestMarkerKind]int{
		model.QuestMarkerNone: 0, model.QuestMarkerInProgress: 1, model.QuestMarkerOffer: 2, model.QuestMarkerTurnIn: 3,
	}
	checked := 0
	for _, st := range states {
		p := newLearner(30)
		p.ledger = quests.NewLedger(qr)
		p.ledger.Restore(st)
		for _, def := range conversants {
			head := model.QuestMarkerNone
			if ms := QuestMarkers([]*mobs.MobDefinition{def}, p, curve.DefaultKillXP()); len(ms) == 1 {
				head = ms[0].Kind
			}
			best := model.QuestMarkerNone
			if c := present(def.Interaction, p, noRows, noTravel); c != nil {
				for _, r := range rowsOf(t, c, c.EntryNode) {
					if rank[r.QuestMarker] > rank[best] {
						best = r.QuestMarker
					}
				}
			}
			if head == model.QuestMarkerOffer || head == model.QuestMarkerTurnIn ||
				best == model.QuestMarkerOffer || best == model.QuestMarkerTurnIn {
				assert.Equal(t, head, best, "%s in %v: the head and its rows disagree", def.Name, st)
			}
			if best == model.QuestMarkerInProgress {
				assert.NotEqual(t, model.QuestMarkerNone, head, "%s in %v: a grey row under a bare head", def.Name, st)
			}
			if best != model.QuestMarkerNone {
				checked++
			}
		}
	}
	assert.NotZero(t, checked, "the pin judged no marked row at all")
}
