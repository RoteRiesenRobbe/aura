package sys

// Stealth (plan-effect-types-round-2.md C6, D2, D25, L7): the cast drops the
// player off every mob's table, and no mob door reaches a stealthed player,
// the aura door included.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func stealthEffect() skills.EffectDef {
	return skills.EffectDef{Type: skills.EffectTypeStealth, Stealth: &skills.StealthParams{DurationTicks: 600}}
}

type forgetRecorder struct{ forgot []uint64 }

func (r *forgetRecorder) ForgetTarget(id uint64) { r.forgot = append(r.forgot, id) }

func TestStealth_TheCastDropsThePlayerOffEveryTable(t *testing.T) {
	p := realCCPlayer(t, phy.Vec2f{})
	s := NewSkillSystem(phy.NewSpace(), newFakeGame())
	rec := &forgetRecorder{}
	s.SetAggroForgetter(rec)

	require.True(t, s.applyStealth(p, 168, stealthEffect()))

	assert.True(t, p.(model.Stealther).Stealthed())
	assert.Equal(t, []uint64{p.Basic().ID()}, rec.forgot, "D2: every mob forgets the player")
}

func TestStealth_AMobCasterIsANoOp(t *testing.T) {
	assert.False(t, testSkillSystem().applyStealth(newFakeMob(), 168, stealthEffect()), "stealth is a player tool (D3)")
}

// L7: a mob's AURA hits any eligible collider, not only its target, so the
// filter has to sit in the shared harm seam too.
func TestStealth_AMobAuraDoesNotReachAStealthedPlayer(t *testing.T) {
	auraDef := &skills.SkillDefinition{
		ID: 232, Name: "TestMobAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDamageAura, Radius: 2, TargetsEnemies: true, TickInterval: 1,
			Damage: &skills.DamageParams{HP: 5},
		}},
	}
	def := testMobDef()
	def.Skills = []mobs.MobSkill{{Def: auraDef, Level: 1}}
	caster := mob.NewMob(def, 0, nil)
	p := realCCPlayer(t, phy.Vec2f{X: 1})
	caster.NoteThreat(p.(model.Combatant), 10) // it is fighting this player

	applyDamageAura(caster, 232, 1, auraDef.Effects[0], colliderSetOf(p), testRNG())
	before := p.VitalSigns().Health
	require.Less(t, before, p.MaxHealth(), "control: the aura reaches a visible player")

	require.True(t, p.(model.Stealther).ApplyStealth(168, 600))
	applyDamageAura(caster, 232, 1, auraDef.Effects[0], colliderSetOf(p), testRNG())

	assert.Equal(t, before, p.VitalSigns().Health, "the stealthed player takes nothing")
	assert.True(t, p.(model.Stealther).Stealthed())
}
