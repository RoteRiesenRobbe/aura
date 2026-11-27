package sys

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-playtest-versions.md D2 (PV1): version B's damageFactor multiplies a
// hostile mob's outgoing damage at casterDamageFactor, and never its heals
// (those read their own sites, L11).
func TestMobDifficulty_DamageFactorScalesDamageNotHeals(t *testing.T) {
	mob.SetDifficulty(2, 1)
	t.Cleanup(func() { mob.SetDifficulty(1, 1) })

	caster := mob.NewMob(testMobDef(), 0, nil)
	assert.InDelta(t, 2, casterDamageFactor(caster), 1e-6)

	target := &mobTouchRecorder{}
	effect := skills.EffectDef{
		Type:           skills.EffectTypeDamageAura,
		TargetsEnemies: true,
		Damage:         &skills.DamageParams{HP: 0.004},
	}
	applyDamageAura(caster, testSkillID, 1, effect, colliderSetOf(target), testRNG())
	require.Len(t, target.factors, 1)
	assert.InDelta(t, 0.008, target.factors[0].Damage, 1e-6)

	ally := &fakeHealableMob{faction: caster.Faction(), health: 50, maxHealth: 100}
	heal := healEffect()
	heal.CostFractionOfMax = 0
	testSkillSystem().applyHealAura(caster, testSkillID, 1, heal, setOf(colliderAt(vec(1, 0), ally)))
	assert.Equal(t, vitals.VitalSign(10), ally.healReceived, "a heal is never scaled")
}
