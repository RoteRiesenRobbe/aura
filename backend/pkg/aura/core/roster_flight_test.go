package core

// D16 — A FLYER IS INVISIBLE IN THE WORLD AND VISIBLE ON THE MAP
// (plan-flight-paths.md C4, PO ruling 2026-08-05).
//
// These tests exist to FAIL when someone adds `if p.Flying() { continue }` to
// codec.RosterFor. That line is not a hypothetical: five comments and two
// status docs used to instruct the next session to write it, because the plan
// treated world-visibility and map-visibility as one fact. They are two.
//
//   - The WORLD channel is closed, structurally: takeoff removes the flyer's
//     body, hand and aura shapes from phy.Space (D13), so every other player's
//     viewport query stops recording them. Pinned in player/flight_test.go and
//     at the browser surface by c3-flight-client.
//   - The MAP channel stays OPEN, deliberately: fires and the routes between
//     them are what the map is for, so a dot crossing it toward a fire is the
//     map doing its job. It is also the only way to know someone is inbound —
//     a dot approaches a fire, then a player materialises.
//
// The roster is one marshal shared by every viewer (sendRoster), so this
// cannot be a per-viewer choice: a flyer is on everyone's map or nobody's.
// That is what makes landmine 10 (flyers cannot see each other in the world)
// coexist with flyers seeing each other on the map without a third rule.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/api/AuraApi"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

func TestRoster_FlyerStaysOnTheMap(t *testing.T) {
	ana := newRosterPlayer(2, -3)
	bo := newRosterPlayer(-10, 0.5)
	bo.flying = true

	n := &NetSystem{game: &game{Tick: 90}}
	n.players = []model.PlayerEntity{ana, bo}
	n.sendRoster()

	roster := rosterFrom(t, ana.client.sent[0])
	require.Equal(t, 2, roster.EntriesLength(),
		"D16: a flyer is still a dot on other players' maps — do NOT filter Flying() out of codec.RosterFor")

	entry := &AuraApi.RosterEntry{}
	require.True(t, roster.Entries(entry, 1))
	assert.Equal(t, bo.basic.ID(), entry.Id(), "the flyer keeps their own id on the map")
}

func TestRoster_FlyerDotTracksTheLerp(t *testing.T) {
	// The payoff of D16 is watching someone CROSS the map, which only works
	// if the roster reads the in-air position rather than a takeoff snapshot.
	// It does, and for a reason worth pinning: core/input.go calls
	// p.SetPosition(pos) on every tick of the lerp, so Position() — the exact
	// accessor RosterFor reads — is live even though three of the player's
	// four shapes are out of the physics space. Nothing about leaving the
	// space freezes a position.
	ana := newRosterPlayer(0, 0)
	flyer := newRosterPlayer(-10, 0.5)
	flyer.flying = true

	n := &NetSystem{game: &game{Tick: 90}}
	n.players = []model.PlayerEntity{ana, flyer}
	n.sendRoster()

	// One tick of lerp later, the mover has written a new position.
	flyer.pos.X = -4
	n.sendRoster()

	// ⚑ The length check is load-bearing, not defensive: flatbuffers' Entries()
	// does not bounds-check, so reading index 1 of a filtered 1-entry roster
	// panics deep in the decoder instead of reporting the D16 breach. Assert
	// the count first and the failure names the rule.
	moved := rosterFrom(t, ana.client.sent[1])
	require.Equal(t, 2, moved.EntriesLength(),
		"D16: the flyer must still be on the roster mid-flight")

	entry := &AuraApi.RosterEntry{}
	require.True(t, moved.Entries(entry, 1))
	assert.InDelta(t, -4*codec.Points2px, entry.Pos(nil).X(), 0.01,
		"the dot moves with the flight, it does not sit at the origin fire")
}

func TestRoster_LandedPlayerIsUnremarkable(t *testing.T) {
	// The other half of the pin: landing changes nothing about the roster,
	// because takeoff changed nothing either. There is no restore-at-landing
	// gate here to forget — which is the entire reason D16 is cheaper than
	// the filter it replaced (landmine 1: every gate needs its restore).
	ana := newRosterPlayer(0, 0)
	flyer := newRosterPlayer(-10, 0.5)
	flyer.flying = true

	n := &NetSystem{game: &game{Tick: 90}}
	n.players = []model.PlayerEntity{ana, flyer}
	n.sendRoster()
	before := rosterFrom(t, ana.client.sent[0]).EntriesLength()

	flyer.flying = false // Ground()
	n.sendRoster()

	assert.Equal(t, before, rosterFrom(t, ana.client.sent[1]).EntriesLength(),
		"the roster is the same across takeoff and landing")
}
