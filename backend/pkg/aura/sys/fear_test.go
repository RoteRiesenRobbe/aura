package sys

// Fear (plan-effect-types-round-2.md C5, D5, D22, D23, L8, L10): the cast
// both ways, through the real doors, and the cast gate.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func fearDef(maxTargets int) *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 166, Name: "TestFear", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 600,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeFear, Radius: 3, MaxTargets: maxTargets, TargetsEnemies: true,
			Fear: &skills.StunParams{DurationTicks: 90},
		}},
	}
}

func TestFear_APlayerFearsTheNearestMob(t *testing.T) {
	space := phy.NewSpace()
	near := mob.NewMob(testMobDef(), 0, nil)
	near.SetPosition(phy.Vec2f{X: 1})
	far := mob.NewMob(testMobDef(), 0, nil)
	far.SetPosition(phy.Vec2f{X: 2})
	addBodies(space, near.Bodies())
	addBodies(space, far.Bodies())
	caster := realCCPlayer(t, phy.Vec2f{})
	s := NewSkillSystem(space, newFakeGame())
	s.rng = testRNG()
	space.Update()

	require.True(t, s.applyFear(caster, 166, 1, fearDef(1).Effects[0]))

	assert.True(t, near.Feared())
	assert.False(t, far.Feared(), "capped at one, nearest first")
	assert.NotZero(t, near.AppliedEffects()&skills.AppliedEffectFear, "the pip bit")
}

func TestFear_AMobFearsARealPlayer(t *testing.T) {
	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: fearDef(0), Level: 1}}
	caster := mob.NewMob(casterDef, 0, nil)
	caster.SetPosition(phy.Vec2f{})
	space := phy.NewSpace()
	addBodies(space, caster.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 1})
	addBodies(space, p.Bodies())
	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	sk.AddEntity(caster)

	worldTick(space, sk, caster, p.(ccTickable))

	assert.True(t, p.(model.Fearable).Feared(), "D5: mobs fear players")
	assert.NotZero(t, caster.SkillComponent().SlotCooldownRemaining(0), "consumed on the hit")
	_, reason := p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedFeared, reason, "the landing is noted")
}

// D22: a feared caster casts nothing, the stun gate's rule.
func TestFear_AFearedMobCastsNothing(t *testing.T) {
	casterDef := testMobDef()
	casterDef.Skills = []mobs.MobSkill{{Def: fearDef(0), Level: 1}}
	caster := mob.NewMob(casterDef, 0, nil)
	space := phy.NewSpace()
	addBodies(space, caster.Bodies())
	p := realCCPlayer(t, phy.Vec2f{X: 1})
	addBodies(space, p.Bodies())
	sk := NewSkillSystem(space, newFakeGame())
	sk.rng = testRNG()
	sk.AddEntity(caster)
	require.True(t, caster.ApplyFear(1, p, 90))

	worldTick(space, sk, caster, p.(ccTickable))

	assert.False(t, p.(model.Fearable).Feared())
	assert.Zero(t, caster.SkillComponent().SlotCooldownRemaining(0), "held, nothing fired")
}
