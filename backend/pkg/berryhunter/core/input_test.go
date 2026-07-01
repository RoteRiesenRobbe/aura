package core

// Tests for the active-aura branch of PlayerInputSystem.updateInput — the
// server-side half of the wire contract for active_aura_slot:
//
//	>= 0  switch to that slot
//	  -1  (wire default / absent field) no change
//	  -2  deactivate sentinel → component slot -1 (Nothing)
//
// See docs/skill-system-design.md, Wire Protocol Changes.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/trichner/berryhunter/pkg/berryhunter/model"
	"github.com/trichner/berryhunter/pkg/berryhunter/phy"
	"github.com/trichner/berryhunter/pkg/berryhunter/skills"
)

// fakeInputPlayer implements just enough of model.PlayerEntity for
// updateInput's aura branch. The embedded nil interface panics on any method
// the test did not anticipate — a loud signal that updateInput grew.
type fakeInputPlayer struct {
	model.PlayerEntity
	sc   *skills.SkillComponent
	hand model.Hand
}

func (f *fakeInputPlayer) Hand() *model.Hand                     { return &f.hand }
func (f *fakeInputPlayer) SkillComponent() *skills.SkillComponent { return f.sc }

func newFakeInputPlayer() *fakeInputPlayer {
	def := &skills.SkillDefinition{ID: 1, Name: "DamageAura", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	sc := skills.NewSkillComponent(true)
	sc.EquipAura(0, def, 1)
	sc.EquipAura(2, def, 1)

	return &fakeInputPlayer{
		sc: sc,
		// A real collider so the unconditional hand-mask reset works.
		hand: model.Hand{Collider: phy.NewCircle(phy.VEC2F_ZERO, 0.1)},
	}
}

func inputWithAuraSlot(slot int) *model.PlayerInput {
	return &model.PlayerInput{ActiveAuraSlot: slot}
}

func TestUpdateInput_SwitchesToRequestedSlot(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.sc.AuraSlots[2].TickAccumulator = 5

	sys.updateInput(p, inputWithAuraSlot(2), nil)

	assert.Equal(t, 2, p.sc.ActiveAuraSlot)
	assert.Equal(t, 0, p.sc.AuraSlots[2].TickAccumulator,
		"switching must reset the incoming slot's accumulator (anti rapid-switch)")
}

func TestUpdateInput_DeactivateSentinelYieldsNothing(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.sc.SetActiveAura(0)

	sys.updateInput(p, inputWithAuraSlot(model.ActiveAuraSlotDeactivate), nil)

	assert.Equal(t, -1, p.sc.ActiveAuraSlot, "-2 on the wire maps to Nothing (-1)")
}

func TestUpdateInput_NoChangeKeepsActiveSlot(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.sc.SetActiveAura(0)
	p.sc.AuraSlots[0].TickAccumulator = 2

	sys.updateInput(p, inputWithAuraSlot(model.ActiveAuraSlotNoChange), nil)

	assert.Equal(t, 0, p.sc.ActiveAuraSlot)
	assert.Equal(t, 2, p.sc.AuraSlots[0].TickAccumulator,
		"no-change must not reset the running accumulator")
}

func TestUpdateInput_OutOfRangeSlotFromClientIsIgnored(t *testing.T) {
	// A malicious or buggy client can send any byte; the server must not let
	// it escape the slot array bounds or change state.
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.sc.SetActiveAura(0)

	assert.NotPanics(t, func() {
		sys.updateInput(p, inputWithAuraSlot(99), nil)
	})
	assert.Equal(t, 0, p.sc.ActiveAuraSlot)
}

func TestUpdateInput_NilInputIsNoop(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.sc.SetActiveAura(0)

	assert.NotPanics(t, func() {
		sys.updateInput(p, nil, nil)
	})
	assert.Equal(t, 0, p.sc.ActiveAuraSlot)
}
