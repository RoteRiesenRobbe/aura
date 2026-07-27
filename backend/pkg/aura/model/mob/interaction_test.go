package mob

// The conversant half of the actor merge (plan-entity-model.md chunk 3a).
//
// An NPC's proximity sensor and a mob's aggro sensor are the same mechanism —
// "approach" IS aggro, for something friendly — so the merged NPC has no sensor
// of its own. What it needs instead is for the one sensor to be sized and
// masked for talking as well as for fighting.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// npcDefinition is the shape the 14 merged NPCs author: a passive, friendly
// faction, no loadout, no movement, and an interaction block.
func npcDefinition() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:                51,
		Name:              "Farmer",
		Faction:           5,
		AggroMask:         0, // passive: acquires nobody
		FriendlyToPlayers: true,
		Factors:           mobs.Factors{BaseMaxHealth: 200, Speed: 0},
		Body:              mobs.Body{Radius: 0.35, AggroRadius: 1.0},
		Interaction: &mobs.Interaction{
			Nodes: []mobs.InteractionNode{{ID: "root", Lines: []string{"hello"}}},
		},
	}
}

// ⚑ L11 — the one line the whole chunk rests on. aggroSensorMask derives the
// mask from the AGGRO set, and an NPC aggros nobody, so without this widening
// its sensor reports nothing and the NPC is silently mute: every evaluator
// test still passes, and no player is ever seen.
func TestNewMob_ConversantSensesPlayersDespitePassiveFaction(t *testing.T) {
	npc := NewMob(npcDefinition(), 0, nil)

	assert.NotZero(t, npc.aggroAura.Shape().Mask&int(model.LayerPlayerCollision),
		"a conversant must see players even though it acquires nobody")
}

// The widening is scoped to conversants: a passive faction that has nothing to
// say keeps its empty sensor and its zero broadphase pairs (mob-depth 6.6).
func TestNewMob_PassiveFactionWithoutInteractionStaysBlind(t *testing.T) {
	def := npcDefinition()
	def.Interaction = nil

	assert.Equal(t, int(model.LayerNoneCollision), NewMob(def, 0, nil).aggroAura.Shape().Mask)
}

// A support carrier already senses both combatant layers; carrying a
// conversation must not narrow that.
func TestNewMob_ConversantSupportCarrierKeepsTheWiderMask(t *testing.T) {
	def := npcDefinition()
	def.Skills = []mobs.MobSkill{{Def: testHealAuraSkill(), Level: 1}}

	assert.Equal(t, int(model.LayerCombatants), NewMob(def, 0, nil).aggroAura.Shape().Mask)
}

// D7: one circle, sized by whichever job needs to see further.
func TestNewMob_SensorRadiusCoversTheInteractionRange(t *testing.T) {
	def := npcDefinition()
	def.Interaction.Range = 2.5 // a talker that reaches further than it aggros

	assert.InDelta(t, 2.5, NewMob(def, 0, nil).aggroAura.Radius, 0.0001)
}

func TestNewMob_SensorRadiusStaysTheAggroRadiusWhenItIsWider(t *testing.T) {
	def := npcDefinition()
	def.Body.AggroRadius = 8 // a teaching guard that fights bandits
	def.Interaction.Range = 1.5

	assert.InDelta(t, 8.0, NewMob(def, 0, nil).aggroAura.Radius, 0.0001)
}

// Sensor() is the capability seam the interaction system reads. It is the
// SAME shape as the aggro aura on purpose: Bodies() already hands it to the
// physics space as a DYNAMIC shape, which is the requirement the deleted
// addNpcEntity existed to satisfy.
func TestMob_SensorIsTheAggroAura(t *testing.T) {
	npc := NewMob(npcDefinition(), 0, nil)

	require.NotNil(t, npc.Sensor())
	assert.Same(t, npc.aggroAura, npc.Sensor())

	var dynamic bool
	for _, b := range npc.Bodies() {
		if c, ok := b.(*phy.Circle); ok && c == npc.aggroAura {
			dynamic = true
		}
	}
	assert.True(t, dynamic, "the sensor must ride Bodies() or it is never registered")
}

func TestMob_InteractionIsTheAuthoredBlock(t *testing.T) {
	npc := NewMob(npcDefinition(), 0, nil)
	require.NotNil(t, npc.Interaction())
	assert.Equal(t, "root", npc.Interaction().Nodes[0].ID)

	assert.Nil(t, newTestMob().Interaction(), "an ordinary mob carries no conversation")
}
