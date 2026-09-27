package mob

// The while-active self modifier on a REAL mob (plan-aura-drawbacks.md C1):
// recomputeDerived is the mob's too, so a mob aura carrying a stat_multiplier
// moves that mob's numbers while it runs (§10 L4). Behaviour, never Derived.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func statAura(name string, bonus float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 199, Name: "TestStatAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeStatMultiplier,
			Stat: &skills.StatParams{Name: name, Bonus: bonus},
		}},
	}
}

func TestMob_DamageReductionDrawback_RaisesDamageTaken(t *testing.T) {
	m := mobWithPool(100)
	m.SkillComponent().EquipAura(0, statAura(skills.StatDamageReduction, -0.5), 1)

	m.takeDamage(model.Damage{HP: 20}, 0, model.StatusEffectDamagedAmbient)
	require.Equal(t, vitals.VitalSign(80), m.Health(), "equipped but off: the full 20")

	m.SkillComponent().SetActiveAura(0)
	m.takeDamage(model.Damage{HP: 20}, 0, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(50), m.Health(), "20 × 1.5 = 30 while the aura runs")
}

func TestMob_MaxHealthDrawback_ShrinksThePoolWhileOn(t *testing.T) {
	m := mobWithPool(100)
	m.SkillComponent().EquipAura(0, statAura(skills.StatMaxHealth, -0.4), 1)

	m.SkillComponent().SetActiveAura(0)
	assert.Equal(t, vitals.VitalSign(60), m.MaxHealth())

	m.SkillComponent().SetActiveAura(-1)
	assert.Equal(t, vitals.VitalSign(100), m.MaxHealth())
}
