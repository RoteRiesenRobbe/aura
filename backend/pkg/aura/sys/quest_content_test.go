package sys

// The two-row quest shape against the REAL content (plan-quest-dialogue.md C2,
// D11): Reinhard's rats, walked through present() and applyGrant at every quest
// state. The engine rules this leans on (the show-rule, the dead-end prune) are
// pinned elsewhere; this pins that the authored file composes them into the
// shape the manual names as the norm.
//
// ⚑ It reads the EMBEDDED content: run `make -C backend cp-defs` after editing
// api/mobs/reinhard.json, or this judges the previous copy.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	afactions "github.com/RoteRiesenRobbe/aura/pkg/api/factions"
	amobs "github.com/RoteRiesenRobbe/aura/pkg/api/mobs"
	aquests "github.com/RoteRiesenRobbe/aura/pkg/api/quests"
	askills "github.com/RoteRiesenRobbe/aura/pkg/api/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/factions"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/quests"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// contentRegistries loads the embedded mobs and quests the way the server does.
func contentRegistries(t *testing.T) (mobs.Registry, quests.Registry) {
	t.Helper()
	fr, err := factions.RegistryFromFS(afactions.Factions)
	require.NoError(t, err)
	sr, err := skills.RegistryFromFS(askills.Skills, fr)
	require.NoError(t, err)
	mr, err := mobs.RegistryFromFS(sr, fr, curve.Default(), amobs.Mobs)
	require.NoError(t, err)
	qr, err := quests.RegistryFromFS(aquests.Quests, mr)
	require.NoError(t, err)
	_, err = quests.CrossValidate(mr, qr)
	require.NoError(t, err)
	return mr, qr
}

func optionTexts(rows []model.ConversationOption) []string {
	texts := make([]string, 0, len(rows))
	for _, r := range rows {
		texts = append(texts, r.Text)
	}
	return texts
}

const (
	ratsQuest    = "giant-rats-in-the-barn"
	ratsOffer    = "Anything in the barn?"
	ratsProgress = "About the rats in the barn..."
	ratsAccept   = "I'll do it."
	ratsTurnIn   = "I killed the 8 rats."
	ratsOnIt     = "I am on it."
	ratsMore     = "Tell me more about rats."
)

func TestContent_ReinhardsRatsQuestSwapsItsRootRow(t *testing.T) {
	mr, qr := contentRegistries(t)
	reinhard, err := mr.GetByName("Reinhard")
	require.NoError(t, err)
	rat, err := mr.GetByName("GiantRat")
	require.NoError(t, err)
	in := reinhard.Interaction

	p := newLearner(2)
	p.ledger = quests.NewLedger(qr)

	root := func() []string { return optionTexts(rowsOf(t, present(in, p, noRows, noTravel), "root")) }
	progress := func() []string {
		return optionTexts(rowsOf(t, present(in, p, noRows, noTravel), "rats_running"))
	}
	click := func(nodeID, text string) {
		t.Helper()
		for _, r := range rowsOf(t, present(in, p, noRows, noTravel), nodeID) {
			if r.Text == text {
				_, _, ok := applyGrant(in, p, noRows, noTravel, nodeID, int(r.OptionIndex), int(r.GrantIndex))
				require.True(t, ok, "click %q on %q", text, nodeID)
				return
			}
		}
		t.Fatalf("no row %q on %q", text, nodeID)
	}

	// Not started: the offer row only, and the offer node holds nothing but Accept.
	assert.Contains(t, root(), ratsOffer)
	assert.NotContains(t, root(), ratsProgress, "the progress node has nothing to show yet")
	assert.Equal(t, []string{ratsAccept},
		optionTexts(rowsOf(t, present(in, p, noRows, noTravel), "rats")), "the offer node is brief + Accept")

	// Killing: the root row swaps.
	click("rats", ratsAccept)
	assert.NotContains(t, root(), ratsOffer, "the offer row leaves with the accept")
	assert.Contains(t, root(), ratsProgress)
	assert.Equal(t, []string{ratsOnIt, ratsMore}, progress(), "while killing: the stage answer and the question")

	// Rats dead: the report stage brings the turn-in and retires "I am on it."
	for i := 0; i < 8; i++ {
		p.ledger.NoteKill(rat.ID)
	}
	assert.Equal(t, []string{ratsTurnIn, ratsMore}, progress(), "at the report stage: the turn-in and the question")

	// Completed: the question is gated `running`, so the progress node empties
	// and its root row leaves with the turn-in (D15, PO 2026-10-07: the norm for
	// most quests). Neither row comes back.
	click("rats_running", ratsTurnIn)
	_, running, completed := p.ledger.Progress(ratsQuest)
	require.True(t, completed && !running)
	assert.NotContains(t, root(), ratsOffer)
	assert.NotContains(t, root(), ratsProgress, "the progress row leaves at the turn-in")
	assert.Empty(t, progress())
}

// An abandon puts the quest back to not started: the offer row returns, and the
// progress row leaves with the running band.
func TestContent_ReinhardsRatsQuestAbandonBringsTheOfferBack(t *testing.T) {
	mr, qr := contentRegistries(t)
	reinhard, err := mr.GetByName("Reinhard")
	require.NoError(t, err)
	in := reinhard.Interaction

	p := newLearner(2)
	p.ledger = quests.NewLedger(qr)
	require.NoError(t, p.ledger.Accept(ratsQuest))
	require.NoError(t, p.ledger.Abandon(ratsQuest))

	root := optionTexts(rowsOf(t, present(in, p, noRows, noTravel), "root"))
	assert.Contains(t, root, ratsOffer)
	assert.NotContains(t, root, ratsProgress)
}

// The two-row shape on EVERY quest (plan-quest-dialogue.md C3, L5): for each
// node holding a quest's turn-in, the rows leading there are absent before the
// accept, present at the working stage and at the report stage, and gone after
// the turn-in; the rows leading to the quest's offer node show only before the
// accept. A turn-in on an entry node (a node no row leads to) is the old
// one-node shape's leftover, or a giver that skipped the progress row.
//
// Exempt by name, each a PO ruling: the Grandfather Knot's two quests keep their
// flow (D13); `eliza-sends-me` has no brief and turns in on Reinhard's root
// (D17); `wolves-on-the-road` turns in on root at two NPCs that did not give it
// (D18; its giver, the Town Crier, is walked by the offer half).
var twoRowExempt = map[string]bool{
	"clear-the-grove":    true,
	"the-sleeping-roots": true,
	"eliza-sends-me":     true,
	"wolves-on-the-road": true,
}

type questSite struct {
	mob    *mobs.MobDefinition
	nodeID string
	grant  mobs.InteractionGrant
}

// questSites finds every node carrying a quest grant of the given kind, and
// which nodes are entry nodes (no authored row leads to them).
func questSites(mr mobs.Registry, kind mobs.GrantKind) ([]questSite, map[*mobs.MobDefinition]map[string]bool) {
	var sites []questSite
	entries := map[*mobs.MobDefinition]map[string]bool{}
	for _, m := range mr.Mobs() {
		if m.Interaction == nil {
			continue
		}
		led := map[string]bool{}
		for _, n := range m.Interaction.Nodes {
			for _, o := range n.Options {
				if o.Next != "" {
					led[o.Next] = true
				}
			}
		}
		entries[m] = map[string]bool{}
		for _, n := range m.Interaction.Nodes {
			if !led[n.ID] {
				entries[m][n.ID] = true
			}
			for _, o := range n.Options {
				for _, g := range o.Grants {
					if g.Kind == kind {
						sites = append(sites, questSite{mob: m, nodeID: n.ID, grant: g})
					}
				}
			}
		}
	}
	return sites, entries
}

// rowsInto reports whether any presented row, on any presented node, leads to
// nodeID: that is the root row the dead-end prune keeps or takes away, whichever
// entry node (Eliza's root_fed, the traveller's root_lit) is speaking.
func rowsInto(c *model.Conversation, nodeID string) bool {
	for _, n := range c.Nodes {
		for _, o := range n.Options {
			if o.Next == nodeID {
				return true
			}
		}
	}
	return false
}

func TestContent_EveryQuestTurnsInBehindAProgressRow(t *testing.T) {
	mr, qr := contentRegistries(t)
	turnIns, entries := questSites(mr, mobs.GrantAdvanceQuest)
	require.NotEmpty(t, turnIns)

	for _, s := range turnIns {
		q, err := qr.Get(s.grant.Quest)
		require.NoError(t, err)
		if twoRowExempt[q.ID] {
			continue
		}
		name := s.mob.Name + "/" + q.ID
		t.Run(name, func(t *testing.T) {
			in := s.mob.Interaction
			require.False(t, entries[s.mob][s.nodeID],
				"the turn-in sits on entry node %q: move it to a progress node behind an \"About the ...\" row", s.nodeID)

			p := newLearner(30)
			p.ledger = quests.NewLedger(qr)
			shows := func() bool { return rowsInto(present(in, p, noRows, noTravel), s.nodeID) }

			assert.False(t, shows(), "before the accept the progress row is hidden")

			require.NoError(t, p.ledger.Accept(q.ID))
			assert.True(t, shows(), "at the working stage the progress row shows (author \"I am on it.\" gated on the stage)")

			p.ledger.Restore(quests.LedgerState{Quests: map[string]quests.Progress{
				q.ID: {Path: []string{q.Stages[0].ID, s.grant.FromStage}, Running: true},
			}})
			require.True(t, p.ledger.MatchesStage(q.ID, s.grant.FromStage))
			require.True(t, shows(), "at the report stage the progress row shows")

			click := func() {
				for _, r := range rowsOf(t, present(in, p, noRows, noTravel), s.nodeID) {
					if r.GrantIndex == 0 && in.Nodes[nodeIndex(t, in, s.nodeID)].Options[r.OptionIndex].Grants[0].Quest == q.ID {
						_, _, ok := applyGrant(in, p, noRows, noTravel, s.nodeID, int(r.OptionIndex), int(r.GrantIndex))
						require.True(t, ok)
						return
					}
				}
				t.Fatalf("no turn-in row presented on %q", s.nodeID)
			}
			click()
			_, running, completed := p.ledger.Progress(q.ID)
			require.True(t, completed && !running)
			assert.False(t, shows(), "after the turn-in the progress row is gone (D15/D16)")
		})
	}
}

func TestContent_EveryQuestOfferRowLeavesWithTheAccept(t *testing.T) {
	mr, qr := contentRegistries(t)
	offers, entries := questSites(mr, mobs.GrantOfferQuest)
	require.NotEmpty(t, offers)

	for _, s := range offers {
		q, err := qr.Get(s.grant.Quest)
		require.NoError(t, err)
		if twoRowExempt[q.ID] && q.ID != "wolves-on-the-road" {
			continue
		}
		t.Run(s.mob.Name+"/"+q.ID, func(t *testing.T) {
			in := s.mob.Interaction
			require.False(t, entries[s.mob][s.nodeID], "the offer sits on entry node %q", s.nodeID)

			p := newLearner(30)
			p.ledger = quests.NewLedger(qr)
			shows := func() bool { return rowsInto(present(in, p, noRows, noTravel), s.nodeID) }

			assert.True(t, shows(), "before the accept the offer row shows")
			require.NoError(t, p.ledger.Accept(q.ID))
			assert.False(t, shows(), "the offer row leaves with the accept: the offer node holds only Accept")
		})
	}
}

func nodeIndex(t *testing.T, in *mobs.Interaction, id string) int {
	t.Helper()
	for i, n := range in.Nodes {
		if n.ID == id {
			return i
		}
	}
	t.Fatalf("no node %q", id)
	return -1
}

// The Town Crier gives `wolves-on-the-road` but turns it in nowhere (D18: the
// City Guard and the Shaman take it on root), so the turn-in walk never sees
// his progress row: it shows while the wolves are hunted, and leaves when the
// word is to be carried elsewhere.
func TestContent_TheCriersWolvesRowLastsTheHunt(t *testing.T) {
	mr, qr := contentRegistries(t)
	crier, err := mr.GetByName("TownCrier")
	require.NoError(t, err)
	in := crier.Interaction

	p := newLearner(30)
	p.ledger = quests.NewLedger(qr)
	shows := func() bool { return rowsInto(present(in, p, noRows, noTravel), "wolves_running") }

	assert.False(t, shows(), "before the accept")
	require.NoError(t, p.ledger.Accept("wolves-on-the-road"))
	assert.True(t, shows(), "while the wolves are hunted")
	p.ledger.Restore(quests.LedgerState{Quests: map[string]quests.Progress{
		"wolves-on-the-road": {Path: []string{"thin", "carry_word"}, Running: true},
	}})
	assert.False(t, shows(), "once the word goes to the Guard or the Shaman")
}
