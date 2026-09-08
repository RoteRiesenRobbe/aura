package main

import (
	"math"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The shipped passages, walked end to end over the REAL content
// (plan-underworld.md U3b).
//
// ⭐ THIS IS THE ROUND TRIP A BROWSER WOULD DO. Everything between a player
// pressing E and arriving is already covered by unit tests one layer down; what
// no unit test can see is whether the four doors the world actually places
// point at the four anchors the world actually authors, and whether following
// them gets you home. That is a property of the CONTENT, so it is pinned
// against the content.
//
// ⚑ It is also the D8 guard. A door inside a campfire’s dwell circle loses
// every E press to the client’s synthesized flight offer, which is invisible
// server-side and therefore invisible to every other test in the tree.

// passageDoors indexes the placed travel doors by the anchor they deliver to.
func placedDoors(t *testing.T, zones []*world.Zone) map[string]*world.Spawn {
	t.Helper()
	doors := map[string]*world.Spawn{}
	for _, z := range zones {
		for i := range z.Spawns {
			s := &z.Spawns[i]
			if s.Def == nil || s.Def.Interaction == nil {
				continue
			}
			for ni := range s.Def.Interaction.Nodes {
				for oi := range s.Def.Interaction.Nodes[ni].Options {
					for _, g := range s.Def.Interaction.Nodes[ni].Options[oi].Grants {
						if g.Kind == mobs.GrantTravelTo && g.Travel == mobs.TravelAnchor {
							doors[s.Anchor] = s
						}
					}
				}
			}
		}
	}
	return doors
}

func shippedZones(t *testing.T) []*world.Zone {
	t.Helper()
	mobsRegistry, propsRegistry := repoZoneRegistries(t)
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	zones, err := world.LoadZonesFS(content.zones, []string{"world", "underworld"},
		mobsRegistry, propsRegistry)
	require.NoError(t, err)
	return zones
}

// ⭐ Down one hole and back up the matching shaft, twice. The assertion that
// matters is the LAST one: you come back out beside the mouth you went in by,
// not beside the other one.
func TestPassages_EachOneReturnsYouWhereYouWentIn(t *testing.T) {
	zones := shippedZones(t)
	anchors := allAnchors(zones)
	doors := placedDoors(t, zones)

	for _, leg := range []struct{ down, up string }{
		{down: "under-west", up: "surface-west"},
		{down: "under-east", up: "surface-east"},
	} {
		mouth := doors[leg.down]
		require.NotNil(t, mouth, "no placed door travels to %q", leg.down)
		assert.Equal(t, "CaveMouth", mouth.Mob)

		arrival, ok := anchors[leg.down]
		require.True(t, ok, "anchor %q is not authored anywhere", leg.down)

		exit := doors[leg.up]
		require.NotNil(t, exit, "no placed door travels to %q", leg.up)
		assert.Equal(t, "CaveExit", exit.Mob)

		// ⚑ You have to be able to WALK to the way back. The exit sensor is
		// interaction.range wide, so landing far from it is not a broken passage -
		// but landing across the room from it in the dark is a bad one.
		walk := math.Hypot(float64(exit.X-arrival.X), float64(exit.Y-arrival.Y))
		assert.Less(t, walk, 8.0, "%q drops you %.1f units from its way back", leg.down, walk)

		returned, ok := anchors[leg.up]
		require.True(t, ok)
		home := math.Hypot(float64(returned.X-mouth.X), float64(returned.Y-mouth.Y))
		assert.Less(t, home, 8.0,
			"%q must put you back beside the mouth you entered, not somewhere else", leg.up)
	}
}

// ⛑ THE D8 TRAP, and it is content-shaped so only a content test can catch it:
// the client synthesizes a campfire interact offer that OVERRIDES the server’s
// (plan-portal-spells.md D8), so a door standing inside a fire’s dwell circle
// silently loses every E press to the flight map. An exit is exactly where a
// cave’s campfire wants to stand, which is what makes this worth a test rather
// than a comment.
func TestPassages_NoDoorStandsInsideACampfiresDwellCircle(t *testing.T) {
	zones := shippedZones(t)

	// The dwell radius is the fire’s heal radius x CampfireDwellRadiusFactor and
	// is derived at boot, so this is a deliberately generous stand-in: any door
	// this far from every fire is clear of it under any plausible tuning.
	const clearance = 8.0

	for anchor, door := range placedDoors(t, zones) {
		for _, z := range zones {
			for _, c := range z.Campfires {
				d := math.Hypot(float64(c.X-door.X), float64(c.Y-door.Y))
				assert.Greater(t, d, clearance,
					"the door to %q stands %.1f units from campfire %q - inside a dwell circle "+
						"it would lose every interact press to the flight map (D8)", anchor, d, c.ID)
			}
		}
	}
}

// Every arrival point must be somewhere a body can actually stand: inside its
// zone’s border wall, with room for the landing jitter.
func TestPassages_EveryArrivalIsWellInsideItsZone(t *testing.T) {
	zones := shippedZones(t)

	for name, pos := range allAnchors(zones) {
		idx := -1
		for i, z := range zones {
			if math.Abs(float64(pos.X-z.Origin.X)) <= float64(z.Bounds.Width)/2 &&
				math.Abs(float64(pos.Y-z.Origin.Y)) <= float64(z.Bounds.Height)/2 {
				idx = i
			}
		}
		require.NotEqual(t, -1, idx, "anchor %q sits in the gap between zones", name)
	}
}
