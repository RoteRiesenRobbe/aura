package main

import (
	"io/fs"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

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

	mobsRegistry, err := mobs.RegistryFromFS(itemsRegistry, skillsRegistry, content.mobs)
	require.NoError(t, err)
	assert.NotEmpty(t, mobsRegistry.Mobs())

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
		zone, err := world.LoadZoneFS(content.zones, stem, mobsRegistry, propsRegistry)
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

	// The scaffold zone specifically carries hand-authored terrain — keep the
	// terrain-parsing pipeline pinned against real content.
	zone, err := world.LoadZoneFS(content.zones, "scaffold", mobsRegistry, propsRegistry)
	require.NoError(t, err)
	assert.NotEmpty(t, zone.Terrain, "scaffold zone should carry hand-authored terrain")
}

// TestDiskContent_MissingSubdirFails pins the loud-failure contract: a
// -content dir without the api/ layout must error at startup, not surface as
// an empty registry later.
func TestDiskContent_MissingSubdirFails(t *testing.T) {
	_, err := diskContent(t.TempDir())
	assert.Error(t, err)
}
