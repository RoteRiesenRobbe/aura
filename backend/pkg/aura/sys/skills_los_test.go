package sys

// LoS prototype behavior tests (docs/plan-prototype-aura-los.md §6 step 2):
// a blocking prop between caster and target must stop aura effects and
// instant deliveries; the same setup without the prop (or with it beside the
// sightline) must land. The ray predicate itself is pinned in
// phy/los_test.go; these tests pin the funnel wiring.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// losSpace wires an aura sensor + target like spaceWithAuraAndTargetAt, but
// returns the space too, so the test's SkillSystem runs its LoS queries
// against the same space the sensor lives in.
func losSpace(t *testing.T, targetPos phy.Vec2f, targetUserData any) (*phy.Space, *phy.Circle) {
	t.Helper()

	aura := phy.NewCircle(phy.VEC2F_ZERO, 1.0)
	aura.Shape().IsSensor = true
	aura.Shape().Layer = int(model.LayerNoneCollision)
	aura.Shape().Mask = int(model.LayerPlayerCollision | model.LayerActionCollision)

	target := phy.NewCircle(targetPos, 0.25)
	target.Shape().IsSensor = true
	target.Shape().Layer = int(model.LayerActionCollision)
	target.Shape().UserData = targetUserData

	space := phy.NewSpace()
	space.AddShape(aura)
	space.AddShape(target)
	space.Update()

	require.NotEmpty(t, aura.Collisions(), "physics setup must produce a collision")
	return space, aura
}

// blockingProp drops a static circle on the movement-blocking layers, exactly
// like model/prop.New does for a blocksMovement prop.
func blockingProp(space *phy.Space, pos phy.Vec2f, radius float32) {
	prop := phy.NewCircle(pos, radius)
	prop.Shape().Layer = int(model.LayerPlayerStaticCollision | model.LayerMobStaticCollision | model.LayerViewportCollision)
	space.AddStaticShape(prop)
}

func losDamageAuraDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 99, Name: "TestAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Radius: 1.0, TickInterval: 1,
			Damage: &skills.DamageParams{HP: 10},
		}},
	}
}

func losCaster(t *testing.T, space *phy.Space, aura *phy.Circle) (*fakePlayer, *SkillSystem) {
	t.Helper()

	caster := newFakePlayer()
	caster.aura = aura
	caster.sc.EquipAura(0, losDamageAuraDef(), 1)
	caster.sc.SetActiveAura(0)

	s := NewSkillSystem(space, nil)
	s.rng = testRNG()
	return caster, s
}

func TestProcessEntity_PropBetweenBlocksAuraEffect(t *testing.T) {
	target := &touchRecorder{}
	space, aura := losSpace(t, phy.Vec2f{X: 0.8, Y: 0}, target)
	blockingProp(space, phy.Vec2f{X: 0.4, Y: 0}, 0.15)

	caster, s := losCaster(t, space, aura)
	s.processEntity(caster)

	assert.Empty(t, target.touches, "a blocking prop between caster and target must stop the aura")
}

func TestProcessEntity_PropBesideSightlineDoesNotBlock(t *testing.T) {
	// Control for the test above: same prop, off the sightline.
	target := &touchRecorder{}
	space, aura := losSpace(t, phy.Vec2f{X: 0.8, Y: 0}, target)
	blockingProp(space, phy.Vec2f{X: 0.4, Y: 0.6}, 0.15)

	caster, s := losCaster(t, space, aura)
	s.processEntity(caster)

	require.Len(t, target.touches, 1, "a prop beside the sightline must not block the aura")
}

func TestProcessEntity_PropBetweenBlocksHealAura(t *testing.T) {
	// Effect-agnosticism (scope: all effects): the same prop stops a heal.
	ally := newFakePlayer()
	ally.vitalSigns.Health = 50
	start := ally.vitalSigns.Health
	space, aura := losSpace(t, phy.Vec2f{X: 0.8, Y: 0}, model.PlayerEntity(ally))
	blockingProp(space, phy.Vec2f{X: 0.4, Y: 0}, 0.15)

	caster := newFakePlayer()
	caster.aura = aura
	def := &skills.SkillDefinition{
		ID: 98, Name: "TestHeal", Category: skills.SkillCategoryActiveAura, MaxLevel: 5,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeHealAura, TargetsAllies: true, Radius: 1.0, TickInterval: 1,
			Heal: &skills.HealParams{HP: 10},
		}},
	}
	caster.sc.EquipAura(0, def, 1)
	caster.sc.SetActiveAura(0)

	s := NewSkillSystem(space, nil)
	s.rng = testRNG()
	s.processEntity(caster)

	assert.Equal(t, start, ally.vitalSigns.Health, "a blocking prop between caster and ally must stop the heal")
}

func TestQueryInstantTargets_PropBetweenExcludesHit(t *testing.T) {
	target := &touchRecorder{}
	space, aura := losSpace(t, phy.Vec2f{X: 0.8, Y: 0}, target)

	caster := newFakePlayer()
	caster.aura = aura
	effect := skills.EffectDef{
		Type: skills.EffectTypeInstantDamage, TargetsEnemies: true, Radius: 1.0,
		Damage: &skills.DamageParams{HP: 10},
	}
	s := NewSkillSystem(space, nil)

	require.Len(t, s.queryInstantTargets(caster, effect, 1), 1,
		"without a prop the instant delivery reaches the target")

	blockingProp(space, phy.Vec2f{X: 0.4, Y: 0}, 0.15)
	assert.Empty(t, s.queryInstantTargets(caster, effect, 1),
		"a blocking prop between caster and target must exclude the instant hit")
}
