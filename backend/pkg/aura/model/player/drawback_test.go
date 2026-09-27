package player

// The while-active self modifier on a REAL player (plan-aura-drawbacks.md C1):
// behaviour (HP, damage taken), never Derived alone.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func drawbackAura(stat string, bonus float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 901, Name: "Drawback", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeStatMultiplier,
			Stat: &skills.StatParams{Name: stat, Bonus: bonus},
		}},
	}
}

func drawbackPlayer(stat string, bonus float32) *player {
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.PlayerVitalSigns.Health = 100
	p.skills.EquipAura(0, drawbackAura(stat, bonus), 1)
	return p
}

func TestPlayer_DamageReductionDrawback_RaisesDamageTaken(t *testing.T) {
	p := drawbackPlayer(skills.StatDamageReduction, -0.5)

	p.takeDamage(model.Damage{HP: 20}, 0, model.StatusEffectDamagedAmbient)
	require.Equal(t, vitals.VitalSign(80), p.VitalSigns().Health, "equipped but off: the full 20, no more")

	p.skills.SetActiveAura(0)
	p.takeDamage(model.Damage{HP: 20}, 0, model.StatusEffectDamagedAmbient)
	assert.Equal(t, vitals.VitalSign(50), p.VitalSigns().Health, "20 × (1 + 0.5) = 30 while the aura runs")
}

// D5: the pool shrinks at switch-on, and the player's per-tick clamp (the
// mob's rule) brings current HP down to it on the next tick.
func TestPlayer_MaxHealthDrawback_ClampsOnTheNextTick(t *testing.T) {
	p := drawbackPlayer(skills.StatMaxHealth, -0.4)
	require.Equal(t, vitals.VitalSign(100), p.MaxHealth())

	p.skills.SetActiveAura(0)
	require.Equal(t, vitals.VitalSign(60), p.MaxHealth(), "the pool shrinks at switch-on")

	p.Update(0)

	assert.Equal(t, vitals.VitalSign(60), p.VitalSigns().Health, "clamped to the shrunken pool")
}

// The clamp runs in combat too: it is not a regen, it is a cap.
func TestPlayer_MaxHealthDrawback_ClampsInCombat(t *testing.T) {
	p := drawbackPlayer(skills.StatMaxHealth, -0.4)
	p.NoteCombatAction()
	p.skills.SetActiveAura(0)

	p.Update(0)

	assert.Equal(t, vitals.VitalSign(60), p.VitalSigns().Health)
}

// Switch-off leaves HP absolute: the pool has room again, and the player
// regenerates into it rather than being refilled (the accepted hysteresis).
func TestPlayer_MaxHealthDrawback_SwitchOffLeavesHPAbsolute(t *testing.T) {
	p := drawbackPlayer(skills.StatMaxHealth, -0.4)
	p.skills.SetActiveAura(0)
	p.NoteCombatAction() // no regen may mask the assertion
	p.Update(0)
	require.Equal(t, vitals.VitalSign(60), p.VitalSigns().Health)

	p.skills.SetActiveAura(-1)
	p.Update(0)

	assert.Equal(t, vitals.VitalSign(100), p.MaxHealth(), "the pool is back")
	assert.Equal(t, vitals.VitalSign(60), p.VitalSigns().Health, "HP stays where it was")
}

// A dead player stays dead: the clamp only ever lowers HP.
func TestPlayer_MaxHealthClamp_NeverRaisesHP(t *testing.T) {
	p := drawbackPlayer(skills.StatMaxHealth, -0.4)
	p.PlayerVitalSigns.Health = 0
	p.skills.SetActiveAura(0)

	p.Update(0)

	assert.Equal(t, vitals.VitalSign(0), p.VitalSigns().Health)
}
