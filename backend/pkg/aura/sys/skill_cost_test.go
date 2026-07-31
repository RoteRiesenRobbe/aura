package sys

// Tests for the resource-cost system (plan-numbers-rewrite C1, D5–D9, D13).
// The cost used to live inside HealParams and be charged inside applyHealAura;
// it now rides every EffectDef and is charged by applyAuraEffect (auras, on a
// landed effect) or at cooldown fire (always). The heal-specific economics
// tests in heal_economics_test.go / heal_selfcost_clamp_test.go still cover the
// migration branch; this file covers the general system.
//
// Reuses the fakePlayer / fakeMob / colliderSetOf doubles from
// skills_behavior_test.go.

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// costed returns a copy of an effect priced at a fraction of the caster's max
// health — the one cost model (D7).
func costed(effect skills.EffectDef, fraction float32) skills.EffectDef {
	effect.CostFractionOfMax = fraction
	return effect
}

// --- D5: the cost rides ANY effect type, not a payload ---

func TestAuraCost_ChargesOnEveryEffectType(t *testing.T) {
	// The PO requirement behind D5 ("we need to ensure we can balance the
	// resource cost per skill and it's not hard coded per effect type"): a
	// damage aura, a slow, a shield and a dot are four different payloads with
	// nothing in common, and all four pay.
	for _, tc := range []struct {
		name   string
		effect skills.EffectDef
		target any
	}{
		{"damage_aura", damageEffect(1), &touchRecorder{}},
		{"slow_aura", slowEffect(), newSlowTarget()},
		{"shield_aura", shieldEffect(), &shieldTargetRecorder{basic: ecs.NewBasic()}},
		{"dot_aura", dotEffect(), &dotRecorder{basic: ecs.NewBasic()}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			caster := newFakePlayer() // 100 max, 100 current

			testSkillSystem().applyAuraEffect(caster, 1, 1, costed(tc.effect, 0.1), colliderSetOf(tc.target))

			assert.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health,
				"10%% of a 100 pool")
			assert.Contains(t, caster.statusEffects.Effects(), model.StatusEffectDamagedAmbient)
		})
	}
}

// --- D7: fraction of max, so a cost cannot go free as the pool grows ---

func TestAuraCost_IsAFractionOfTheCastersMaxPool(t *testing.T) {
	// The mechanism that made Recover dead content, closed: the same authored
	// cost takes the same SHARE of a level-1 and a level-30 pool.
	for _, maxHP := range []vitals.VitalSign{100, 2600} {
		caster := newFakePlayer()
		caster.maxHealth = maxHP
		caster.vitalSigns.Health = maxHP
		target := &touchRecorder{}

		testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.05), colliderSetOf(target))

		assert.Equal(t, maxHP-maxHP/20, caster.vitalSigns.Health, "5%% of a %d pool", maxHP)
	}
}

// --- D8: an aura pays only for a landed effect ---

func TestAuraCost_UnlandedEffectPaysNothing(t *testing.T) {
	caster := newFakePlayer()

	// Nothing in range: the applier reports it landed on nobody.
	testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.1), nil)

	assert.Equal(t, vitals.VitalSign(100), caster.vitalSigns.Health,
		"an aura is a field — it pays for what it did, not for being on")
	assert.Empty(t, caster.statusEffects.Effects())
}

// --- L4: the never-kill clamp, carried verbatim from the heal path ---

func TestAuraCost_ClampsToLeaveTheCasterAtOneHP(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 10 // a 20-HP cost would land below the floor
	target := &touchRecorder{}

	testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.2), colliderSetOf(target))

	assert.Equal(t, vitals.VitalSign(1), caster.vitalSigns.Health)
	assert.Len(t, target.touches, 1, "the effect still landed in full")
}

func TestAuraCost_CasterAtTheFloorSkipsTheWholeEffect(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 1
	target := &touchRecorder{}

	testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.2), colliderSetOf(target))

	assert.Empty(t, target.touches, "no effect emitted")
	assert.Equal(t, vitals.VitalSign(1), caster.vitalSigns.Health, "and no cost paid")
}

func TestAuraCost_FreeEffectStillFiresAtTheFloor(t *testing.T) {
	// D6/D16b: the free floor is the guarantee that there is never no option
	// left. A 0 cost must never be clamped away.
	caster := newFakePlayer()
	caster.vitalSigns.Health = 1
	target := &touchRecorder{}

	testSkillSystem().applyAuraEffect(caster, 1, 1, damageEffect(1), colliderSetOf(target))

	require.Len(t, target.touches, 1, "the free action always works (GDD §3)")
	assert.Equal(t, vitals.VitalSign(1), caster.vitalSigns.Health)
}

// --- L5: mobs pay nothing, and GOD skips ---

func TestAuraCost_MobCastersPayNothing(t *testing.T) {
	// ⚑ The gate this pins used to be structural: the cost lived behind the
	// player-only healCaster assert inside applyHealAura. Lifting it onto every
	// effect moved it away from that gate — without costPayer re-establishing
	// it, every caster mob in the game would pay a cost and suicide.
	mob := newFakeMob()
	target := &mobTouchRecorder{}

	// A mob is not a costPayer at all, so the only observable is that the
	// effect lands and nothing panics on the missing player vitals.
	testSkillSystem().applyAuraEffect(mob, 1, 1, costed(damageEffect(1), 0.5), colliderSetOf(target))

	assert.Len(t, mob.statusEffects.Effects(), 0, "no cost VFX")
	assert.Len(t, target.factors, 1, "and the aura still fires in full")
}

func TestAuraCost_GodModePaysNothing(t *testing.T) {
	caster := newFakePlayer()
	caster.god = true
	target := &touchRecorder{}

	testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.5), colliderSetOf(target))

	require.Len(t, target.touches, 1)
	assert.Equal(t, vitals.VitalSign(100), caster.vitalSigns.Health)
}

// --- D5: a skill's cost is the SUM of its effects' costs ---

func TestCooldownCost_SumsAcrossEffects(t *testing.T) {
	caster := newFakePlayer()
	es := &skills.EquippedSkill{
		Def: &skills.SkillDefinition{
			ID: 1, Name: "TwoCosts", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
			Effects: []skills.EffectDef{
				costed(selfHealEffect(), 0.1),
				costed(selfHealEffect(), 0.05),
			},
		},
		Level: 1,
	}

	payer, cost := cooldownCostHP(caster, es)

	require.NotNil(t, payer)
	assert.Equal(t, uint32(15), cost, "10%% + 5%% of a 100 pool, charged in one go")
}

// --- D8/D9: cooldowns pay on cast, always; unaffordable is REJECTED ---

func TestCooldownCost_PaidOnFireEvenWhenItWhiffs(t *testing.T) {
	caster := newFakePlayer()
	// A taunt with nothing in range is a whiff — it still costs.
	es := equippedCooldown(costed(tauntEffect(), 0.1))

	s := testSkillSystem()
	s.fireAndCharge(caster, es)

	assert.Equal(t, vitals.VitalSign(90), caster.vitalSigns.Health,
		"a cooldown is a committed act — it pays on cast (D8)")
	assert.Greater(t, es.CdTicks, 0, "and the cooldown is consumed")
}

func TestCooldownCost_UnaffordableIsRejectedNotClamped(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 10 // less than the 20-HP cost
	es := equippedCooldown(costed(tauntEffect(), 0.2))

	reason := testSkillSystem().activationPrecondition(caster, es)

	assert.Equal(t, model.ActivationRejectedNotEnoughResource, reason,
		"GDD §3: an ability that silently stops working is the wrong protection")
}

func TestCooldownCost_ExactlyAffordableIsRejected(t *testing.T) {
	// Paying your whole pool is not affording it — a cooldown must never kill
	// its caster, and unlike an aura there is no clamp to fall back on.
	caster := newFakePlayer()
	caster.vitalSigns.Health = 20
	es := equippedCooldown(costed(tauntEffect(), 0.2))

	assert.Equal(t, model.ActivationRejectedNotEnoughResource,
		testSkillSystem().activationPrecondition(caster, es))

	caster.vitalSigns.Health = 21
	assert.Equal(t, model.ActivationRejectedNone,
		testSkillSystem().activationPrecondition(caster, es), "one HP of headroom is enough")
}

func TestCooldownCost_RejectionSpendsNothingAndStartsNoCooldown(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 10
	es := equippedCooldown(costed(tauntEffect(), 0.2))
	sc := caster.sc
	sc.CooldownSlots[0] = es
	sc.RequestCooldownActivation(0)

	testSkillSystem().processCooldowns(caster, sc)

	assert.Equal(t, vitals.VitalSign(10), caster.vitalSigns.Health, "nothing spent")
	assert.Equal(t, 0, es.CdTicks, "no cooldown started")
	require.Len(t, caster.rejections, 1, "and the player is told")
	assert.Equal(t, rejectedActivation{es.Def.ID, model.ActivationRejectedNotEnoughResource},
		caster.rejections[0])
}

func TestCooldownCost_FreeCooldownIsNeverRejected(t *testing.T) {
	caster := newFakePlayer()
	caster.vitalSigns.Health = 1
	es := equippedCooldown(tauntEffect())

	assert.Equal(t, model.ActivationRejectedNone,
		testSkillSystem().activationPrecondition(caster, es))
}

// --- D13: the cost-reduction passive, the first stat on an INPUT ---

func TestCostReductionPassive_ScalesTheCostDown(t *testing.T) {
	caster := newFakePlayer()
	caster.sc.EquipPassive(0, costReductionPassive(0.25), 1)
	target := &touchRecorder{}

	testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.2), colliderSetOf(target))

	assert.Equal(t, vitals.VitalSign(85), caster.vitalSigns.Health,
		"20 HP × (1 − 0.25) = 15")
}

func TestCostReductionPassive_ClampsAtFreeNeverARefund(t *testing.T) {
	caster := newFakePlayer()
	caster.sc.EquipPassive(0, costReductionPassive(1.5), 1)
	target := &touchRecorder{}

	testSkillSystem().applyAuraEffect(caster, 1, 1, costed(damageEffect(1), 0.2), colliderSetOf(target))

	assert.Equal(t, vitals.VitalSign(100), caster.vitalSigns.Health, "free, not healing")
}

func costReductionPassive(bonus float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 900, Name: "Frugal", Category: skills.SkillCategoryPassive, MaxLevel: 1,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeStatMultiplier,
			Stat: &skills.StatParams{Name: skills.StatCostReduction, Bonus: bonus},
		}},
	}
}

func slowEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:           skills.EffectTypeSlowAura,
		TargetsEnemies: true,
		TickInterval:   1,
		Slow:           &skills.SlowParams{Fraction: 0.2},
	}
}

// tauntEffect is the cooldown used for the whiff tests: with nothing in range
// it affects nobody, which is exactly the case D8 says still pays.
func tauntEffect() skills.EffectDef {
	return skills.EffectDef{
		Type: skills.EffectTypeTaunt, Radius: 2.0, TargetsEnemies: true,
		Threat: &skills.ThreatParams{Margin: 50},
	}
}

func selfHealEffect() skills.EffectDef {
	return skills.EffectDef{
		Type:     skills.EffectTypeSelfHeal,
		SelfHeal: &skills.SelfHealParams{HealHP: 5},
	}
}

func equippedCooldown(effects ...skills.EffectDef) *skills.EquippedSkill {
	return &skills.EquippedSkill{
		Def: &skills.SkillDefinition{
			ID: 800, Name: "TestCooldown", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
			CooldownTicks: 60,
			Effects:       effects,
		},
		Level: 1,
	}
}
