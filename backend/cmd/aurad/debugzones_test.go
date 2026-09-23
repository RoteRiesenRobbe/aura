package main

import (
	"io/fs"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// -debug-zones swaps the ZONE ROOT and nothing else: the set is whatever sits
// in zones/.debug/, and the main files beside it are not part of it.
//
// ⛔ No test here loads the real debug world. It is a frozen snapshot of older
// content, so a test would redden on every future mob or prop change;
// `aurad -validate -debug-zones` is its gate.
func TestUseDebugZones_RootsTheZoneSetInDotDebug(t *testing.T) {
	src := contentSources{zones: fstest.MapFS{
		"world.json":              {Data: []byte("{}")},
		".debug/world_debug.json": {Data: []byte("{}")},
		".debug/underworld.json":  {Data: []byte("{}")},
	}}

	got, err := useDebugZones(src)
	require.NoError(t, err)

	stems, err := fs.Glob(got.zones, "*.json")
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"underworld.json", "world_debug.json"}, stems)
}

func TestUseDebugZones_MissingDirFailsLoudly(t *testing.T) {
	src := contentSources{zones: fstest.MapFS{"world.json": {Data: []byte("{}")}}}

	_, err := useDebugZones(src)
	require.Error(t, err)
	assert.Contains(t, err.Error(), debugZonesDir)
}

// The embed has to carry the dot directory explicitly — a bare directory
// pattern skips it — or -debug-zones would only ever work with -content.
func TestUseDebugZones_EmbeddedCopyCarriesTheSet(t *testing.T) {
	got, err := useDebugZones(embeddedContent())
	require.NoError(t, err)

	_, err = fs.Stat(got.zones, debugStartZone+".json")
	assert.NoError(t, err)
}

func TestResolveStartZone_FlagBeatsDebugBeatsConf(t *testing.T) {
	assert.Equal(t, "tunnel", resolveStartZone("tunnel", true, "world"), "an explicit -start-zone wins")
	assert.Equal(t, debugStartZone, resolveStartZone("", true, "world"), "-debug-zones names its own primary")
	assert.Equal(t, "world", resolveStartZone("", false, "world"), "otherwise the conf decides")
}
