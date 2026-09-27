package sim

// AuraSpec → skills.SkillDefinition mapping (farm-band bite+venom pass
// 2026-07-22): a mob aura may carry a direct hit AND a dot at once — the
// GiantSpider shape. Before this, DotTicks > 0 CONVERTED the single effect
// into a dot and dropped the direct damage on the floor, so any authored
// two-payload aura was silently modelled at half its output.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefinition_DamageOnly(t *testing.T) {
	def := AuraSpec{DamageHP: 14, TickInterval: 40, Radius: 1.1, Variance: 0.15, MaxTargets: 1}.
		definition(1, "X")

	assert.Len(t, def.Effects, 1)
	assert.Equal(t, skills.EffectTypeDamageAura, def.Effects[0].Type)
	assert.NotNil(t, def.Effects[0].Damage)
	assert.Nil(t, def.Effects[0].Dot)
	assert.Equal(t, float32(14), def.Effects[0].Damage.HP)
}

// A dot-only spec keeps the long-standing shorthand: DamageHP is the dot's
// per-event HP when no explicit DotHP is given. Every C8 roster preset and
// every authored dot mob relies on this.
func TestDefinition_DotOnly_DamageHPIsTheDotPayload(t *testing.T) {
	def := AuraSpec{DamageHP: 6, TickInterval: 50, Radius: 1.6, DotTicks: 5, DotTickInterval: 45}.
		definition(1, "X")

	assert.Len(t, def.Effects, 1)
	assert.Equal(t, skills.EffectTypeDotAura, def.Effects[0].Type)
	assert.Nil(t, def.Effects[0].Damage)
	if assert.NotNil(t, def.Effects[0].Dot) {
		assert.Equal(t, float32(6), def.Effects[0].Dot.HP)
		assert.Equal(t, 5, def.Effects[0].Dot.TickCount)
		assert.Equal(t, 45, def.Effects[0].Dot.Interval)
	}
}

// Both payloads: two effects on one skill, exactly like the authored
// GiantVenomSpit JSON. DotHP carries the dot, DamageHP the direct hit.
func TestDefinition_DirectAndDot(t *testing.T) {
	def := AuraSpec{
		DamageHP: 3.5, DotHP: 6,
		TickInterval: 40, Radius: 1.6, Variance: 0.15, MaxTargets: 2,
		DotTicks: 5, DotTickInterval: 45,
	}.definition(1, "X")

	if !assert.Len(t, def.Effects, 2) {
		return
	}

	direct, dot := def.Effects[0], def.Effects[1]
	assert.Equal(t, skills.EffectTypeDamageAura, direct.Type)
	if assert.NotNil(t, direct.Damage) {
		assert.Equal(t, float32(3.5), direct.Damage.HP)
	}
	assert.Nil(t, direct.Dot)

	assert.Equal(t, skills.EffectTypeDotAura, dot.Type)
	if assert.NotNil(t, dot.Dot) {
		assert.Equal(t, float32(6), dot.Dot.HP)
		assert.Equal(t, 5, dot.Dot.TickCount)
	}
	assert.Nil(t, dot.Damage)

	// Both payloads share the aura's geometry and application cadence — the
	// modelling contract the harness enforces on authored content.
	for _, e := range def.Effects {
		assert.Equal(t, float32(1.6), e.Radius)
		assert.Equal(t, 40, e.TickInterval)
		assert.Equal(t, 2, e.MaxTargets)
		assert.True(t, e.TargetsEnemies)
	}
}

// f(level) inflates HP VALUES ONLY — and the dot payload is an HP value, so
// it rides the curve exactly like the direct hit (§5).
func TestMobAt_ScalesBothDamagePayloads(t *testing.T) {
	fx := baselineFixture()
	fx.Mob.Aura = AuraSpec{DamageHP: 10, DotHP: 20, TickInterval: 40, Radius: 1.6, DotTicks: 5, DotTickInterval: 45}

	m := fx.MobAt(2)
	f := fx.Curve.F(2)

	assert.InDelta(t, 10*f, float64(m.Aura.DamageHP), 0.001)
	assert.InDelta(t, 20*f, float64(m.Aura.DotHP), 0.001)
	assert.Equal(t, 5, m.Aura.DotTicks, "dot cadence is not an HP value — never scaled")
	assert.Equal(t, float32(1.6), m.Aura.Radius, "geometry is never scaled")
}

func TestPlayerAt_ScalesBothDamagePayloads(t *testing.T) {
	fx := baselineFixture()
	fx.Player.Aura = AuraSpec{DamageHP: 10, DotHP: 20, TickInterval: 40, Radius: 1.1, DotTicks: 4, DotTickInterval: 60}

	p := fx.PlayerAt(3)
	f := fx.Curve.F(3)

	assert.InDelta(t, 10*f, float64(p.Aura.DamageHP), 0.001)
	assert.InDelta(t, 20*f, float64(p.Aura.DotHP), 0.001)
}

// The sim knob (plan-aura-drawbacks.md D6): a selfModifier on the aura folds
// through the real SkillComponent while the aura is active, so it moves a TTK
// with no re-modelled math. +100 % damage dealt halves exactPlayer's four
// hits to two: death on tick 6 instead of 12.
func TestSelfModifier_MovesTheTTK(t *testing.T) {
	p := exactPlayer()
	p.Aura.SelfModifier = map[string]float32{"damageDealt": 1}

	r := RunFight(TTK(p, turretMob(0, 1), 0.5), 1)

	assert.Equal(t, OutcomeMobDied, r.Outcome)
	assert.Equal(t, 6, r.Ticks)
}

// A drawback on the player's aura is the fold the live game runs: a -0.4
// maxHealth modifier shrinks the sim player's pool while the aura is on.
func TestSelfModifier_ShrinksThePoolWhileActive(t *testing.T) {
	p := exactPlayer()
	p.Aura.SelfModifier = map[string]float32{"maxHealth": -0.4}

	w := NewWorld(TTK(p, turretMob(0, 1), 0.5), 1)

	assert.EqualValues(t, 60, w.Player.MaxHealth())
}

// An unknown stat is an error, never a silent drop.
func TestSelfModifier_UnknownStatIsAnError(t *testing.T) {
	a := exactPlayer().Aura
	a.SelfModifier = map[string]float32{"movmentSpeed": -0.2}

	err := a.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "movmentSpeed")
	assert.Panics(t, func() { a.definition(1, "X") }, "the world builder refuses it too")

	a.SelfModifier = map[string]float32{"movementSpeed": -0.2}
	assert.NoError(t, a.Validate())
}
