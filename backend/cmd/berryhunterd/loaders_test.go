package main

import (
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

	zone, err := world.LoadZoneFS(content.zones, mobsRegistry)
	require.NoError(t, err)
	assert.Positive(t, zone.Bounds.Width)
	assert.Positive(t, zone.Bounds.Height)
}

// TestDiskContent_MissingSubdirFails pins the loud-failure contract: a
// -content dir without the api/ layout must error at startup, not surface as
// an empty registry later.
func TestDiskContent_MissingSubdirFails(t *testing.T) {
	_, err := diskContent(t.TempDir())
	assert.Error(t, err)
}
