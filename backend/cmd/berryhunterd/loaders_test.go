package main

import (
	"io/fs"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/trichner/berryhunter/pkg/berryhunter/factions"
	"github.com/trichner/berryhunter/pkg/berryhunter/items"
	"github.com/trichner/berryhunter/pkg/berryhunter/items/mobs"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
	"github.com/trichner/berryhunter/pkg/berryhunter/world"
)

// TestDiskContent_RepoApiLoadsEndToEnd pins the -content disk-load path over
// the repo's api/ directory (the source of truth the embedded copies are
// synced from). Loading it through the full registry chain also puts the
// source content itself under load-time validation — the embedded-copy tests
// alone can't catch an api/ edit that was never cp-defs'd.
func TestDiskContent_RepoApiLoadsEndToEnd(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)

	itemsRegistry, err := items.RegistryFromFS(content.items)
	require.NoError(t, err)
	assert.NotEmpty(t, itemsRegistry.Items())

	skillsRegistry, err := skills.RegistryFromFS(content.skills)
	require.NoError(t, err)
	assert.NotEmpty(t, skillsRegistry.All())

	factionsRegistry, err := factions.RegistryFromFS(content.factions)
	require.NoError(t, err)
	assert.NotEmpty(t, factionsRegistry.All())

	mobsRegistry, err := mobs.RegistryFromFS(itemsRegistry, skillsRegistry, factionsRegistry, content.mobs)
	require.NoError(t, err)
	assert.NotEmpty(t, mobsRegistry.Mobs())

	// The chunk-6.6 smoke content must actually exercise mob factions: at
	// least one predator (non-empty mob-faction aggro set) and one passive
	// prey species ship in the repo roster.
	var hasHunter, hasPassive bool
	for _, m := range mobsRegistry.Mobs() {
		if m.AggroMask&^uint64(1<<factions.Aligned) != 0 {
			hasHunter = true
		}
		if m.Faction >= 2 && m.AggroMask == 0 {
			hasPassive = true
		}
	}
	assert.True(t, hasHunter, "repo content ships a mob-hunting faction")
	assert.True(t, hasPassive, "repo content ships a passive faction")

	recipeRegistry, err := skills.RecipesFromFS(content.recipes, skillsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, recipeRegistry.All())

	propsRegistry, err := world.PropRegistryFromFS(content.props)
	require.NoError(t, err)
	assert.NotEmpty(t, propsRegistry.Props())

	// EVERY shipped zone must load by stem — a zone that only breaks when
	// selected would otherwise ship broken. Selecting by stem also proves
	// multi-zone selection against real content.
	stems, err := fs.Glob(content.zones, "*.json")
	require.NoError(t, err)
	require.NotEmpty(t, stems)
	for _, file := range stems {
		stem := strings.TrimSuffix(file, ".json")
		zone, err := world.LoadZoneFS(content.zones, stem, mobsRegistry, propsRegistry, skillsRegistry)
		require.NoError(t, err, "zone %q must load", stem)
		assert.Equal(t, stem, zone.ID)
		assert.Positive(t, zone.Bounds.Width)
		assert.Positive(t, zone.Bounds.Height)
		// every zone prop resolves against the prop registry at load time
		for _, p := range zone.Props {
			assert.NotNil(t, p.Def)
		}
		// every spawn resolves against the mob registry at load time
		for _, s := range zone.Spawns {
			assert.NotNil(t, s.Def)
		}
	}

	// The proving-grounds zone (the default debug/test map since 2026-07-11)
	// carries authored terrain and both chunk-5 movement archetypes — keep the
	// terrain + wander/waypoint parsing pipelines pinned against real content.
	zone, err := world.LoadZoneFS(content.zones, "proving-grounds", mobsRegistry, propsRegistry, skillsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, zone.Terrain, "proving-grounds should carry authored terrain")
	var wanderers, patrollers int
	for _, s := range zone.Spawns {
		if s.EffectiveWanderRadius() > 0 {
			wanderers++
		}
		if len(s.Waypoints) > 0 {
			patrollers++
		}
	}
	assert.NotZero(t, wanderers, "proving-grounds should exercise local wander")
	assert.NotZero(t, patrollers, "proving-grounds should exercise route patrol")
}

// TestDiskContent_MissingSubdirFails pins the loud-failure contract: a
// -content dir without the api/ layout must error at startup, not surface as
// an empty registry later.
func TestDiskContent_MissingSubdirFails(t *testing.T) {
	_, err := diskContent(t.TempDir())
	assert.Error(t, err)
}
