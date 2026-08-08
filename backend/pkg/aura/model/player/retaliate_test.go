package player

// The retaliate trigger (docs/archive/plan-cc-and-retaliation.md C2, A4): while the
// FrostShield passive is equipped, any mob that damages the player is slowed.
//
// ⚑ `MobTouches` is the trigger site because it is the ONE place both
// mob→player damage paths funnel through — direct damage-aura hits AND mob DoT
// ticks, the latter dispatched with the DoT's caster. That was checked
// specifically: a DoT that credited only a SkillID would have left "every mob
// that hits you" with a hole in it.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const retaliateSource = skills.SkillID(200)

// slowableAttacker is a mob that records what was done to it. It implements
// only the slice of model.MobEntity the trigger needs plus ApplySlow — the
// embedded nil interface is the tripwire for anything else.
type slowableAttacker struct {
	model.MobEntity
	sources   []skills.SkillID
	fractions []float32
	ticks     []int
}

func (a *slowableAttacker) ApplySlow(source skills.SkillID, fraction float32, ticks int) bool {
	a.sources = append(a.sources, source)
	a.fractions = append(a.fractions, fraction)
	a.ticks = append(a.ticks, ticks)
	return true
}

// plainAttacker carries no ApplySlow at all — a structure, or a mob type that
// never gained the door. The trigger must skip it silently.
type plainAttacker struct{ model.MobEntity }

var retaliatePassive = &skills.SkillDefinition{
	ID:       retaliateSource,
	Name:     "FrostShield",
	Category: skills.SkillCategoryPassive,
	MaxLevel: 5,
	Effects: []skills.EffectDef{{
		Type:      skills.EffectTypeRetaliateSlow,
		Retaliate: &skills.RetaliateParams{Fraction: 0.1, FractionPerLevel: 0.05, DurationTicks: 150},
	}},
}

// hittablePlayer is newTestPlayer plus the two things takeDamage needs that
// the bare fixture leaves nil — the status-effect sets it stamps a damage tag
// into. MobTouches goes all the way through the real damage path here on
// purpose: a retaliate that only works when nothing else does is not the
// mechanic.
func hittablePlayer(t *testing.T) *player {
	t.Helper()
	p := newTestPlayer(nil)
	p.statusEffects = model.NewStatusEffects()
	p.newStatusEffects = model.NewStatusEffects()
	return p
}

// wearer returns a player with the passive equipped at the given level.
func wearer(t *testing.T, level int) *player {
	t.Helper()
	p := hittablePlayer(t)
	p.skills.EquipPassive(0, retaliatePassive, level)
	require.NotZero(t, p.skills.Derived.RetaliateSlow.Fraction, "precondition: the passive is on")
	return p
}

func TestRetaliate_SlowsTheMobThatHitYou(t *testing.T) {
	p := wearer(t, 3)
	mob := &slowableAttacker{}

	p.MobTouches(mob, mobs.Factors{Damage: 5})

	require.Len(t, mob.fractions, 1, "the attacker is slowed exactly once per hit")
	assert.InDelta(t, 0.2, mob.fractions[0], 1e-6, "level 3: 0.1 + 2×0.05")
	assert.Equal(t, 150, mob.ticks[0])
	assert.Equal(t, retaliateSource, mob.sources[0],
		"keyed by the passive, so it owns its own buff stream")
}

func TestRetaliate_DoesNothingWithoutThePassive(t *testing.T) {
	p := hittablePlayer(t)
	mob := &slowableAttacker{}

	p.MobTouches(mob, mobs.Factors{Damage: 5})

	assert.Empty(t, mob.fractions, "no passive, no retaliation")
}

// A4, first half: `MobTouches` already stamps the attacker for the companion
// defend signal "resisted or not", and the same reading applies here — the mob
// attacked you, whether or not it got through. A hit fully absorbed by a shield
// still earns the slow.
func TestRetaliate_AFullyMitigatedHitStillRetaliates(t *testing.T) {
	p := wearer(t, 1)
	mob := &slowableAttacker{}

	p.MobTouches(mob, mobs.Factors{Damage: 0})

	require.Len(t, mob.fractions, 1, "swinging at you is the trigger, not the damage landing")
	assert.InDelta(t, 0.1, mob.fractions[0], 1e-6)
}

// A4, second half: IsGod() short-circuits INSIDE takeDamage, so without an
// explicit check a cheat-mode player would walk the world slowing everything
// that brushed them — a playtest artifact, not a feature.
func TestRetaliate_AGodPlayerDoesNot(t *testing.T) {
	p := wearer(t, 5)
	p.SetGodmode(true)
	require.True(t, p.IsGod(), "precondition")
	mob := &slowableAttacker{}

	p.MobTouches(mob, mobs.Factors{Damage: 5})

	assert.Empty(t, mob.fractions, "GOD walks through the world without slowing it")
}

// L4: the DoT path dispatches with the DoT's CASTER, and a departed caster's
// ref stays valid by design — so the trigger can reach a mob that has died or
// left the viewport. Whatever it reaches, it must be a no-op rather than a
// panic; an attacker with no CC door at all is the same requirement.
func TestRetaliate_ANonSlowableAttackerIsSkipped(t *testing.T) {
	p := wearer(t, 5)

	assert.NotPanics(t, func() {
		p.MobTouches(&plainAttacker{}, mobs.Factors{Damage: 5})
	})
}
