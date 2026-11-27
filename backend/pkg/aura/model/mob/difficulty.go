package mob

import "github.com/RoteRiesenRobbe/aura/pkg/aura/model"

// Version B's hidden difficulty (plan-playtest-versions.md D2): two factors on
// a hostile world mob's outgoing damage and its pool. Both are 1 in version A.
// Set once at boot (and by the simharness flags), before any mob spawns, like
// SetHealthGainTick.
//
// ⚑ Beside PowerScale, never inside it (L1): PowerScale is the level curve and
// also feeds summon output, so folding a second factor into it applies twice.
var difficultyDamage, difficultyHealth float32 = 1, 1

// SetDifficulty sets both factors. A non-positive value (an absent conf entry
// that bypassed cfg.ParseConfig, a zero flag) reads as 1, so no read site has
// to re-check it.
func SetDifficulty(damageFactor, healthFactor float32) {
	difficultyDamage = neutralUnlessPositive(damageFactor)
	difficultyHealth = neutralUnlessPositive(healthFactor)
}

// Difficulty is the resolved pair, for the boot log (D5).
func Difficulty() (damageFactor, healthFactor float32) {
	return difficultyDamage, difficultyHealth
}

func neutralUnlessPositive(f float32) float32 {
	if f <= 0 {
		return 1
	}
	return f
}

// difficultyScaled is the mob set B makes harder: no player owner (summons,
// companions, camps stay as they are), not friendly to players (townsfolk, the
// army), and no gate keys (the harvestables, PO Q9 2026-11-27). Every tier
// scales (PO Q3). It reads the definition, never the live faction, so a
// charmed mob keeps its pool mid-fight.
func (m *Mob) difficultyScaled() bool {
	return m.owner == nil && !m.definition.FriendlyToPlayers && len(m.definition.Factors.GateKeys) == 0
}

// DifficultyDamageFactor multiplies this mob's outgoing damage
// (sys.casterDamageFactor); 1 for a mob outside the set.
func (m *Mob) DifficultyDamageFactor() float32 {
	if !m.difficultyScaled() {
		return 1
	}
	return difficultyDamage
}

func (m *Mob) difficultyHealthFactor() float32 {
	if !m.difficultyScaled() {
		return 1
	}
	return difficultyHealth
}

// A drifted signature breaks the build instead of silently degrading to
// "not scaled" behind casterDamageFactor's type assertion.
var _ model.DifficultyScaled = (*Mob)(nil)
