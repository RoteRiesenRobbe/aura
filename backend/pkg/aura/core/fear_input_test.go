package core

// A feared player at the input system (plan-effect-types-round-2.md C5, D5,
// D22): the SERVER moves them away from the fearer at walking speed, whatever
// they press, and refuses their casts with the Feared reason.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

type fearablePlayer interface {
	ApplyFear(source skills.SkillID, from any, ticks int) bool
}

// standingFearer is the fearer as the feared side reads it: a position.
type standingFearer struct{ pos phy.Vec2f }

func (s *standingFearer) Position() phy.Vec2f { return s.pos }

func fearedFixture(t *testing.T, ticks int) (*flightFixture, *standingFearer) {
	t.Helper()
	f := newFlightFixture(t)
	f.g.Tick = 100
	f.p.SkillComponent().EquipCooldown(0, stunInputPress(), 1)
	from := &standingFearer{pos: f.p.Position().Add(phy.Vec2f{X: 2})}
	require.True(t, f.p.(fearablePlayer).ApplyFear(166, from, ticks))
	f.tick()
	return f, from
}

func TestFearInput_AFearedPlayerRunsWithNoInput(t *testing.T) {
	f, from := fearedFixture(t, 30)
	start := f.p.Position()

	for i := 0; i < 5; i++ {
		f.tick()
	}

	assert.Less(t, f.p.Position().X, start.X, "away from the fearer to the east")
	assert.Greater(t, from.pos.Sub(f.p.Position()).Abs(), from.pos.Sub(start).Abs())
}

func TestFearInput_MovementInputIsIgnored(t *testing.T) {
	f, _ := fearedFixture(t, 30)
	start := f.p.Position()

	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange, Movement: &phy.Vec2f{X: 1},
	})
	f.tick()

	assert.Less(t, f.p.Position().X, start.X, "pushing towards the fearer still runs away")
}

func TestFearInput_ACooldownPressIsRefusedAsFeared(t *testing.T) {
	f, _ := fearedFixture(t, 30)

	f.c.inputs = append(f.c.inputs, &model.PlayerInput{
		ActiveAuraSlot: model.ActiveAuraSlotNoChange, CooldownActivations: []int{0},
	})
	f.tick()

	assert.Empty(t, f.p.SkillComponent().PendingCooldowns)
	_, reason := f.p.ActivationRejected()
	assert.Equal(t, model.ActivationRejectedFeared, reason)
}

func TestFearInput_GodRefusesIt(t *testing.T) {
	f := newFlightFixture(t)
	f.p.(interface{ SetGodmode(bool) }).SetGodmode(true)

	assert.False(t, f.p.(fearablePlayer).ApplyFear(166, &standingFearer{}, 30), "L10: GOD refuses CC")
}
