package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

func TestAuraMaskFor_PlayerDamageAura(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsMobs: true},
	}}

	assert.Equal(t, int(LayerActionCollision), AuraMaskFor(def))
}

func TestAuraMaskFor_MobDamageAura_PlayersOnly(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsPlayers: true},
	}}

	assert.Equal(t, int(LayerPlayerCollision), AuraMaskFor(def))
}

func TestAuraMaskFor_MobDamageAura_PlayersAndStructures(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeDamageAura, TargetsPlayers: true, TargetsStructures: true},
	}}

	assert.Equal(t, int(LayerPlayerCollision|LayerPlaceableCollision), AuraMaskFor(def))
}

func TestAuraMaskFor_HealAuraImpliesPlayers(t *testing.T) {
	def := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeHealAura},
	}}

	assert.Equal(t, int(LayerPlayerCollision), AuraMaskFor(def))
}

func TestAuraMaskFor_NoEffectsYieldsNone(t *testing.T) {
	def := &skills.SkillDefinition{}

	assert.Equal(t, int(LayerNoneCollision), AuraMaskFor(def))
}
