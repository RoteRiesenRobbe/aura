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
