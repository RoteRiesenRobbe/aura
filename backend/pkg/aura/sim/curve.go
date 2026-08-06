package sim

// Chunk 2 (docs/archive/plan-sim-harness.md §5 + §8): the f(character level) curve
// and the fixture generator that turns "a level" into explicit combatant
// numbers. This models the decided curve inside the tool only — the live-game
// multiplier is a separate step-6 task (§5 Decision 5).

import (
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
)

// Curve is f(character level) in its decided form: f(L) = growth^(L-1).
// Since C0 (live wiring, plan-content-zones12.md §13) the formula lives in
// pkg/aura/curve, shared with the live game — this alias keeps the
// harness structurally incapable of drifting from what ships.
type Curve = curve.Curve

// XPModel carries the kills-per-level analytics. The level-up requirement
// mirrors player.experienceForNextLevel (base × growth^(L-1), rounded,
// min 1) — same rule, so the sim cannot drift from the game.
//
// The kill side is the WHOLE live economy since C1.5 (plan-xp-formula.md §13):
// before it, this type carried four scalars and reached curve.KillXP.BaseAt
// alone, so the tool that calibrates the economy could see base(P) and nothing
// else — not the taper, not the gray boundary, not the up-bonus, not the tier
// multipliers, not xpFactor (§13.1). The taper's shape IS the open D8 question,
// so calibrating against that tool would have been choosing blind.
//
// ⚑ The FIELD LAYOUT is a compat surface, not a private detail (L6):
// cmd/simharness/index.html builds its XP inputs from a table keyed on the four
// literal names below and posts an object with exactly those keys. So the four
// stay, and the six new knobs are flat siblings that an older poster simply
// omits — see killXP for what an omission resolves to.
type XPModel struct {
	LevelUpBase   float64 `json:"levelUpBase"`
	LevelUpGrowth float64 `json:"levelUpGrowth"`
	KillBase      float64 `json:"killBase"`
	KillGrowth    float64 `json:"killGrowth"`

	// The rest of curve.KillXP, flattened. Absent (zero) means UNAUTHORED and
	// resolves to the live default for that field — none of the six has a
	// meaningful zero, and a zeroed GrayStep alone would mean every mob below
	// your level pays nothing (curve.KillXP.Normalized's own record of L2).
	KillUpBonus   float64 `json:"killUpBonusPerLevel,omitempty"`
	KillUpCap     int     `json:"killUpBonusCapLevels,omitempty"`
	KillGrayBase  int     `json:"killGrayBase,omitempty"`
	KillGrayStep  int     `json:"killGrayStep,omitempty"`
	KillTierElite float64 `json:"killTierElite,omitempty"`
	KillTierBoss  float64 `json:"killTierBoss,omitempty"`
}

// killXP assembles the live kill-XP economy this model pays with.
//
// ⚑ The two halves are resolved DIFFERENTLY on purpose. The six new fields
// normalize — a caller written before C1.5 omits them, and "omitted" can only
// sensibly mean "the shipped economy". KillBase/KillGrowth do NOT: every caller
// has always supplied them (the CLI flags default to curve.DefaultKillXP, the
// explorer's inputs are pre-filled), so a zero there is an explicit "off" and
// normalizing it would change what the -levels sweep reports for that input.
// Overwriting them after Normalized keeps KillXP(tier) byte-identical to the
// pre-C1.5 raw curve.KillXP{Base, Growth}.BaseAt path.
func (x XPModel) killXP() curve.KillXP {
	k := curve.KillXP{
		UpBonus:   x.KillUpBonus,
		UpCap:     x.KillUpCap,
		GrayBase:  x.KillGrayBase,
		GrayStep:  x.KillGrayStep,
		TierElite: x.KillTierElite,
		TierBoss:  x.KillTierBoss,
	}.Normalized()
	k.Base, k.Growth = x.KillBase, x.KillGrowth
	return k
}

// KillEconomy is the resolved economy, for callers that need a term of it the
// methods below do not expose — the placement battery reads tier multipliers
// off it (mobs.MobDefinition.KillXPTierMultiplier takes the type).
func (x XPModel) KillEconomy() curve.KillXP { return x.killXP() }

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

// KillXP is the modeled XP for killing one at-level normal mob at a tier —
// the live formula's base(P).
//
// ⚑ Δ = 0, tier normal, xpFactor 1 is BAKED IN here, and that is deliberate:
// this is what the -levels sweep's kills-per-level column has meant since
// chunk 2 (sweep.go), and silently widening its meaning would move a number
// the PO has been reading for four chunks. Award/KillsPerLevelAt below are
// where a placement is priced.
func (x XPModel) KillXP(tier int) float64 {
	return x.killXP().BaseAt(tier)
}

// KillsPerLevel is how many same-tier at-level kills advance one level.
func (x XPModel) KillsPerLevel(level int) float64 {
	return x.XPToNext(level) / x.KillXP(level)
}

// Award is what one kill pays one participant — the live curve.KillXP.Award,
// passed straight through, so what the harness reports is what the server
// hands out. tierMultiplier comes from the species' tier
// (mobs.MobDefinition.KillXPTierMultiplier) and xpFactor from its factors.
func (x XPModel) Award(playerLevel, mobLevel int, tierMultiplier, xpFactor float64) uint64 {
	return x.killXP().Award(playerLevel, mobLevel, tierMultiplier, xpFactor)
}

// KillsPerLevelAt is KillsPerLevel's Δ-aware sibling: how many kills of a mob
// standing at mobLevel advance a player at playerLevel by one level.
//
// ⚑ Returns +Inf when the kill pays nothing — a gray mob, or an xpFactor-0
// species. That is the honest answer (no number of them ever levels you) but
// it does NOT survive encoding/json, so a report field must branch on the
// award being zero rather than storing this.
func (x XPModel) KillsPerLevelAt(playerLevel, mobLevel int, tierMultiplier, xpFactor float64) float64 {
	award := x.Award(playerLevel, mobLevel, tierMultiplier, xpFactor)
	if award == 0 {
		return math.Inf(1)
	}
	return x.XPToNext(playerLevel) / float64(award)
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
	p.Aura.DotHP = float32(float64(p.Aura.DotHP) * f)
	return p
}

// MobAt is the same-tier mob at a tier: the baseline with max HP and aura
// damage inflated by f(tier).
func (fx Fixture) MobAt(tier int) MobSpec {
	f := fx.Curve.F(tier)
	m := fx.Mob
	m.MaxHealth = float32(float64(m.MaxHealth) * f)
	m.Aura.DamageHP = float32(float64(m.Aura.DamageHP) * f)
	m.Aura.DotHP = float32(float64(m.Aura.DotHP) * f)
	return m
}
