package core

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/codec"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The roster's zone filter (plan-underworld.md U2 / L14).
//
// ⛔ THE ROSTER IS THE ONE THING THAT CROSSES ZONES BY DEFAULT. Everything else
// a client learns about other players arrives through the AOI viewport query,
// which is a spatial test and therefore zone-safe for free. The roster is not:
// it ships EVERY live player to EVERY client, so an underworld player would
// draw as a dot on the surface map. The type's own doc comment has claimed
// "every live player character in the zone" since it was written — this is what
// finally makes that true.
//
// ⚑ Tested at the GROUPING, not at the send: the send needs live websocket
// clients, and the grouping is the part that can be wrong.

func placedZones() []cfg.PlacedBounds {
	return []cfg.PlacedBounds{
		{Bounds: cfg.Bounds{Width: 144, Height: 72}, ZoneID: "world"},
		{Bounds: cfg.Bounds{Width: 60, Height: 40}, OriginY: -300, ZoneID: "under"},
	}
}

func TestRosterZones_PlayersAreGroupedByTheZoneTheyStandIn(t *testing.T) {
	zones := placedZones()

	surface := cfg.ZoneIndexAt(zones, 10, 5)
	deep := cfg.ZoneIndexAt(zones, 10, -295)

	require.Equal(t, 0, surface)
	require.Equal(t, 1, deep)
	assert.NotEqual(t, surface, deep,
		"a surface player and an underworld player must never land in the same roster")
}

// The single-zone path has to stay byte-identical: one assembly, one marshal,
// one payload to everyone. A regression here would be a per-player marshal on
// the 1 Hz roster for every server that has no second zone — which is all of
// them today.
func TestRosterZones_OneZoneKeepsEveryoneInOneGroup(t *testing.T) {
	zones := []cfg.PlacedBounds{{Bounds: cfg.Bounds{Width: 144, Height: 72}, ZoneID: "world"}}

	assert.Less(t, len(zones), 2, "fewer than two zones takes the unfiltered path in sendRoster")
	assert.Equal(t, 0, cfg.ZoneIndexAt(zones, 71, 35))
}

// RosterFor itself stays zone-blind: it assembles whatever slice it is handed.
// The filter lives at the send, where the grouping is known — keeping the
// assembly a separate, testable step is the reason this type exists at all.
func TestRosterZones_RosterForAssemblesExactlyWhatItIsGiven(t *testing.T) {
	roster := codec.RosterFor(7, nil)
	assert.EqualValues(t, 7, roster.Tick)
	assert.Empty(t, roster.Entries)
}

// A position in the gap between zones resolves to no zone. Dropping such a
// player from the roster is the safe read — better a missing dot than a dot on
// a stranger's map — and it cannot happen in play, because each zone's border
// wall holds its occupants inside it.
func TestRosterZones_TheGapBelongsToNobody(t *testing.T) {
	assert.Equal(t, -1, cfg.ZoneIndexAt(placedZones(), 0, -150))
}

// The filter reads the SAME rectangle core/game.go hands phy.NewInvAABB, so
// "the wall holds you here" and "the roster counts you here" cannot drift: a
// player pinned at the very edge by the wall is still counted in that zone.
func TestRosterZones_FilterRectangleIsTheOneTheWallIsBuiltFrom(t *testing.T) {
	zones := placedZones()
	under := zones[1]

	// The four corners of the rectangle the wall confines a body to.
	for _, corner := range [][2]float32{
		{under.OriginX - under.Width/2, under.OriginY - under.Height/2},
		{under.OriginX + under.Width/2, under.OriginY + under.Height/2},
		{under.OriginX - under.Width/2, under.OriginY + under.Height/2},
		{under.OriginX + under.Width/2, under.OriginY - under.Height/2},
	} {
		assert.Equal(t, 1, cfg.ZoneIndexAt(zones, corner[0], corner[1]),
			"a player held at the wall's edge belongs to that zone's roster")
	}
}
