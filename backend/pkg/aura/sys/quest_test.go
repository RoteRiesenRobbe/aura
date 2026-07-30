package sys

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// questFixture wires a real player (with a real ledger on the state fixture's
// quest registry) to a QuestSystem, and hands back the client its journal rows
// arrive through.
func questFixture(t *testing.T) (*QuestSystem, model.PlayerEntity, *fakeClient) {
	t.Helper()
	s, g := newStateFixture(t)
	g.questReg = stateTestQuestRegistry(t)
	c := newFakeClient()
	p := joinPlayer(t, s, g, c, "Alice")

	qs := NewQuestSystem()
	qs.AddPlayer(p)
	return qs, p, c
}

// D13: abandoning returns the quest to not-started — path and diary cleared —
// while the lifetime counters stand, which is what makes it instantly
// re-completable and why L10 pins grant_xp to terminal edges.
func TestQuestSystem_AbandonClearsThePathAndKeepsTheCounters(t *testing.T) {
	qs, p, c := questFixture(t)
	require.NoError(t, p.QuestLedger().Accept("cull"))
	p.QuestLedger().NoteKill(7)

	c.abandons = append(c.abandons, &model.AbandonQuest{QuestID: "cull"})
	qs.Update(0)

	path, running, completed := p.QuestLedger().Progress("cull")
	assert.Empty(t, path, "the walked path — and with it the diary — is gone")
	assert.False(t, running)
	assert.False(t, completed)
	assert.Equal(t, uint64(1), p.QuestLedger().KillCount(7), "lifetime counters are untouched")
	assert.Empty(t, p.QuestLedger().Snapshot(), "and the quest leaves the journal entirely")

	// ...and it is offerable again, which is the whole point of the verb.
	assert.NoError(t, p.QuestLedger().Accept("cull"))
}

// A stale click — the quest finished, or was never running — is ordinary, not an
// error: the panel re-renders from the next snapshot either way.
func TestQuestSystem_RefusalsAreSilent(t *testing.T) {
	qs, p, c := questFixture(t)

	c.abandons = append(c.abandons,
		&model.AbandonQuest{QuestID: "cull"},       // known quest, not running
		&model.AbandonQuest{QuestID: "no-such-id"}, // not a quest at all
		&model.AbandonQuest{QuestID: ""},           // an empty row
	)
	assert.NotPanics(t, func() {
		qs.Update(0)
		qs.Update(0)
		qs.Update(0)
	})
	_, running, completed := p.QuestLedger().Progress("cull")
	assert.False(t, running)
	assert.False(t, completed)
}

// One message per player per tick, the drain shape every other client verb uses.
func TestQuestSystem_DrainsOnePerTick(t *testing.T) {
	qs, p, c := questFixture(t)
	require.NoError(t, p.QuestLedger().Accept("cull"))

	c.abandons = append(c.abandons,
		&model.AbandonQuest{QuestID: "cull"},
		&model.AbandonQuest{QuestID: "cull"},
	)
	qs.Update(0)
	assert.Len(t, c.abandons, 1, "the second waits for the next tick")
}

// A disconnected player must leave the drain list, or the system holds a
// reference to a client that has been closed.
func TestQuestSystem_RemoveDropsThePlayer(t *testing.T) {
	qs, p, _ := questFixture(t)
	require.Len(t, qs.players, 1)

	qs.Remove(p.Basic())
	assert.Empty(t, qs.players)
}
