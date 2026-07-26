package mob

// Chunk 1a of plan-entity-model.md ("the Actor model"): the three
// stat_multiplier passives that used to be read only by player code paths now
// apply to any actor carrying a SkillComponent.
//
// ⚑ These pins assert on BEHAVIOUR — HP pool, damage taken, distance moved —
// never on Derived (landmine L6): recomputeDerived is a SkillComponent method
// and has always populated Derived.* correctly for mobs, so a test asserting
// on Derived passes while the behaviour is entirely absent.

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/curve"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/vitals"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// statPassive is a one-effect passive granting a flat stat bonus at level 1 —
// the shape of the authored Hardy / Tough / Swift passives.
func statPassive(name string, bonus float32) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 198, Name: "TestStatPassive", Category: skills.SkillCategoryPassive, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeStatMultiplier,
			Stat: &skills.StatParams{Name: name, Bonus: bonus},
		}},
	}
}

// mobWithPool builds a test mob with an explicit absolute HP pool.
func mobWithPool(hp uint32) *Mob {
	d := testMobDefinition()
	d.Factors.BaseMaxHealth = hp
	return NewMob(d, 0, nil)
}

// game.mob.walkingSpeedPerTick (gap 2 remainder): the base step was a bare
// 0.055 in the constructor under a standing TODO. It is now a conf knob under
// the player's name and unit — and the VALUE is preserved, because every
// authored factors.speed is tuned against it (landmine L1).

func TestMob_VelocityFollowsConfiguredWalkingSpeedPerTick(t *testing.T) {
	t.Cleanup(func() { SetWalkingSpeedPerTick(0) }) // 0 restores the built-in default

	assert.InDelta(t, 0.055, float64(newTestMob().velocity), 1e-9,
		"factors.speed 1.0 × the built-in default — the pre-knob hardcoded value")

	SetWalkingSpeedPerTick(0.1)
	assert.InDelta(t, 0.1, float64(newTestMob().velocity), 1e-7,
		"consumed at construction: a mob spawned after the change walks at the new rate")
}

func TestSetWalkingSpeedPerTick_NonPositiveKeepsBuiltInDefault(t *testing.T) {
	t.Cleanup(func() { SetWalkingSpeedPerTick(0) })

	SetWalkingSpeedPerTick(0.1)
	SetWalkingSpeedPerTick(0) // absent in conf.json → the default must survive
	assert.Equal(t, defaultMobWalkingSpeedPerTick, walkingSpeedPerTick)

	SetWalkingSpeedPerTick(-1)
	assert.Equal(t, defaultMobWalkingSpeedPerTick, walkingSpeedPerTick)
}

func TestMob_MaxHealthPassive_RaisesThePool(t *testing.T) {
	m := mobWithPool(100)
	require.Equal(t, vitals.VitalSign(100), m.MaxHealth(), "baseline pool")

	m.SkillComponent().EquipPassive(0, statPassive(skills.StatMaxHealth, 0.5), 1)

	assert.Equal(t, vitals.VitalSign(150), m.MaxHealth(), "+50% max health")
	// The cap moved, not just the getter: the mob can now heal into the
	// widened pool (spawn health is the base pool).
	assert.Equal(t, vitals.VitalSign(50), m.Heal(80), "heals up to the new cap")
	assert.Equal(t, vitals.VitalSign(150), m.Health())
}

func TestMob_DamageReductionPassive_ReducesDamageTaken(t *testing.T) {
	plain := mobWithPool(100)
	plain.takeDamage(model.Damage{HP: 40}, model.StatusEffectDamagedAmbient)
	require.Equal(t, vitals.VitalSign(60), plain.Health(), "baseline: full 40 lands")

	tough := mobWithPool(100)
	tough.SkillComponent().EquipPassive(0, statPassive(skills.StatDamageReduction, 0.25), 1)
	tough.takeDamage(model.Damage{HP: 40}, model.StatusEffectDamagedAmbient)

	assert.Equal(t, vitals.VitalSign(70), tough.Health(), "40 × (1 − 0.25) = 30 lands")
}

// Level + PowerScale (gap 3): a mob evaluates the SAME curve the player does,
// now at a level it can name. Behaviour today is unchanged — the value equals
// the one the registry froze into definition.PowerScale — but the derivation
// is what chunk 1b makes dynamic.
func TestMob_PowerScale_IsFOfItsLevel(t *testing.T) {
	d := testMobDefinition()
	neutral := NewMob(d, 0, nil)
	assert.Equal(t, 1, neutral.Level(), "an unauthored curveLevel is the baseline")
	assert.InDelta(t, 1.0, neutral.PowerScale(), 1e-9,
		"a definition without a curve (sim harness, tests) stays neutral")

	d = testMobDefinition()
	d.CurveLevel = 5
	d.Curve = curve.Curve{Growth: 1.12, MaxLevel: 30}
	scaled := NewMob(d, 0, nil)

	assert.Equal(t, 5, scaled.Level())
	assert.InDelta(t, math.Pow(1.12, 4), float64(scaled.PowerScale()), 1e-6, "f(5) = growth⁴")
}

func TestMob_MovementSpeedPassive_MovesFarther(t *testing.T) {
	far := phy.Vec2f{X: 100, Y: 0}

	plain := newTestMob()
	plain.SetPosition(phy.VEC2F_ZERO)
	plain.moveTowards(far)
	base := plain.Position().X
	require.Greater(t, base, float32(0), "baseline: the mob moves at all")

	swift := newTestMob()
	swift.SetPosition(phy.VEC2F_ZERO)
	swift.SkillComponent().EquipPassive(0, statPassive(skills.StatMovementSpeed, 0.5), 1)
	swift.moveTowards(far)

	assert.InDelta(t, float64(base*1.5), float64(swift.Position().X), 1e-5,
		"+50% movement speed is a longer step, and it rides the CONSUMPTION site "+
			"(stepLength) so a later-equipped passive is not frozen into velocity")
}
