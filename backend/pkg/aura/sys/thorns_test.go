package sys

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Thorns on others (plan-effect-types-round-2.md C2, D16): retaliate_burst
// takes the speed_burst shape. The self half is Retribution's, unchanged; the
// ally half is a one-shot capped query circle.

type appliedReflect struct {
	source   skills.SkillID
	fraction float32
	ticks    int
}

// reflectTarget records ApplyReflect calls on a real buff store.
type reflectTarget struct {
	model.MobEntity
	basic    ecs.BasicEntity
	faction  model.Faction
	reflects []appliedReflect
	buffs    skills.Buffs
}

func (r *reflectTarget) Basic() ecs.BasicEntity { return r.basic }
func (r *reflectTarget) Faction() model.Faction { return r.faction }
func (r *reflectTarget) ApplyReflect(source skills.SkillID, fraction float32, tags []string, ticks int) {
	r.reflects = append(r.reflects, appliedReflect{source, fraction, ticks})
	r.buffs.ApplyReflect(source, fraction, tags, ticks)
}
func (r *reflectTarget) ReflectBurst() (skills.SkillID, float32, []string) {
	return r.buffs.ReflectBurst()
}

func (f *fakePlayer) ReflectBurst() (skills.SkillID, float32, []string) {
	return f.buffs.ReflectBurst()
}

func thornsDef() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 204, Name: "Thorns", Category: skills.SkillCategoryCooldown, MaxLevel: 5,
		CooldownTicks: 600,
		Effects: []skills.EffectDef{{
			Type:          skills.EffectTypeRetaliateBurst,
			Radius:        4,
			Selector:      skills.SelectorNearest,
			MaxTargets:    1,
			TargetsAllies: true,
			RetaliateBurst: &skills.RetaliateBurstParams{
				Fraction: 0.3, FractionPerLevel: 0.05, DurationTicks: 300,
				Tags: []string{"nature"},
			},
		}},
	}
}

func TestCooldown_ThornsReflectBuffsTheAllyNotTheCaster(t *testing.T) {
	ally := &reflectTarget{basic: ecs.NewBasic(), faction: model.FactionAligned}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), ally))
	caster.sc.EquipCooldown(0, thornsDef(), 3)
	caster.sc.RequestCooldownActivation(0)

	sk.Update(33.0)

	require.Len(t, ally.reflects, 1)
	got := ally.reflects[0]
	assert.Equal(t, skills.SkillID(204), got.source)
	assert.InDelta(t, 0.4, got.fraction, 1e-6, "level 3 = 0.3 + 2×0.05")
	assert.Equal(t, 300+1, got.ticks, "the ally half: authored window + 1, the speed_burst rule")
	_, own, _ := caster.ReflectBurst()
	assert.Zero(t, own, "no targetsSelf, no reflect on the caster")
}

func TestCooldown_ThornsNeverReachesAnEnemy(t *testing.T) {
	enemy := &reflectTarget{basic: ecs.NewBasic(), faction: model.FactionHostile}
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), enemy))

	assert.False(t, sk.applyRetaliateBurst(caster, 204, 1, thornsDef().Effects[0]),
		"an ally-only burst with only an enemy in range is a whiff (a mob keeps the cooldown)")
	assert.Empty(t, enemy.reflects)
}

// The self half stays Retribution's: the authored window exactly, no +1.
func TestApplyRetaliateBurst_SelfHalfKeepsTheAuthoredWindow(t *testing.T) {
	caster, sk := cooldownCaster(spaceWithBurstTarget(int(model.LayerActionCollision), nil))
	effect := thornsDef().Effects[0]
	effect.TargetsAllies = false
	effect.RetaliateBurst.TargetsSelf = true

	assert.True(t, sk.applyRetaliateBurst(caster, 204, 1, effect), "the self-apply counts as a hit")
	_, fraction, tags := caster.ReflectBurst()
	assert.InDelta(t, 0.3, fraction, 1e-6)
	assert.Equal(t, []string{"nature"}, tags)
}
