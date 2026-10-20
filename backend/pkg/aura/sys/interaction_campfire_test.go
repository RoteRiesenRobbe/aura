package sys

// The campfire's panel: Bind & Restock, Restock, Fly. Each is a row of its own
// that hands over nothing; what it touches is connection state, through the
// travel seam's Campfire method.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// campfireInteraction is the shape campfire.json authors.
func campfireInteraction() *mobs.Interaction {
	row := func(text string, kind mobs.GrantKind) mobs.InteractionOption {
		return mobs.InteractionOption{Text: text, Grants: []mobs.InteractionGrant{{Kind: kind, Line: text + "."}}}
	}
	return &mobs.Interaction{
		Range: 0.5,
		Nodes: []mobs.InteractionNode{{
			ID:    "root",
			Lines: []string{"The fire crackles."},
			Options: []mobs.InteractionOption{
				row("Bind & Restock", mobs.GrantBindRestock),
				row("Restock", mobs.GrantRestock),
				row("Fly", mobs.GrantFly),
			},
		}},
	}
}

func TestPresent_CampfireRowsAreAlwaysAvailable(t *testing.T) {
	rows := rowsOf(t, present(campfireInteraction(), newLearner(1), noRows, noTravel), "root")

	require.Len(t, rows, 3)
	for i, text := range []string{"Bind & Restock", "Restock", "Fly"} {
		assert.Equal(t, text, rows[i].Text)
		assert.Equal(t, text+".", rows[i].Reply)
		assert.False(t, rows[i].Locked)
		assert.Equal(t, uint8(0), rows[i].GrantIndex, "a takeable row is never the navigation sentinel")
	}
}

func TestApplyGrant_CampfireRowsAskTheSeam(t *testing.T) {
	tr := &fakeTravel{}
	for option, kind := range []mobs.GrantKind{mobs.GrantBindRestock, mobs.GrantRestock, mobs.GrantFly} {
		_, taught, ok := applyGrant(campfireInteraction(), newLearner(1), noRows, tr, "root", option, 0)
		require.True(t, ok, kind)
		assert.Nil(t, taught, "a campfire row hands over nothing, so there is no unlock banner")
	}
	assert.Equal(t, []mobs.GrantKind{mobs.GrantBindRestock, mobs.GrantRestock, mobs.GrantFly}, tr.campfire)

	_, _, ok := applyGrant(campfireInteraction(), newLearner(1), noRows, noTravel, "root", 0, 0)
	assert.False(t, ok, "no seam, no campfire row")
}

// The real seam asks the connection state about the fire it stands at, and the
// panel closes with the row.
func TestPortalTravel_CampfireRowClosesTheSession(t *testing.T) {
	fire := CampfireAnchor{ID: "spawnpoint-1", Pos: phy.Vec2f{X: 10, Y: 10}, DwellRadius: 0.75}
	cs := &fakeConnState{fires: []CampfireAnchor{fire}}
	rider := newFakePlayer()
	rider.SetConversingWith(7)

	tr := portalTravel{anchors: cs, rider: rider, from: fire.Pos}
	require.True(t, tr.Campfire(mobs.GrantRestock))
	assert.Equal(t, []mobs.GrantKind{mobs.GrantRestock}, cs.campfireRows)
	assert.Zero(t, rider.ConversingWith(), "every campfire row is a last word")

	// Refused away from a fire: the session stays open and nothing happens.
	rider.SetConversingWith(7)
	away := portalTravel{anchors: cs, rider: rider, from: phy.Vec2f{X: 500}}
	assert.False(t, away.Campfire(mobs.GrantRestock))
	assert.Equal(t, uint64(7), rider.ConversingWith())
	assert.False(t, portalTravel{rider: rider, from: fire.Pos}.Campfire(mobs.GrantRestock), "no anchor seam")
}
