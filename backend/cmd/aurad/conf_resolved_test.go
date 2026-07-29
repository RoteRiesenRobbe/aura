package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/core"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
)

// resolvedTuning is every game-tuning number a conf file can influence, taken
// AFTER the full normalization chain — cfg.ReadConfig's defaults, core.Config's
// defaults, the CombatConfig accessors and the model/mob package setters. This
// is the layer at which "absent key" and "key restating the default" must be
// indistinguishable (§35 D1/L4).
type resolvedTuning struct {
	Game                   cfg.GameConfig
	CritFactor             float32
	HealerThreat           float32
	MobHealthGainTick      float32
	MobWalkingSpeedPerTick float32
}

func resolveTuning(t *testing.T, raw []byte) resolvedTuning {
	t.Helper()
	path := filepath.Join(t.TempDir(), "conf.json")
	require.NoError(t, os.WriteFile(path, raw, 0o644))
	conf, err := cfg.ReadConfig(path)
	require.NoError(t, err)

	var g cfg.GameConfig
	require.NoError(t, core.Config(conf)(&g))

	// The mob pair rides package-level setters, not GameConfig (backlog
	// §27.2.3); resolve it the way aurad's boot does. Setting 0 restores the
	// built-in default, so the globals are trivially restorable.
	mob.SetHealthGainTick(conf.Game.Mob.HealthGainTick)
	mob.SetWalkingSpeedPerTick(conf.Game.Mob.WalkingSpeedPerTick)
	t.Cleanup(func() {
		mob.SetHealthGainTick(0)
		mob.SetWalkingSpeedPerTick(0)
	})

	resolved := resolvedTuning{
		Game:                   g,
		CritFactor:             g.CombatConfig.CritFactor(),
		HealerThreat:           g.CombatConfig.HealerThreat(),
		MobHealthGainTick:      mob.HealthGainTick(),
		MobWalkingSpeedPerTick: mob.WalkingSpeedPerTick(),
	}
	// CombatConfig is copied raw by design (its accessors normalize), so the
	// raw struct legitimately differs between an empty conf (0,0) and the
	// default file's restatement — the accessor outputs above are what must
	// match. Blank the raw copy so assert.Equal compares only defined values.
	resolved.Game.CombatConfig = cfg.CombatConfig{}
	return resolved
}

// The §35 C1 invariant: conf.default.json is a PURE RESTATEMENT of the Go
// defaults, and every tracked environment conf resolves to exactly the same
// game tuning — per-environment differences live in the server block and the
// zone selector (which is a content selector, not tuning, and is deliberately
// outside this comparison). This is what makes the shrink-to-deltas (D1) safe:
// deleting a game key from any of these files cannot change the resolved
// config, and a key that WOULD change it turns this test red.
// trackedConfs are the on-disk conf files this repo owns, keyed by their
// repo-relative name; the embedded copy rides beside them as raw bytes
// (defaultConfig).
var trackedConfs = map[string]string{
	"backend/conf.default.json":       "../../conf.default.json",
	"backend/conf.docker.json":        "../../conf.docker.json",
	"backend/conf.local-windows.json": "../../conf.local-windows.json",
	"devops/conf.json":                "../../../devops/conf.json",
}

func TestTrackedConfs_ResolveToIdenticalGameTuning(t *testing.T) {
	baseline := resolveTuning(t, []byte(`{"game":{}}`))

	for name, path := range trackedConfs {
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(path)
			require.NoError(t, err)
			assert.Equal(t, baseline, resolveTuning(t, raw),
				"%s resolves different game tuning than the Go defaults — either it carries a genuine per-environment game delta (then this test needs a documented exception) or it has drifted", name)
		})
	}

	t.Run("cmd/aurad/conf.default.json (embedded)", func(t *testing.T) {
		assert.Equal(t, baseline, resolveTuning(t, defaultConfig),
			"the embedded default resolves different game tuning than the Go defaults — a fresh boot would not run on the documented numbers")
	})
}

// The D2 boot-noise guarantee (§35 C2): every key in a TRACKED conf is either
// a live cfg.Config field or "_"-prefixed, so booting any of them warns about
// nothing. A red run here means a key was added to a conf without a struct
// field (typo or drift — the class the warning exists to catch) or a field
// was retired without pruning the files.
func TestTrackedConfs_HaveNoUnknownKeys(t *testing.T) {
	check := func(t *testing.T, name string, raw []byte) {
		t.Helper()
		unknown, err := cfg.UnknownKeys(raw)
		require.NoError(t, err)
		assert.Empty(t, unknown, "%s carries keys cfg.Config does not have — every boot of it will warn", name)
	}

	for name, path := range trackedConfs {
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(path)
			require.NoError(t, err)
			check(t, name, raw)
		})
	}
	t.Run("cmd/aurad/conf.default.json (embedded)", func(t *testing.T) {
		check(t, "cmd/aurad/conf.default.json", defaultConfig)
	})
}
