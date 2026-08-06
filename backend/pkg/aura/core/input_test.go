package core

// Tests for the active-aura branch of PlayerInputSystem.updateInput — the
// server-side half of the wire contract for active_aura_slot:
//
//	>= 0  switch to that slot
//	  -1  (wire default / absent field) no change
//	  -2  deactivate sentinel → component slot -1 (Nothing)
//
// See docs/archive/plan-skill-system.md, Wire Protocol Changes.

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
)

// fakeInputPlayer implements just enough of model.PlayerEntity for
// updateInput's aura branch. The embedded nil interface panics on any method
// the test did not anticipate — a loud signal that updateInput grew.
type fakeInputPlayer struct {
	model.PlayerEntity
	sc          *skills.SkillComponent
	vitalSigns  model.PlayerVitalSigns
	config      cfg.PlayerConfig
	pos         phy.Vec2f
	lastMoveDir phy.Vec2f
	speedCheat  float32
	basic       ecs.BasicEntity
	buffs       skills.Buffs
}

func (f *fakeInputPlayer) Basic() ecs.BasicEntity    { return f.basic }
func (f *fakeInputPlayer) SpeedCheatFactor() float32 { return f.speedCheat }

func (f *fakeInputPlayer) SkillComponent() *skills.SkillComponent { return f.sc }
func (f *fakeInputPlayer) LastMoveDir() phy.Vec2f                 { return f.lastMoveDir }
func (f *fakeInputPlayer) MovementFactor() float32                { return f.buffs.MovementFactor() }
func (f *fakeInputPlayer) SetLastMoveDir(v phy.Vec2f)             { f.lastMoveDir = v }

func newFakeInputPlayer() *fakeInputPlayer {
	def := &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}
	sc := skills.NewSkillComponent(true)
	sc.EquipAura(0, def, 1)
	sc.EquipAura(2, def, 1)

	return &fakeInputPlayer{
		sc:    sc,
		basic: ecs.NewBasic(),
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

// pickInput coasts a starved tick on the last movement (movement only — never
// replaying one-shots) and keeps coasting the SAME held copy across consecutive
// starved ticks, up to maxHoldTicks. plan-input-jitter.md chunk A.
func TestPickInput_CoastsHeldMovement(t *testing.T) {
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

	// First starved tick coasts on a movement-only copy — one-shots stripped.
	got := sys.pickInput(7, nil)
	if assert.NotNil(t, got) {
		assert.Equal(t, move, got.Movement)
		assert.Equal(t, float32(0.5), got.Rotation)
		assert.Equal(t, model.ActiveAuraSlotNoChange, got.ActiveAuraSlot,
			"coast must not replay an aura switch")
		assert.Empty(t, got.CooldownActivations, "coast must not replay cooldowns")
	}

	// Consecutive starved ticks keep coasting the same held copy (not consumed).
	assert.Same(t, got, sys.pickInput(7, nil))
	assert.Same(t, got, sys.pickInput(7, nil))
}

// --- chunk A: coast counters + cap, run histogram ---

func freshMove() *model.PlayerInput {
	return &model.PlayerInput{Movement: &phy.Vec2f{X: 1}, ActiveAuraSlot: model.ActiveAuraSlotNoChange}
}

// A starve run within the cap coasts every tick (zero stalls); past the cap it
// halts. starved = coasted + stalled, bounded by maxHoldTicks. plan §3-4.
func TestPickInput_CoastCounterAndCap(t *testing.T) {
	sys := &PlayerInputSystem{lastMove: map[uint64]*model.PlayerInput{}}
	const id = 7
	sys.pickInput(id, freshMove()) // seed the held movement

	for k := 0; k < maxHoldTicks; k++ {
		assert.NotNil(t, sys.pickInput(id, nil), "coast within the cap")
	}
	for k := 0; k < 3; k++ {
		assert.Nil(t, sys.pickInput(id, nil), "halt past the cap")
	}

	st := sys.statFor(id)
	assert.Equal(t, uint64(maxHoldTicks+3), st.starved)
	assert.Equal(t, uint64(maxHoldTicks), st.coasted, "coasted caps at maxHoldTicks")
	assert.Equal(t, uint64(3), st.stalled, "past-cap ticks stall")
	assert.Equal(t, maxHoldTicks+3, st.runLen, "run still open (never closed by a fresh input)")
}

// A run is bucketed by length only when a real input closes it.
func TestPickInput_ClosedRunBucketed(t *testing.T) {
	sys := &PlayerInputSystem{lastMove: map[uint64]*model.PlayerInput{}}
	const id = 8
	sys.pickInput(id, freshMove())
	sys.pickInput(id, nil)
	sys.pickInput(id, nil)
	sys.pickInput(id, nil)         // run length 3
	sys.pickInput(id, freshMove()) // closes it

	st := sys.statFor(id)
	assert.Equal(t, 2, bucket(3), "run length 3 → index 2 ('3' bucket)")
	assert.Equal(t, uint64(1), st.hist[bucket(3)], "closed run of length 3 bucketed")
	assert.Equal(t, 0, st.runLen, "run closed by the fresh input")
}

// A run still open at disconnect (never closed by a fresh input) must NOT be
// bucketed — otherwise a dropped client's permanent-starve tail would poison
// the histogram.
func TestPickInput_OpenRunNotBucketed(t *testing.T) {
	sys := &PlayerInputSystem{lastMove: map[uint64]*model.PlayerInput{}}
	const id = 9

	sys.pickInput(id, freshMove())
	for k := 0; k < 5; k++ {
		sys.pickInput(id, nil)
	}

	st := sys.statFor(id)
	assert.Equal(t, uint64(5), st.starved)
	assert.Equal(t, 5, st.runLen, "run still open")
	for idx, b := range st.hist {
		assert.Equal(t, uint64(0), b, "bucket %d must be empty for an unclosed run", idx)
	}
}

func TestBucket(t *testing.T) {
	cases := map[int]int{1: 0, 2: 1, 3: 2, 4: 3, 6: 3, 7: 4, 9: 4, 10: 5, 15: 5, 16: 6, 100: 6}
	for n, want := range cases {
		assert.Equal(t, want, bucket(n), "bucket(%d)", n)
	}
}

// The starved path (coast while held, then stall past the cap — the hot path
// during a client stall) must allocate nothing, keeping the fe0044d0 zero-alloc
// posture. The fresh path pre-allocates the held copy (pre-existing) and is
// deliberately not pinned here.
func TestPickInput_StarvedPathZeroAlloc(t *testing.T) {
	sys := &PlayerInputSystem{lastMove: map[uint64]*model.PlayerInput{}}
	const id = 7
	// Warm the stats entry + held movement so both are pure reads under measure.
	sys.pickInput(id, freshMove())

	allocs := testing.AllocsPerRun(1000, func() {
		sys.pickInput(id, nil)
	})
	assert.Equal(t, 0.0, allocs, "the coast/stall pickInput path must not allocate")
}

// A dead player's held movement is cleared, so a coast cannot replay the
// pre-death direction across respawn (plan-input-jitter.md §7 item 4).
func TestUpdateInput_DeathClearsHeldMovement(t *testing.T) {
	sys := &PlayerInputSystem{lastMove: map[uint64]*model.PlayerInput{}}
	p := newFakeInputPlayer()
	id := p.Basic().ID()
	p.vitalSigns.Health = 100

	// Seed a held movement via a fresh walking input while alive.
	fresh := &model.PlayerInput{Movement: &phy.Vec2f{X: 1, Y: 0}, ActiveAuraSlot: model.ActiveAuraSlotNoChange}
	sys.updateInput(p, sys.pickInput(id, fresh), nil)
	assert.NotNil(t, sys.lastMove[id], "held seeded while alive")

	// Player dies: updateInput must drop the held movement this tick.
	p.vitalSigns.Health = 0
	sys.updateInput(p, sys.pickInput(id, nil), nil)
	assert.Nil(t, sys.lastMove[id], "death clears the held movement")

	// After respawn a starved tick must not coast (held is gone → halt).
	p.vitalSigns.Health = 100
	assert.Nil(t, sys.pickInput(id, nil), "no coast across respawn")
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

func TestUpdateInput_SpeedBurstMultipliesMovement(t *testing.T) {
	// Swift as a cooldown: the transient speed buff scales the per-tick step,
	// on top of config × passive. Asserted on distance moved, never on the
	// buff store — the store being populated says nothing about the player
	// actually going faster, which is the whole point of the movement site.
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100
	p.config.WalkingSpeedPerTick = 0.05

	move := &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{X: 1, Y: 0},
	}

	sys.updateInput(p, move, nil)
	assert.InDelta(t, 0.05, p.pos.X, 1e-6, "no buff = plain config speed")

	p.buffs.ApplySpeed(10, 1.5, 2)
	sys.updateInput(p, move, nil)
	assert.InDelta(t, 0.125, p.pos.X, 1e-6, "a 1.5× sprint moves 1.5× as far in one tick")
}

func TestUpdateInput_SlowReachesThePlayer(t *testing.T) {
	// The other half of the shared movement factor: slows have lived in the
	// buff store since the effect-foundations step but only mobs ever read
	// them, so a slow on a player was inert. Going through MovementFactor
	// closes that — pinned here so it cannot silently regress.
	sys := &PlayerInputSystem{}
	p := newFakeInputPlayer()
	p.vitalSigns.Health = 100
	p.config.WalkingSpeedPerTick = 0.05
	p.buffs.ApplySlow(4, 0.5, 2)

	sys.updateInput(p, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange,
		Movement:       &phy.Vec2f{X: 1, Y: 0},
	}, nil)

	assert.InDelta(t, 0.025, p.pos.X, 1e-6, "a 50 % slow halves the step")
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
