package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A fresh server with no conf.json writes the EMBEDDED default (loaders.go
// writeDefaultConfig), not the repo one — so `cmd/aurad/conf.default.json` is
// what a new deployment actually runs on, while `backend/conf.default.json` is
// the file everyone reads and edits. Nothing kept the two in step, and
// cfg.ReadConfig has no DisallowUnknownFields, so the embedded copy silently
// accumulated 7 keys that no longer exist on cfg.Config while missing every
// block added since (mob, combat, zone, …).
//
// ⚑ The `server` block is deliberately NOT compared (L-H4): frontendDir vs path
// is the one real per-environment difference between the two files, and pinning
// it would invite someone to "fix" the drift by deleting that difference.
//
// ⚑ Compared as maps, not as cfg.Config values (L-H4): a struct round-trip
// drops unknown keys, which is exactly the drift this test exists to catch.
func TestEmbeddedDefaultConfig_GameBlockMatchesRepoDefault(t *testing.T) {
	repo, err := os.ReadFile("../../conf.default.json")
	require.NoError(t, err)

	assert.Equal(t, gameBlock(t, repo), gameBlock(t, defaultConfig),
		"cmd/aurad/conf.default.json's game block has drifted from backend/conf.default.json — "+
			"a fresh server would boot on different tuning than the repo default documents")
}

func gameBlock(t *testing.T, raw []byte) map[string]any {
	t.Helper()
	var conf map[string]any
	require.NoError(t, json.Unmarshal(raw, &conf))
	game, ok := conf["game"].(map[string]any)
	require.True(t, ok, "config has no game block")
	return game
}
