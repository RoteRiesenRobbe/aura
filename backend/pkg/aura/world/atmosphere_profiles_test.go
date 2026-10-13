package world

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadAtmosphereDarkness_ReadsOnlyDeclaredDarkness(t *testing.T) {
	fsys := fstest.MapFS{AtmosphereProfileFile: {Data: []byte(`{
		"_comment": "docs",
		"Cave": {"darkness": 1, "blend": 2, "color": "#000000"},
		"Gloom": {"darkness": 0.55},
		"Fog": {"haze": 0.5, "scroll": {"x": 1, "y": 0}}
	}`)}}
	got, err := LoadAtmosphereDarkness(fsys)
	require.NoError(t, err)
	assert.Equal(t, map[string]float32{"Cave": 1, "Gloom": 0.55}, got)
}

func TestLoadAtmosphereDarkness_RefusesOutOfRange(t *testing.T) {
	fsys := fstest.MapFS{AtmosphereProfileFile: {Data: []byte(`{"Bad": {"darkness": 1.5}}`)}}
	_, err := LoadAtmosphereDarkness(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `"Bad"`)
}

// plan-lightmap.md D7 (PO 2026-10-13, "no shine through ever"): the client
// multiplies the world by a darkness colour, so full darkness must be black.
func TestLoadAtmosphereDarkness_FullDarknessMustBeBlack(t *testing.T) {
	fsys := fstest.MapFS{AtmosphereProfileFile: {Data: []byte(`{"Cave": {"darkness": 1, "color": "#03050c"}}`)}}
	_, err := LoadAtmosphereDarkness(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), `"Cave"`)
	assert.Contains(t, err.Error(), "must be black")
}

func TestLoadAtmosphereDarkness_FullDarknessBlackOrUncoloured(t *testing.T) {
	fsys := fstest.MapFS{AtmosphereProfileFile: {Data: []byte(`{
		"Black": {"darkness": 1, "color": "#000000"},
		"Bare": {"darkness": 1},
		"Gloom": {"darkness": 0.55, "color": "#141c30"}
	}`)}}
	got, err := LoadAtmosphereDarkness(fsys)
	require.NoError(t, err)
	assert.Equal(t, map[string]float32{"Black": 1, "Bare": 1, "Gloom": 0.55}, got)
}
