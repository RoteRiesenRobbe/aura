package mob

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Stat buffs on others at the mob's read sites (plan-effect-types-round-2.md C1).

// threatHolder is a hostile source carrying a threat stat.
type threatHolder struct {
	*fakeAuraPlayer
	stats skills.DerivedStats
}

func (h threatHolder) ApplyStat(skills.SkillID, string, float32, int) bool { return false }
func (h threatHolder) EffectiveStats() skills.DerivedStats                 { return h.stats }

// D15: every threat write scales by the SOURCE's threat factor.
func TestMob_NoteThreatScalesByTheSourcesThreatStat(t *testing.T) {
	m := newTestMob()
	tank := threatHolder{fakeAuraPlayer: newFakeAuraPlayer(), stats: skills.DerivedStats{ThreatBonus: 1}}
	plain := newFakeAuraPlayer()

	m.NoteThreat(tank, 10)
	m.NoteThreat(plain, 10)

	require.Contains(t, m.threat, tank.Basic().ID())
	assert.InDelta(t, 20, m.threat[tank.Basic().ID()].threat, 1e-6, "threat × (1 + 1)")
	assert.InDelta(t, 10, m.threat[plain.Basic().ID()].threat, 1e-6, "a source with no stat writes 1x")
}

// D14: a timed damageReduction on the mob reaches takeDamage beside the passive.
func TestMob_TimedDamageReductionReachesTakeDamage(t *testing.T) {
	m := mobWithPool(100)
	m.ApplyStat(1, skills.StatDamageReduction, -0.5, 30)

	m.takeDamage(model.Damage{HP: 40}, 0, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(40), m.Health(), "40 × 1.5 = 60 lands")
}
