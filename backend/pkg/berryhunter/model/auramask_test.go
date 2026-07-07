package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// Masks are faction-relative since effect foundations Step 1: the same skill
// definition yields the opposing layer set for an aligned vs. a hostile
// caster, so a future faction flip retargets without content changes.

func TestAuraMaskFor_DamageAura_EnemiesPerCasterFaction(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Damage: &skills.DamageParams{}},
	}}

	assert.Equal(t, int(LayerActionCollision), AuraMaskFor(def, FactionAligned),
		"an aligned caster's enemies are on the action (mob) layer")
	assert.Equal(t, int(LayerPlayerCollision), AuraMaskFor(def, FactionHostile),
		"a hostile caster's enemies are on the player layer")
}

func TestAuraMaskFor_MobDamageAura_EnemiesAndStructures(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsEnemies: true, TargetsStructures: true, Damage: &skills.DamageParams{}},
	}}

	assert.Equal(t, int(LayerPlayerCollision|LayerPlaceableCollision), AuraMaskFor(def, FactionHostile))
}

func TestAuraMaskFor_HealAuraImpliesAllies(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeHealAura, Heal: &skills.HealParams{}},
	}}

	assert.Equal(t, int(LayerPlayerCollision), AuraMaskFor(def, FactionAligned))
	assert.Equal(t, int(LayerActionCollision), AuraMaskFor(def, FactionHostile),
		"a hostile healer's implicit allies are mobs (inert until item 7 lifts mob healing)")
}

func TestAuraMaskFor_NoEffectsYieldsNone(t *testing.T) {
	def := &skills.SkillDefinition{}

	assert.Equal(t, int(LayerNoneCollision), AuraMaskFor(def, FactionAligned))
}

// A resist aura must collect its targets via the sensor mask like any other
// aura — without this case the sensor mask is empty and only the targetsSelf
// self-buff ever lands (found in the FireWard in-game check, item 11 Phase 2).
func TestAuraMaskFor_ResistAura(t *testing.T) {
	allies := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeResistAura, TargetsAllies: true, Resist: &skills.ResistParams{}},
	}}
	assert.Equal(t, int(LayerPlayerCollision), AuraMaskFor(allies, FactionAligned))

	enemies := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeResistAura, TargetsEnemies: true, Resist: &skills.ResistParams{}},
	}}
	assert.Equal(t, int(LayerActionCollision), AuraMaskFor(enemies, FactionAligned))
}

func TestInstantDamageMask_FactionRelative(t *testing.T) {
	e := skills.EffectDef{Type: skills.EffectTypeInstantDamage, TargetsEnemies: true, Damage: &skills.DamageParams{}}

	assert.Equal(t, int(LayerActionCollision), InstantDamageMask(e, FactionAligned))
	assert.Equal(t, int(LayerPlayerCollision), InstantDamageMask(e, FactionHostile))
}
