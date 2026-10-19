package main

import (
	"math"
	"strings"
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
		// Doors authored as exits (plan-passages.md P1) and any still placed
		// as spawns, alike.
		placed := append(append([]world.Spawn(nil), z.Spawns...), z.ExitSpawns()...)
		for i := range placed {
			s := &placed[i]
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
		// A touch exit is a way through too (P4): stood at its centroid, so
		// a talk exit one way and a touch exit back still round-trip.
		for _, a := range z.ExitAreas {
			c := a.Centroid()
			doors[a.Anchor] = &world.Spawn{Mob: "touch exit", X: c.X, Y: c.Y, Anchor: a.Anchor}
		}
	}
	return doors
}

func shippedZones(t *testing.T) []*world.Zone {
	t.Helper()
	mobsRegistry, propsRegistry := repoZoneRegistries(t)
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	// Auto-discovery, exactly as the server boots: the directory is the zone
	// list, so a zone file added to api/zones/ is covered by these pins the
	// moment it lands — no second list here to forget to update.
	zones, err := world.LoadAllZonesFS(content.zones, "world", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	return zones
}

// nearestDoor returns the placed door standing closest to p — the one a player
// arriving at p would walk to in order to leave again.
//
// ⭐ NEAREST, NOT WITHIN-N. The old version of these tests carried hand-picked
// distance thresholds, which made every map edit a test failure while catching
// nothing a threshold-free formulation misses. "Which door is at this end of
// the passage" is an ordering question, and ordering survives the whole
// passage being moved anywhere in the world.
func nearestDoor(doors map[string]*world.Spawn, p world.Point) (*world.Spawn, float64) {
	var best *world.Spawn
	bestD := math.Inf(1)
	for _, d := range doors {
		if dist := math.Hypot(float64(d.X-p.X), float64(d.Y-p.Y)); dist < bestD {
			best, bestD = d, dist
		}
	}
	return best, bestD
}

// ⭐ EVERY PASSAGE ROUND-TRIPS: go through any door and the door waiting at the
// far end brings you back to the one you left by — not to the other passage's
// mouth, which is the swap this catches and which nothing else would.
//
// ⚑ It names no anchor and asserts no distance, so re-authoring the map moves
// this test's subject rather than breaking it. It fails only when a passage is
// genuinely one-way or crossed.
func TestPassages_EachOneReturnsYouWhereYouWentIn(t *testing.T) {
	zones := shippedZones(t)
	anchors := allAnchors(zones)
	doors := placedDoors(t, zones)
	require.NotEmpty(t, doors, "the world places no travel doors at all")

	for dest, door := range doors {
		arrival, ok := anchors[dest]
		require.True(t, ok, "%s at (%g, %g) travels to anchor %q, which nothing authors",
			door.Mob, door.X, door.Y, dest)

		// The way back is whatever door stands where this one drops you.
		back, walk := nearestDoor(doors, arrival)
		require.NotNil(t, back)
		require.NotSame(t, door, back,
			"the door to %q is the nearest door to its own destination — the passage leads to itself", dest)

		// And following IT must land beside the door we started at.
		home := anchors[back.Anchor]
		returned, _ := nearestDoor(doors, home)
		assert.Same(t, door, returned,
			"%s → %q drops you %.1f units from the door to %q, which sends you somewhere else: "+
				"the passage does not round-trip", door.Mob, dest, walk, back.Anchor)
	}
}

// ⛑ THE D8 TRAP, and it is content-shaped so only a content test can catch it:
// the client synthesizes a campfire interact offer that OVERRIDES the server’s
// (plan-portal-spells.md D8), so a door standing inside a fire’s dwell circle
// silently loses every E press to the flight map. An exit is exactly where a
// cave’s campfire wants to stand, which is what makes this worth a test rather
// than a comment.
func TestPassages_NoDoorStandsInsideACampfiresDwellCircle(t *testing.T) {
	mobsRegistry, _ := repoZoneRegistries(t)
	zones := shippedZones(t)

	// ⭐ DERIVED, NOT GUESSED: the bound is the fire's bind circle plus the
	// door's own sensor, so a retune of either moves the check with it.
	// ⚑ Since plan-passages.md P1 the boot itself refuses this for every talk
	// exit (loadZones); this pins that the shipped world passes it.
	dwell := campfireDwellRadius(mobsRegistry)
	require.Greater(t, dwell, float32(0), "the Campfire mob must publish a bind radius")
	require.NoError(t, world.CrossValidateExitClearance(zones, dwell))
	for _, z := range zones {
		for _, s := range z.Spawns {
			assert.NotContains(t, []string{"CaveMouth", "CaveExit"}, s.Mob,
				"zone %q still places a door in spawns; doors live in exits (plan-passages.md D11)", z.ID)
		}
	}
}

// plan-passages.md D6, over the real content: every door carries its exit for
// the header, and every destination's words reach at least one door. Words
// authored for a place only custom doors lead to would show nowhere (a custom
// door keeps its own, tier 0), which is the mistake this names.
func TestPassages_EveryDoorCarriesItsWords(t *testing.T) {
	loaded := loadLangContent(t)
	shown := map[string]bool{}
	for _, z := range loaded.zones {
		for _, e := range z.Exits {
			assert.Equal(t, e.Key(), e.Def.Interaction.ExitID, "exit to %q", e.Anchor)
			// D12: an exit with no conversation of its own is worded by itself,
			// its destination or its look, never by the shared conversation.
			if e.Conversation == "" {
				for _, n := range e.Def.Interaction.Nodes {
					for _, id := range n.LineIDs {
						assert.Regexp(t, `^(exit|anchor|exit-look)\.`, id, "exit to %q", e.Anchor)
					}
				}
			}
			for _, n := range e.Def.Interaction.Nodes {
				for _, id := range n.LineIDs {
					shown[id] = true
				}
			}
		}
	}
	for _, e := range loaded.langEntries["regions"] {
		if strings.HasPrefix(e.Key, "anchor.") {
			assert.True(t, shown[e.Key], "%s is authored but no door shows it", e.Key)
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
