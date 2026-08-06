package curve

import "math"

// KillXP is the kill-XP economy (docs/archive/plan-xp-formula.md §3, D1): what one mob
// death pays ONE participant. The whole point is the anchor — every term but
// the mob's tier and species factor is evaluated at the RECIPIENT's level, so
// the award is bounded by what that player's own at-level kill is worth no
// matter what died:
//
//	award = base(P) × mod(Δ) × tier × xpFactor        P = recipient's level
//	base(P) = Base × Growth^(P-1)                     Δ = mob level − P
//
// That closes both failure modes the flat authored `experience` had: a
// low-level tagalong at an endgame kill (bounded to +20% of their own at-level
// pay, D1) and endgame gray farming (a linear taper to exactly zero, D2).
//
// The base is EXPONENTIAL rather than WoW's linear L×5+45 because the
// level-up requirement is exponential (levelUpXPBase × levelUpXPGrowthFactor^
// (L-1)); Growth == levelUpXPGrowthFactor is the property that makes
// kills-per-level flat across the whole span (§3.1). Setting Growth a notch
// lower is the one knob that slows the late game — a C2 calibration question,
// not a structural one.
//
// Every value is [PLACEHOLDER] until C2's calibration pass says otherwise.
//
// ⚑ It lives here, beside Curve, for the reason sim.Curve aliases curve.Curve:
// the sim harness consumes this type, so the tool that calibrates the economy
// cannot model a different one than the game pays.
//
// ⛑ That claim was HALF TRUE from C1 until C1.5, and the half it was missing is
// the half the calibration pass needs (plan-xp-formula.md §13.1). sim.XPModel
// carried four scalars and reached BaseAt ALONE — no Modifier, no gray boundary,
// no up-bonus, no tier multipliers, no xpFactor — so the harness could see
// base(P) and nothing else, and the taper's shape is precisely the open D8
// question. It now goes through Award. *A shared type is not a shared model:
// delegating one method proves no drift in that method and nothing about the
// rest.*
type KillXP struct {
	// Base is what an at-level normal kill pays a level-1 player, and Growth
	// inflates it per recipient level.
	Base   float64 `json:"base"`
	Growth float64 `json:"growth"`

	// UpBonus is the per-level bonus for killing ABOVE your level and UpCap
	// how many levels of it count (WoW's +5%/level, capped). The cap is what
	// bounds pull-through: past it, an endgame boss pays a level-3 exactly the
	// same as a mob UpCap levels above them.
	UpBonus float64 `json:"upBonusPerLevel"`
	UpCap   int     `json:"upBonusCapLevels"`

	// GrayBase and GrayStep define the gray distance GD(P) = GrayBase +
	// P/GrayStep: how far below you a mob must be to pay nothing. It widens
	// with level so a high-level player keeps earning across a wider band than
	// a new one — the same shape WoW uses.
	GrayBase int `json:"grayBase"`
	GrayStep int `json:"grayStep"`

	// TaperStretch runs the taper's zero point DEEPER than the gray boundary:
	// the linear falloff reaches zero at GD(P) × TaperStretch, but the boundary
	// truncates it first — so the deepest green kill still pays a real fraction
	// (~1 − 1/TaperStretch) instead of ~1/GD (D13, 2026-08-06). This is WoW
	// Classic's own two-distance structure (gray level vs. ZD; at 60 a level-48
	// mob pays 29%, a 47 pays 0), which the pre-D13 formula had collapsed into
	// one — the collapse was the whole D8 defect. 1 reproduces the collapsed
	// shape; sub-1 values clamp to 1 (a green kill may never pay zero).
	TaperStretch float64 `json:"taperStretch"`

	// TierElite and TierBoss multiply the award for the two marked tiers.
	// Normal has no knob BY DESIGN: base(P) IS the at-level normal kill, so a
	// normal multiplier would be a second name for Base.
	TierElite float64 `json:"tierElite"`
	TierBoss  float64 `json:"tierBoss"`
}

// DefaultKillXP is the built-in economy — THE source of truth for the numbers,
// which conf.json restates and the sim harness's flag defaults read (the
// defaultMobHealthGainTick precedent). An absent conf block resolves back to
// here rather than to Go zero values, which is what keeps a deployment that
// predates the block (the live server, §35/L5) paying a working economy
// instead of nothing.
//
// Base 20 × Growth 1.2 is ~15 normal kills per level, flat across all 30
// levels (D19, from the in-game pass: "too much XP overall"; D15 keeps growth
// flat — levels 21–30 are empty, so a late-game slowdown would lengthen a span
// with no content). GrayBase 5 × GrayStep 10 is WoW Classic's OWN gray
// distance (5 + ⌊P/10⌋: 5→8 across the span) — D18, ruled at the game surface:
// at L12 a level-5 or level-6 mob pays nothing, which is WoW's L12 boundary to
// the digit. It supersedes D14's wide band, which the same pass falsified.
// Stretch 1.15 survives D18 (deepest green pays ~24–30%, then the cliff).
// TierElite 2.5 is D17, the conservative end of the PO's 2.5–3 range.
// [PLACEHOLDER]
func DefaultKillXP() KillXP {
	return KillXP{
		Base:         20,
		Growth:       1.2,
		UpBonus:      0.05,
		UpCap:        4,
		GrayBase:     5,
		GrayStep:     10,
		TaperStretch: 1.15,
		TierElite:    2.5,
		TierBoss:     5,
	}
}

// Configured reports whether this economy can pay anything at all. A zero value
// cannot, and says so here rather than paying a floored 1 XP per kill.
func (k KillXP) Configured() bool { return k.Base > 0 && k.Growth > 0 }

// Normalized falls every non-positive field back to the default for THAT
// field, so a partially-authored conf block is completed rather than taken
// literally.
//
// ⚑ This is the whole-block guard's blind spot, and it is L2's shape at the
// conf seam. A calibration pass writing only `{"base": 60, "growth": 1.15}` —
// exactly what C2 invites — passes Configured() and would otherwise install
// GrayStep 0 (⇒ gray distance 0, so EVERY mob below your level pays nothing),
// UpBonus 0 (no up-bonus ever) and TierElite/TierBoss 0 (⇒ every elite and
// boss in the game pays NOTHING, via Award's tierMultiplier guard). All of it
// silent, and the two fields that were set are the two the boot log prints.
//
// A zero here can only ever mean "unauthored": a genuinely free tier is
// expressed on the species with xpFactor 0, not by zeroing the whole tier.
func (k KillXP) Normalized() KillXP {
	d := DefaultKillXP()
	if k.Base <= 0 {
		k.Base = d.Base
	}
	if k.Growth <= 0 {
		k.Growth = d.Growth
	}
	if k.UpBonus <= 0 {
		k.UpBonus = d.UpBonus
	}
	if k.UpCap <= 0 {
		k.UpCap = d.UpCap
	}
	if k.GrayBase <= 0 {
		k.GrayBase = d.GrayBase
	}
	if k.GrayStep <= 0 {
		k.GrayStep = d.GrayStep
	}
	if k.TaperStretch <= 0 {
		k.TaperStretch = d.TaperStretch
	}
	if k.TierElite <= 0 {
		k.TierElite = d.TierElite
	}
	if k.TierBoss <= 0 {
		k.TierBoss = d.TierBoss
	}
	return k
}

// BaseAt is what an at-level normal kill pays a player at this level; levels
// below 1 clamp to the baseline, matching Curve.F.
func (k KillXP) BaseAt(level int) float64 {
	if !k.Configured() {
		return 0
	}
	if level < 1 {
		level = 1
	}
	return k.Base * math.Pow(k.Growth, float64(level-1))
}

// GrayDistance is ZD(P) — how many levels below the recipient a mob has to be
// before it pays nothing.
func (k KillXP) GrayDistance(level int) int {
	if level < 1 {
		level = 1
	}
	step := k.GrayStep
	if step < 1 {
		return k.GrayBase
	}
	return k.GrayBase + level/step
}

// Modifier is mod(Δ): a bounded bonus for killing above your level, and below
// it a linear taper TRUNCATED by the gray boundary (D13, amending D2's "taper
// to exactly zero"): the falloff would reach zero at GD × TaperStretch, but at
// the boundary itself the kill already pays nothing — a cliff at ~30–40% of
// at-level, exactly WoW Classic's shape (never a cliff at full value, which is
// what D2 actually ruled out).
func (k KillXP) Modifier(recipientLevel, mobLevel int) float64 {
	if recipientLevel < 1 {
		recipientLevel = 1
	}
	if mobLevel < 1 {
		mobLevel = 1
	}
	delta := mobLevel - recipientLevel

	if delta >= 0 {
		counted := delta
		if k.UpCap >= 0 && counted > k.UpCap {
			counted = k.UpCap
		}
		return 1 + k.UpBonus*float64(counted)
	}

	gray := k.GrayDistance(recipientLevel)
	if gray < 1 {
		return 0
	}
	if -delta >= gray {
		return 0 // at/past the boundary: gray, pays nothing — the cliff
	}
	stretch := k.TaperStretch
	if stretch < 1 {
		stretch = 1 // sub-1 would zero a green kill, breaking gray ⟺ pays nothing
	}
	mod := 1 + float64(delta)/(float64(gray)*stretch)
	if mod < 0 {
		return 0
	}
	return mod
}

// Award is what this kill pays one participant, rounded to whole XP.
//
// ⚑ The min-1 floor is gated on the award being MEANT to be non-zero — an
// authored xpFactor 0 (every NPC, structure, totem and summon) pays zero, and
// so does a gray kill. Between those, a positive-but-tiny product floors at 1
// rather than rounding to nothing, or "almost gray" reads as gray and the
// taper's shape lies (L4).
func (k KillXP) Award(recipientLevel, mobLevel int, tierMultiplier, xpFactor float64) uint64 {
	if !k.Configured() || tierMultiplier <= 0 || xpFactor <= 0 {
		return 0
	}
	mod := k.Modifier(recipientLevel, mobLevel)
	if mod <= 0 {
		return 0
	}
	award := math.Round(k.BaseAt(recipientLevel) * mod * tierMultiplier * xpFactor)
	if award < 1 {
		return 1
	}
	return uint64(award)
}
