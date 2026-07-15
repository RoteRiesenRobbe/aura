package sim

// Chunk-2 sanity tests, part 1 (plan-sim-harness §8 chunk 2): the f(character
// level) curve math and the fixture generator — f(L) = growth^(L-1) scales
// HP values ONLY (§5: damage / max HP; never radius, tick, variance, crit,
// geometry), and the kills-per-level analytics mirror the game's XP rule.

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCurve_F(t *testing.T) {
	c := Curve{Growth: 1.12, MaxLevel: 30}

	assert.InDelta(t, 1.0, c.F(1), 1e-12, "f(1) is the un-inflated baseline")
	assert.InDelta(t, 1.12, c.F(2), 1e-12)
	assert.InDelta(t, 1.12*1.12, c.F(3), 1e-12)
	assert.InDelta(t, 1.0, c.F(0), 1e-12, "levels below 1 clamp to the baseline")
	assert.InDelta(t, c.F(30), c.TotalInflation(), 1e-12)
}

// baselineFixture has distinctive numbers on every field so an accidentally
// scaled non-HP knob shows up as a failure, not a coincidence.
func baselineFixture() Fixture {
	return Fixture{
		Curve: Curve{Growth: 1.12, MaxLevel: 30},
		Player: PlayerSpec{
			MaxHealth: 100,
			Aura:      AuraSpec{DamageHP: 14, TickInterval: 40, Radius: 1.1, Variance: 0.15, CritChance: 0.05, CritFactor: 1.5, MaxTargets: 1},
		},
		Mob: MobSpec{
			MaxHealth:            60,
			MaxHealthVariance:    0.1,
			Speed:                0.5,
			BodyRadius:           0.35,
			AggroRadius:          4.0,
			FleeBelowHealthRatio: 0.2,
			Aura:                 AuraSpec{DamageHP: 8, TickInterval: 20, Radius: 0.9, Variance: 0.1, MaxTargets: 1},
		},
		XP: XPModel{LevelUpBase: 300, LevelUpGrowth: 1.2, KillBase: 40, KillGrowth: 1.2},
	}
}

func TestFixture_Level1IsTheBaseline(t *testing.T) {
	fx := baselineFixture()

	assert.Equal(t, fx.Player, fx.PlayerAt(1))
	assert.Equal(t, fx.Mob, fx.MobAt(1))
}

func TestFixture_ScalesHPValuesOnly(t *testing.T) {
	fx := baselineFixture()
	f := fx.Curve.F(10)

	p := fx.PlayerAt(10)
	assert.Equal(t, int(f*100+0.5), p.MaxHealth, "player max HP scales by f (rounded)")
	assert.InDelta(t, 14*f, float64(p.Aura.DamageHP), 1e-4, "player aura damage scales by f")
	// Everything else is geometry / cadence / relative knobs — untouched (§5).
	assert.Equal(t, fx.Player.Aura.TickInterval, p.Aura.TickInterval)
	assert.Equal(t, fx.Player.Aura.Radius, p.Aura.Radius)
	assert.Equal(t, fx.Player.Aura.Variance, p.Aura.Variance)
	assert.Equal(t, fx.Player.Aura.CritChance, p.Aura.CritChance)
	assert.Equal(t, fx.Player.Aura.CritFactor, p.Aura.CritFactor)
	assert.Equal(t, fx.Player.Aura.MaxTargets, p.Aura.MaxTargets)

	m := fx.MobAt(10)
	assert.InDelta(t, 60*f, float64(m.MaxHealth), 1e-4, "mob max HP scales by f")
	assert.InDelta(t, 8*f, float64(m.Aura.DamageHP), 1e-4, "mob aura damage scales by f")
	assert.Equal(t, fx.Mob.MaxHealthVariance, m.MaxHealthVariance, "the spawn roll band is relative, not an HP value")
	assert.Equal(t, fx.Mob.Speed, m.Speed)
	assert.Equal(t, fx.Mob.BodyRadius, m.BodyRadius)
	assert.Equal(t, fx.Mob.AggroRadius, m.AggroRadius)
	assert.Equal(t, fx.Mob.FleeBelowHealthRatio, m.FleeBelowHealthRatio)
	assert.Equal(t, fx.Mob.Aura.TickInterval, m.Aura.TickInterval)
	assert.Equal(t, fx.Mob.Aura.Radius, m.Aura.Radius)
	assert.Equal(t, fx.Mob.Aura.Variance, m.Aura.Variance)
}

// The level-up requirement mirrors player.experienceForNextLevel exactly
// (base × growth^(L-1), rounded, min 1) — the sim must not drift from the
// game's XP rule.
func TestXPModel_MirrorsGameLevelUpRule(t *testing.T) {
	x := XPModel{LevelUpBase: 300, LevelUpGrowth: 1.2, KillBase: 40, KillGrowth: 1.2}

	assert.Equal(t, 300.0, x.XPToNext(1))
	assert.Equal(t, 360.0, x.XPToNext(2))
	assert.Equal(t, 622.0, x.XPToNext(5), "300 × 1.2^4 = 622.08 rounds like the game does")
}

// With kill XP growing at the same rate as the requirement, kills-per-level
// is flat across the span (up to the game's rounding).
func TestXPModel_KillsPerLevelFlatWhenGrowthsMatch(t *testing.T) {
	x := XPModel{LevelUpBase: 300, LevelUpGrowth: 1.2, KillBase: 40, KillGrowth: 1.2}

	assert.InDelta(t, 7.5, x.KillsPerLevel(1), 1e-9)
	assert.InDelta(t, 7.5, x.KillsPerLevel(10), 0.1, "flat up to XP rounding")
	assert.InDelta(t, 7.5, x.KillsPerLevel(25), 0.1, "flat up to XP rounding")
}
