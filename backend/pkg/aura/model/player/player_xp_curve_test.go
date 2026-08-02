package player

import (
	"fmt"
	"math"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// The XP curve is evaluated once per player PER TICK — LevelProgressXP feeds
// Character.xp_in_level / xp_for_next_level for the HUD's XP bar — and it used
// to recompute base × growth^(L-1) from scratch every time, through a summation
// loop, i.e. O(level) math.Pow calls per lookup and O(level²) to resolve a level
// from an XP total. A 2026-08-02 CPU profile put that at 23 % of all server CPU
// under load, the single largest game-code cost, ahead of the whole physics
// broadphase.
//
// These tests pin the curve's VALUES against the original formula so the
// table can only ever be a faster way to compute the same numbers.

// liveCurveConfig mirrors the shipped conf (growth 1.12 × maxLevel 30,
// xpBase 300 × xpGrowth 1.2).
func liveCurveConfig() *cfg.PlayerConfig {
	return &cfg.PlayerConfig{
		LevelUpXPBase:         300,
		LevelUpXPGrowthFactor: 1.2,
		LevelCurve:            curve.Curve{Growth: 1.12, MaxLevel: 30},
		BaseHealth:            100,
	}
}

func curvePlayer(c *cfg.PlayerConfig) *player {
	return &player{config: c, progression: model.PlayerProgression{Level: 1}}
}

// referenceRequired is the ORIGINAL per-level requirement, kept verbatim as the
// oracle: base × growth^(L-1), rounded.
func referenceRequired(c *cfg.PlayerConfig, level uint32) uint64 {
	if level < 1 {
		level = 1
	}
	growth := float64(c.LevelUpXPGrowthFactor)
	if growth <= 1.0 {
		growth = 1.2
	}
	return uint64(math.Round(float64(c.LevelUpXPBase) * math.Pow(growth, float64(level-1))))
}

// referenceTotal is the ORIGINAL cumulative sum.
func referenceTotal(c *cfg.PlayerConfig, level uint32) uint64 {
	if level <= 1 {
		return 0
	}
	var total uint64
	for l := uint32(1); l < level; l++ {
		total += referenceRequired(c, l)
	}
	return total
}

func TestXPCurve_TotalMatchesFormula(t *testing.T) {
	for _, c := range []*cfg.PlayerConfig{
		liveCurveConfig(),
		{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, LevelCurve: curve.Curve{Growth: 1.12, MaxLevel: 30}},
		// growth <= 1 exercises the 1.2 fallback inside the formula
		{LevelUpXPBase: 250, LevelUpXPGrowthFactor: 0.5, LevelCurve: curve.Curve{Growth: 1.12, MaxLevel: 10}},
		// uncapped: MaxLevel 0 must still resolve, past the table's end
		{LevelUpXPBase: 300, LevelUpXPGrowthFactor: 1.2},
	} {
		p := curvePlayer(c)
		for level := uint32(0); level <= 64; level++ {
			if got, want := p.totalXPForLevel(level), referenceTotal(c, level); got != want {
				t.Fatalf("base=%d growth=%v maxLevel=%d totalXPForLevel(%d) = %d, formula says %d",
					c.LevelUpXPBase, c.LevelUpXPGrowthFactor, c.LevelCurve.MaxLevel, level, got, want)
			}
		}
	}
}

func TestXPCurve_ExperienceForNextLevelMatchesFormula(t *testing.T) {
	c := liveCurveConfig()
	p := curvePlayer(c)
	for level := uint32(0); level <= 40; level++ {
		if got, want := p.experienceForNextLevel(level), referenceRequired(c, level); got != want {
			t.Fatalf("experienceForNextLevel(%d) = %d, formula says %d", level, got, want)
		}
	}
}

// referenceLevelFor is the ORIGINAL resolution loop, the oracle for the
// binary search that replaces it — including the maxLevel clamp, which fires
// before the XP comparison and so caps a level even for absurd XP.
func referenceLevelFor(c *cfg.PlayerConfig, xp uint64) uint32 {
	maxLevel := uint32(c.LevelCurve.MaxLevel)
	level := uint32(1)
	for {
		if maxLevel > 0 && level >= maxLevel {
			return maxLevel
		}
		if xp < referenceTotal(c, level+1) {
			return level
		}
		level++
		if level >= 65535 {
			return level
		}
	}
}

func TestXPCurve_LevelForExperienceMatchesLoop(t *testing.T) {
	for _, c := range []*cfg.PlayerConfig{
		liveCurveConfig(),
		{LevelUpXPBase: 100, LevelUpXPGrowthFactor: 2.0, LevelCurve: curve.Curve{Growth: 1.12, MaxLevel: 30}},
		{LevelUpXPBase: 300, LevelUpXPGrowthFactor: 1.2}, // uncapped
	} {
		p := curvePlayer(c)
		// every exact level boundary, ±1 around it, plus a coarse sweep
		var xps []uint64
		for level := uint32(1); level <= 34; level++ {
			b := referenceTotal(c, level)
			xps = append(xps, b)
			if b > 0 {
				xps = append(xps, b-1)
			}
			xps = append(xps, b+1)
		}
		xps = append(xps, 0, 1, 12345, 1<<40)
		for _, xp := range xps {
			if got, want := p.levelForExperience(xp), referenceLevelFor(c, xp); got != want {
				t.Fatalf("base=%d maxLevel=%d levelForExperience(%d) = %d, loop says %d",
					c.LevelUpXPBase, c.LevelCurve.MaxLevel, xp, got, want)
			}
		}
	}
}

// BenchmarkXPCurve* measure the per-tick cost. LevelProgressXP is the one that
// actually runs 30×/s per player; the others are its parts.
func BenchmarkXPCurveLevelProgressXP(b *testing.B) {
	for _, level := range []uint32{1, 15, 30} {
		b.Run(fmt.Sprintf("level=%d", level), func(b *testing.B) {
			c := liveCurveConfig()
			p := curvePlayer(c)
			p.progression.Level = level
			p.progression.Experience = referenceTotal(c, level) + 5
			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				g, r := p.LevelProgressXP()
				_, _ = g, r
			}
		})
	}
}

func BenchmarkXPCurveLevelForExperience(b *testing.B) {
	c := liveCurveConfig()
	p := curvePlayer(c)
	xp := referenceTotal(c, 28)
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = p.levelForExperience(xp)
	}
}
