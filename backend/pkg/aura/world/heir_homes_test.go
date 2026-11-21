package world

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// stone builds a definition whose ceremony names heirHome, the shape the mob
// loader produces (the ceremony hangs off the generated summary node).
func stone(name, heirHome string) *mobs.MobDefinition {
	cer := &mobs.Ceremony{HeirHome: heirHome}
	return &mobs.MobDefinition{
		Name:        name,
		Interaction: &mobs.Interaction{Nodes: []mobs.InteractionNode{{ID: mobs.CeremonySummaryNodeID, Ceremony: cer}}},
	}
}

func ceremonyOf(def *mobs.MobDefinition) *mobs.Ceremony { return def.Interaction.Nodes[0].Ceremony }

// plan-ascension-ceremony.md D13: any loaded zone may hold the fire, and the
// fire's area is recorded so the summary can name the place.
func TestResolveHeirHomes_FindsTheFireInAnyLoadedZoneAndRecordsItsArea(t *testing.T) {
	surface := zoneAt("world", 144, 72, 0, 0)
	cave := zoneAt("under", 60, 40, 0, -500)
	cave.BindPoints = []Campfire{{ID: "spawnpoint-11", InArea: InArea{Area: "umberwood"}}}
	front, bare := stone("FrontAscensionStone", "spawnpoint-11"), stone("AscensionStone", "")
	places(surface, front, "")

	warnings, err := ResolveHeirHomes(fakeRegistry{defs: []*mobs.MobDefinition{front, bare}},
		[]*Zone{surface, cave})
	require.NoError(t, err)
	assert.Empty(t, warnings)
	assert.Equal(t, "umberwood", ceremonyOf(front).HeirHomeArea)
	assert.Empty(t, ceremonyOf(bare).HeirHomeArea, "a stone without a home names no place")
}

// A PLACED stone whose home no zone places refuses the boot.
func TestResolveHeirHomes_RefusesAPlacedStoneWithAnUnknownBindPoint(t *testing.T) {
	surface := zoneAt("world", 144, 72, 0, 0)
	surface.BindPoints = []Campfire{{ID: "spawnpoint-10"}}
	front := stone("FrontAscensionStone", "spawnpoint-11")
	places(surface, front, "")

	_, err := ResolveHeirHomes(fakeRegistry{defs: []*mobs.MobDefinition{front}}, []*Zone{surface})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "FrontAscensionStone")
	assert.Contains(t, err.Error(), "spawnpoint-11")
}

// A stone nobody places cannot be reached, so it only warns
// (CrossValidateTravelAnchors' split).
func TestResolveHeirHomes_AnUnplacedStoneOnlyWarns(t *testing.T) {
	surface := zoneAt("world", 144, 72, 0, 0)
	warnings, err := ResolveHeirHomes(fakeRegistry{defs: []*mobs.MobDefinition{stone("FrontAscensionStone", "spawnpoint-11")}},
		[]*Zone{surface})
	require.NoError(t, err)
	require.Len(t, warnings, 1)
	assert.Contains(t, warnings[0], "spawnpoint-11")
}
