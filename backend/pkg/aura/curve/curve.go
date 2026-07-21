// Package curve holds f(character level) — the game's number-inflation axis
// (GDD §5 Power Source & Curve, tdd §4.1). One formula shared by the live game
// (player output/max-HP scaling, mob tier+baseline derivation) and the sim
// harness, so the tool can never drift from what ships.
package curve

import "math"

// Curve is f(character level) in its decided form: f(L) = growth^(L-1)
// (plan-sim-harness §5 Decision 3 — steep, cross-tier-defining). Growth and
// MaxLevel are conf-driven [WORKING LOCK 2026-07-16: 1.12 × 30].
type Curve struct {
	Growth   float64 `json:"growth"`
	MaxLevel int     `json:"maxLevel"`
}

// Default is the working-lock curve (PO 2026-07-16: growth 1.12 × max level
// 30 ≈ 27× total inflation, band ≈ +5; [PLACEHOLDER]-class until content
// proves it). The single source for every consumer that has no conf file:
// cfg.ReadConfig's missing-key default and the sim harness's preset loader.
func Default() Curve {
	return Curve{Growth: 1.12, MaxLevel: 30}
}

// F is the inflation multiplier at a character level; level 1 is the
// un-inflated baseline, anything below clamps to it. Growth <= 0 (an
// un-configured curve) is neutral 1 at every level.
func (c Curve) F(level int) float64 {
	if c.Growth <= 0 {
		return 1
	}
	if level < 1 {
		level = 1
	}
	return math.Pow(c.Growth, float64(level-1))
}

// TotalInflation is f at the level cap — one corner of the linked triple
// (band width ↔ max level ↔ total inflation, plan-sim-harness §5 Decision 4).
func (c Curve) TotalInflation() float64 {
	return c.F(c.MaxLevel)
}
