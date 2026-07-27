package sim

// Chunk-4 tests (plan-sim-harness §8/§9): kite geometry, the chain cycle
// (real recovery, exact where the RNG is off), self-heal, aggregation
// invariants, reproducibility.

import (
	"math/rand"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// chainPlayer deals exactly 10 HP every 3rd tick; 128 max HP so the regen
// arithmetic below is exact in float32 (128 × 2^-5 = 4.0).
func chainPlayer() PlayerSpec {
	return PlayerSpec{
		MaxHealth: 128,
		Aura:      AuraSpec{DamageHP: 10, TickInterval: 3, Radius: 2.0, MaxTargets: 1},
	}
}

// chainMob is a 40-HP turret hitting for exactly 16 every 5th tick: the
// player kills it on tick 12 (hits at 3, 6, 9, 12 — the chunk-1 cadence),
// taking two hits (ticks 5, 10) = 32 damage.
func chainMob() MobSpec {
	return MobSpec{
		MaxHealth:   40,
		Role:        string(mobs.RoleStructure),
		Speed:       0,
		BodyRadius:  0.2,
		AggroRadius: 2.4,
		Aura:        AuraSpec{DamageHP: 16, TickInterval: 5, Radius: 1.0, MaxTargets: 1},
	}
}

// exactChainConfig: zero variance everywhere, RegenTick 2^-5 (exact in
// binary) → 128 × 0.03125 = 4.0 HP per regen tick, no accumulator drift.
func exactChainConfig() ChainConfig {
	return ChainConfig{
		Player:          chainPlayer(),
		Mob:             chainMob(),
		ChainFights:     3,
		DowntimeSeconds: 10,
		RegenTick:       0.03125,
		BaseSeed:        1,
		Runs:            1,
	}
}

func TestKiteDistance_WindowAndInfeasible(t *testing.T) {
	// Ring [mobAura + 0.25, playerAura + mobBody) = [1.25, 2.2) → centre.
	d, ok := KiteDistance(chainPlayer(), chainMob())
	require.True(t, ok)
	assert.InDelta(t, (1.25+2.2)/2, d, 1e-6)

	// The mob outranges the player: no ring.
	m := chainMob()
	m.Aura.Radius = 3.0
	_, ok = KiteDistance(chainPlayer(), m)
	assert.False(t, ok)
}

func TestChainScenario_Stances(t *testing.T) {
	p, m := chainPlayer(), chainMob()
	m.Speed = 0.5

	ft, d, ok := chainScenario(p, m, StanceFacetank, 0, 0.01)
	require.True(t, ok)
	assert.Zero(t, ft.StartDistance, "facetank = player at the mob's centre")
	assert.Zero(t, d)
	assert.EqualValues(t, 0.5, ft.Mob.Speed, "facetank keeps the authored speed")
	assert.EqualValues(t, float32(0.01), ft.RegenTick)
	assert.Equal(t, OutcomeMobDied, ft.Primary)

	kite, d, ok := chainScenario(p, m, StanceKite, 0, 0.01)
	require.True(t, ok)
	want, _ := KiteDistance(p, m)
	assert.Equal(t, want, kite.StartDistance)
	assert.Equal(t, want, d)
	assert.Zero(t, kite.Mob.Speed, "kite pins the mob — the ideal-mover geometry")

	m.Aura.Radius = 3.0
	_, _, ok = chainScenario(p, m, StanceKite, 0, 0)
	assert.False(t, ok)
}

// RegenTick 0 must mean exactly the game default — the chunks-1-3 contract
// (their scenarios leave the field zero) and the knob's zero value coincide.
func TestScenario_RegenTickDefault(t *testing.T) {
	cfg := exactChainConfig()
	sc, _, _ := chainScenario(cfg.Player, cfg.Mob, StanceFacetank, 0, DefaultRegenTick)
	scZero := sc
	scZero.RegenTick = 0

	explicit := runChain(sc, cfg, 1)
	zero := runChain(scZero, cfg, 1)

	require.Equal(t, explicit, zero)
}

// The exact chain pin, all RNG off. Fight: mob dead on tick 12, player at
// 128−32 = 96 HP. Recovery on the same world: the last combat stamp is the
// player's killing hit on tick 12 (inCombatTicks = 100, aged at the start
// of each following tick), so ticks 13..111 are graced (99 recovery steps)
// and regen starts on tick 112 = recovery step 100, at exactly 4 HP per
// tick → 32 missing HP land on step 107. Chain clock per cycle:
// 12 + 107 ticks + 10 s downtime.
func TestRunChain_ExactPinZeroVariance(t *testing.T) {
	cfg := exactChainConfig()
	sc, _, ok := chainScenario(cfg.Player, cfg.Mob, StanceFacetank, 0, cfg.RegenTick)
	require.True(t, ok)

	r := runChain(sc, cfg, 1)

	require.Equal(t, OutcomeChainDone, r.Outcome)
	require.Equal(t, 3, r.Fights)
	require.Len(t, r.Cycles, 3)
	for _, cyc := range r.Cycles {
		assert.Equal(t, 12, cyc.Fight.Ticks)
		assert.Equal(t, 99+8, cyc.RecoveryTicks)
	}
	wantSeconds := 3 * (seconds(12) + seconds(107) + 10)
	assert.InDelta(t, wantSeconds, r.Seconds, 1e-9)

	// Kills per simulated hour follows directly from the pinned clock.
	report := RunChain(cfg)
	cell := report.Rows[0].Facetank
	assert.InDelta(t, 3/(wantSeconds/3600), cell.KillsPerHour.P50, 1e-9)
	assert.EqualValues(t, 1, cell.SurviveRate)
}

// Every chain fight must be byte-identical to RunFight under its per-fight
// seed — the chain adds recovery around fights, it does not change them.
func TestRunChain_EveryFightMatchesRunFight(t *testing.T) {
	cfg := exactChainConfig()
	// Full RNG on: variance + crit + spawn-HP roll.
	cfg.Player.Aura.Variance, cfg.Player.Aura.CritChance, cfg.Player.Aura.CritFactor = 0.2, 0.25, 1.5
	cfg.Mob.MaxHealthVariance, cfg.Mob.Aura.Variance = 0.1, 0.2
	sc, _, _ := chainScenario(cfg.Player, cfg.Mob, StanceFacetank, 0, cfg.RegenTick)

	const chainSeed = 42
	r := runChain(sc, cfg, chainSeed)

	rng := rand.New(rand.NewSource(chainSeed))
	for i, cyc := range r.Cycles {
		want := RunFight(sc, rng.Int63())
		assert.Equal(t, want, cyc.Fight, "cycle %d", i)
	}
}

// A lost fight ends the chain: kills banked so far, clock stopped at death.
func TestRunChain_PlayerDeathEndsChain(t *testing.T) {
	cfg := exactChainConfig()
	cfg.Mob.MaxHealth = 10000 // unkillable: the player dies mid-fight 1
	sc, _, _ := chainScenario(cfg.Player, cfg.Mob, StanceFacetank, 0, cfg.RegenTick)

	r := runChain(sc, cfg, 1)

	require.Equal(t, OutcomePlayerDied, r.Outcome)
	assert.Zero(t, r.Fights)
	require.Len(t, r.Cycles, 1)
	assert.InDelta(t, r.Cycles[0].Fight.Seconds, r.Seconds, 1e-9, "the clock stops at death")
}

// The self-heal fires at the first recovery (within the grace window — it
// does not stamp combat) and shortens it by exactly heal ÷ regen-per-tick;
// the second cycle sits inside the 30 s cooldown on the chain clock and
// recovers unhealed.
func TestRunChain_SelfHealShortensRecoveryExactly(t *testing.T) {
	cfg := exactChainConfig()
	cfg.DowntimeSeconds = 0 // keep cycle 2 inside the 30 s cooldown
	sc, _, _ := chainScenario(cfg.Player, cfg.Mob, StanceFacetank, 0, cfg.RegenTick)
	base := runChain(sc, cfg, 1)

	cfg.SelfHealLevel = 1 // 20% of 128 = 25.6 HP
	healed := runChain(sc, cfg, 1)

	require.Equal(t, OutcomeChainDone, healed.Outcome)
	assert.True(t, healed.Cycles[0].SelfHealed)
	assert.False(t, healed.Cycles[1].SelfHealed, "cycle 2 is inside the cooldown")
	// 32 missing − 25.6 healed = 6.4 HP → 2 regen ticks instead of 8.
	assert.Equal(t, base.Cycles[0].RecoveryTicks-6, healed.Cycles[0].RecoveryTicks)
	assert.Equal(t, base.Cycles[1].RecoveryTicks, healed.Cycles[1].RecoveryTicks)
}

// The RegenTick knob: doubling the rate halves the regen phase exactly.
func TestRunChain_RegenTickKnob(t *testing.T) {
	cfg := exactChainConfig()
	cfg.RegenTick = 0.0625 // 8 HP per tick → 32 missing in 4 ticks
	sc, _, _ := chainScenario(cfg.Player, cfg.Mob, StanceFacetank, 0, cfg.RegenTick)

	r := runChain(sc, cfg, 1)

	require.Equal(t, OutcomeChainDone, r.Outcome)
	assert.Equal(t, 99+4, r.Cycles[0].RecoveryTicks)
}

// The kite bot never gets hit: zero recovery, full survival.
func TestRunChain_KiteTakesNoDamage(t *testing.T) {
	cfg := exactChainConfig()
	cfg.Runs = 3

	report := RunChain(cfg)

	kite := report.Rows[0].Kite
	require.True(t, kite.Feasible)
	assert.EqualValues(t, 1, kite.SurviveRate)
	assert.Zero(t, kite.MeanRecoverySeconds)
	ft := report.Rows[0].Facetank
	assert.Positive(t, ft.MeanRecoverySeconds, "the facetank bot pays recovery")
}

// Efficiency = facetank ÷ kite can never exceed 1: same fights, but only
// the facetank bot pays recovery.
func TestRunChain_EfficiencyAtMostOne(t *testing.T) {
	cfg := exactChainConfig()
	cfg.Runs = 3

	report := RunChain(cfg)

	eff := report.Rows[0].Efficiency
	assert.Positive(t, eff)
	assert.Less(t, eff, 1.0)
}

// The GDD boss case: a mob that simply kills the stand-still bot. Facetank
// dies → efficiency 0; the kite bot (out of reach) survives and banks kills.
func TestRunChain_FacetankDiesKiteSurvives(t *testing.T) {
	cfg := exactChainConfig()
	cfg.Mob.Aura = AuraSpec{DamageHP: 40, TickInterval: 1, Radius: 1.0, MaxTargets: 1}
	cfg.Runs = 2

	report := RunChain(cfg)

	row := report.Rows[0]
	assert.Zero(t, row.Facetank.SurviveRate)
	assert.Zero(t, row.Efficiency, `facetank "dies"`)
	assert.EqualValues(t, 1, row.Kite.SurviveRate)
	assert.NotZero(t, row.Kite.KillsPerHour.Samples)
}

// No kite ring (the mob outranges the player): the cell is marked, not run.
func TestRunChain_InfeasibleKiteMarked(t *testing.T) {
	cfg := exactChainConfig()
	cfg.Player.Aura.Radius = 0.5
	cfg.Mob.Aura.Radius = 3.0
	cfg.Mob.Aura.DamageHP = 0 // harmless — only the geometry is under test

	report := RunChain(cfg)

	row := report.Rows[0]
	assert.False(t, row.Kite.Feasible)
	assert.Zero(t, row.Kite.KillsPerHour.Runs, "an infeasible cell runs no chains")
	assert.Zero(t, row.Efficiency)
	assert.True(t, row.Facetank.Feasible, "facetank is always feasible")
}

// The reproducibility contract (plan §3) holds for the full grid with every
// RNG source on, level brackets included.
func TestRunChain_ReproducibleUnderFixedSeed(t *testing.T) {
	cfg := exactChainConfig()
	cfg.Player.Aura.Variance, cfg.Player.Aura.CritChance, cfg.Player.Aura.CritFactor = 0.2, 0.25, 1.5
	cfg.Mob.MaxHealthVariance, cfg.Mob.Aura.Variance = 0.1, 0.2
	cfg.Curve = Curve{Growth: 1.15, MaxLevel: 30}
	cfg.Levels = []int{1, 5}
	cfg.Runs = 4
	cfg.SelfHealLevel = 1

	first := RunChain(cfg)
	second := RunChain(cfg)

	require.Equal(t, first.Rows, second.Rows)
}
