package main

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The campfire's panel is offered exactly where its bind circle is drawn: the
// interaction sensor overlaps a player's body when the player's CENTRE is
// within range + body radius, and the bind circle (discovery, flight origin)
// asks about the centre. Equal, or E would light at the edge for a Fly the
// server then refuses.
func TestCampfire_PanelRangeMatchesTheBindCircle(t *testing.T) {
	mobsRegistry, _ := repoZoneRegistries(t)
	def, err := mobsRegistry.GetByName("Campfire")
	require.NoError(t, err)
	require.NotNil(t, def.Interaction, "the campfire carries the Bind & Restock / Restock / Fly panel")

	assert.InDelta(t, campfireDwellRadius(mobsRegistry), def.Interaction.Range+player.ColliderRadiusMeters, 1e-5,
		"interaction.range + the player's body radius must equal the bind circle")
}
