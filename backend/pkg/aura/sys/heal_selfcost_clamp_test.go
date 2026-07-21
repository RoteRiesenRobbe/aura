package sys

// Tests for the heal-aura self-cost floor (plan-intermission-triage.md item 1):
// the heal aura must never kill its caster. The scaled self-cost is computed up
// front and clamped so the caster is left at 1 HP at worst; a caster already at
// the floor skips the entire effect for the tick — no heal emitted, no cost
// paid. Health is absolute HP (item 11 Phase 1), so the floor is VitalSign(1).
// Reuses the fakePlayer/colliderSetOf doubles from skills_behavior_test.go.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// costlyHealEffect mirrors the real heal-aura shape with a self-cost large
// enough to threaten a low-HP caster (all numbers [PLACEHOLDER], matching the
// authored flat 18 of api/skills/heal.json).
func costlyHealEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:         skills.EffectTypeHealAura,
		TickInterval: 1,
		Heal:         &skills.HealParams{HP: 10, SelfDamageHP: 18},
	}
}

func TestApplyHealAura_SelfCostClampedToLeaveCasterAtOneHP(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 10 // full cost of 18 would land below the floor
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, costlyHealEffect(), set)

	assert.Equal(t, vitals.VitalSign(60), ally.vitalSigns.Health, "the ally is still healed in full")
	assert.Equal(t, vitals.VitalSign(1), caster.vitalSigns.Health,
		"the cost is clamped so the caster is left at exactly 1 HP")
}

func TestApplyHealAura_CasterAtOneHP_SkipsEffectEntirely(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 1 // already at the floor — cost fully clamped
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, costlyHealEffect(), set)

	assert.Equal(t, vitals.VitalSign(50), ally.vitalSigns.Health, "no heal is emitted")
	assert.Empty(t, ally.healedBy, "no participation is recorded")
	assert.Equal(t, vitals.VitalSign(1), caster.vitalSigns.Health, "no cost is paid")
	assert.Empty(t, caster.statusEffects.Effects(), "no cost VFX either")
}

func TestApplyHealAura_ZeroCostEffect_StillHealsAtOneHP(t *testing.T) {
	// Multi-effect heal components (Paladin/Vanguard/Warbanner) author
	// selfDamageHP 0 — a zero cost never clamps, so the floor must not block
	// them even on a 1-HP caster.
	caster := newFakePlayer()
	caster.vitalSigns.Health = 1
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	effect := costlyHealEffect()
	effect.Heal.SelfDamageHP = 0
	testSkillSystem().applyHealAura(caster, 1, effect, set)

	require.Equal(t, vitals.VitalSign(60), ally.vitalSigns.Health, "the free heal still fires")
	assert.Equal(t, vitals.VitalSign(1), caster.vitalSigns.Health, "and still costs nothing")
}

func TestApplyHealAura_LowHPCaster_NoWoundedAlly_PaysNothing(t *testing.T) {
	// The existing "no one healed → no cost" rule must survive the up-front
	// cost computation: a full-health ally means no heal and no cost, clamped
	// or not.
	caster := newFakePlayer()
	caster.vitalSigns.Health = 10
	ally := newFakePlayer() // full health
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, costlyHealEffect(), set)

	assert.Equal(t, vitals.VitalSign(10), caster.vitalSigns.Health,
		"no one was healed, so the caster pays nothing — clamp aside")
	assert.Empty(t, caster.statusEffects.Effects())
}
