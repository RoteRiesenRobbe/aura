package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Content guards for the MAINTAINED buffs — resist, slow and shield, the three
// aura effects whose applier authors the buff lifetime as
// `effectiveTickInterval(effect, level) + 1` rather than reading it from JSON
// (sys/skills.go). R3/F5 moved four of them onto a slower shared beat, and the
// PO's condition on that ruling was explicit: a permanent debuff must stay
// permanent — checked, not assumed.

// maintainedBuffTypes are the effect types whose lifetime the apply site derives
// from the cadence. dot_aura and hot_aura are deliberately absent: they author
// their own lifetime, which is why theirs is pinned at the LOADER instead
// (skills.checkOverTimeLifetime).
var maintainedBuffTypes = map[skills.EffectType]bool{
	skills.EffectTypeResistAura: true,
	skills.EffectTypeSlowAura:   true,
	skills.EffectTypeShieldAura: true,
}

// TestMaintainedBuffsNeverExpireOnATargetInRange is the F5 condition.
//
// The lifetime is derived at factor 1.0 on purpose — haste must not shorten a
// buff — while the FIRING cadence takes the caster's live TickRateFactor. A
// haste (< 1) fires sooner than the lifetime, which is safe. A tick-SLOW (> 1)
// fires later than the lifetime, and then the buff expires between applications:
// the mob is briefly free, the pip blinks, and nothing in the engine complains.
//
// No content authors a tick-slow today, so this passes at factor 1 — which is
// the point. It is a tombstone: the first tick_rate effect authored above 1
// turns a silent, intermittent gameplay bug into a failing test, at the moment
// the number is written rather than the moment a player notices flickering.
func TestMaintainedBuffsNeverExpireOnATargetInRange(t *testing.T) {
	defs := playerSkillDefs(t)
	factor := worstAuthoredTickSlow(defs)

	for _, def := range defs {
		if def.Category != skills.SkillCategoryActiveAura {
			continue // a cooldown applies once; there is no next application to survive to
		}
		for i := range def.Effects {
			effect := def.Effects[i]
			if !maintainedBuffTypes[effect.Type] {
				continue
			}
			for level := 1; level <= def.MaxLevel; level++ {
				lifetime := skills.EffectiveTickInterval(effect, level, 1) + 1
				fired := skills.EffectiveTickInterval(effect, level, factor)
				assert.Greaterf(t, lifetime, fired,
					"%s effect %d (type id %d) at level %d: the buff lives %d ticks but is re-applied every %d "+
						"(tick-rate factor %.2f) — it expires between applications, so a debuff the player "+
						"experiences as permanent blinks instead",
					def.Name, i, int(effect.Type), level, lifetime, fired, factor)
			}
		}
	}
}

// worstAuthoredTickSlow is worstSustainableHaste's mirror: the largest tick_rate
// factor ABOVE 1 the content can produce, which is the direction that lengthens
// the gap between applications. Factors multiply (skills.Buffs.TickRateFactor),
// so they multiply here too. Returns 1 when no tick-slow is authored — the
// neutral cadence, which is today's answer.
func worstAuthoredTickSlow(defs []*skills.SkillDefinition) float32 {
	var factor float32 = 1
	for _, def := range defs {
		for i := range def.Effects {
			effect := def.Effects[i]
			if effect.Type != skills.EffectTypeTickRate || effect.TickRate == nil {
				continue
			}
			if effect.TickRate.Factor > 1 {
				factor *= effect.TickRate.Factor
			}
		}
	}
	return factor
}

// TestSlowAuraResponsivenessIsWithinTheRuledBound pins the OTHER half of the F5
// condition — the half that is a real behavioural cost, not a bug.
//
// Moving a slow off the default 1-tick cadence buys the cost system a beat it can
// charge sanely and pays for it in responsiveness at both edges: a mob entering
// the ring walks unslowed for up to one full interval, and a mob leaving stays
// slowed for interval + 1 after it is out. The PO ruled the trade acceptable at
// the 40-tick damage beat (~1.3 s). This asserts the bound rather than the exact
// value, so a future cadence change inside it is free and one past it has to be
// argued for — with the real numbers in the failure message.
func TestSlowAuraResponsivenessIsWithinTheRuledBound(t *testing.T) {
	// ~1.3 s at 30 ticks/s: the damage beat every slow-carrying aura now shares.
	const maxRuledInterval = 40

	defs := playerSkillDefs(t)
	seen := 0
	for _, def := range defs {
		if def.Category != skills.SkillCategoryActiveAura {
			continue
		}
		for i := range def.Effects {
			effect := def.Effects[i]
			if effect.Type != skills.EffectTypeSlowAura {
				continue
			}
			seen++
			for level := 1; level <= def.MaxLevel; level++ {
				interval := skills.EffectiveTickInterval(effect, level, 1)
				assert.LessOrEqualf(t, interval, maxRuledInterval,
					"%s effect %d at level %d re-applies its slow every %d ticks (%.2f s): a mob entering the "+
						"ring is unslowed that long, and one leaving stays slowed %d ticks after it is out",
					def.Name, i, level, interval, float64(interval)/30, interval+1)
			}
		}
	}
	require.Equal(t, 4, seen, "the authored slow auras are Slow, Suppression, Warbanner and the "+
		"limit-test OmniAura (interval 40, exactly on the bound) — "+
		"a new one must be looked at through this bound, and a removed one is worth noticing")
}
