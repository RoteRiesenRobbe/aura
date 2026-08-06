package sim

// C1.5 (plan-xp-formula.md §13 / §7.1): the placement battery's own invariants
// — determinism, the player-level axis, the spawn reconciliation, and the
// unmeasurable-cell rule. The 423-spawn enumeration is asserted where the
// content lives (cmd/simharness).

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// twoRungConfig is a tiny synthetic world: a soft species at rung 4 and a
// second at rung 8, both the exact-cadence turret from the chain tests so the
// numbers are stable and cheap.
func twoRungConfig() PlacementConfig {
	spec := func(species string, level, spawns int, tier float64, xpFactor float64) PlacementSpec {
		return PlacementSpec{
			Species: species, Level: level, Spawns: spawns,
			Tier: "normal", TierMultiplier: tier, XPFactor: xpFactor,
			Mob: chainMob(),
		}
	}
	return PlacementConfig{
		Zone: "test",
		Specs: []PlacementSpec{
			spec("Soft", 4, 3, 1, 1),
			spec("Free", 4, 2, 1, 0), // xpFactor 0: pays nothing, still fightable
			spec("Deep", 8, 5, 1, 1),
		},
		Player:          chainPlayer(),
		Curve:           Curve{Growth: 1.12, MaxLevel: 30},
		XP:              defaultXPModel(),
		ChainFights:     2,
		DowntimeSeconds: 10,
		BaseSeed:        1,
		Runs:            2,
	}
}

// The standing property of every battery in this package: same (config, seed)
// → same numbers, so a diff between two calibration runs is a content or knob
// change and never luck.
func TestRunPlacements_IsDeterministic(t *testing.T) {
	a := RunPlacements(twoRungConfig())
	b := RunPlacements(twoRungConfig())

	// The timestamp is the only field allowed to move.
	a.GeneratedAt = b.GeneratedAt
	assert.Equal(t, a, b)
}

// Rows are placed RUNGS (D12), sorted, with every authored spawn accounted
// for — the report's spawn total must reconcile against the enumeration or a
// shrinking sample reads as a smaller world.
func TestRunPlacements_GroupsByRungAndReconcilesSpawns(t *testing.T) {
	rep := RunPlacements(twoRungConfig())

	require.Len(t, rep.Rows, 2)
	assert.Equal(t, 4, rep.Rows[0].Level)
	assert.Equal(t, 8, rep.Rows[1].Level)
	assert.Equal(t, 5, rep.Rows[0].Spawns, "Soft×3 + Free×2")
	assert.Equal(t, 5, rep.Rows[1].Spawns)
	assert.Equal(t, 10, rep.TotalSpawns)

	total := 0
	for _, row := range rep.Rows {
		total += row.Spawns
		assert.Equal(t, row.PlayerLevel, row.Level, "0 = the diagonal")
		assert.Zero(t, row.Delta)
	}
	assert.Equal(t, rep.TotalSpawns, total)

	// Species within a rung are sorted, so two runs of the report diff cleanly.
	assert.Equal(t, "Free", rep.Rows[0].Cells[0].Species)
	assert.Equal(t, "Soft", rep.Rows[0].Cells[1].Species)
}

// The player-level axis is the point of the battery (§13.3): without it every
// rung reads at-level and the taper C1.5 just wired in stays invisible.
func TestRunPlacements_PlayerLevelAxisMovesTheAward(t *testing.T) {
	diagonal := RunPlacements(twoRungConfig())

	cfg := twoRungConfig()
	cfg.PlayerLevel = 20
	fixed := RunPlacements(cfg)

	for i, row := range fixed.Rows {
		assert.Equal(t, 20, row.PlayerLevel)
		assert.Equal(t, row.Level-20, row.Delta)
		// ZD(20) = 5 + 20/6 = 8, so rungs 4 and 8 are both ≥ 8 below a
		// level-20 player: gray, where the diagonal paid full.
		assert.Zero(t, row.Award, "rung %d is gray to a level-20", row.Level)
		assert.Zero(t, row.XPPerHour)
		assert.Greater(t, diagonal.Rows[i].Award, 0.0, "...and pays at level")
	}

	// One rung inside the band pays, and pays LESS than at-level.
	//
	// ⚑ Δ = −1 would NOT show this at the shipped defaults, and the near-miss
	// is worth recording: at growth 1.2 and ZD(9) = 6, one level of base gain
	// exactly cancels one level of taper (1.2 × 5/6 = 1.00), so a level-9
	// player gets the identical 143 XP from a rung-8 mob that a level-8 gets.
	// Δ = −2 is where the taper starts winning.
	cfg.PlayerLevel = 10
	near := RunPlacements(cfg)
	deep := near.Rows[1] // rung 8, Δ = −2
	require.Equal(t, 8, deep.Level)
	assert.Greater(t, deep.Award, 0.0)
	assert.Less(t, deep.Award, diagonal.Rows[1].Award)
}

// An xpFactor-0 species is fightable and pays nothing — the cell must say so
// with a zero award rather than dropping out of the row.
func TestRunPlacements_XPFactorZeroPaysNothingButStillCounts(t *testing.T) {
	rep := RunPlacements(twoRungConfig())

	free := rep.Rows[0].Cells[0]
	require.Equal(t, "Free", free.Species)
	assert.Zero(t, free.Award)
	assert.Zero(t, free.KillsPerLevel, "the honest value is +Inf; the report carries 0 and Award says why")
	assert.Zero(t, free.XPPerHour)
	assert.True(t, free.Measurable, "it is perfectly killable, it just pays nothing")
	assert.Contains(t, []int{2}, free.Spawns)
	assert.Equal(t, 5, rep.Rows[0].MeasuredSpawns, "its spawns still stand behind the row")
}

// A species the stand-still bot cannot finish is excluded from the rates and
// COUNTED OUT loudly — never averaged in as a zero (§7.1: no silent caps).
func TestRunPlacements_UnmeasurableCellsAreCountedOutNotAveragedIn(t *testing.T) {
	cfg := twoRungConfig()
	// ⚑ Lethal is NOT enough on its own: the kite stance pins the mob (speed 0,
	// role structure) at a distance where its aura misses, so anything with a
	// kite ring is measurable no matter how hard it hits. Unmeasurable needs
	// BOTH — it kills the facetank bot AND it outranges the player, so there
	// is no ring (aura 3.0 vs the player's 2.0; KiteDistance returns !ok).
	lethal := chainMob()
	lethal.MaxHealth = 200
	lethal.Aura.DamageHP = 1000
	lethal.Aura.TickInterval = 1
	lethal.Aura.Radius = 3.0
	cfg.Specs = append(cfg.Specs, PlacementSpec{
		Species: "Lethal", Level: 4, Spawns: 7,
		Tier: "boss", TierMultiplier: 5, XPFactor: 1, Mob: lethal,
	})

	rep := RunPlacements(cfg)
	row := rep.Rows[0]

	assert.Equal(t, 12, row.Spawns, "every authored spawn is reported")
	assert.Equal(t, 5, row.MeasuredSpawns, "only the ones with a sample back the rates")
	assert.Equal(t, 7, rep.UnmeasuredSpawns)

	var lethalCell PlacementCell
	for _, c := range row.Cells {
		if c.Species == "Lethal" {
			lethalCell = c
		}
	}
	require.Equal(t, "Lethal", lethalCell.Species)
	assert.False(t, lethalCell.Measurable)
	assert.Zero(t, lethalCell.KillsPerHour)
	// ⚑ But the award is real: what one kill pays does not depend on the bot
	// managing it.
	assert.Greater(t, lethalCell.Award, uint64(0))
	assert.Greater(t, lethalCell.KillsPerLevel, 0.0)

	// The row's rates must be the measurable cells' — the lethal boss's 7
	// spawns must not drag them toward zero.
	clean := RunPlacements(twoRungConfig())
	assert.InDelta(t, clean.Rows[0].KillsPerHour, row.KillsPerHour, 1e-9)
}

// ⛑ A rung with NOTHING measurable is not a rung that pays nothing, and the
// two are one line apart in the renderer: the row's aggregate award is 0 only
// because there is no sample behind it. Printing that as "gray" would state
// the exact opposite of the truth for a rung the player cannot yet beat.
func TestPlacementTable_UnmeasuredRungIsNotRenderedAsGray(t *testing.T) {
	unkillable := chainMob()
	unkillable.MaxHealth = 200
	unkillable.Aura.DamageHP = 1000
	unkillable.Aura.TickInterval = 1
	unkillable.Aura.Radius = 3.0 // outranges the player: no kite ring either

	cfg := twoRungConfig()
	cfg.Specs = []PlacementSpec{
		{Species: "Soft", Level: 4, Spawns: 3, Tier: "normal", TierMultiplier: 1, XPFactor: 1, Mob: chainMob()},
		{Species: "Wall", Level: 5, Spawns: 2, Tier: "boss", TierMultiplier: 5, XPFactor: 1, Mob: unkillable},
	}
	rep := RunPlacements(cfg)

	require.Len(t, rep.Rows, 2)
	wall := rep.Rows[1]
	require.Zero(t, wall.MeasuredSpawns)
	require.Zero(t, wall.Award, "no sample, so no aggregate")
	// ...but the CELL's award is real, and it is emphatically not gray.
	require.Greater(t, wall.Cells[0].Award, uint64(0))

	table := rep.PlacementTable()
	lines := strings.Split(strings.TrimSpace(table), "\n")
	var wallLine string
	for _, l := range lines {
		if strings.Contains(l, "Wall×2") {
			wallLine = l
		}
	}
	require.NotEmpty(t, wallLine, "the rung must still appear:\n%s", table)
	assert.NotContains(t, wallLine, "gray",
		"an unmeasured rung reads as unmeasured, never as \"this pays nothing\"")
	assert.Contains(t, wallLine, "0/2", "and says how much of it went unmeasured")

	// The species table still carries the honest per-kill pay.
	assert.NotContains(t, rep.PlacementSpeciesTable(), "gray")
}

// The whole report must survive encoding/json — the +Inf kills-per-level trap
// (XPModel.KillsPerLevelAt's own warning) would take the artifact out silently
// at the end of a long calibration run.
func TestRunPlacements_ArtifactMarshals(t *testing.T) {
	cfg := twoRungConfig()
	cfg.PlayerLevel = 20 // every rung gray → every kills-per-level would be +Inf
	rep := RunPlacements(cfg)

	data, err := json.Marshal(rep)
	require.NoError(t, err)
	assert.NotContains(t, string(data), "Inf")

	var back PlacementReport
	require.NoError(t, json.Unmarshal(data, &back))
	assert.Equal(t, rep.TotalSpawns, back.TotalSpawns)
}

// The chain battery learned to price its kills (§13.1: "the chain battery
// reports no XP at all"). Unpriced stays unpriced — every caller before C1.5
// passes no ChainKillXP.
func TestRunChain_XPPerHourIsOptAndPricedByTheLiveEconomy(t *testing.T) {
	cfg := exactChainConfig()
	unpriced := RunChain(cfg)
	assert.Zero(t, unpriced.Rows[0].Award)
	assert.Zero(t, unpriced.Rows[0].Facetank.XPPerHour)

	// ...including a LEVELLED bracket, where a nil KillXP has a level it could
	// silently price against. The pre-C1.5 callers all pass nil, and an award
	// appearing in their artifacts is a changed report, not a free feature.
	levelled := exactChainConfig()
	levelled.Curve = Curve{Growth: 1.12, MaxLevel: 30}
	levelled.Levels = []int{12}
	assert.Zero(t, RunChain(levelled).Rows[0].Award, "nil KillXP prices nothing, at any bracket")

	x := defaultXPModel()
	cfg.KillXP = &ChainKillXP{XP: x, PlayerLevel: 10, MobLevel: 10}
	priced := RunChain(cfg)
	row := priced.Rows[0]

	assert.Equal(t, x.Award(10, 10, 1, 1), row.Award)
	assert.InDelta(t, float64(row.Award)*row.Facetank.KillsPerHour.P50, row.Facetank.XPPerHour, 1e-9)
	// Pricing must not move the fight: the measured rates are identical.
	assert.Equal(t, unpriced.Rows[0].Facetank.KillsPerHour, row.Facetank.KillsPerHour)
}

// A bracket with no level of its own (the explicit-numbers row) cannot be
// priced from the bracket, and says so with a zero rather than pricing at
// level 1.
func TestChainKillXP_UnlevelledBracketIsUnpriced(t *testing.T) {
	k := &ChainKillXP{XP: defaultXPModel()}
	assert.Zero(t, k.award(0), "the explicit-numbers bracket carries no level")
	assert.Greater(t, k.award(12), uint64(0))

	// ...and the overrides are what the placement battery uses to price it.
	k.PlayerLevel, k.MobLevel = 20, 12
	assert.Equal(t, defaultXPModel().Award(20, 12, 1, 1), k.award(0))
}
