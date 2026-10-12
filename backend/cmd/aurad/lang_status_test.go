package main

import (
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// plan-localization.md D25, D26, D30: the status function on a fixture.
func TestLangStatus_MissingOutdatedAllowlistedAndTooLong(t *testing.T) {
	langFS := fstest.MapFS{
		"en/quests.arb": {Data: []byte(`{"@@locale": "en",
			"q_title": "Wolves", "@q_title": {"description": "t", "x-maxLength": 10},
			"q_new": "New", "@q_new": {"description": "t"},
			"q_changed": "Now", "@q_changed": {"description": "t"},
			"q_excused": "Later", "@q_excused": {"description": "t"},
			"q_long": "Far too long a title", "@q_long": {"description": "t", "x-maxLength": 10}}`)},
		"de/quests.arb":         {Data: []byte(`{"@@locale": "de", "q_title": "Wölfe über Wölfe", "q_changed": "Vorher", "q_long": "Kurz"}`)},
		"de/quests.translated-from.json": {Data: []byte(`{"q_title": "Wolves", "q_changed": "Before", "q_long": "Far too long a title"}`)},
		"de/allowlist.json":     {Data: []byte(`["q_excused"]`)},
		"fr/quests.arb":         {Data: []byte(`{"@@locale": "fr", "q_title": "Loups"}`)},
	}
	bundle, err := lang.LoadOverlays(langFS)
	require.NoError(t, err)
	var entries []lang.Entry
	for _, k := range []string{"q_title", "q_new", "q_changed", "q_excused", "q_long"} {
		entries = append(entries, lang.Entry{Key: k, Text: bundle.Overlay("en")[k]})
	}
	status, err := langStatus(loadedContent{langBundle: bundle, langEntries: map[string][]lang.Entry{"quests": entries}}, langFS)
	require.NoError(t, err)

	de := status["de"]
	assert.Equal(t, []string{"q_new"}, de.Missing)
	assert.Equal(t, []string{`q_changed: was "Before", now "Now"`}, de.Outdated)
	assert.Equal(t, []string{"q_excused"}, de.Allowlisted)
	assert.Len(t, de.TooLong, 1, "Wölfe über Wölfe is 16 characters against 10")
	assert.Contains(t, de.TooLong[0], "q_title")
	assert.Len(t, status["en"].TooLong, 1)
	assert.Contains(t, status["en"].TooLong[0], "q_long", "English is held to the limit too")
	// D26: a later language is reported, by the same function.
	assert.ElementsMatch(t, []string{"q_new", "q_changed", "q_excused", "q_long"}, status["fr"].Missing)
}

func TestVisibleLength_CountsAPluralNamesLongestForm(t *testing.T) {
	assert.Equal(t, 5, visibleLength("Wölfe"))
	assert.Equal(t, 6, visibleLength("{count, plural, one {Wolf} other {Wolves}}"))
	assert.Equal(t, 6, visibleLength("{count, plural, one {wilk} few {wilki} many {wilków} other {wilka}}"), "every category of a translation")
}

// plan-localization.md D27: a shipped zone's name is authored English; the
// debug zone set (-debug-zones, a dev tool) speaks its file's dev label.
func TestZoneNames_ShippedNeedEnglishDebugFallsBackToTheLabel(t *testing.T) {
	zones := fstest.MapFS{"world.json": {Data: []byte(`{"name": "World label"}`)}, "cave.json": {Data: []byte(`{"name": "Cave label"}`)}}
	english := map[string]string{"zone.world.name": "World"}

	names, findings, err := zoneNamesFrom(zones, english, false)
	require.NoError(t, err)
	assert.Equal(t, map[string]string{"world": "World"}, names)
	require.Len(t, findings, 1)
	assert.Contains(t, findings[0], "zone.cave.name")

	names, findings, err = zoneNamesFrom(zones, english, true)
	require.NoError(t, err)
	assert.Equal(t, map[string]string{"world": "World", "cave": "Cave label"}, names)
	assert.Empty(t, findings)
}
