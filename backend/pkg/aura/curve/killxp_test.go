package curve

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The three worked examples from plan-xp-formula.md §3.2, transcribed. They pin
// the constants AND the plan text together: if a default moves, the plan's
// feel description is stale and this says so.
func TestKillXP_PlanWorkedExamples(t *testing.T) {
	k := DefaultKillXP()

	// "Carried level-3 at a level-23 boss kill: base(3) × 1.20 × 5 ≈ 346."
	assert.EqualValues(t, 346, k.Award(3, 23, k.TierBoss, 1),
		"§3.2: a carried level-3 gets ~0.8 of a level from an endgame boss, once")

	// "Level-30 farming rabbits (Δ = −29, ZD = 10): mod = 0. Nothing, forever."
	assert.Equal(t, 10, k.GrayDistance(30))
	assert.EqualValues(t, 0, k.Award(30, 1, 1, 1), "§3.2: gray farming pays nothing")

	// "A level-12 clearing the level-6 forest (Δ = −6, ZD = 7): mod = 0.14."
	assert.Equal(t, 7, k.GrayDistance(12))
	assert.InDelta(t, 0.143, k.Modifier(12, 6), 0.001, "§3.2: fading, not yet gray")
}

// At level, at any level, one normal kill is worth base(P) — which is what
// makes kills-per-level flat across the span when killXPGrowth equals the
// level-up growth (§3.1).
func TestKillXP_AtLevelIsBaseAtEveryLevel(t *testing.T) {
	k := DefaultKillXP()
	for level := 1; level <= 30; level++ {
		want := uint64(math.Round(k.BaseAt(level)))
		assert.Equal(t, want, k.Award(level, level, 1, 1), "at-level normal kill at L%d", level)
	}
}

// killXPGrowth == levelUpXPGrowthFactor ⇒ flat kills-per-level. The governing
// property §3.1 promotes from the sim harness into the game.
func TestKillXP_FlatKillsPerLevelWhenGrowthMatchesTheRequirement(t *testing.T) {
	const levelUpBase, levelUpGrowth = 300.0, 1.2
	k := DefaultKillXP()
	require.Equal(t, levelUpGrowth, k.Growth, "the default mirrors levelUpXPGrowthFactor")

	first := levelUpBase / k.BaseAt(1)
	for level := 1; level <= 30; level++ {
		required := levelUpBase * math.Pow(levelUpGrowth, float64(level-1))
		assert.InDelta(t, first, required/k.BaseAt(level), 0.0001, "kills per level at L%d", level)
	}
	assert.InDelta(t, 7.5, first, 0.01, "§3.1: ~7.5 normal kills per level at the defaults")
}

func TestKillXP_UpwardBonusAndItsCap(t *testing.T) {
	k := DefaultKillXP()

	assert.InDelta(t, 1.00, k.Modifier(10, 10), 1e-9, "Δ=0")
	assert.InDelta(t, 1.05, k.Modifier(10, 11), 1e-9, "Δ=+1")
	assert.InDelta(t, 1.20, k.Modifier(10, 14), 1e-9, "Δ=+4, the cap")
	assert.InDelta(t, 1.20, k.Modifier(10, 15), 1e-9, "Δ=+5 stays at the cap")
	assert.InDelta(t, 1.20, k.Modifier(1, 30), 1e-9,
		"the bound is what closes pull-through: no kill is worth more than +20%")
}

func TestKillXP_TaperReachesExactlyZeroAtGray(t *testing.T) {
	k := DefaultKillXP()

	// ZD(6) = 5 + 1 = 6, so Δ = −6 is the gray line.
	require.Equal(t, 6, k.GrayDistance(6))
	assert.InDelta(t, 5.0/6.0, k.Modifier(6, 5), 1e-9, "Δ=−1")
	assert.InDelta(t, 1.0/6.0, k.Modifier(6, 1), 1e-9, "Δ=−5, one short of gray")
	assert.InDelta(t, 0, k.Modifier(12, 6), 0.15, "Δ=−6 at L12 is not gray (ZD widened)")

	// D2: a linear taper to exactly zero — not a token floor, not a cliff.
	// ZD(7) is also 6, and a level-1 mob is Δ=−6 from a level-7 player: the
	// shallowest gray kill in the game, since mob levels clamp at 1.
	require.Equal(t, 6, k.GrayDistance(7))
	assert.Zero(t, k.Modifier(7, 1), "Δ=−6 at L7 is exactly gray")
	assert.Zero(t, k.Modifier(20, 1), "far below gray stays zero, never negative")

	// Below L7 nothing in the world can be gray to you, because the taper
	// needs a mob further down than level 1 exists.
	for level := 1; level <= 6; level++ {
		assert.Greater(t, k.Modifier(level, 1), 0.0, "nothing is gray to a level-%d player", level)
	}
}

func TestKillXP_GrayDistanceWidensWithLevel(t *testing.T) {
	k := DefaultKillXP()
	for _, c := range []struct{ level, want int }{
		{1, 5}, {5, 5}, {6, 6}, {11, 6}, {12, 7}, {24, 9}, {30, 10},
	} {
		assert.Equal(t, c.want, k.GrayDistance(c.level), "ZD(%d)", c.level)
	}
}

func TestKillXP_TierMultipliesTheAward(t *testing.T) {
	k := DefaultKillXP()
	base := k.BaseAt(10)

	// Rounded from the product, not from the normal award — 2 × round(x) and
	// round(2x) differ by one XP and the formula is the authority.
	assert.EqualValues(t, math.Round(base), k.Award(10, 10, 1, 1))
	assert.EqualValues(t, math.Round(base*2), k.Award(10, 10, k.TierElite, 1))
	assert.EqualValues(t, math.Round(base*5), k.Award(10, 10, k.TierBoss, 1))
}

func TestKillXP_XPFactorScalesAndZeroPaysNothing(t *testing.T) {
	k := DefaultKillXP()
	full := k.Award(10, 10, 1, 1)

	assert.EqualValues(t, full/2, k.Award(10, 10, 1, 0.5), "the surviving kite rule (§3.4)")

	// ⚑ The min-1 floor is gated on xpFactor too, not only on mod: a structure
	// or NPC authoring xpFactor 0 must pay ZERO, not the floor. (Amendment to
	// §3's "min 1 while mod > 0" — see the ledger.)
	assert.Zero(t, k.Award(10, 10, 1, 0), "xpFactor 0 pays nothing at full mod")
	assert.Zero(t, k.Award(1, 1, k.TierBoss, 0), "not even a boss")
}

// L4: float mod × a small base rounds to 0 well before the gray line. The floor
// is load-bearing — without it "almost gray" reads as gray and the taper lies.
func TestKillXP_FloorKeepsTheTaperHonestAboveGray(t *testing.T) {
	k := DefaultKillXP()

	// A tiny xpFactor drives the product below 0.5 while the kill is nowhere
	// near gray — the harvest case (§3.4) at low level.
	assert.EqualValues(t, 1, k.Award(1, 1, 1, 0.001), "rounds to 0, floored to 1")

	// The same shape from the taper side: one level short of gray still pays.
	require.Equal(t, 6, k.GrayDistance(7))
	assert.EqualValues(t, 1, k.Award(7, 2, 1, 0.02), "Δ=−5 of 6 — faded, not gray")
	assert.Zero(t, k.Award(7, 1, 1, 1), "at gray the floor does not apply")
}

func TestKillXP_LevelsBelowOneClampToTheBaseline(t *testing.T) {
	k := DefaultKillXP()
	assert.Equal(t, k.BaseAt(1), k.BaseAt(0))
	assert.Equal(t, k.BaseAt(1), k.BaseAt(-3))
	assert.Equal(t, k.Award(1, 1, 1, 1), k.Award(0, 0, 1, 1))
}

// L2/L5 in one: an un-configured economy must be inert and LOUD, never a
// silently-floored 1 XP per kill. The live game never sees this — mob.SetKillXP
// normalizes a non-positive conf back to the default — but a hand-built
// KillXP{} in a test must fail immediately rather than pay pocket change.
func TestKillXP_ZeroValueConfigPaysNothing(t *testing.T) {
	assert.Zero(t, KillXP{}.Award(10, 10, 1, 1))
	assert.Zero(t, KillXP{Growth: 1.2}.Award(10, 10, 1, 1), "no base")
	assert.Zero(t, KillXP{Base: 40}.Award(10, 10, 1, 1), "no growth")
}

// A partial conf block is COMPLETED, not taken literally. Authoring only the
// two knobs a calibration pass moves must not zero the other six — the boot log
// prints base and growth, so the damage would be invisible.
func TestKillXP_NormalizedFillsEveryUnauthoredFieldIndividually(t *testing.T) {
	d := DefaultKillXP()

	got := KillXP{Base: 60, Growth: 1.15}.Normalized()
	assert.EqualValues(t, 60, got.Base, "authored wins")
	assert.EqualValues(t, 1.15, got.Growth)
	assert.Equal(t, d.UpBonus, got.UpBonus)
	assert.Equal(t, d.UpCap, got.UpCap)
	assert.Equal(t, d.GrayBase, got.GrayBase)
	assert.Equal(t, d.GrayStep, got.GrayStep)
	assert.Equal(t, d.TierElite, got.TierElite)
	assert.Equal(t, d.TierBoss, got.TierBoss)

	assert.Equal(t, d, KillXP{}.Normalized(), "an empty block resolves to the default outright")

	// The concrete consequences the whole-block guard would have shipped.
	assert.Greater(t, got.Modifier(8, 7), 0.0, "grayStep 0 would make everything below you gray")
	assert.Greater(t, got.Award(8, 8, got.TierElite, 1), uint64(0), "tierElite 0 would zero every elite")
}
