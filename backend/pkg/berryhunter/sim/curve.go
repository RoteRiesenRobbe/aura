package sim

// Chunk 2 (docs/plan-sim-harness.md §5 + §8): the f(character level) curve
// and the fixture generator that turns "a level" into explicit combatant
// numbers. This models the decided curve inside the tool only — the live-game
// multiplier is a separate step-6 task (§5 Decision 5).

import (
	"math"

	"github.com/trichner/berryhunter/pkg/berryhunter/curve"
)

// Curve is f(character level) in its decided form: f(L) = growth^(L-1).
// Since C0 (live wiring, plan-content-zones12.md §13) the formula lives in
// pkg/berryhunter/curve, shared with the live game — this alias keeps the
// harness structurally incapable of drifting from what ships.
type Curve = curve.Curve

// XPModel carries the kills-per-level analytics. The level-up requirement
// mirrors player.experienceForNextLevel (base × growth^(L-1), rounded,
// min 1) — same rule, so the sim cannot drift from the game. Kill XP is the
// authored-content model: a same-tier kill at tier T yields
// killBase × killGrowth^(T-1); killGrowth = levelUpGrowth means flat
// kills-per-level across the span.
type XPModel struct {
	LevelUpBase   float64 `json:"levelUpBase"`
	LevelUpGrowth float64 `json:"levelUpGrowth"`
	KillBase      float64 `json:"killBase"`
	KillGrowth    float64 `json:"killGrowth"`
}

// XPToNext is the XP required to go from level to level+1, exactly as the
// game computes it.
func (x XPModel) XPToNext(level int) float64 {
	if level < 1 {
		level = 1
	}
	required := x.LevelUpBase * math.Pow(x.LevelUpGrowth, float64(level-1))
	if required < 1 {
		required = 1
	}
	return math.Round(required)
}

// KillXP is the modeled XP for killing one same-tier mob at a tier.
func (x XPModel) KillXP(tier int) float64 {
	if tier < 1 {
		tier = 1
	}
	return x.KillBase * math.Pow(x.KillGrowth, float64(tier-1))
}

// KillsPerLevel is how many same-tier kills advance one level.
func (x XPModel) KillsPerLevel(level int) float64 {
	return x.XPToNext(level) / x.KillXP(level)
}

// Fixture is the level-typical combatant generator: level-1 baselines plus
// the curve. PlayerAt/MobAt scale HP VALUES ONLY (damage and max HP) — never
// radius, tick cadence, variance/crit, geometry or ratios (§5: those stay
// specialization/content knobs, out of the inflation treadmill). Mobs carry
// no level in the game; MobAt models "hand-authored to sit on the curve at
// tier T" (gdd §5).
type Fixture struct {
	Curve  Curve      `json:"curve"`
	Player PlayerSpec `json:"player"` // level-1 baseline build
	Mob    MobSpec    `json:"mob"`    // tier-1 baseline mob
	XP     XPModel    `json:"xp"`
}

// PlayerAt is the level-typical player: the baseline with max HP and aura
// damage inflated by f(level).
func (fx Fixture) PlayerAt(level int) PlayerSpec {
	f := fx.Curve.F(level)
	p := fx.Player
	p.MaxHealth = int(math.Round(float64(p.MaxHealth) * f))
	p.Aura.DamageHP = float32(float64(p.Aura.DamageHP) * f)
	return p
}

// MobAt is the same-tier mob at a tier: the baseline with max HP and aura
// damage inflated by f(tier).
func (fx Fixture) MobAt(tier int) MobSpec {
	f := fx.Curve.F(tier)
	m := fx.Mob
	m.MaxHealth = float32(float64(m.MaxHealth) * f)
	m.Aura.DamageHP = float32(float64(m.Aura.DamageHP) * f)
	return m
}
