package sys

import (
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/mob"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/player"
)

// The self-buff cooldowns — tick_rate, speed_burst, lifesteal_burst — reach the
// caster through STRUCTURAL asserts (`e.(speedApplier)`), which is the house
// pattern and is right: the capability belongs in sys, not in a model interface
// every entity would have to carry.
//
// Its cost is that a real type missing a method fails SILENTLY and completely.
// The applier's `ok` is false, so it returns false, so nothing is granted — and
// the cooldown still fires, still charges the caster and still starts its timer,
// because a cooldown pays on cast, hit or whiff (D9). Meanwhile the READ side
// (casterLifesteal, TickRateFactor) falls back to its neutral value, so no
// arithmetic looks wrong either. The whole feature is inert and nothing anywhere
// says so.
//
// It is not hypothetical: R3 built lifesteal_burst end to end — payload, buff
// store, applier, dispatch, composition into the damage payload, six passing
// behaviour tests — against a fake player that had the methods and real types
// that did not. Every one of those tests was green while Bloodthirst did nothing
// in the actual game.
//
// So: the doubles prove the mechanism, and this proves the mechanism is wired to
// the things the mechanism is for.
func TestRealEntitiesSatisfyTheSelfBuffCapabilities(t *testing.T) {
	// The REAL constructors, not doubles — the whole point is that the doubles
	// already answer yes. An unjoined player and a zero mob are fine: these are
	// assertions about the type, not about any state.
	p := player.New(newStateFakeGame(t), nil, "capability-probe")
	var m any = &mob.Mob{}

	for _, c := range []struct {
		name  string
		holds func(any) bool
	}{
		{"tickRateApplier", func(e any) bool { _, ok := e.(tickRateApplier); return ok }},
		{"speedApplier", func(e any) bool { _, ok := e.(speedApplier); return ok }},
		{"lifestealApplier", func(e any) bool { _, ok := e.(lifestealApplier); return ok }},
		// The read side of the same wiring: an applier with no reader is just as
		// inert as a reader with no applier.
		{"LifestealFraction reader", func(e any) bool {
			_, ok := e.(interface{ LifestealFraction() float32 })
			return ok
		}},
		{"TickRateFactor reader", func(e any) bool {
			_, ok := e.(tickRateBuffed)
			return ok
		}},
	} {
		assert.Truef(t, c.holds(p), "*player must satisfy %s, or the cooldown that needs it charges and does nothing", c.name)
		assert.Truef(t, c.holds(m), "*mob.Mob must satisfy %s, or the cooldown that needs it charges and does nothing", c.name)
	}
}

// costPayer is the same structural-assert class with the opposite polarity on
// mobs: *player must satisfy it (or every cost in the game is silently free —
// widening the interface for cost_paid is exactly how that would happen), and
// *mob.Mob must NOT (L5: the gate is what stops every caster mob paying a cost
// and suiciding).
func TestRealEntitiesAndTheCostPayerCapability(t *testing.T) {
	var p any = player.New(newStateFakeGame(t), nil, "capability-probe")
	var m any = &mob.Mob{}

	_, playerPays := p.(costPayer)
	assert.True(t, playerPays, "*player must satisfy costPayer, or every resource cost is silently free")

	_, mobPays := m.(costPayer)
	assert.False(t, mobPays, "*mob.Mob must never satisfy costPayer (L5) — a paying caster mob suicides")
}
