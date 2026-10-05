package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The campfire's map light is its skill's light, read from content
// (plan-map-fog-darkness.md C1): a renamed skill would leave every campfire
// pocket unmapped, and only a warning would say so.
func TestCampfireLightRadius_ReadsTheSkill(t *testing.T) {
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	skillsRegistry, err := loadSkills(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)
	assert.Greater(t, campfireLightRadius(skillsRegistry), float32(0))
}
