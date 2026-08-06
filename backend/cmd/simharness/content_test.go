package main

// auraSpecOf mapping pins (farm-band bite+venom pass 2026-07-22). The
// guardrail battery asserts on these specs, so a mapping that silently drops
// half a mob's output is worse than no mapping at all: an aura carrying BOTH
// a direct hit and a dot must be modelled as both, and anything the
// single-aura AuraSpec cannot express must be a loud error.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

func auraDef(effects ...skills.EffectDef) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID:       1,
		Name:     "TestAura",
		Category: skills.SkillCategoryActiveAura,
		MaxLevel: 5,
		Effects:  effects,
	}
}

func directEffect(hp float32) skills.EffectDef {
	return skills.EffectDef{
		Type: skills.EffectTypeDamageAura, Radius: 1.6, TickInterval: 40, MaxTargets: 2,
		TargetsEnemies: true,
		Damage:         &skills.DamageParams{HP: hp, Variance: 0.15},
	}
}

func dotEffect(hp float32) skills.EffectDef {
	return skills.EffectDef{
		Type: skills.EffectTypeDotAura, Radius: 1.6, TickInterval: 40, MaxTargets: 2,
		TargetsEnemies: true,
		Dot:            &skills.DotParams{HP: hp, Variance: 0.15, TickCount: 5, Interval: 45},
	}
}

func TestAuraSpecOf_DotOnly(t *testing.T) {
	spec, err := auraSpecOf(auraDef(dotEffect(6)), 1, 2)
	require.NoError(t, err)

	assert.Equal(t, float32(12), spec.DamageHP, "dot-only shorthand: DamageHP carries the dot, × powerScale")
	assert.Zero(t, spec.DotHP)
	assert.Equal(t, 5, spec.DotTicks)
	assert.Equal(t, 45, spec.DotTickInterval)
	assert.False(t, spec.HasDirect())
}

func TestAuraSpecOf_DirectOnly(t *testing.T) {
	spec, err := auraSpecOf(auraDef(directEffect(3.5)), 1, 2)
	require.NoError(t, err)

	assert.Equal(t, float32(7), spec.DamageHP)
	assert.Zero(t, spec.DotTicks)
	assert.True(t, spec.HasDirect())
}

// The GiantVenomSpit shape: both payloads land, so both are modelled.
func TestAuraSpecOf_DirectAndDot(t *testing.T) {
	spec, err := auraSpecOf(auraDef(directEffect(3.5), dotEffect(6)), 1, 2)
	require.NoError(t, err)

	assert.Equal(t, float32(7), spec.DamageHP, "the bite")
	assert.Equal(t, float32(12), spec.DotHP, "the venom")
	assert.Equal(t, 5, spec.DotTicks)
	assert.True(t, spec.HasDirect())
	assert.Equal(t, float32(12), spec.DotPayloadHP())

	assert.Equal(t, 40, spec.TickInterval)
	assert.Equal(t, float32(1.6), spec.Radius)
	assert.Equal(t, 2, spec.MaxTargets)
}

// Effect order in the JSON must not change the mapping.
func TestAuraSpecOf_DirectAndDot_OrderIndependent(t *testing.T) {
	a, err := auraSpecOf(auraDef(directEffect(3.5), dotEffect(6)), 1, 1)
	require.NoError(t, err)
	b, err := auraSpecOf(auraDef(dotEffect(6), directEffect(3.5)), 1, 1)
	require.NoError(t, err)

	assert.Equal(t, a, b)
}

// The live mob owns ONE aura sensor sized to the max radius across effects,
// and selection filters by that sensor rather than per effect — so a smaller
// authored radius does not mean what it looks like. Reject, never model.
func TestAuraSpecOf_RejectsDivergentGeometry(t *testing.T) {
	narrow := directEffect(3.5)
	narrow.Radius = 1.0

	_, err := auraSpecOf(auraDef(narrow, dotEffect(6)), 1, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "radius")
}

// WarlordCleave's shape: a 35-tick sweep on 3 targets plus a 50-tick bleed on
// 1. Divergent cadence and target count are real authored content and must be
// modelled faithfully, not rejected — this is exactly what the old
// firstDamageEffect mapping dropped on the floor.
func TestAuraSpecOf_ModelsDivergentCadenceAndTargets(t *testing.T) {
	sweep := directEffect(20)
	sweep.TickInterval = 35
	sweep.MaxTargets = 3
	bleed := dotEffect(6)
	bleed.TickInterval = 50
	bleed.MaxTargets = 1

	spec, err := auraSpecOf(auraDef(sweep, bleed), 1, 1)
	require.NoError(t, err)

	assert.Equal(t, 35, spec.TickInterval)
	assert.Equal(t, 3, spec.MaxTargets)
	assert.Equal(t, 50, spec.DotApplyCadence())
	assert.Equal(t, 1, spec.DotTargetCap())
	assert.Equal(t, float32(20), spec.DamageHP)
	assert.Equal(t, float32(6), spec.DotHP)
}

// A dot re-applied slower than it lasts leaves uptime gaps the steady-state
// sustained model silently ignores.
func TestAuraSpecOf_RejectsDotSlowerThanItsLifetime(t *testing.T) {
	gappy := dotEffect(6)
	gappy.TickInterval = 500 // lifetime is 5 × 45 = 225 ticks

	_, err := auraSpecOf(auraDef(gappy), 1, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "continuous uptime")
}

func TestAuraSpecOf_RejectsTwoDirectPayloads(t *testing.T) {
	_, err := auraSpecOf(auraDef(directEffect(3.5), directEffect(2)), 1, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "two damage_aura payloads")
}

func TestAuraSpecOf_NoDamagePayload(t *testing.T) {
	light := skills.EffectDef{Type: skills.EffectTypeLightAura, Radius: 4}

	_, err := auraSpecOf(auraDef(light), 1, 1)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no damage_aura or dot_aura")
}

// The authored spider must survive the mapping with both payloads intact —
// the disk pin for this pass.
func TestMobSpecOf_GiantSpiderCarriesBiteAndVenom(t *testing.T) {
	defs, _, err := loadContent("")
	require.NoError(t, err)

	var spider *mobs.MobDefinition
	for _, d := range defs {
		if d.Name == "GiantSpider" {
			spider = d
			break
		}
	}
	require.NotNil(t, spider, "GiantSpider must exist in content")

	spec, err := mobSpecOf(spider, spider.CurveLevel)
	require.NoError(t, err)

	assert.Greater(t, spec.Aura.DamageHP, float32(0), "the bite lands on the aura tick")
	assert.Greater(t, spec.Aura.DotHP, float32(0), "the venom lands on top")
	assert.True(t, spec.Aura.HasDirect())
	assert.Greater(t, spec.Speed, float32(0.9), "it must out-walk the player to land any of it")
}
