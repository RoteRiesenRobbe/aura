package main

import (
	"math"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
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

	// ⭐ DERIVED, NOT GUESSED. The bound is the two radii that actually decide
	// the overlap — the fire's bind circle and the door's own interact sensor —
	// so a retune of either moves this test with it, and a map edit that keeps
	// the door out of the circle never reddens it. The constant this replaced
	// was 8.0 against a real bound of 2.75, which made it a false-positive
	// generator on every map edit and proved nothing when it passed.
	dwell := campfireDwellRadius(t, mobsRegistry)
	require.Greater(t, dwell, float32(0), "the Campfire mob must publish a bind radius")

	for anchor, door := range placedDoors(t, zones) {
		require.NotNil(t, door.Def.Interaction)
		// Full separation of the two circles: no spot a player could stand in to
		// use the door is also a spot the flight offer would claim.
		clearance := float64(dwell + door.Def.Interaction.Range)
		for _, z := range zones {
			for _, c := range z.Campfires {
				d := math.Hypot(float64(c.X-door.X), float64(c.Y-door.Y))
				assert.Greater(t, d, clearance,
					"the door to %q stands %.2f units from campfire %q, inside the %.2f it needs "+
						"(bind radius %.2f + interact range %.2f) - it would lose interact presses "+
						"to the flight map (D8)", anchor, d, c.ID, clearance, dwell, door.Def.Interaction.Range)
			}
		}
	}
}

// campfireDwellRadius reproduces the boot-time derivation in aurad.go: a
// campfire's bind circle is its aura radius scaled by CampfireDwellRadiusFactor.
// ⚑ Read from the registry rather than restated, so a content or factor change
// cannot leave this test asserting against a number the game no longer uses.
func campfireDwellRadius(t *testing.T, mr mobs.Registry) float32 {
	t.Helper()
	def, err := mr.GetByName("Campfire")
	require.NoError(t, err, "no Campfire mob is defined")

	var radius float32
	for _, s := range def.Skills {
		require.NotNil(t, s.Def, "a campfire skill did not resolve")
		for _, e := range s.Def.Effects {
			if e.Type == skills.EffectTypeLightAura {
				continue // light never sizes the aura (EffectiveRadius)
			}
			if r := skills.Scaled(e.Radius, e.RadiusPerLevel, s.Level); r > radius {
				radius = r
			}
		}
	}
	return radius * sys.CampfireDwellRadiusFactor
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
