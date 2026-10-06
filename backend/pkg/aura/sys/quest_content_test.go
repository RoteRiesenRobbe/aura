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
