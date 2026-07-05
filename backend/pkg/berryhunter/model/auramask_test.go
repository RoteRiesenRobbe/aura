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

// A resist aura must collect its allies via the sensor mask like any other
// aura — without this case the sensor mask is empty and only the targetsSelf
// self-buff ever lands (found in the FireWard in-game check, item 11 Phase 2).
func TestAuraMaskFor_ResistAura(t *testing.T) {
	players := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeResistAura, TargetsPlayers: true},
	}}
	assert.Equal(t, int(LayerPlayerCollision), AuraMaskFor(players))

	mobs := &skills.SkillDefinition{Effects: []skills.EffectDef{
		{Type: skills.EffectTypeResistAura, TargetsMobs: true},
	}}
	assert.Equal(t, int(LayerActionCollision), AuraMaskFor(mobs))
}
