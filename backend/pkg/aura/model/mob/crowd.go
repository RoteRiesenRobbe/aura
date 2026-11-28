package mob

import "github.com/RoteRiesenRobbe/aura/pkg/aura/model"

// Version B's crowd scaling (plan-playtest-versions.md D3, PV2): a hostile mob
// grows stronger for each extra player recently on its threat table.
//
//	attackers = live PLAYER rows whose last threat write is < crowdWindow ticks old
//	bonus     = min((attackers - 1) × crowdPerAttacker, crowdCap)
//
// The bonus raises the damage the mob deals (damageDealt, D3) and mirrors onto
// the damage it takes: × 1/(1+bonus) (Q2, PO 2026-11-28), so a full crowd
// doubles its output and halves what it takes, never immune. Both knobs are 0
// in version A, which turns the whole thing off. Set once at boot, like
// SetDifficulty. All values [PLACEHOLDER].
//
// ⚑ The window belongs to the count, never to the table (L7): rows still leave
// only on death, disconnect, detaunt or reset, because retention, the leash and
// the dormancy wake read the table.
var (
	crowdPerAttacker float32
	crowdCap         float32
	crowdWindow      uint64 = defaultCrowdWindow
)

// defaultCrowdWindow is 5 s at 30 ticks/s (R5) [PLACEHOLDER]: the window an
// absent conf key reads as, so a passer-by always drops out.
const defaultCrowdWindow = 150

// SetCrowd sets the three knobs. A non-positive per-attacker or cap reads as 0
// (off); a non-positive window as the default.
func SetCrowd(perAttacker, capAt float32, windowTicks int) {
	crowdPerAttacker = max(perAttacker, 0)
	crowdCap = max(capAt, 0)
	crowdWindow = defaultCrowdWindow
	if windowTicks > 0 {
		crowdWindow = uint64(windowTicks)
	}
}

// Crowd is the resolved knobs, for the boot log (D5).
func Crowd() (perAttacker, capAt float32, windowTicks int) {
	return crowdPerAttacker, crowdCap, int(crowdWindow)
}

// CrowdBonus is this tick's cached bonus; 0 outside version B and the hostile
// set.
func (m *Mob) CrowdBonus() float32 {
	return m.crowdBonus
}

// crowdTakenFactor is the mirror on incoming damage, 1/(1+bonus) (Q2). Its own
// factor beside DamageReductionFactor, not folded into the additive, clamped
// damageReduction stat.
func (m *Mob) crowdTakenFactor() float32 {
	return 1 / (1 + m.crowdBonus)
}

// tickCrowd advances the mob's crowd clock and recounts, once per tick from
// Update: every read in between takes the cached value. A dormant mob skips
// Update, but it has an empty table (dormancy.go), so nothing is missed.
func (m *Mob) tickCrowd() {
	m.crowdTick++
	m.crowdBonus = 0
	if crowdPerAttacker <= 0 || crowdCap <= 0 || !m.difficultyScaled() {
		return
	}
	attackers := 0
	for _, e := range m.threat {
		if m.crowdTick-e.lastTick >= crowdWindow || e.entity.HealthRatio() == 0 {
			continue
		}
		// R2: players only. A summon's row names the summon, a Mob.
		if _, isPlayer := e.entity.(model.PlayerEntity); isPlayer {
			attackers++
		}
	}
	if attackers > 1 {
		m.crowdBonus = min(float32(attackers-1)*crowdPerAttacker, crowdCap)
	}
}
