package world

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The boot-time proof that an anchor-mode travel row leads somewhere
// (plan-underworld.md U3 / U3b).
//
// ⭐ THIS IS THE ONLY CHECK THERE IS. The runtime lookup fails closed - a miss
// renders the row LOCKED and moves nobody - which is exactly the failure this
// pass exists to prevent: a door standing in the world that a player walks up
// to, presses, and watches do nothing.
//
// ⚑ It walks PLACEMENTS since U3b. A definition alone no longer says where
// anything goes: the same CaveMouth leads to two different places in two
// different spots, which is the whole reason the field moved.

type fakeRegistry struct{ defs []*mobs.MobDefinition }

func (f fakeRegistry) Mobs() []*mobs.MobDefinition { return f.defs }

// door builds a definition with one anchor-mode travel row. A blank default is
// what the shipped CaveMouth/CaveExit author.
func door(name, defaultAnchor string) *mobs.MobDefinition {
	return &mobs.MobDefinition{
		Name: name,
		Interaction: &mobs.Interaction{
			Nodes: []mobs.InteractionNode{{
				ID: "root",
				Options: []mobs.InteractionOption{{
					Text: "Climb down.",
					Grants: []mobs.InteractionGrant{{
						Kind:   mobs.GrantTravelTo,
						Travel: mobs.TravelAnchor,
						Anchor: defaultAnchor,
					}},
				}},
			}},
		},
	}
}

// places a resolved spawn, the shape the zone loader produces.
func places(z *Zone, def *mobs.MobDefinition, anchor string) *Zone {
	z.Spawns = append(z.Spawns, Spawn{Mob: def.Name, Def: def, Anchor: anchor})
	return z
}

// ⭐ THE CASE U3b EXISTS FOR: one definition, two placements, two destinations.
// Before the placement field this needed two near-identical mob files, and a
// world with N passages needed 2N of them.
func TestCrossValidateTravelAnchors_OneDefinitionServesTwoPassages(t *testing.T) {
	mouth := door("CaveMouth", "")
	surface := zoneAt("world", 144, 72, 0, 0)
	places(surface, mouth, "under-west")
	places(surface, mouth, "under-east")
	under := zoneAt("under", 60, 40, 0, 300)
	under.Anchors = []Anchor{{Name: "under-west"}, {Name: "under-east"}}

	warnings, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface, under})

	require.NoError(t, err)
	assert.Empty(t, warnings)
}

// The anchor lives in the OTHER zone, which is the point: a name resolves
// across the placed set, so an entrance and its destination are never in the
// same file.
func TestCrossValidateTravelAnchors_ResolvesAcrossTheWholeSet(t *testing.T) {
	mouth := door("CaveMouth", "")
	surface := places(zoneAt("world", 144, 72, 0, 0), mouth, "under-west")
	under := zoneAt("under", 60, 40, 0, 300)
	under.Anchors = []Anchor{{Name: "under-west"}}

	_, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface, under})
	require.NoError(t, err)
}

func TestCrossValidateTravelAnchors_RefusesTheBootWhenAPlacedDoorLeadsNowhere(t *testing.T) {
	mouth := door("CaveMouth", "")
	surface := places(zoneAt("world", 144, 72, 0, 0), mouth, "under-west")

	_, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface})

	require.Error(t, err)
	// The message names all three, because the fix could be any of them: the
	// mob, the zone that placed it, and the anchor that is missing.
	assert.Contains(t, err.Error(), "CaveMouth")
	assert.Contains(t, err.Error(), "world")
	assert.Contains(t, err.Error(), "under-west")
}

// ⛑ The placement that names NOTHING and inherits nothing. It is its own
// error rather than an unknown-anchor one, because the fix is different: there
// is no typo to correct, the destination was simply never authored.
func TestCrossValidateTravelAnchors_RefusesAPlacementWithNoDestinationAtAll(t *testing.T) {
	mouth := door("CaveMouth", "")
	surface := places(zoneAt("world", 144, 72, 0, 0), mouth, "")

	_, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "neither the placement nor the definition")
}

// The definition-level default still works for a placement that names none -
// the tri-state idiom wanderRadius, idleSpeedFactor and level already use.
func TestCrossValidateTravelAnchors_APlacementInheritsTheDefinitionDefault(t *testing.T) {
	mouth := door("CaveMouth", "under-west")
	surface := places(zoneAt("world", 144, 72, 0, 0), mouth, "")
	under := zoneAt("under", 60, 40, 0, 300)
	under.Anchors = []Anchor{{Name: "under-west"}}

	_, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface, under})
	require.NoError(t, err)
}

// ⚑ And the placement WINS over a broken default, which is what makes the
// override real: a stale default on a definition must not redden a world whose
// every placement names a good destination.
func TestCrossValidateTravelAnchors_ThePlacementShadowsABrokenDefault(t *testing.T) {
	mouth := door("CaveMouth", "long-since-renamed")
	surface := places(zoneAt("world", 144, 72, 0, 0), mouth, "under-west")
	under := zoneAt("under", 60, 40, 0, 300)
	under.Anchors = []Anchor{{Name: "under-west"}}

	_, err := CrossValidateTravelAnchors(fakeRegistry{defs: []*mobs.MobDefinition{mouth}},
		[]*Zone{surface, under})
	require.NoError(t, err)
}

// ⭐ THE ERROR/WARNING SPLIT IS PLACEMENT, and this is the half that lets the
// two edits an entrance needs - the mob def and the zone that places it - land
// in either order. A def nobody places cannot be pressed.
func TestCrossValidateTravelAnchors_WarnsRatherThanFailsForAnUnplacedDoor(t *testing.T) {
	surface := zoneAt("world", 144, 72, 0, 0)

	warnings, err := CrossValidateTravelAnchors(
		fakeRegistry{defs: []*mobs.MobDefinition{door("CaveMouth", ""), door("CaveExit", "gone")}},
		[]*Zone{surface})

	require.NoError(t, err)
	require.Len(t, warnings, 2)
	assert.Contains(t, warnings[0], "CaveExit")
	assert.Contains(t, warnings[0], "gone", "a broken default is worth naming")
	assert.Contains(t, warnings[1], "CaveMouth")
}

// The other two modes resolve through the portal's owner and author no anchor
// at all, so this pass must not invent a destination for them to be missing.
func TestCrossValidateTravelAnchors_IgnoresOwnerRelativeModes(t *testing.T) {
	portal := door("PortalHome", "")
	portal.Interaction.Nodes[0].Options[0].Grants[0].Travel = mobs.TravelHomeCampfire

	warnings, err := CrossValidateTravelAnchors(
		fakeRegistry{defs: []*mobs.MobDefinition{portal}},
		[]*Zone{places(zoneAt("world", 144, 72, 0, 0), portal, "")})

	require.NoError(t, err)
	assert.Empty(t, warnings)
}

func TestCrossValidateTravelAnchors_IgnoresMobsThatDoNotTalk(t *testing.T) {
	warnings, err := CrossValidateTravelAnchors(
		fakeRegistry{defs: []*mobs.MobDefinition{{Name: "Wolf"}}},
		[]*Zone{zoneAt("world", 144, 72, 0, 0)})

	require.NoError(t, err)
	assert.Empty(t, warnings)
}
