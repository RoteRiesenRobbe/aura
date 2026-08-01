package sys

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Resource costs (plan-numbers-rewrite C1, D5–D9).
//
// GDD §3: a player has exactly one resource, and it is both "what I can still
// do" and "how long I have left to live". Spending survivability for power IS
// the combat game — so a cost is charged in HP, priced as a fraction of the
// caster's MAX HP (D7), and lives on the EFFECT rather than on a payload type
// (D5), which is what lets a slow, a shield, a summon or a speed burst be
// priced without the engine knowing anything about them.
//
// Two rules split by category, because that is how each is felt (D8):
//   - an aura is a field: it pays only when its effect actually lands, on each
//     effect's own tick interval;
//   - a cooldown is a committed act: it pays on cast, hit or whiff, and one it
//     cannot afford is REJECTED rather than silently skipped (D9).
//
// ⚑ "Lands" is ONE rule across every aura applier, and R2 is where that became
// true (plan-resource-costs-feedback §5.2). It means WORK DONE, which each
// applier answers in its own vocabulary but never by mere proximity:
//   - damage / heal — something was actually damaged or actually healed;
//   - dot / hot / resist / slow — at least one target got a genuinely NEW
//     application. A refresh at the same strength changes nothing but an expiry
//     timer, so it is not work; you pay to ignite, not to keep burning;
//   - shield — a pool newly granted, or a drained one restored. The absorb pool
//     is the one payload carrying its own sustain signal, so a shield aura keeps
//     costing exactly while it is being consumed.
//
// Before R2, shield and resist answered `hitAny || len(targets) > 0` and hot
// answered `len(targets) > 0` — a proximity tax — and a targetsSelf effect set
// the flag BEFORE the target set was read, so Warbanner charged full price
// standing alone in an empty field. The comment above described the rule; the
// code implemented three.

// effectCostHP prices ONE application of an effect for its caster, in absolute
// HP, before any never-kill clamping.
//
// ⚑ There is exactly ONE cost model now (D7): a share of the caster's max
// health. C1's migration scaffolding — heal_aura's absolute `selfDamageHp`
// read alongside the fraction — is gone with C2b, along with the field itself.
// The conversion was near-exact rather than a retune: the authored 10 rode
// casterPowerScale against a baseHealth of 100, so it already WAS 10 % of the
// pool. ⚑ It is not bit-identical for one case: max health also carries the
// HP passives, so a caster running Tough or Hardy now pays 10 % of their
// LARGER pool. That is the scale-invariance D7 asked for, not a regression.
func effectCostHP(e skillEntity, payer costPayer, effect skills.EffectDef, level int) float32 {
	// ⚑ The free-floor early-out comes FIRST (§3.8): MaxHealth() is a math.Pow
	// through curve.F, and the permanently-free Damage aura is the most-executed
	// aura in the game — before R2 it paid for a Pow per effect per tick that was
	// then multiplied by zero. It allocates nothing, so the alloc guards
	// structurally cannot see it. CostFractionAt already floors at 0, so <= 0 and
	// == 0 are the same test.
	fraction := effect.CostFractionAt(level)
	if fraction <= 0 {
		return 0
	}
	// The cost-reduction passive (D13) — the first stat that modifies an input.
	// Neutral (×1) for every actor with no such passive equipped.
	return fraction * float32(payer.MaxHealth()) * e.SkillComponent().Derived.CostFactor()
}

// auraEffectCost prices one aura effect tick and pre-clamps it against the
// never-kill floor. It reports the payer (nil when nothing is owed), the HP to
// charge if the effect lands, and whether the whole effect must be SKIPPED this
// tick.
//
// ⚑ L4 — the clamp is computed BEFORE the effect, and the shape is carried
// verbatim from applyHealAura, where it has been the live precedent since
// triage item 1: paying may leave the caster at exactly 1 HP but never below,
// and a caster already at the floor skips the effect entirely (no effect
// emitted, no cost paid). Computing affordability after applying would let a
// cost kill its caster.
func auraEffectCost(e skillEntity, effect skills.EffectDef, level int) (payer costPayer, charge uint32, skip bool) {
	payer, pays := e.(costPayer)
	if !pays || payer.IsGod() {
		return nil, 0, false
	}
	cost := vitals.HP(effectCostHP(e, payer, effect, level))
	if cost == 0 {
		return nil, 0, false
	}
	if health := payer.VitalSigns().Health.UInt32(); cost >= health {
		if health <= 1 {
			return nil, 0, true // cost fully clamped away — skip the whole effect
		}
		cost = health - 1 // leave the caster at exactly 1 HP
	}
	return payer, cost, false
}

// cooldownCostHP totals what firing a cooldown costs its caster: the sum of its
// effects' costs (D5), charged in one go because a cooldown fires all its
// effects at once. Reports a nil payer when nothing is owed.
func cooldownCostHP(e skillEntity, es *skills.EquippedSkill) (costPayer, uint32) {
	payer, pays := e.(costPayer)
	if !pays || payer.IsGod() {
		return nil, 0
	}
	var total float32
	for _, effect := range es.Def.Effects {
		total += effectCostHP(e, payer, effect, es.Level)
	}
	cost := vitals.HP(total)
	if cost == 0 {
		return nil, 0
	}
	return payer, cost
}

// canAfford reports whether the caster can pay a cooldown's cost and live.
// Unlike the aura path there is no clamp: D9 rejects the activation instead,
// because a cooldown that silently fires at a reduced price is the "silently
// stops working" behaviour GDD §3 calls the wrong protection.
func canAfford(payer costPayer, cost uint32) bool {
	return cost < payer.VitalSigns().Health.UInt32()
}

// chargeCost deducts a priced cost from the payer and stamps the ambient-damage
// status, so paying reads on the client exactly like the heal aura's self-cost
// always has.
func chargeCost(payer costPayer, cost uint32) {
	vs := payer.VitalSigns()
	vs.Health = vs.Health.Sub(cost)
	payer.StatusEffects().Add(model.StatusEffectDamagedAmbient)
}
