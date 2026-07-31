package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Content guards for the authored resource costs (plan-numbers-rewrite C2b).
// Both catch mistakes that are SILENT — no boot warning, no failing unit test,
// no visible symptom until a player either dies to their own aura or wonders
// why an expensive-looking skill is free.

// playerSkillDefs is every authored player skill (mob skills number from 100,
// the simharness convention) read from the real api/ tree.
func playerSkillDefs(t *testing.T) []*skills.SkillDefinition {
	t.Helper()
	content, err := diskContent("../../../api")
	require.NoError(t, err)
	registry, err := skills.RegistryFromFS(content.skills, mustLoadFactions(t, content))
	require.NoError(t, err)

	var defs []*skills.SkillDefinition
	for _, def := range registry.All() {
		if def.ID < 100 {
			defs = append(defs, def)
		}
	}
	require.NotEmpty(t, defs)
	return defs
}

// TestAuraCostDrainIsSurvivableAtLevelOne is the tickInterval trap.
//
// ⚑ A cost is charged ONCE PER APPLICATION, and vitals.HP floors any positive
// amount at 1 HP — the rule that stops small heals vanishing. Together they mean
// a cost on a high-frequency effect is charged at its cadence with a hard 1-HP
// minimum, so on a level-1 pool of 100 an effect that ticks every game tick
// costs *30 HP per second* however small the authored fraction is. That is a
// third of the pool per second against ~1 %/s regen: the skill kills its own
// caster in about three seconds, and the authored number gives no hint of it.
//
// `tickInterval` defaults to 1 when absent (definition.go), which is exactly how
// slow_aura, resist_aura and light_aura are authored today — so the trap is one
// forgotten key away, not a hypothetical.
//
// The bound is the LEVEL-1 drain including the floor, because that is where the
// pool is smallest and the floor bites hardest.
//
// ⚑ And the cadence it measures is NOT the authored tickInterval. applyAuraEffects
// passes the caster's live TickRateFactor into EffectiveTickInterval
// (sys/skills.go), so a haste that halves the interval doubles how often every
// cost on the active aura is charged. Asserting at a hardcoded factor 1 made this
// guard blind to the one live mechanism that moves the very cadence it is about:
// under Haste's authored 0.5, Heal drains 7.5 %/s at skill level 1 and Spearhead
// 7.8 %/s at 10 — both over this bound, with the guard green.
func TestAuraCostDrainIsSurvivableAtLevelOne(t *testing.T) {
	const (
		levelOnePool   = 100.0 // conf.default.json game.player.baseHealth
		maxDrainPerSec = 0.06  // 6 % of the pool per second — ~17 s of uptime from full
	)

	defs := playerSkillDefs(t)
	factor, duty := worstSustainableHaste(defs)

	for _, def := range defs {
		if def.Category != skills.SkillCategoryActiveAura {
			continue // a cooldown pays once per cast; cadence does not apply
		}
		for i := range def.Effects {
			effect := def.Effects[i]
			for level := 1; level <= def.MaxLevel; level++ {
				cost := float64(effect.CostFractionAt(level)) * levelOnePool
				if cost <= 0 {
					continue
				}
				if cost < 1 {
					cost = 1 // vitals.HP's floor — the whole point of this guard
				}
				// Both cadences are taken from EffectiveTickInterval rather than
				// scaled arithmetically, so its rounding and its ≥1 clamp are
				// included: at short intervals a haste buys less than 1/factor.
				interval := float64(skills.EffectiveTickInterval(effect, level, 1))
				hasted := float64(skills.EffectiveTickInterval(effect, level, factor))
				perSec := func(ticks float64) float64 { return cost / levelOnePool * 30 / ticks }
				drain := (1-duty)*perSec(interval) + duty*perSec(hasted)
				assert.LessOrEqualf(t, drain, maxDrainPerSec,
					"%s effect %d (type id %d) drains %.1f%% of a level-1 pool per second at level %d "+
						"(cost %.2f HP every %.0f ticks, every %.0f while hasted %.0f%% of the time) — "+
						"cadence, not the authored fraction, is usually the cause",
					def.Name, i, int(effect.Type), drain*100, level, cost, interval, hasted, duty*100)
			}
		}
	}
}

// worstSustainableHaste derives, from authored content rather than assumption,
// the tick_rate factor a player can hold and the share of the time they can hold
// it — the two numbers that turn an authored cadence into the cadence costs are
// actually charged at.
//
// Peak is deliberately NOT what this feeds: asserting the peak drain against a
// bound scaled by the same factor is the factor-1 assertion restated, and a haste
// window cannot kill anyway (the never-kill clamp parks the caster at 1 HP). What
// decides survivability is the SUSTAINED drain with the haste on cooldown, so the
// caller duty-cycle-weights the two cadences: durationTicks at the hasted rate,
// the rest of the cooldown at the authored one.
//
// Only hastes count. A tick_rate factor above 1 is a slow — it makes costs
// cheaper, and letting one raise the bound would be the guard arguing itself
// down. Buffs multiply across skills (skills.Buffs.TickRateFactor), so factors
// multiply here too, against the longest single duty cycle: exact for the one
// authored haste, deliberately conservative if a second is ever added.
func worstSustainableHaste(defs []*skills.SkillDefinition) (factor float32, duty float64) {
	factor = 1
	for _, def := range defs {
		if def.Category != skills.SkillCategoryCooldown {
			continue
		}
		for i := range def.Effects {
			effect := def.Effects[i]
			if effect.Type != skills.EffectTypeTickRate || effect.TickRate == nil {
				continue
			}
			if effect.TickRate.Factor <= 0 || effect.TickRate.Factor >= 1 {
				continue // a tick-slow, not a haste
			}
			factor *= effect.TickRate.Factor
			d := 1.0
			if def.CooldownTicks > 0 {
				d = float64(effect.TickRate.DurationTicks) / float64(def.CooldownTicks)
			}
			if d > 1 {
				d = 1
			}
			if d > duty {
				duty = d
			}
		}
	}
	return factor, duty
}

// TestNoCostOnAnEffectThatCanNeverBeCharged — an aura pays through
// applyAuraEffect, which only charges when one of its SEVEN dispatched appliers
// reports that the effect landed. An active aura's light_aura has no case in
// that switch, so it can never report landing; a passive never reaches the
// dispatch at all (its effects are aggregated into DerivedStats once).
//
// Authoring a cost on either is inert — the skill reads as priced in the JSON
// and in the tooltip while costing nothing, which is the failure mode that
// survives longest because it looks like a balance opinion rather than a bug.
func TestNoCostOnAnEffectThatCanNeverBeCharged(t *testing.T) {
	chargeable := map[skills.EffectType]bool{
		skills.EffectTypeDamageAura: true,
		skills.EffectTypeHealAura:   true,
		skills.EffectTypeSlowAura:   true,
		skills.EffectTypeResistAura: true,
		skills.EffectTypeDotAura:    true,
		skills.EffectTypeShieldAura: true,
		skills.EffectTypeHotAura:    true,
	}

	for _, def := range playerSkillDefs(t) {
		if def.Category == skills.SkillCategoryCooldown {
			continue // cooldownCostHP sums EVERY effect, whatever its type
		}
		for i := range def.Effects {
			effect := def.Effects[i]
			if def.Category == skills.SkillCategoryActiveAura && chargeable[effect.Type] {
				continue
			}
			for level := 1; level <= def.MaxLevel; level++ {
				assert.Zerof(t, effect.CostFractionAt(level),
					"%s effect %d (type id %d, %s) authors a cost that can never be charged",
					def.Name, i, int(effect.Type), def.Category)
			}
		}
	}
}
