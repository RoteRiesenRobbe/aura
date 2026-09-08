package sys

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Anchor-mode travel: the destination that is authored geometry rather than a
// player (plan-underworld.md U3).

const (
	entryAnchor = "underworld-entry"
	backAnchor  = "surface-return"
)

func caveAnchors() map[string]phy.Vec2f {
	return map[string]phy.Vec2f{
		entryAnchor: {X: 3, Y: -497},
		backAnchor:  {X: -20, Y: 8},
	}
}

// ⭐ THE WHOLE POINT OF U3, AND THE ONE LINE THAT COULD SILENTLY UNDO IT.
// destination() opens with an owner==nil guard that is correct for both older
// modes - they resolve THROUGH the owner - and would refuse every cave mouth in
// the world, because a zone-placed fixture has no owner by construction. Anchor
// mode is answered above that guard.
func TestPortalTravel_AnchorModeWorksOnAConversantWithNoOwner(t *testing.T) {
	rider := newFakePlayer()
	rider.SetConversingWith(7)
	tr := portalTravel{zoneAnchors: caveAnchors(), rider: rider}

	require.True(t, tr.CanReach(mobs.TravelAnchor, entryAnchor),
		"a cave mouth has no owner and must still lead somewhere")
	require.True(t, tr.Travel(mobs.TravelAnchor, entryAnchor))

	dist := rider.Position().DistanceToSquared(phy.Vec2f{X: 3, Y: -497})
	assert.LessOrEqual(t, dist, float32(respawnJitterRadius*respawnJitterRadius),
		"delivered into the jitter disc around the authored anchor")
	assert.Equal(t, 1, rider.grounded, "the Recall/WARP recipe: Ground() before the jump")
	assert.Zero(t, rider.ConversingWith(), "the player is a zone away now, so the panel closes with them")
}

// The name is what selects the destination, so the two ends of a passage are
// told apart by nothing else.
func TestPortalTravel_AnchorModeDeliversToTheNamedAnchor(t *testing.T) {
	rider := newFakePlayer()
	tr := portalTravel{zoneAnchors: caveAnchors(), rider: rider}

	require.True(t, tr.Travel(mobs.TravelAnchor, backAnchor))
	assert.LessOrEqual(t, rider.Position().DistanceToSquared(phy.Vec2f{X: -20, Y: 8}),
		float32(respawnJitterRadius*respawnJitterRadius))
}

// ⚑ Fails closed, the seam's standing posture - but this is the case the BOOT
// check exists to make impossible (world.CrossValidateTravelAnchors), because
// what it looks like in play is a door that takes the keypress and does nothing.
func TestPortalTravel_AnchorModeRefusesAnUnknownName(t *testing.T) {
	rider := newFakePlayer()
	tr := portalTravel{zoneAnchors: caveAnchors(), rider: rider}

	assert.False(t, tr.CanReach(mobs.TravelAnchor, "no-such-anchor"))
	assert.False(t, tr.Travel(mobs.TravelAnchor, "no-such-anchor"))
	assert.Equal(t, phy.VEC2F_ZERO, rider.Position(), "nothing moved")
	assert.Zero(t, rider.grounded)
}

// A world with no seam wired renders every anchor row LOCKED rather than
// crashing - the nil posture the campfire seam already had.
func TestPortalTravel_AnchorModeRefusesWithNoTableAtAll(t *testing.T) {
	tr := portalTravel{rider: newFakePlayer()}
	assert.False(t, tr.CanReach(mobs.TravelAnchor, entryAnchor))
}

// ⚑ The other direction of the same split: an OWNER-relative mode must not
// start reading the anchor table. A summoned portal whose caster never bound is
// still refused, even standing next to a perfectly good cave mouth.
func TestPortalTravel_OwnerRelativeModesIgnoreTheAnchorTable(t *testing.T) {
	tr := portalTravel{zoneAnchors: caveAnchors(), anchors: &fakeConnState{bound: false},
		owner: newFakePlayer(), rider: newFakePlayer()}

	assert.False(t, tr.CanReach(mobs.TravelHomeCampfire, entryAnchor),
		"home_campfire resolves through the owner and nothing else")
}

// ⭐ THE PER-PLACEMENT OVERRIDE (U3b), and the case that makes one CaveMouth
// definition serve every passage in the world: the same definition, two
// placements, two destinations. Before this the grant was the only place a
// destination could live, so a world with N passages needed 2N mob files.
func TestPortalTravel_ThePlacementDestinationWinsOverTheGrantDefault(t *testing.T) {
	west := newFakePlayer()
	east := newFakePlayer()

	// Both rows carry the SAME grant default; only the placement differs.
	require.True(t, portalTravel{zoneAnchors: caveAnchors(), anchorOverride: entryAnchor,
		rider: west}.Travel(mobs.TravelAnchor, backAnchor))
	require.True(t, portalTravel{zoneAnchors: caveAnchors(), anchorOverride: backAnchor,
		rider: east}.Travel(mobs.TravelAnchor, backAnchor))

	assert.LessOrEqual(t, west.Position().DistanceToSquared(phy.Vec2f{X: 3, Y: -497}),
		float32(respawnJitterRadius*respawnJitterRadius), "the override decided this one")
	assert.LessOrEqual(t, east.Position().DistanceToSquared(phy.Vec2f{X: -20, Y: 8}),
		float32(respawnJitterRadius*respawnJitterRadius))
}

// ⚑ Absent inherits, the tri-state idiom world.Spawn already uses for
// wanderRadius, idleSpeedFactor and level. A door whose definition names the
// destination still works with a placement that says nothing.
func TestPortalTravel_AnEmptyPlacementFallsBackToTheGrant(t *testing.T) {
	rider := newFakePlayer()
	tr := portalTravel{zoneAnchors: caveAnchors(), rider: rider}

	require.True(t, tr.Travel(mobs.TravelAnchor, entryAnchor))
	assert.LessOrEqual(t, rider.Position().DistanceToSquared(phy.Vec2f{X: 3, Y: -497}),
		float32(respawnJitterRadius*respawnJitterRadius))
}

// ⛑ An override that names nothing real is refused even though the grant
// default would have worked. That is the right way round: the placement is the
// authority, so a typo in it must not silently fall through to somewhere else.
func TestPortalTravel_ABrokenOverrideDoesNotFallThroughToTheGrant(t *testing.T) {
	tr := portalTravel{zoneAnchors: caveAnchors(), anchorOverride: "no-such-anchor",
		rider: newFakePlayer()}
	assert.False(t, tr.CanReach(mobs.TravelAnchor, entryAnchor))
}

// The system-level wiring, over a REAL zone-placed conversant: SetZoneAnchors
// is what puts the table on every seam built afterwards, and travelFor is where
// a cave mouth's nil owner meets it. Forgetting the call renders every cave
// mouth locked and fails no other test - the footgun SetAnchors documents.
func TestInteractionSystem_SetZoneAnchorsReachesTheSeam(t *testing.T) {
	cave := mob.NewMob(npcDef("CaveMouth", teachingInteraction([]string{"A dark opening."})), 0, nil)
	require.Nil(t, cave.Owner(), "a zone-placed fixture is nobody's summon - the case U3 turns on")

	s := NewInteractionSystem()
	assert.False(t, s.travelFor(cave, newFakePlayer()).CanReach(mobs.TravelAnchor, entryAnchor),
		"unwired, an anchor row is locked")

	s.SetZoneAnchors(caveAnchors())
	assert.True(t, s.travelFor(cave, newFakePlayer()).CanReach(mobs.TravelAnchor, entryAnchor))
}
