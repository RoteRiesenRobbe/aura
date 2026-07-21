package sim

// Chunk-1 sanity tests (plan-sim-harness §9): the world builds, fights
// terminate, exact outcomes are pinned where the RNG is off, and
// distributions reproduce exactly under a fixed base seed.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// exactPlayer deals exactly 10 HP every 3rd tick, no rolls.
func exactPlayer() PlayerSpec {
	return PlayerSpec{
		MaxHealth: 100,
		Aura:      AuraSpec{DamageHP: 10, TickInterval: 3, Radius: 1.0, MaxTargets: 1},
	}
}

// stationaryMob is a 40-HP turret: speed 0 keeps its aura always on and its
// position fixed, so hit cadences are exactly the tick math.
func stationaryMob(damage float32, interval int) MobSpec {
	return MobSpec{
		MaxHealth:   40,
		Speed:       0,
		BodyRadius:  0.2,
		AggroRadius: 2.4,
		Aura:        AuraSpec{DamageHP: damage, TickInterval: interval, Radius: 1.0, MaxTargets: 1},
	}
}

func TestNewWorld_Builds(t *testing.T) {
	w := NewWorld(TTK(exactPlayer(), stationaryMob(0, 1), 0.5), 1)

	assert.EqualValues(t, 100, w.Player.VitalSigns().Health)
	assert.EqualValues(t, 40, w.Mob.Health())
	assert.InDelta(t, 0.5, w.Mob.Position().X, 1e-6)
}

// TTK with all RNG off is exact tick math: interval-3 hits land on ticks
// 3, 6, 9, 12 (skills_behavior_test.go cadence pin); 40 HP / 10 per hit =
// 4 hits → death on tick 12. Pinning this proves the harness drives the
// real accumulator, not a re-modeled cadence.
func TestRunFight_TTK_ExactWithZeroVariance(t *testing.T) {
	r := RunFight(TTK(exactPlayer(), stationaryMob(0, 1), 0.5), 1)

	assert.Equal(t, OutcomeMobDied, r.Outcome)
	assert.Equal(t, 12, r.Ticks)
	assert.InDelta(t, 12.0/TicksPerSecond, r.Seconds, 1e-9)
}

// TTD against a stationary mob: 10 HP every 2nd tick into a 100-HP idle
// player → 10 hits → death on tick 20. The player's aura is off, so the mob
// is never harmed.
func TestRunFight_TTD_ExactWithZeroVariance(t *testing.T) {
	r := RunFight(TTD(exactPlayer(), stationaryMob(10, 2), 0.3), 1)

	assert.Equal(t, OutcomePlayerDied, r.Outcome)
	assert.Equal(t, 20, r.Ticks)
}

// A moving mob exercises the real acquisition + chase path: it must aggro
// the idle player, walk into aura reach and kill — later than the
// stationary-mob cadence floor, still well before the timeout.
func TestRunFight_TTD_ChasingMobTerminates(t *testing.T) {
	m := stationaryMob(10, 2)
	m.Speed = 0.5
	r := RunFight(TTD(exactPlayer(), m, 2.0), 1)

	assert.Equal(t, OutcomePlayerDied, r.Outcome)
	assert.Greater(t, r.Ticks, 20, "chase + acquisition must cost ticks over the in-reach cadence floor")
	assert.Less(t, r.Ticks, DefaultMaxTicks, "the fight must resolve, not time out")
}

// An idle player with a harmless mob never resolves — the timeout guard
// reports it instead of hanging.
func TestRunFight_Timeout(t *testing.T) {
	sc := TTD(exactPlayer(), stationaryMob(0, 1), 0.3)
	sc.MaxTicks = 50
	r := RunFight(sc, 1)

	assert.Equal(t, OutcomeTimeout, r.Outcome)
	assert.Equal(t, 50, r.Ticks)
}

// A dot-armed mob (DotTicks > 0 = the spec builds a real dot_aura, C8
// full-roster presets) kills an idle player through the real buff pipeline:
// 10 HP dot events every 2nd tick into a 100-HP pool → 10 events. The aura
// (tick 2) applies on tick 2, the acting accumulator then fires every 2nd
// tick — exact tick math with all RNG off, proving the harness runs the
// real StatusEffects/Buffs path, not a re-modeled cadence.
func TestRunFight_TTD_DotAuraExactWithZeroVariance(t *testing.T) {
	m := stationaryMob(10, 2)
	m.Aura.DotTicks = 3
	m.Aura.DotTickInterval = 2
	r := RunFight(TTD(exactPlayer(), m, 0.3), 1)

	assert.Equal(t, OutcomePlayerDied, r.Outcome)
	assert.Equal(t, 22, r.Ticks)
}

// A dot-armed player kills a mob, including the dot's defining upgrade: the
// buff keeps ticking on its own cadence independent of the aura's. 40-HP mob,
// 10 HP per event → 4 events; the fight must resolve well before timeout.
func TestRunFight_TTK_DotAuraKills(t *testing.T) {
	p := exactPlayer()
	p.Aura = AuraSpec{DamageHP: 10, TickInterval: 3, Radius: 1.0, MaxTargets: 1,
		DotTicks: 3, DotTickInterval: 2}
	r := RunFight(TTK(p, stationaryMob(0, 1), 0.5), 1)

	assert.Equal(t, OutcomeMobDied, r.Outcome)
	assert.Less(t, r.Ticks, DefaultMaxTicks, "the dot fight must resolve, not time out")
}

// fullRNG turns every chunk-1 randomness source on: hit variance and crit on
// both sides plus the mob spawn-HP roll.
func fullRNGScenario() Scenario {
	p := PlayerSpec{
		MaxHealth: 100,
		Aura:      AuraSpec{DamageHP: 10, TickInterval: 3, Radius: 1.0, Variance: 0.2, CritChance: 0.25, CritFactor: 1.5, MaxTargets: 1},
	}
	m := MobSpec{
		MaxHealth:         40,
		MaxHealthVariance: 0.1,
		Speed:             0,
		BodyRadius:        0.2,
		AggroRadius:       2.4,
		Aura:              AuraSpec{DamageHP: 4, TickInterval: 2, Radius: 1.0, Variance: 0.2, MaxTargets: 1},
	}
	return TTK(p, m, 0.5)
}

// The reproducibility contract (plan §3): the same (scenario, baseSeed, n)
// yields the exact same distribution, even with every RNG source on and
// regardless of how many worlds were built before (entity-ID counter state).
func TestRunDistribution_ReproducibleUnderFixedSeed(t *testing.T) {
	sc := fullRNGScenario()

	first := RunDistribution(sc, 42, 15)
	second := RunDistribution(sc, 42, 15)

	require.Equal(t, first, second)
}

// With variance on, N runs must actually spread — a degenerate all-identical
// distribution would mean the rolls are not reaching the fight.
func TestRunDistribution_VarianceSpreads(t *testing.T) {
	d := RunDistribution(fullRNGScenario(), 7, 30)

	require.NotZero(t, d.Samples, "the player build must win at least sometimes")
	assert.Less(t, d.Min, d.Max, "seeded runs must sample the variance band, not collapse to one value")
}
