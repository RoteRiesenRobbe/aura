package sys

// Apply-site tests for the heal-aura economics (plan-intermission-triage.md):
//   item 2 — the self-cost scales per level (SelfDamageHPPerLevel), authored
//     negative so leveling makes the aura cheaper; clamped at 0.
//   item 13 — a percent-of-max heal (FractionOfMax) restores a share of the
//     TARGET's max HP, so a campfire heals big and small pools at the same rate.
// Reuses the fakePlayer/colliderSetOf doubles from skills_behavior_test.go.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fadingCostHealEffect mirrors the authored heal-aura curve (item 2): heal 12,
// self-cost 10 falling by 2/level.
func fadingCostHealEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:         skills.EffectTypeHealAura,
		TickInterval: 1,
		Heal:         &skills.HealParams{HP: 12, SelfDamageHP: 10, SelfDamageHPPerLevel: -2},
	}
}

func TestApplyHealAura_SelfCostScalesDownPerLevel(t *testing.T) {
	for _, tc := range []struct {
		level    int
		wantCost vitals.VitalSign
	}{
		{1, 10}, // 10 - 0
		{3, 6},  // 10 - 4
		{5, 2},  // 10 - 8
	} {
		caster := newFakePlayer()
		ally := newFakePlayer()
		ally.vitalSigns.Health = 50
		set := colliderSetOf(model.PlayerEntity(ally))

		testSkillSystem().applyHealAura(caster, tc.level, fadingCostHealEffect(), set)

		assert.Equal(t, vitals.VitalSign(100)-tc.wantCost, caster.vitalSigns.Health,
			"level %d self-cost", tc.level)
	}
}

func TestApplyHealAura_SelfCostNeverExceedsHealAtL1(t *testing.T) {
	// The design invariant (item 2, PO ruling): heal > cost from L1. A fresh
	// caster healing a wounded ally nets positive on the pair (ally +12 vs
	// caster −10).
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, fadingCostHealEffect(), set)

	assert.Equal(t, vitals.VitalSign(62), ally.vitalSigns.Health, "ally healed 12")
	assert.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health, "caster paid 10 < 12")
}

func TestApplyHealAura_SelfCostClampsAtZeroForOverGenerousCurve(t *testing.T) {
	// A level past where the curve would go negative pays nothing (never heals
	// the caster) but the ally is still healed.
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 7, fadingCostHealEffect(), set) // 10 - 12 < 0

	assert.Equal(t, vitals.VitalSign(100), caster.vitalSigns.Health, "cost floored at 0")
	assert.Greater(t, ally.vitalSigns.Health, vitals.VitalSign(50), "ally still healed")
}

// fractionHealEffect is the campfire shape (item 13): percent-of-max, no flat
// HP, no self-cost, uncapped.
func fractionHealEffect(frac float32) skills.EffectDef {
	return skills.EffectDef{
		Type:         skills.EffectTypeHealAura,
		TickInterval: 1,
		Heal:         &skills.HealParams{FractionOfMax: frac},
	}
}

func TestApplyHealAura_FractionOfMax_HealsShareOfTargetMax(t *testing.T) {
	caster := newFakePlayer()

	// A small pool and a large pool, both wounded to 50, healed by the same
	// 20%-of-max campfire tick: the big pool restores proportionally more HP.
	small := newFakePlayer() // MaxHealth 100
	small.vitalSigns.Health = 50
	big := newFakePlayer()
	big.maxHealth = 200 // MaxHealth 200
	big.vitalSigns.Health = 50

	testSkillSystem().applyHealAura(caster, 1, fractionHealEffect(0.2), colliderSetOf(model.PlayerEntity(small)))
	testSkillSystem().applyHealAura(caster, 1, fractionHealEffect(0.2), colliderSetOf(model.PlayerEntity(big)))

	assert.Equal(t, vitals.VitalSign(70), small.vitalSigns.Health, "20% of 100 = 20 HP")
	assert.Equal(t, vitals.VitalSign(90), big.vitalSigns.Health, "20% of 200 = 40 HP")
}

func TestApplyHealAura_FractionOfMax_CasterPaysNoCost(t *testing.T) {
	// The campfire (a mob) authors no self-cost; the fraction path must not
	// invent one.
	caster := newFakePlayer()
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	set := colliderSetOf(model.PlayerEntity(ally))

	testSkillSystem().applyHealAura(caster, 1, fractionHealEffect(0.1), set)

	require.Equal(t, vitals.VitalSign(60), ally.vitalSigns.Health, "10% of 100 = 10 HP")
	assert.Equal(t, vitals.VitalSign(100), caster.vitalSigns.Health, "no self-cost on a fraction heal")
}
