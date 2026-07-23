package sys

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// The start screen's "players online" readout reads this from an HTTP
// goroutine (GET /players), so the count is published as an atomic snapshot
// once per tick rather than measured off the live players slice — only the
// game loop may touch that. These pin the snapshot against every flow that
// mutates it.

func TestPlayerCount_TracksJoinsAndDisconnects(t *testing.T) {
	s, g := newStateFixture(t)
	assert.Equal(t, 0, s.PlayerCount(), "an empty server counts nobody")

	joinPlayer(t, s, g, newFakeClient(), "Ana")
	assert.Equal(t, 1, s.PlayerCount(), "a joined player counts")

	p2 := joinPlayer(t, s, g, newFakeClient(), "Bo")
	assert.Equal(t, 2, s.PlayerCount())

	// Disconnect: the net layer removes the entity, the published count
	// catches up on the next tick.
	g.RemoveEntity(p2.Basic())
	s.Update(0)
	assert.Equal(t, 1, s.PlayerCount(), "a disconnected player stops counting")
}

func TestPlayerCount_ExcludesSpectatorsAndTheDead(t *testing.T) {
	s, g := newStateFixture(t)

	// A connected client that has not submitted a name is a spectator sitting
	// on the start screen — connected, but not in the world.
	g.AddEntity(spectatorFor(newFakeClient()))
	s.Update(0)
	assert.Equal(t, 0, s.PlayerCount(), "a client on the start screen is not a player")

	p := joinPlayer(t, s, g, newFakeClient(), "Ana")
	assert.Equal(t, 1, s.PlayerCount())

	kill(t, s, p)
	assert.Equal(t, 0, s.PlayerCount(), "a dead player is on the death overlay, not in the world")
}
