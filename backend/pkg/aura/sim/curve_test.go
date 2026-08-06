package sim

// Chunk-2 sanity tests, part 1 (plan-sim-harness §8 chunk 2): the f(character
// level) curve math and the fixture generator — f(L) = growth^(L-1) scales
// HP values ONLY (§5: damage / max HP; never radius, tick, variance, crit,
// geometry), and the kills-per-level analytics mirror the game's XP rule.

import (
	"encoding/json"
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

// defaultXPModel is the harness's shipped economy: the level-up requirement
// from conf plus the LIVE curve.DefaultKillXP, which is what the -levels flag
// defaults read (main.go). Written out field by field rather than assembled
// from the type, so a field appearing on curve.KillXP without a home here
// fails to compile instead of silently defaulting.
func defaultXPModel() XPModel {
	d := curve.DefaultKillXP()
	return XPModel{
		LevelUpBase: 300, LevelUpGrowth: 1.2,
		KillBase: d.Base, KillGrowth: d.Growth,
		KillUpBonus: d.UpBonus, KillUpCap: d.UpCap,
		KillGrayBase: d.GrayBase, KillGrayStep: d.GrayStep,
		KillTierElite: d.TierElite, KillTierBoss: d.TierBoss,
	}
}

// Curve math tests live with the shared formula in pkg/aura/curve
// (moved there in C0 — sim.Curve is an alias).

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

// ---------------------------------------------------------------------------
// C1.5 (plan-xp-formula.md §13): the harness pays what the game pays
// ---------------------------------------------------------------------------
//
// Until C1.5 XPModel reached curve.KillXP.BaseAt ALONE (§13.1): no taper, no
// gray boundary, no up-bonus, no tier multipliers, no xpFactor. These are the
// legs that would have caught that.

// The oracle is written out by hand from §3's formula rather than by calling
// curve.KillXP — a restatement of the implementation would agree with a wrong
// implementation (C0's vitest-oracle discipline).
func expectedAward(base, growth float64, upBonus float64, upCap int,
	grayBase, grayStep int, playerLevel, mobLevel int, tier, xpFactor float64) uint64 {
	if tier <= 0 || xpFactor <= 0 {
		return 0
	}
	delta := mobLevel - playerLevel
	var mod float64
	if delta >= 0 {
		counted := delta
		if counted > upCap {
			counted = upCap
		}
		mod = 1 + upBonus*float64(counted)
	} else {
		zd := grayBase + playerLevel/grayStep
		mod = 1 + float64(delta)/float64(zd)
	}
	if mod <= 0 {
		return 0
	}
	award := math.Round(base * math.Pow(growth, float64(playerLevel-1)) * mod * tier * xpFactor)
	if award < 1 {
		return 1
	}
	return uint64(award)
}

// The whole economy, seen from the harness: a Δ sweep across the gray zero,
// both tier multipliers and a fractional xpFactor, against an independent
// mirror of §3's formula.
func TestXPModel_AwardIsTheWholeLiveEconomy(t *testing.T) {
	x := defaultXPModel()
	d := curve.DefaultKillXP()

	for _, playerLevel := range []int{1, 6, 12, 20, 30} {
		zd := d.GrayBase + playerLevel/d.GrayStep
		for delta := -zd - 2; delta <= 8; delta++ {
			mobLevel := playerLevel + delta
			if mobLevel < 1 {
				continue
			}
			for _, tc := range []struct {
				name     string
				tier     float64
				xpFactor float64
			}{
				{"normal", 1, 1},
				{"elite", d.TierElite, 1},
				{"boss", d.TierBoss, 1},
				{"kite", 1, 0.5},
				{"turnip", 1, 0.05},
				{"free", 1, 0},
			} {
				want := expectedAward(d.Base, d.Growth, d.UpBonus, d.UpCap,
					d.GrayBase, d.GrayStep, playerLevel, mobLevel, tc.tier, tc.xpFactor)
				got := x.Award(playerLevel, mobLevel, tc.tier, tc.xpFactor)
				assert.Equal(t, want, got, "P%d vs mob L%d (Δ%+d) %s", playerLevel, mobLevel, delta, tc.name)
			}
		}
	}
}

// The no-drift pin: whatever the tool pays, the game pays. This is the claim
// curve/killxp.go's doc comment already makes — true of BaseAt alone before
// C1.5, true of the whole award after it.
func TestXPModel_AwardMatchesTheLiveType(t *testing.T) {
	x := defaultXPModel()
	live := curve.DefaultKillXP()

	for playerLevel := 1; playerLevel <= 30; playerLevel++ {
		for mobLevel := 1; mobLevel <= 30; mobLevel++ {
			for _, tier := range []float64{1, live.TierElite, live.TierBoss} {
				assert.Equal(t,
					live.Award(playerLevel, mobLevel, tier, 0.5),
					x.Award(playerLevel, mobLevel, tier, 0.5),
					"P%d vs L%d tier %.0f", playerLevel, mobLevel, tier)
			}
		}
	}
}

// The taper reaches exactly zero at the boundary and the last green rung pays
// a real amount — §12.1's measurement, now visible from inside the harness.
func TestXPModel_TaperReachesZeroAtTheGrayBoundary(t *testing.T) {
	x := defaultXPModel()
	const playerLevel = 30
	zd := curve.DefaultKillXP().GrayDistance(playerLevel) // 10

	atLevel := x.Award(playerLevel, playerLevel, 1, 1)
	lastGreen := x.Award(playerLevel, playerLevel-zd+1, 1, 1)
	gray := x.Award(playerLevel, playerLevel-zd, 1, 1)

	assert.EqualValues(t, 0, gray, "Δ = −ZD pays exactly nothing (D2)")
	assert.Greater(t, lastGreen, uint64(0))
	assert.InDelta(t, 0.10, float64(lastGreen)/float64(atLevel), 0.005,
		"§12.1: the deepest green rung pays ~1/ZD of an at-level kill")
}

// KillsPerLevelAt is the Δ-aware sibling. On the diagonal it must agree with
// the at-level KillsPerLevel the -levels sweep column has meant since chunk 2
// (§13.3 — that column's meaning must not move).
//
// ⚑ They agree only UP TO WHOLE-XP ROUNDING, and the gap has a direction:
// KillsPerLevel divides by the unrounded base(P) while KillsPerLevelAt divides
// by the rounded award the server actually hands out, so the sweep column has
// always been very slightly optimistic (7.5005 vs 7.47 at L6, worst case
// ~1.25% = half an XP over the smallest base). Recorded rather than
// "corrected": the column's meaning is what must not move.
func TestXPModel_KillsPerLevelAtAgreesWithTheAtLevelColumn(t *testing.T) {
	x := defaultXPModel()

	for level := 1; level <= 30; level++ {
		assert.InEpsilon(t, x.KillsPerLevel(level), x.KillsPerLevelAt(level, level, 1, 1), 0.02,
			"the diagonal is the at-level reading, L%d", level)
	}

	// Below you: more kills. Above you: fewer, up to the bounded bonus.
	assert.Greater(t, x.KillsPerLevelAt(20, 17, 1, 1), x.KillsPerLevel(20))
	assert.Less(t, x.KillsPerLevelAt(20, 24, 1, 1), x.KillsPerLevel(20))
	// Gray never gets you there.
	assert.True(t, math.IsInf(x.KillsPerLevelAt(20, 12, 1, 1), 1), "gray is infinitely many kills")
	assert.True(t, math.IsInf(x.KillsPerLevelAt(20, 20, 1, 0), 1), "xpFactor 0 pays nothing, forever")
}

// L6 — the compat surface. XPModel's four long-standing JSON names are posted
// by cmd/simharness/index.html; a poster that predates C1.5 must keep working,
// and the six new fields must resolve to the LIVE economy rather than to Go
// zero values (a zeroed GrayStep means every mob below you pays nothing).
func TestXPModel_LegacyFourKeyPostResolvesToTheLiveEconomy(t *testing.T) {
	// Copied verbatim from the explorer's posted object (index.html) and the
	// serve_test.go request pin.
	const legacy = `{"levelUpBase": 300, "levelUpGrowth": 1.2, "killBase": 40, "killGrowth": 1.2}`

	var x XPModel
	require.NoError(t, json.Unmarshal([]byte(legacy), &x))

	assert.Equal(t, curve.DefaultKillXP(), x.KillEconomy(),
		"the six unposted fields fall back to the live defaults, not to zero")
	assert.Equal(t, 300.0, x.XPToNext(1))
	assert.InDelta(t, 7.5, x.KillsPerLevel(1), 1e-9)
}

// ... and the six ARE knobs when they are posted.
func TestXPModel_NewKnobsAreHonoured(t *testing.T) {
	x := defaultXPModel()
	x.KillGrayBase, x.KillGrayStep = 10, 6 // §11's `10 + P/6` candidate

	assert.Equal(t, 13, x.KillEconomy().GrayDistance(20))
	assert.Greater(t, x.Award(20, 10, 1, 1), uint64(0), "Δ=−10 progresses under the wider band")
	assert.EqualValues(t, 0, defaultXPModel().Award(20, 10, 1, 1), "...and pays nothing under the shipped one")
}
