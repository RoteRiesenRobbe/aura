package main

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"

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

	assert.InDelta(t, campfireDwellRadius(t, mobsRegistry), def.Interaction.Range+player.ColliderRadiusMeters, 1e-5,
		"interaction.range + the player's body radius must equal the bind circle")
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
