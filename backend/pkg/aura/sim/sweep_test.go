package sim

// Chunk-2 sanity tests, part 2: the level / gap / linked-triple sweeps.
// Turret mobs + zero variance make outcomes exact tick math, so the sweeps'
// core claims are pinned, not eyeballed: same-tier is scale-invariant across
// the span (§5 Philosophy A), the cross-tier gap has a wall, steeper growth
// narrows the band.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// exactFixture is deterministic: turret mob (role structure, speed 0), no
// variance, no crit.
// Baseline cadence (chunk-1 pins): TTK = ceil(60/14) = 5 hits × 40 ticks =
// tick 200; TTD = ceil(100/8) = 13 hits × 20 ticks = tick 260.
func exactFixture(growth float64, maxLevel int) Fixture {
	return Fixture{
		Curve: Curve{Growth: growth, MaxLevel: maxLevel},
		Player: PlayerSpec{
			MaxHealth: 100,
			Aura:      AuraSpec{DamageHP: 14, TickInterval: 40, Radius: 1.0, MaxTargets: 1},
		},
		Mob: MobSpec{
			MaxHealth:   60,
			Role:        string(mobs.RoleStructure),
			Speed:       0,
			BodyRadius:  0.2,
			AggroRadius: 2.4,
			Aura:        AuraSpec{DamageHP: 8, TickInterval: 20, Radius: 1.0, MaxTargets: 1},
		},
		XP: XPModel{LevelUpBase: 300, LevelUpGrowth: 1.2, KillBase: 40, KillGrowth: 1.2},
	}
}

// Philosophy A pinned: a same-tier fight reads the same at every level of the
// span — TTK and TTD p50 stay within one aura tick of the level-1 value
// (integer HP rounding may shift a hit boundary, never more).
func TestRunLevelSweep_SameTierIsScaleInvariant(t *testing.T) {
	fx := exactFixture(1.12, 12)

	points := RunLevelSweep(fx, 0.35, 1, 2)

	require.Len(t, points, 12)
	tickTTK := float64(fx.Player.Aura.TickInterval) / TicksPerSecond
	tickTTD := float64(fx.Mob.Aura.TickInterval) / TicksPerSecond
	for _, pt := range points {
		require.Equal(t, 2, pt.TTK.Outcomes[OutcomeMobDied], "level %d: every TTK run must end in a kill", pt.Level)
		require.Equal(t, 2, pt.TTD.Outcomes[OutcomePlayerDied], "level %d: every TTD run must end in the player's death", pt.Level)
		assert.InDelta(t, points[0].TTK.P50, pt.TTK.P50, tickTTK+1e-9, "TTK drifts at level %d", pt.Level)
		assert.InDelta(t, points[0].TTD.P50, pt.TTD.P50, tickTTD+1e-9, "TTD drifts at level %d", pt.Level)
		assert.InDelta(t, fx.Curve.F(pt.Level), pt.F, 1e-12)
		assert.Greater(t, pt.KillsPerLevel, 0.0)
	}
}

// The cross-tier picture: as the mob tier climbs over the player level, TTK
// grows and the win-rate falls off a cliff — the wall. Below the player's
// level the fight only gets safer.
func TestRunGapSweep_WallAndMonotonicity(t *testing.T) {
	fx := exactFixture(1.3, 10)

	points := RunGapSweep(fx, 5, 3, 0.35, 1, 2)

	require.Len(t, points, 7, "deltas -3..+3")
	assert.Equal(t, -3, points[0].Delta)
	assert.Equal(t, 3, points[len(points)-1].Delta)
	for i, pt := range points {
		assert.Equal(t, 5+pt.Delta, pt.MobTier)
		if i > 0 {
			assert.LessOrEqual(t, pt.WinRate, points[i-1].WinRate, "win-rate must not recover as the gap widens (Δ=%d)", pt.Delta)
			if pt.TTK.Samples > 0 && points[i-1].TTK.Samples > 0 {
				assert.GreaterOrEqual(t, pt.TTK.P50, points[i-1].TTK.P50, "TTK must not shrink as the mob outgrows the player (Δ=%d)", pt.Delta)
			}
		}
	}
	assert.Equal(t, 1.0, points[0].WinRate, "3 tiers under the player is a guaranteed win")
	assert.Equal(t, 0.0, points[len(points)-1].WinRate, "3 tiers over the player at growth 1.3 is a wall")
}

// The linked triple: steeper growth → narrower doable band (smaller wall Δ);
// total inflation is the analytic growth^(maxLevel-1) per max-level candidate.
func TestRunTripleTable_SteeperGrowthNarrowsTheBand(t *testing.T) {
	fx := exactFixture(1.12, 10)

	rows := RunTripleTable(fx, []float64{1.1, 1.3}, []int{10, 20}, 5, 4, 0.35, 1, 2)

	require.Len(t, rows, 2)
	shallow, steep := rows[0], rows[1]
	assert.Equal(t, 1.1, shallow.Growth)
	assert.Equal(t, 1.3, steep.Growth)

	require.NotEqual(t, -1, shallow.WallDelta, "growth 1.1 must hit a wall within Δ≤4")
	require.NotEqual(t, -1, steep.WallDelta, "growth 1.3 must hit a wall within Δ≤4")
	assert.Less(t, steep.WallDelta, shallow.WallDelta, "steeper growth must wall earlier")

	for _, row := range rows {
		require.Len(t, row.Inflation, 2)
		for _, inf := range row.Inflation {
			assert.InDelta(t, Curve{Growth: row.Growth}.F(inf.MaxLevel), inf.TotalInflation, 1e-9)
		}
	}
}

// The chunk-1 reproducibility contract extends to the whole curve report:
// same config in, identical measurements out — with every RNG source on.
func TestRunCurve_ReproducibleUnderFixedSeed(t *testing.T) {
	fx := exactFixture(1.12, 4)
	fx.Player.Aura.Variance = 0.2
	fx.Mob.Aura.Variance = 0.2
	fx.Mob.MaxHealthVariance = 0.1
	cfg := CurveConfig{
		Fixture:            fx,
		BaseSeed:           42,
		Runs:               5,
		Distance:           0.35,
		RefLevel:           2,
		MaxDelta:           2,
		GrowthCandidates:   []float64{1.12},
		MaxLevelCandidates: []int{4},
	}

	first := RunCurve(cfg)
	second := RunCurve(cfg)

	require.Equal(t, first.Levels, second.Levels)
	require.Equal(t, first.Gaps, second.Gaps)
	require.Equal(t, first.Triple, second.Triple)
}

// RefLevel 0 self-selects the middle of the span — the one convenience
// default the sim layer owns (candidate lists stay a caller concern).
func TestRunCurve_DefaultRefLevel(t *testing.T) {
	cfg := CurveConfig{
		Fixture:  exactFixture(1.12, 8),
		BaseSeed: 1,
		Runs:     1,
		Distance: 0.35,
		MaxDelta: 1,
	}

	report := RunCurve(cfg)

	assert.Equal(t, 4, report.RefLevel)
	assert.Empty(t, report.Triple, "no growth candidates → no triple table")
}
