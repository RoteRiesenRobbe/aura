package core

// Tests for the active-aura branch of PlayerInputSystem.updateInput — the
// server-side half of the wire contract for active_aura_slot:
//
//	>= 0  switch to that slot
//	  -1  (wire default / absent field) no change
//	  -2  deactivate sentinel → component slot -1 (Nothing)
//
// See docs/plan-skill-system.md, Wire Protocol Changes.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// fakeInputPlayer implements just enough of model.PlayerEntity for
// updateInput's aura branch. The embedded nil interface panics on any method
// the test did not anticipate — a loud signal that updateInput grew.
type fakeInputPlayer struct {
	model.PlayerEntity
	sc          *skills.SkillComponent
	hand        model.Hand
	vitalSigns  model.PlayerVitalSigns
	config      cfg.PlayerConfig
	pos         phy.Vec2f
	lastMoveDir phy.Vec2f
	speedCheat  float32
}

func (f *fakeInputPlayer) SpeedCheatFactor() float32 { return f.speedCheat }

func (f *fakeInputPlayer) Hand() *model.Hand                      { return &f.hand }
func (f *fakeInputPlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeInputPlayer) LastMoveDir() phy.Vec2f                 { return f.lastMoveDir }
func (f *fakeInputPlayer) SetLastMoveDir(v phy.Vec2f)             { f.lastMoveDir = v }

func newFakeInputPlayer() *fakeInputPlayer {
	def := &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
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

// pickInput bridges a single starved tick (client/server clock drift drops one
// input every ~30 s) with the last movement, so walking doesn't hitch — but
// only for one tick, so a disconnected client's character halts instead of
// sliding forever. See docs deferred-bug note "Movement micro-stutter".
func TestPickInput_BridgesOneStarvedTick(t *testing.T) {
	sys := &PlayerInputSystem{lastMove: map[uint64]*model.PlayerInput{}}
	move := &phy.Vec2f{X: 1, Y: 0}
	fresh := &model.PlayerInput{
		Movement:            move,
		Rotation:            0.5,
		ActiveAuraSlot:      3,
		CooldownActivations: []int{1},
	}

	// A fresh input is applied as-is (full command, incl. one-shots).
	assert.Same(t, fresh, sys.pickInput(7, fresh))

	// First starved tick: bridged with a movement-only copy — the one-shot
	// commands must NOT be replayed.
	got := sys.pickInput(7, nil)
	if assert.NotNil(t, got) {
		assert.Equal(t, move, got.Movement)
		assert.Equal(t, float32(0.5), got.Rotation)
		assert.Equal(t, model.ActiveAuraSlotNoChange, got.ActiveAuraSlot,
			"bridged input must not replay an aura switch")
		assert.Empty(t, got.CooldownActivations,
			"bridged input must not replay cooldown activations")
	}

	// Second consecutive starved tick: nil → the player halts.
	assert.Nil(t, sys.pickInput(7, nil))
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

// --- cast interrupts from the input path (plan-skill-vocab chunk 4) ---
//
// Any deliberate act cancels a running cast: an aura switch (incl. the
// deactivate sentinel) and actual movement. A no-change aura byte and a
// zero movement vector are NOT deliberate acts. (Damage interrupts live in
// player.takeDamage; a different cooldown activation in the SkillSystem.)

func (f *fakeInputPlayer) VitalSigns() *model.PlayerVitalSigns { return &f.vitalSigns }
func (f *fakeInputPlayer) Config() *cfg.PlayerConfig           { return &f.config }
func (f *fakeInputPlayer) Position() phy.Vec2f                 { return f.pos }
func (f *fakeInputPlayer) SetPosition(v phy.Vec2f)             { f.pos = v }

func startCast(p *fakeInputPlayer) {
	def := &skills.SkillDefinition{
		ID: 28, Name: "Recall", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 9000, CastTicks: 300, CastInterruptedByDamage: true,
	}
	p.sc.EquipCooldown(0, def, 1)
	p.sc.StartCast(0)
}

func TestUpdateInput_AuraSwitchCancelsCast(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	startCast(p)

	sys.updateInput(p, inputWithAuraSlot(2), nil)

	assert.False(t, p.sc.IsCasting(), "an aura switch is a deliberate act")
}

func TestUpdateInput_AuraDeactivateCancelsCast(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.sc.SetActiveAura(0)
	startCast(p)

	sys.updateInput(p, inputWithAuraSlot(model.ActiveAuraSlotDeactivate), nil)

	assert.False(t, p.sc.IsCasting(), "deactivating the aura is a deliberate act")
}

func TestUpdateInput_AuraNoChangeKeepsCast(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	startCast(p)

	sys.updateInput(p, inputWithAuraSlot(model.ActiveAuraSlotNoChange), nil)

	assert.True(t, p.sc.IsCasting(), "the wire default is not a command")
}

func TestUpdateInput_MovementCancelsCast(t *testing.T) {
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100
	startCast(p)

	sys.updateInput(p, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{X: 1, Y: 0},
	}, nil)

	assert.False(t, p.sc.IsCasting(), "moving cancels the cast")
}

func TestUpdateInput_MovementRecordsDashDirection(t *testing.T) {
	// The dash aim (chunk 5) is the last non-zero movement direction, recorded
	// as a unit vector. A diagonal (3,4) normalizes to (0.6,0.8).
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100

	sys.updateInput(p, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{X: 3, Y: 4},
	}, nil)

	assert.InDelta(t, 0.6, p.lastMoveDir.X, 1e-6)
	assert.InDelta(t, 0.8, p.lastMoveDir.Y, 1e-6)
}

func TestUpdateInput_ZeroMovementKeepsLastDashDirection(t *testing.T) {
	// Standing still (zero/idle packet) must not overwrite the recorded dash
	// direction — a stationary player still dashes where they last walked.
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100
	p.lastMoveDir = phy.Vec2f{X: 0, Y: 1}

	sys.updateInput(p, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{},
	}, nil)

	assert.Equal(t, phy.Vec2f{X: 0, Y: 1}, p.lastMoveDir, "zero movement leaves the last direction intact")
}

func TestUpdateInput_SpeedCheatMultipliesMovement(t *testing.T) {
	// The SPEED dev cheat multiplies the effective walking speed on top of
	// config × passive bonus; 0 = off (the zero value must not freeze players).
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100
	p.config.WalkingSpeedPerTick = 0.05

	move := &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{X: 1, Y: 0},
	}

	sys.updateInput(p, move, nil)
	assert.InDelta(t, 0.05, p.pos.X, 1e-6, "cheat off (zero value) = plain config speed")

	p.speedCheat = 2
	sys.updateInput(p, move, nil)
	assert.InDelta(t, 0.15, p.pos.X, 1e-6, "factor 2 doubles the per-tick step")
}

func TestUpdateInput_ZeroMovementVectorKeepsCast(t *testing.T) {
	// A present-but-zero movement (idle packet / bridged tick) is not a
	// deliberate act — standing still must not flicker the cast.
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100
	startCast(p)

	sys.updateInput(p, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{},
	}, nil)

	assert.True(t, p.sc.IsCasting())
}

func TestUpdateInput_DeadPlayerMovementKeepsCast(t *testing.T) {
	// Dead players cannot move; the cast state is cleared on respawn via
	// SetSkillComponent, not by ghost input.
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 0
	startCast(p)

	sys.updateInput(p, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{X: 1, Y: 0},
	}, nil)

	assert.True(t, p.sc.IsCasting())
}
