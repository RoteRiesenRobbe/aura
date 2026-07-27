package sim

// Chunk-3 tests (plan-sim-harness §8 chunk 3): the N-mob generalization is
// pinned with exact tick math (the N=1 path must stay byte-identical to the
// chunk-1 fights), then the matrix sweep on top of it.

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPack_Constructor(t *testing.T) {
	sc := Pack(exactPlayer(), turretMob(0, 1), 4, 0.5)

	assert.Equal(t, "PACK", sc.Name)
	assert.Equal(t, 4, sc.PackSize)
	assert.True(t, sc.PlayerAuraActive)
	assert.Equal(t, OutcomeMobDied, sc.Primary)
	assert.Equal(t, DefaultMaxTicks, sc.MaxTicks)
}

// A pack spawns on an evenly-spaced ring at StartDistance, mob 0 exactly
// where the 1v1 mob spawns; each mob rolls its own spawn HP from the run
// rng in index order, so same-seed worlds match mob for mob.
func TestNewWorld_PackRingPlacement(t *testing.T) {
	m := turretMob(0, 1)
	m.MaxHealthVariance = 0.1
	sc := Pack(exactPlayer(), m, 3, 0.5)

	w := NewWorld(sc, 42)

	require.Len(t, w.Mobs, 3)
	assert.Same(t, w.Mob, w.Mobs[0])
	for i, mb := range w.Mobs {
		angle := 2 * math.Pi * float64(i) / 3
		assert.InDelta(t, 0.5*math.Cos(angle), mb.Position().X, 1e-6, "mob %d x", i)
		assert.InDelta(t, 0.5*math.Sin(angle), mb.Position().Y, 1e-6, "mob %d y", i)
	}

	// The variance band must actually reach the per-mob rolls.
	hp := []float32{float32(w.Mobs[0].Health()), float32(w.Mobs[1].Health()), float32(w.Mobs[2].Health())}
	assert.True(t, hp[0] != hp[1] || hp[1] != hp[2], "per-mob spawn HP rolls must spread, got %v", hp)

	// Same seed → identical pack, roll order pinned.
	w2 := NewWorld(sc, 42)
	for i := range w.Mobs {
		assert.Equal(t, w.Mobs[i].Health(), w2.Mobs[i].Health(), "mob %d HP", i)
	}
}

// The no-regression guard: a PackSize-1 pack replays the 1v1 TTK fight
// tick for tick under every seed — the RNG draw order is unchanged.
func TestRunFight_PackSize1_MatchesTTK(t *testing.T) {
	sc := fullRNGScenario()
	pack := Pack(sc.Player, sc.Mob, 1, sc.StartDistance)

	for seed := int64(1); seed <= 5; seed++ {
		ttk := RunFight(sc, seed)
		got := RunFight(pack, seed)
		assert.Equal(t, ttk, got, "seed %d", seed)
		if got.Outcome == OutcomeMobDied {
			assert.Equal(t, 1, got.Kills, "seed %d", seed)
		}
	}
}

// An uncapped aura (MaxTargets 0) hits every mob in range each cadence
// tick: two 40-HP turrets fall together on tick 12, exactly like one —
// this pins that the harness drives the real multi-target pipeline.
func TestRunFight_Pack_UncappedExact(t *testing.T) {
	p := exactPlayer()
	p.Aura.MaxTargets = 0
	r := RunFight(Pack(p, turretMob(0, 1), 2, 0.5), 1)

	assert.Equal(t, OutcomeMobDied, r.Outcome)
	assert.Equal(t, 12, r.Ticks)
	assert.Equal(t, 2, r.Kills)
}

// A MaxTargets-1 aura clears the same two turrets sequentially: every
// cadence hit lands on exactly one living mob, so 80 pooled HP / 10 per
// hit = 8 hits → tick 24. (Identical mobs make the pin invariant to
// nearest-selector tie-breaking between the equidistant targets.)
func TestRunFight_Pack_CappedSequentialExact(t *testing.T) {
	r := RunFight(Pack(exactPlayer(), turretMob(0, 1), 2, 0.5), 1)

	assert.Equal(t, OutcomeMobDied, r.Outcome)
	assert.Equal(t, 24, r.Ticks)
	assert.Equal(t, 2, r.Kills)
}

// Kills counts the pack members down when the player loses: three 25-HP-
// per-hit interval-10 turrets deal 75 on tick 10 and (one dead since tick
// 12) 50 more on tick 20 → the player falls on tick 20 with exactly one
// kill banked.
func TestRunFight_Pack_KillsBeforeDeath(t *testing.T) {
	r := RunFight(Pack(exactPlayer(), turretMob(25, 10), 3, 0.5), 1)

	assert.Equal(t, OutcomePlayerDied, r.Outcome)
	assert.Equal(t, 20, r.Ticks)
	assert.Equal(t, 1, r.Kills)
}

// --- the matrix sweep ---

// The reproducibility contract, N-wide and with every RNG source on: the
// same MatrixConfig yields the exact same rows — this exercises the
// deterministic targeting order end-to-end (equidistant pack, variance +
// crit on, capped and uncapped rows).
func TestRunMatrix_ReproducibleUnderFixedSeed(t *testing.T) {
	sc := fullRNGScenario()
	cfg := MatrixConfig{
		Player:               sc.Player,
		Mob:                  sc.Mob,
		MaxTargetsCandidates: []int{1, 0},
		MaxPackSize:          3,
		BaseSeed:             42,
		Runs:                 10,
		Distance:             0.5,
	}

	first := RunMatrix(cfg)
	second := RunMatrix(cfg)

	require.Equal(t, first.Rows, second.Rows)
}

// matrixTestConfig is the deterministic straddle fixture: exact 10-HP-per-3-
// tick player vs 4-HP-per-2-tick 40-HP turrets, all RNG off. Tick math per
// row: capped (MaxTargets 1) clears n=1 (24 dmg taken), n=2 (72), dies in
// n=3 around tick 20 with one kill; uncapped clears through n=4 (≤96 dmg by
// the tick-12 wipe) and dies at n=5 (5×4×5 = 100 dmg by tick 10, before the
// tick-12 clear).
func matrixTestConfig() MatrixConfig {
	return MatrixConfig{
		Player:               exactPlayer(),
		Mob:                  turretMob(4, 2),
		MaxTargetsCandidates: []int{1, 0},
		MaxPackSize:          5,
		BaseSeed:             1,
		Runs:                 3,
		Distance:             0.5,
	}
}

func TestRunMatrix_WinRateMonotoneAndOverwhelm(t *testing.T) {
	r := RunMatrix(matrixTestConfig())

	require.Len(t, r.Rows, 2)
	for _, row := range r.Rows {
		require.Len(t, row.Cells, 5)
		prev := 1.1
		firstLoss := -1
		for _, cell := range row.Cells {
			assert.LessOrEqual(t, cell.WinRate, prev,
				"win rate must not increase with pack size (maxTargets %d, pack %d)", row.MaxTargets, cell.PackSize)
			prev = cell.WinRate
			if firstLoss == -1 && cell.WinRate < 0.5 {
				firstLoss = cell.PackSize
			}
		}
		assert.Equal(t, firstLoss, row.OverwhelmPack, "overwhelm = first sub-50%% cell (maxTargets %d)", row.MaxTargets)
	}

	assert.Equal(t, 3, r.Rows[0].OverwhelmPack, "capped build overwhelmed at pack 3")
	assert.Equal(t, 5, r.Rows[1].OverwhelmPack, "uncapped build overwhelmed at pack 5")
	assert.InDelta(t, 1.0, r.Rows[0].Cells[2].Kills.P50, 1e-9,
		"the losing capped pack-3 fights bank exactly one kill")
}

// A build that never loses in the swept range reports no overwhelm point.
func TestRunMatrix_NoOverwhelmReportsMinusOne(t *testing.T) {
	cfg := matrixTestConfig()
	cfg.Mob = turretMob(0, 1) // harmless turrets
	cfg.MaxTargetsCandidates = []int{1}
	cfg.MaxPackSize = 3

	r := RunMatrix(cfg)

	require.Len(t, r.Rows, 1)
	assert.Equal(t, -1, r.Rows[0].OverwhelmPack)
	for _, cell := range r.Rows[0].Cells {
		assert.Equal(t, 1.0, cell.WinRate, "pack %d", cell.PackSize)
	}
}

// Loosening the cap can never hurt: at every pack size the uncapped row wins
// at least as often as the capped one, and clears no slower where both clear.
func TestRunMatrix_MoreTargetsNeverHurts(t *testing.T) {
	r := RunMatrix(matrixTestConfig())

	capped, uncapped := r.Rows[0], r.Rows[1]
	for i := range capped.Cells {
		assert.GreaterOrEqual(t, uncapped.Cells[i].WinRate, capped.Cells[i].WinRate,
			"pack %d win rate", capped.Cells[i].PackSize)
		if capped.Cells[i].ClearTime.Samples > 0 && uncapped.Cells[i].ClearTime.Samples > 0 {
			assert.LessOrEqual(t, uncapped.Cells[i].ClearTime.P50, capped.Cells[i].ClearTime.P50,
				"pack %d clear p50", capped.Cells[i].PackSize)
		}
	}
}
