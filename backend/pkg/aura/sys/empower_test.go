package sys

// Empower next cast (plan-effect-types-round-2.md C4, D20 + D21, L1 + L11):
// the next cooldown the player fires may be instant, free, a guaranteed crit
// and/or stronger, and the empower is spent by that fire alone.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (f *fakePlayer) ApplyEmpower(source skills.SkillID, p skills.EmpowerParams, ticks int) {
	f.buffs.ApplyEmpower(source, p, ticks)
}
func (f *fakePlayer) Empower() (skills.EmpowerParams, bool)       { return f.buffs.Empower() }
func (f *fakePlayer) ArmEmpower()                                 { f.buffs.ArmEmpower() }
func (f *fakePlayer) EmpoweredFire() (skills.EmpowerParams, bool) { return f.buffs.EmpoweredFire() }
func (f *fakePlayer) ConsumeEmpower()                             { f.buffs.ConsumeEmpower() }

var _ model.Empowerable = (*fakePlayer)(nil)

func empowerSkill(p skills.EmpowerParams) *skills.EquippedSkill {
	return &skills.EquippedSkill{
		Def: &skills.SkillDefinition{
			ID: 162, Name: "Swiftness", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
			CooldownTicks: 900,
			Effects:       []skills.EffectDef{{Type: skills.EffectTypeEmpower, Empower: &p}},
		},
		Level: 1,
	}
}

func empowered(p skills.EmpowerParams) *fakePlayer {
	f := newFakePlayer()
	p.DurationTicks = 300
	f.buffs.ApplyEmpower(162, p, p.DurationTicks)
	return f
}

func liveEmpower(f *fakePlayer) bool {
	_, ok := f.buffs.Empower()
	return ok
}

// L1: the empowering cast applies the buff inside its own fire and must not
// spend it on the way out.
func TestEmpower_TheEmpoweringCastDoesNotConsumeItself(t *testing.T) {
	caster := newFakePlayer()

	testSkillSystem().fireAndCharge(caster, empowerSkill(skills.EmpowerParams{Free: true, DurationTicks: 300}))

	assert.True(t, liveEmpower(caster), "armed for the NEXT cooldown")
}

func TestEmpower_InstantSkipsTheCastTime(t *testing.T) {
	caster := empowered(skills.EmpowerParams{Instant: true})
	slow := equippedCooldown(selfHealEffect())
	slow.Def.CastTicks = 60
	caster.sc.CooldownSlots[0] = slow
	caster.sc.RequestCooldownActivation(0)

	testSkillSystem().processCooldowns(caster, caster.sc)

	assert.False(t, caster.sc.IsCasting(), "no wind-up")
	assert.Greater(t, caster.sc.CooldownRemaining(slow.Def.ID), 0, "fired on the press")
	assert.False(t, liveEmpower(caster), "and spent")
}

func TestEmpower_CancelledCastKeepsIt(t *testing.T) {
	caster := empowered(skills.EmpowerParams{Free: true})
	slow := equippedCooldown(selfHealEffect())
	slow.Def.CastTicks = 60
	caster.sc.CooldownSlots[0] = slow
	caster.sc.RequestCooldownActivation(0)
	s := testSkillSystem()

	s.processCooldowns(caster, caster.sc)
	require.True(t, caster.sc.IsCasting(), "free alone does not skip the wind-up")
	caster.sc.CancelCast()

	assert.True(t, liveEmpower(caster), "a cancelled cast spends nothing")
}

// L1's other half: cooldownCostHP is read at the precondition AND at the fire.
func TestEmpower_FreeWaivesTheCostAtBothReads(t *testing.T) {
	caster := empowered(skills.EmpowerParams{Free: true})
	caster.vitalSigns.Health = 10 // less than the 20-HP cost
	es := equippedCooldown(costed(tauntEffect(), 0.2))
	s := testSkillSystem()

	require.Equal(t, model.ActivationRejectedNone, s.activationPrecondition(caster, es), "affordable while free")
	s.fireAndCharge(caster, es)

	assert.Equal(t, vitals.VitalSign(10), caster.vitalSigns.Health, "nothing charged at the fire")
	assert.False(t, liveEmpower(caster))
	assert.Equal(t, model.ActivationRejectedNotEnoughResource, s.activationPrecondition(caster, es),
		"the next cast pays again")
}

func TestEmpower_CritAndFactorReadOnlyWhileFiring(t *testing.T) {
	caster := empowered(skills.EmpowerParams{Crit: true, Factor: 2})

	assert.Less(t, casterCritChance(caster), float32(1), "live is not firing: an aura tick is untouched")
	assert.InDelta(t, 1, casterDamageFactor(caster), 1e-6)

	caster.ArmEmpower()
	assert.Equal(t, float32(1), casterCritChance(caster), "guaranteed crit")
	assert.InDelta(t, 2, casterDamageFactor(caster), 1e-6)
}

// L11: the factor reaches heals through a read site of its own.
func TestEmpower_FactorScalesTheHealOfThatCast(t *testing.T) {
	plain := newFakePlayer()
	plain.vitalSigns.Health = 50
	testSkillSystem().fireAndCharge(plain, equippedCooldown(selfHealEffect()))
	base := plain.vitalSigns.Health - 50
	require.Greater(t, base, vitals.VitalSign(0))

	caster := empowered(skills.EmpowerParams{Factor: 2})
	caster.vitalSigns.Health = 50
	testSkillSystem().fireAndCharge(caster, equippedCooldown(selfHealEffect()))

	assert.Equal(t, 2*base, caster.vitalSigns.Health-50)
	assert.False(t, liveEmpower(caster))
	assert.InDelta(t, 1, casterDamageFactor(caster), 1e-6, "disarmed after the fire")
}

func TestEmpower_MobCasterIsANoOp(t *testing.T) {
	mob := newFakeMob()
	assert.False(t, testSkillSystem().applyEmpower(mob, 162, empowerSkill(skills.EmpowerParams{Free: true, DurationTicks: 300}).Def.Effects[0]),
		"D20: player-only")
}
