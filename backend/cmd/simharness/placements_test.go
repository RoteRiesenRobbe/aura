package main

// C1.5 (plan-xp-formula.md §7.1): the content side of the placement battery —
// one parser (never a second), the combat filter riding the catalog's own flag,
// and a missing content dir failing LOUDLY rather than reporting an empty
// world.

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sim"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// authoredCombatSpawns counts the combat targets in the authored zone, read
// through the same content source the loader uses.
//
// ⭐ It is DERIVED, not hardcoded, and that is the point: this file used to
// assert `Len(placements, 423)` against world.json's 485 spawns, so placing one
// mob in the editor turned three legs red and taught everyone to ignore them. A
// census pin measures the CONTENT; the invariant worth guarding is that the
// PIPELINE loses nothing — every combat spawn reaches a placement row, and
// every row reaches the report. Those hold at any world size.
//
// ⚑ The floor below is what a bare count cannot do without: a derived
// expectation of 0 would match a broken loader returning nothing. The world has
// hundreds of combat spawns and dropping under 100 means something collapsed,
// not that somebody deleted a wolf.
func authoredCombatSpawns(t *testing.T) int {
	t.Helper()
	c, err := contentFS("")
	require.NoError(t, err)
	mr, _, err := loadRegistries(c)
	require.NoError(t, err)
	pr, err := world.PropRegistryFromFS(c.props)
	require.NoError(t, err)
	zone, err := world.LoadZoneFS(c.zones, "world", mr, pr)
	require.NoError(t, err)

	n := 0
	for i := range zone.Spawns {
		if zone.Spawns[i].Def.IsCombatTarget() {
			n++
		}
	}
	require.Greater(t, n, 100, "the authored world holds hundreds of combat spawns; %d means the load collapsed, not that content shrank", n)
	return n
}

// Every combat spawn in the authored world becomes a placement that resolves to
// a level, and the level rungs 1-20 all have a tenant.
//
// ⚑ IsCombatTarget is `XPFactor > 0 && !FriendlyToPlayers` — the same derivation
// the nameplate catalog uses, and NOT what scripts/world-regions.py filters on
// (`xpFactor != 0`). The two agree today because no species is both XP-paying
// and friendly; if one is ever authored they diverge, and the per-placement
// IsCombatTarget assert below is where it surfaces.
func TestLoadPlacements_EnumeratesTheAuthoredWorld(t *testing.T) {
	placements, err := loadPlacements("", "world")
	require.NoError(t, err)

	assert.Len(t, placements, authoredCombatSpawns(t), "every combat spawn in world.json becomes a placement")

	rungs := map[int]int{}
	for _, p := range placements {
		require.NotNil(t, p.Def, "the loader resolves every spawn's species")
		assert.GreaterOrEqual(t, p.Level, 1, "%s carries a resolved level", p.Def.Name)
		assert.True(t, p.Def.IsCombatTarget(), "%s is not prey", p.Def.Name)
		rungs[p.Level]++
	}
	// Every rung 1-20 has a tenant since the world re-placement pass
	// (plan-world-replacement.md C2); 21-30 is D5's standing gap.
	for level := 1; level <= 20; level++ {
		assert.NotZero(t, rungs[level], "rung %d has no tenant", level)
	}
	assert.Empty(t, rungs[21], "levels 21-30 are a standing gap (D5), not content")
}

// L7 — the loader is the one aurad boots with, so a spawn level that the game
// would reject cannot slip through here. Proven by asking the same loader for a
// species-level fact and getting the resolved override, not the curveLevel.
func TestLoadPlacements_UsesTheSpawnOverrideNotTheSpeciesLevel(t *testing.T) {
	placements, err := loadPlacements("", "world")
	require.NoError(t, err)

	// DireWolf is authored cL6 and the re-placement pass spread it across
	// several rungs — so at least one placement must NOT sit at cL6, or the
	// override is being ignored.
	var direWolf *mobs.MobDefinition
	levels := map[int]bool{}
	for _, p := range placements {
		if p.Def.Name != "DireWolf" {
			continue
		}
		direWolf = p.Def
		levels[p.Level] = true
	}
	require.NotNil(t, direWolf, "DireWolf must be placed in world.json")
	require.Equal(t, 6, direWolf.CurveLevel)
	assert.Greater(t, len(levels), 1,
		"one species stands at several placed levels — that is what the battery exists to see")
	assert.NotEqual(t, map[int]bool{6: true}, levels, "the spawn override, not the species curveLevel")
}

// §7.1's no-content degrade, both directions: a content dir without the new
// subdirectories must ERROR rather than report an empty table, which reads as
// "nothing in the world is placed".
func TestContentFS_MissingSubdirectoriesFailLoudly(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"skills", "factions", "mobs"} {
		require.NoError(t, os.Mkdir(filepath.Join(dir, name), 0o755))
	}

	// zones and props still missing.
	_, err := contentFS(dir)
	require.Error(t, err, "a content dir without zones/ must not resolve")
	assert.Contains(t, err.Error(), "content dir")

	require.NoError(t, os.Mkdir(filepath.Join(dir, "zones"), 0o755))
	_, err = contentFS(dir)
	require.Error(t, err, "...nor one without props/, which a zone cannot resolve without")

	require.NoError(t, os.Mkdir(filepath.Join(dir, "props"), 0o755))
	_, err = contentFS(dir)
	require.NoError(t, err)

	// The dirs exist but are empty: the battery must still refuse rather than
	// hand back an empty placement list.
	_, err = loadPlacements(dir, "world")
	require.Error(t, err, "an empty zones dir is not an empty world")
}

// copyContentDir mirrors one api/ subdirectory into a temp content dir.
//
// ⚑ It used to be os.Symlink, which needs a privilege Windows does not grant by
// default (Developer Mode off) — so this leg was red on the PO's machine and
// nowhere else, which is worse than red everywhere: it trains people to skim
// past a failing package. A copy of a few hundred KB of JSON costs nothing and
// runs the same on every platform.
func copyContentDir(t *testing.T, src, dst string) {
	t.Helper()
	require.NoError(t, filepath.Walk(src, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(src, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dst, rel)
		if info.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, data, 0o644)
	}))
}

// The sharper half of the same rule, and the one the guard above is actually
// for: a zone that PARSES but holds nothing a player can fight. LoadZoneFS is
// happy with it, so without the explicit refusal the battery would print a
// table with no rows — "nothing in this world is placed" — for a zone that is
// simply full of NPCs.
func TestLoadPlacements_ZoneWithoutCombatSpawnsFailsLoudly(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"skills", "factions", "mobs", "props"} {
		copyContentDir(t, filepath.Join(repoAPIDir(t), name), filepath.Join(dir, name))
	}
	require.NoError(t, os.Mkdir(filepath.Join(dir, "zones"), 0o755))
	// Farmer is xpFactor 0 (an NPC), so this zone is valid and has zero prey.
	require.NoError(t, os.WriteFile(filepath.Join(dir, "zones", "npcville.json"), []byte(`{
		"name": "NPCville",
		"bounds": {"width": 100, "height": 100},
		"spawns": [{"mob": "Farmer", "x": 0, "y": 0, "respawnTicks": 600}]
	}`), 0o644))

	_, err := loadPlacements(dir, "npcville")
	require.Error(t, err, "a zone with no prey is not an empty table")
	assert.Contains(t, err.Error(), "no combat spawns")
}

// repoAPIDir locates the repo's api/ directory from the test's working dir
// (backend/cmd/simharness).
func repoAPIDir(t *testing.T) string {
	t.Helper()
	abs, err := filepath.Abs(filepath.Join("..", "..", "..", "api"))
	require.NoError(t, err)
	if _, err := os.Stat(abs); err != nil {
		t.Skipf("repo api/ not reachable from the test working dir: %v", err)
	}
	return abs
}

func TestLoadPlacements_UnknownZoneFailsLoudly(t *testing.T) {
	_, err := loadPlacements("", "no-such-zone")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no-such-zone")
}

// The one line that makes the harness placement-aware: powerScale = F(level).
// Everything that is not an HP value must be identical across levels — the
// same Philosophy A rule the fixture obeys (§5: never radius, cadence,
// variance, crit, geometry or ratios).
func TestMobSpecOf_LevelScalesHPValuesOnly(t *testing.T) {
	defs, _, err := loadContent("")
	require.NoError(t, err)

	c := curve.Default()
	for _, def := range defs {
		home, err := mobSpecOf(def, def.CurveLevel)
		require.NoError(t, err)
		placed, err := mobSpecOf(def, def.CurveLevel+5)
		require.NoError(t, err)

		ratio := c.F(def.CurveLevel+5) / c.F(def.CurveLevel)
		if home.MaxHealth > 0 {
			// Absolute, not relative: mobSpecOf ROUNDS the pool (vitals.HP
			// rounds the live one, so a preset keeping the fraction would model
			// a mob the server cannot spawn), and half an HP is a large
			// relative error on a 1-HP Totem.
			assert.InDelta(t, float64(home.MaxHealth)*ratio, float64(placed.MaxHealth), 1.0,
				"%s: max HP rides f(level)", def.Name)
		}
		if home.Aura.DamageHP > 0 {
			assert.InEpsilon(t, float64(home.Aura.DamageHP)*ratio, float64(placed.Aura.DamageHP), 1e-4,
				"%s: aura damage rides f(level)", def.Name)
		}

		// Zero out the HP values and the two specs must be equal — nothing
		// else may move.
		home.MaxHealth, placed.MaxHealth = 0, 0
		home.Aura.DamageHP, placed.Aura.DamageHP = 0, 0
		home.Aura.DotHP, placed.Aura.DotHP = 0, 0
		assert.Equal(t, home, placed, "%s: only HP values may follow the level", def.Name)
	}
}

// The preset roster answers the same question the CLI's -mob-preset does, and
// level 0 keeps meaning "each species at its own curveLevel" — the roster's
// meaning since chunk 2.
func TestLoadPresets_LevelDerivesTheWholeRoster(t *testing.T) {
	home, _, err := loadPresets("", 0)
	require.NoError(t, err)
	placed, _, err := loadPresets("", 16)
	require.NoError(t, err)
	require.Equal(t, len(home), len(placed))

	byName := map[string]mobPreset{}
	for _, p := range home {
		byName[p.Name] = p
	}
	for _, p := range placed {
		assert.Equal(t, 16, p.Level, "%s derived at the requested level", p.Name)
	}

	wolf := byName["DireWolf"]
	require.Equal(t, 6, wolf.Level, "level 0 = the species' own curveLevel")

	direct, err := mobSpecByName("", "DireWolf", 16)
	require.NoError(t, err)
	for _, p := range placed {
		if p.Name == "DireWolf" {
			assert.Equal(t, direct, p.Spec, "-mob-preset and the roster agree")
			assert.Greater(t, p.Spec.MaxHealth, wolf.Spec.MaxHealth, "a DireWolf at 16 is bigger than one at 6")
		}
	}
}

func TestMobSpecByName_UnknownSpeciesListsTheRoster(t *testing.T) {
	_, err := mobSpecByName("", "Wolfe", 0)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown species")
	assert.Contains(t, err.Error(), "Wolf")
}

// End to end over the real world, cheaply: the battery reconciles against the
// enumeration and prices every rung with the live economy.
func TestRunPlacementsBattery_ReconcilesAgainstTheAuthoredWorld(t *testing.T) {
	report, err := runPlacementsBattery(placementsInput{
		zone:   "world",
		player: sim.PlayerSpec{MaxHealth: 100, Aura: sim.AuraSpec{DamageHP: 14, TickInterval: 40, Radius: 1.0, MaxTargets: 1}},
		curve:  sim.Curve{Growth: 1.12, MaxLevel: 30},
		xp: sim.XPModel{
			LevelUpBase: 300, LevelUpGrowth: 1.2,
			KillBase: curve.DefaultKillXP().Base, KillGrowth: curve.DefaultKillXP().Growth,
		},
		fights: 1, downtime: 10, seed: 1, runs: 1, maxSeconds: 20,
	})
	require.NoError(t, err)

	assert.Equal(t, authoredCombatSpawns(t), report.TotalSpawns, "every combat spawn reaches a row")
	assert.Len(t, report.Rows, 20, "rungs 1-20 (D5 leaves 21-30 empty)")

	for _, row := range report.Rows {
		assert.Equal(t, row.Level, row.PlayerLevel, "0 = the diagonal")
		assert.LessOrEqual(t, row.MeasuredSpawns, row.Spawns)
		for _, c := range row.Cells {
			assert.Equal(t, row.Level, c.Level)
			// The tier weight comes off the definition, so an elite pays the
			// elite multiple of what a normal at its rung pays.
			assert.Positive(t, c.TierMultiplier)
		}
	}

	// The tables render without a panic on the real, ragged content.
	assert.Contains(t, report.PlacementTable(), fmt.Sprintf("%d combat spawns", authoredCombatSpawns(t)))
	assert.NotEmpty(t, report.PlacementSpeciesTable())
}
