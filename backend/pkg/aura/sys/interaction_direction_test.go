package sys

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The direction byte a travel row carries so the client can start covering the
// cut on the PRESS rather than on the arrival (plan-underworld.md U4b / D7).
//
// ⭐ WHAT THESE PIN IS A CONVENTION, NOT AN ALGORITHM. Origin Y is otherwise a
// free packing coordinate; U4b makes "+Y is deeper" an authoring contract, and
// these tests are where that contract is written down in executable form. Move
// the underworld to +X and every passage into it correctly reports lateral.

// A surface at the origin, a cave 300 below it, and a neighbouring region 400 to
// the EAST at the same depth — the three cases the byte has to tell apart.
func placedZones() []cfg.PlacedBounds {
	return []cfg.PlacedBounds{
		{Bounds: cfg.Bounds{Width: 144, Height: 72}, OriginX: 0, OriginY: 0, ZoneID: "world"},
		{Bounds: cfg.Bounds{Width: 48, Height: 28}, OriginX: 0, OriginY: 300, ZoneID: "underworld"},
		{Bounds: cfg.Bounds{Width: 48, Height: 28}, OriginX: 400, OriginY: 0, ZoneID: "eastmarch"},
	}
}

func passageAnchors() map[string]phy.Vec2f {
	return map[string]phy.Vec2f{
		"under-west":   {X: -16, Y: 300},
		"surface-west": {X: -24, Y: 14},
		"eastmarch-in": {X: 400, Y: 0},
	}
}

// dirSeam builds the seam as travelFor does, for a door standing at `from`.
func dirSeam(from phy.Vec2f) portalTravel {
	return portalTravel{
		zoneAnchors: passageAnchors(),
		zones:       placedZones(),
		from:        from,
	}
}

// ⭐ THE HEADLINE: a door on the surface leading into the cave reads as a
// DESCENT, and its twin at the bottom reads as an ASCENT. Nothing is authored to
// say so — the two zones' origins say it.
func TestDirection_APassageReadsDownFromAboveAndUpFromBelow(t *testing.T) {
	down := dirSeam(phy.Vec2f{X: -24, Y: 12})
	assert.Equal(t, model.TravelDescend, down.Direction(mobs.TravelAnchor, "under-west"),
		"the surface mouth leads into a zone placed below it")

	up := dirSeam(phy.Vec2f{X: -18, Y: 297})
	assert.Equal(t, model.TravelAscend, up.Direction(mobs.TravelAnchor, "surface-west"),
		"and its twin at the bottom of the shaft leads back out")
}

// The reason the field is a ubyte and not a bool: a hop that changes place
// without changing depth is a third answer, not a missing one.
func TestDirection_ASidewaysZoneIsLateralNotADescent(t *testing.T) {
	seam := dirSeam(phy.Vec2f{X: 60, Y: 0})
	assert.Equal(t, model.TravelLateral, seam.Direction(mobs.TravelAnchor, "eastmarch-in"),
		"same origin Y, so crossing east is not a descent")
}

// A passage whose two ends are in the SAME zone moves the player without moving
// them anywhere new vertically.
func TestDirection_AHopInsideOneZoneIsLateral(t *testing.T) {
	seam := dirSeam(phy.Vec2f{X: 0, Y: 0})
	assert.Equal(t, model.TravelLateral, seam.Direction(mobs.TravelAnchor, "surface-west"),
		"both ends are in the overworld")
}

// ⛔ L15. home_campfire and caster resolve their destination at STEP-THROUGH
// time by design (plan-portal-spells.md D5), so a direction computed when the
// tree was built could be stale — and a confidently wrong descent reads worse
// than a plain crossfade. They report lateral no matter where they would land.
//
// ⚑ THE MUTATION THIS CATCHES is the tempting one: resolving the destination
// first and comparing zones for every mode. It would look right in-game for a
// campfire on the surface and be wrong for the player who bound underground.
func TestDirection_OnlyAnchorModeDerivesADirection(t *testing.T) {
	// An owner standing deep in the cave, so a naive implementation that just
	// resolved the destination would happily report a descent here.
	owner := newFakePlayer()
	owner.SetPosition(phy.Vec2f{X: 0, Y: 300})

	seam := dirSeam(phy.Vec2f{X: 0, Y: 0})
	seam.owner = owner
	seam.ownerLive = true

	require.True(t, seam.CanReach(mobs.TravelCaster, ""),
		"the caster mode really can reach, so this is not a locked-row result")
	assert.Equal(t, model.TravelLateral, seam.Direction(mobs.TravelCaster, ""),
		"a destination that may still move is reported lateral, never descend")
	assert.Equal(t, model.TravelLateral, seam.Direction(mobs.TravelHomeCampfire, ""),
		"and so is a campfire recall, which is why recall out of a cave stays a crossfade")
}

// A door that leads nowhere says nothing about direction. It is rendered locked
// and the client gives it no handler at all.
func TestDirection_AnUnreachableDoorReportsNone(t *testing.T) {
	seam := dirSeam(phy.Vec2f{X: 0, Y: 0})
	require.False(t, seam.CanReach(mobs.TravelAnchor, "no-such-anchor"))
	assert.Equal(t, model.TravelNone, seam.Direction(mobs.TravelAnchor, "no-such-anchor"))
}

// A single-zone world — every world before the underworld, and every test rig
// that wires no placements — must still answer. Lateral is the honest report:
// there is nowhere to descend TO.
func TestDirection_NoPlacementsWiredIsLateralNotAPanic(t *testing.T) {
	seam := portalTravel{zoneAnchors: passageAnchors(), from: phy.Vec2f{X: 0, Y: 0}}
	assert.Equal(t, model.TravelLateral, seam.Direction(mobs.TravelAnchor, "under-west"))
}

// ⭐ THE ROW CARRIES IT, which is the half that actually reaches the client:
// travelRow is the one place the byte is set, so every travel_to grant in the
// game gets it with nothing authored.
func TestTravelRow_CarriesTheDirectionItResolved(t *testing.T) {
	opt := &mobs.InteractionOption{Text: "Climb down."}
	g := &mobs.InteractionGrant{
		Kind: mobs.GrantTravelTo, Travel: mobs.TravelAnchor, Anchor: "under-west",
		Line: "The dark takes you.",
	}

	row := travelRow(0, 0, opt, g, dirSeam(phy.Vec2f{X: -24, Y: 12}))
	assert.False(t, row.Locked)
	assert.Equal(t, model.TravelDescend, row.Travel)

	// ⚑ A LOCKED row reports none, and it is the locked branch that says so —
	// the two branches build separate structs, so this is a real fork, not a
	// restatement of the test above.
	dead := &mobs.InteractionGrant{
		Kind: mobs.GrantTravelTo, Travel: mobs.TravelAnchor, Anchor: "no-such-anchor",
	}
	lockedRow := travelRow(0, 0, opt, dead, dirSeam(phy.Vec2f{X: -24, Y: 12}))
	require.True(t, lockedRow.Locked)
	assert.Equal(t, model.TravelNone, lockedRow.Travel)
}

// ⚑ THE PLACEMENT OVERRIDE REACHES THE DIRECTION TOO (U3b). A generic CaveMouth
// authors no anchor at all, so a direction derived from the GRANT's anchor would
// be TravelNone on every shipped door — the row would render, the byte would be
// wrong, and only the transition would look broken.
func TestDirection_ThePlacementsAnchorWinsHereAsWell(t *testing.T) {
	seam := dirSeam(phy.Vec2f{X: -24, Y: 12})
	seam.anchorOverride = "under-west"

	assert.Equal(t, model.TravelDescend, seam.Direction(mobs.TravelAnchor, ""),
		"the grant authors nothing; the placement names the destination")
}
