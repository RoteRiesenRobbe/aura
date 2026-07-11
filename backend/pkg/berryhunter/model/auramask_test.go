package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// Masks are kind-agnostic since mob factions (chunk 6.6): faction no longer
// maps to a body layer in either direction, so every faction-flag mask spans
// both combatant layers and eligibility does the exact faction check at apply
// time. These pins keep the masks from silently narrowing again.

func TestAuraMaskFor_DamageAura_SpansBothCombatantLayers(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsEnemies: true, Damage: &skills.DamageParams{}},
	}}

	assert.Equal(t, int(LayerCombatants), AuraMaskFor(def),
		"an enemy can sit on either body layer (mob factions vs the player-layer summon trick)")
}

func TestAuraMaskFor_MobDamageAura_EnemiesAndStructures(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsEnemies: true, TargetsStructures: true, Damage: &skills.DamageParams{}},
	}}

	assert.Equal(t, int(LayerCombatants|LayerPlaceableCollision), AuraMaskFor(def))
}

func TestAuraMaskFor_HealAuraImpliesAllies(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeHealAura, Heal: &skills.HealParams{}},
	}}

	assert.Equal(t, int(LayerCombatants), AuraMaskFor(def),
		"allies cross body layers too — an aligned companion lives on the action layer")
}

func TestAuraMaskFor_NoEffectsYieldsNone(t *testing.T) {
	def := &skills.SkillDefinition{}

	assert.Equal(t, int(LayerNoneCollision), AuraMaskFor(def))
}

// A resist aura must collect its targets via the sensor mask like any other
// aura — without this case the sensor mask is empty and only the targetsSelf
// self-buff ever lands (found in the FireWard in-game check, item 11 Phase 2).
func TestAuraMaskFor_ResistAura(t *testing.T) {
	allies := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeResistAura, TargetsAllies: true, Resist: &skills.ResistParams{}},
	}}
	assert.Equal(t, int(LayerCombatants), AuraMaskFor(allies))

	enemies := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeResistAura, TargetsEnemies: true, Resist: &skills.ResistParams{}},
	}}
	assert.Equal(t, int(LayerCombatants), AuraMaskFor(enemies))
}

func TestInstantDamageMask_SpansBothCombatantLayers(t *testing.T) {
	e := skills.EffectDef{Type: skills.EffectTypeInstantDamage, TargetsEnemies: true, Damage: &skills.DamageParams{}}

	assert.Equal(t, int(LayerCombatants), InstantDamageMask(e))
}
