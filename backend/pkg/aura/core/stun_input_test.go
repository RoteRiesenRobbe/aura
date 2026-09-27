package core

// A stunned player at the input system (plan-aura-drawbacks.md C2, §3.3, A7,
// P3). Real players through the real input step (the flight fixture), because
// the refusals read Stunned() through a structural assert, and a double that
// answers it proves nothing about the type the game runs.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

const stunInputSource = skills.SkillID(210)

// stunnablePlayer is the door the SkillSystem reaches the real player through.
type stunnablePlayer interface {
	ApplyStun(source skills.SkillID, ticks int) bool
}

// tick advances one game tick through the real hooks this system depends on:
// the tick-start reset (it ages the stun and clears the rejection stamp), then
// the input system itself.
func (f *flightFixture) tick() {
	f.g.Tick++
	f.p.(interface{ ResetTickNumbers() }).ResetTickNumbers()
	f.i.Update(0)
}

func stunInputPress() *skills.SkillDefinition {
	return &skills.SkillDefinition{
		ID: 214, Name: "TestStunBurst", Category: skills.SkillCategoryCooldown, MaxLevel: 1,
		CooldownTicks: 100,
		Effects: []skills.EffectDef{{
			Type: skills.EffectTypeInstantDamage, Radius: 1, TargetsEnemies: true,
			Damage: &skills.DamageParams{HP: 1},
		}},
	}
}

func stunnedFixture(t *testing.T, ticks int) *flightFixture {
	t.Helper()
	f := newFlightFixture(t)
	f.g.Tick = 100
	f.p.SkillComponent().EquipCooldown(0, stunInputPress(), 1)
	require.True(t, f.p.(stunnablePlayer).ApplyStun(stunInputSource, ticks))
	f.tick() // clear the landing's own stamp, so a press's stamp is the press's
	return f
}

func TestStunInput_AStunnedPlayerDoesNotMove(t *testing.T) {
	f := stunnedFixture(t, 5)
	start := f.p.Position()

	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange, Movement: &phy.Vec2f{X: 1},
	})
	f.tick()
	assert.Equal(t, float32(0), f.p.MovementFactor())
	assert.Equal(t, start, f.p.Position(), "held in place through the real input step")

	for i := 0; i < 5; i++ {
		f.tick()
	}
	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange, Movement: &phy.Vec2f{X: 1},
	})
	f.tick()
	assert.NotEqual(t, start, f.p.Position(), "control: once the stun ends the same input walks")
}

// A cooldown press is refused at the input, never queued, and the reason is
// noted once per press with the slot's skill id.
func TestStunInput_ACooldownPressIsRefusedAndNotedOncePerPress(t *testing.T) {
	f := stunnedFixture(t, 30)
	sc := f.p.SkillComponent()

	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange, CooldownActivations: []int{0},
	})
	f.tick()

	assert.Empty(t, sc.PendingCooldowns, "a stunned press is never queued")
	id, reason := f.p.ActivationRejected()
	assert.Equal(t, skills.SkillID(214), id, "the slot's skill")
	assert.Equal(t, model.ActivationRejectedStunned, reason)

	f.tick()
	_, reason = f.p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedNone, reason, "no press this tick, nothing re-noted")
}

// A crafted slot index is dropped silently, as RequestCooldownActivation
// drops it, and must not panic reading the slot's id.
func TestStunInput_ACraftedSlotIndexIsDroppedSilently(t *testing.T) {
	f := stunnedFixture(t, 30)

	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange, CooldownActivations: []int{-1, 99, 3},
	})
	require.NotPanics(t, f.tick)

	_, reason := f.p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedNone, reason)
}

func TestStunInput_AUtilityPressIsRefusedWithIDZero(t *testing.T) {
	f := stunnedFixture(t, 30)

	f.c.utilities = append(f.c.utilities, &model.UseUtility{Kind: skills.UtilityRecall})
	f.tick()

	assert.Empty(t, f.p.SkillComponent().PendingUtilities)
	id, reason := f.p.ActivationRejected()
	assert.Equal(t, skills.SkillID(0), id)
	assert.Equal(t, model.ActivationRejectedStunned, reason)
}

// P3: takeoff is refused and says why; an invalid request stays silent.
func TestStunInput_TakeoffIsRefused(t *testing.T) {
	f := stunnedFixture(t, 30)

	f.c.flights = append(f.c.flights, startFlightTo("spawnpoint-2"))
	f.tick()

	assert.False(t, f.p.Flying(), "a stunned player cannot take off")
	assert.Empty(t, f.forget.ids)
	id, reason := f.p.ActivationRejected()
	assert.Equal(t, skills.SkillID(0), id)
	assert.Equal(t, model.ActivationRejectedStunned, reason)

	f.tick()
	f.c.flights = append(f.c.flights, startFlightTo("spawnpoint-77"))
	f.tick()
	_, reason = f.p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedNone, reason, "a request that could never fly stays silent")
}

// A7: an aura switch is a state flip, not a cast, and stays allowed.
func TestStunInput_AnAuraSwitchIsAllowed(t *testing.T) {
	f := stunnedFixture(t, 30)
	sc := f.p.SkillComponent()
	sc.EquipAura(0, &skills.SkillDefinition{ID: 1, Name: "Damage", Category: skills.SkillCategoryActiveAura, MaxLevel: 5}, 1)
	require.Equal(t, -1, sc.ActiveAuraSlot)

	f.c.inputs = append(f.c.inputs, &model.PlayerInput{ActiveAuraSlot: 0})
	f.tick()

	assert.Equal(t, 0, sc.ActiveAuraSlot, "the switch went through")
	_, reason := f.p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedNone, reason, "and floats nothing")
}
