package mob

import (
	"math"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
)

// Version B's crowd resistance (plan-playtest-versions.md D8, PV2b): a hostile
// mob takes less damage for each extra player on its threat table.
//
//	players = live PLAYER rows on the threat table, this tick (summons excluded)
//	resist  = min((players - 1) × crowdPerAttacker, crowdCap)
//	taken   = damage × DamageReductionFactor × (1 - resist)
//
// The mob's own damage is untouched (R6). Both knobs are 0 in version A, which
// turns the whole thing off. Set once at boot, like SetDifficulty. All values
// [PLACEHOLDER].
//
// The rule is crowdResist (the formula) and tickCrowd (the count); everything
// else reads the cached m.crowdResist or CrowdPercent (R9). A smarter rule
// later replaces those two functions only.
//
// ⚑ The count reads the table as it is (L7b): nothing here expires or trims a
// row, because retention, the leash and the dormancy wake read the table.
var (
	crowdPerAttacker float32
	crowdCap         float32
)

// maxCrowdCap keeps a crowded mob mortal: a conf cap above it reads as it
// [PLACEHOLDER].
const maxCrowdCap = 0.9

// SetCrowd sets the two knobs. A non-positive per-attacker step or cap reads
// as 0 (off); a cap above maxCrowdCap as maxCrowdCap.
func SetCrowd(perAttacker, capAt float32) {
	crowdPerAttacker = max(perAttacker, 0)
	crowdCap = min(max(capAt, 0), maxCrowdCap)
}

// Crowd is the resolved knobs, for the boot log (D5).
func Crowd() (perAttacker, capAt float32) {
	return crowdPerAttacker, crowdCap
}

// crowdResist is the formula: the resistance a mob gets with this many players
// on its table.
func crowdResist(players int) float32 {
	if players <= 1 {
		return 0
	}
	return min(float32(players-1)*crowdPerAttacker, crowdCap)
}

// CrowdResist is this tick's cached resistance, 0 to maxCrowdCap; 0 outside
// version B and the hostile set.
func (m *Mob) CrowdResist() float32 {
	return m.crowdResist
}

// CrowdPercent is the resistance as the wire and the badge carry it (R7, D9):
// round(resist × 100).
func (m *Mob) CrowdPercent() uint8 {
	return uint8(math.Round(float64(m.crowdResist) * 100))
}

// crowdTakenFactor is the factor on incoming damage, (1 - resist). Its own
// factor beside DamageReductionFactor, not folded into the additive, clamped
// damageReduction stat, so a buff and the crowd stack by multiplication and
// the badge shows the crowd alone.
func (m *Mob) crowdTakenFactor() float32 {
	return 1 - m.crowdResist
}

// tickCrowd recounts once per tick from Update: every read in between takes
// the cached value. A dormant mob skips Update, but it has an empty table
// (dormancy.go), so nothing is missed.
func (m *Mob) tickCrowd() {
	m.crowdResist = 0
	if crowdPerAttacker <= 0 || crowdCap <= 0 || !m.difficultyScaled() {
		return
	}
	players := 0
	for _, e := range m.threat {
		// A dead row stops counting at once, before pruneDeadThreat drops it
		// (R8: a live count, not a latch).
		if e.entity.HealthRatio() == 0 {
			continue
		}
		// R2: players only. A summon's row names the summon, a Mob.
		if _, isPlayer := e.entity.(model.PlayerEntity); isPlayer {
			players++
		}
	}
	m.crowdResist = crowdResist(players)
}
