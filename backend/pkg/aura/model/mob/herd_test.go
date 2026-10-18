package mob

// Herding (plan-herding.md D2-D5): a herd animal runs from every player close
// by — away from the sum of their pushes — remembers who it ran from for
// 10 s, and once it has stood in its pen for 2 s it credits every one of them
// and leaves the world without a death's rewards.

import (
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (f *fakeAuraPlayer) Flying() bool { return false }

type flyingPlayer struct{ *fakeAuraPlayer }

func (flyingPlayer) Flying() bool { return true }

// sheepDefinition is a passive herd animal: it acquires nobody (aggroMask 0,
// the townsfolk shape) and carries no skills.
func sheepDefinition() *mobs.MobDefinition {
	return &mobs.MobDefinition{
		ID:        78,
		Name:      "Wolf", // must be a valid AuraApi entity type name
		Faction:   3,      // testFactionPrey: passive, it acquires nobody
		AggroMask: 0,
		Factors:   mobs.Factors{Speed: 0.6},
		Body:      mobs.Body{Radius: 0.35, AggroRadius: 2.5},
		Herd:      &mobs.Herd{Pen: "hans-pen"},
	}
}

func newSheep(at phy.Vec2f) *Mob {
	m := NewMob(sheepDefinition(), 0, nil)
	m.SetPosition(at)
	return m
}

// sensesAll puts every target in m's sensor on the player layer at once, and
// with none it empties the sensor.
func sensesAll(m *Mob, targets ...model.Combatant) {
	space := phy.NewSpace()
	space.AddShape(m.aggroAura)
	for _, target := range targets {
		c := phy.NewCircle(target.Position(), target.Radius())
		c.Shape().IsSensor = true
		c.Shape().Layer = int(model.LayerPlayerCollision)
		c.Shape().UserData = target
		space.AddShape(c)
	}
	space.Update()
}

func playerAt(x, y float32) *fakeAuraPlayer {
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: x, Y: y}
	return p
}

func TestHerd_OnlyAHerdAnimalSeesPlayers(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	assert.NotZero(t, sheep.aggroAura.Shape().Mask&int(model.LayerPlayerCollision),
		"a passive herd animal must still see players, the conversant widening")

	def := sheepDefinition()
	def.Herd = nil
	plain := NewMob(def, 0, nil)
	assert.Zero(t, plain.aggroAura.Shape().Mask&int(model.LayerPlayerCollision), "control")
}

func TestHerd_RunsStraightAwayFromANearPlayer(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	p := playerAt(-1, 0)
	sensesAll(sheep, p)

	require.True(t, sheep.Update(0))

	assert.InDelta(t, float64(sheep.velocity), float64(sheep.Position().X), 1e-5, "one full-speed step away")
	assert.InDelta(t, 0, sheep.Position().Y, 1e-5)
}

func TestHerd_RunningIsNotAFight(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	p := playerAt(-1, 0)
	sensesAll(sheep, p)

	for i := 0; i < 5; i++ {
		require.True(t, sheep.Update(0))
	}

	assert.Nil(t, sheep.aggroTarget)
	assert.Empty(t, sheep.threat)
	assert.False(t, sheep.InCombat())
	assert.False(t, sheep.returnPosSet, "never a walk-home latch (M1-F5(B))")
}

func TestHerd_WithNobodyNearItStays(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	sensesAll(sheep)

	require.True(t, sheep.Update(0))

	assert.Equal(t, phy.VEC2F_ZERO, sheep.Position())
}

func TestHerd_TwoFlankingPlayersSteerItBetweenThem(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	sensesAll(sheep, playerAt(-1, 1), playerAt(-1, -1))

	require.True(t, sheep.Update(0))

	assert.Greater(t, sheep.Position().X, float32(0), "pushed on, between the two")
	assert.InDelta(t, 0, sheep.Position().Y, 1e-5, "neither one alone decides (R12)")
}

func TestHerd_TheCloserPlayerPushesHarder(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	sensesAll(sheep, playerAt(0, 1), playerAt(0, -2))

	require.True(t, sheep.Update(0))

	assert.Less(t, sheep.Position().Y, float32(0), "away from the nearer one")
}

func TestHerd_IgnoresFlyersAndCompanions(t *testing.T) {
	flyer := flyingPlayer{playerAt(-1, 0)}
	companion := newFakeCombatant()
	companion.pos = phy.Vec2f{X: 1}

	sheep := newSheep(phy.VEC2F_ZERO)
	sensesAll(sheep, flyer, companion)

	require.True(t, sheep.Update(0))

	assert.Equal(t, phy.VEC2F_ZERO, sheep.Position(), "only players on the ground herd (R9)")
	assert.Empty(t, sheep.herders)
}

func TestHerd_PennedAfterTwoSecondsCreditsEveryHerder(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	a, b := playerAt(-1, 0.5), playerAt(-1, -0.5)
	sensesAll(sheep, a, b)
	require.True(t, sheep.Update(0))

	for i := 1; i < penDwellTicks; i++ {
		require.False(t, sheep.UpdatePen(true), "tick %d of %d is not yet penned", i, penDwellTicks)
	}
	require.True(t, sheep.UpdatePen(true))

	assert.EqualValues(t, 1, a.ledger.KillCount(sheep.definition.ID))
	assert.EqualValues(t, 1, b.ledger.KillCount(sheep.definition.ID), "both herders, R2")
	assert.Empty(t, a.xp, "a penning is not a kill: no XP")
	assert.Zero(t, sheep.Health())
	assert.False(t, sheep.Update(0), "it leaves through the death path")
}

func TestHerd_LeavingThePenStartsOver(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	for i := 0; i < penDwellTicks-1; i++ {
		require.False(t, sheep.UpdatePen(true))
	}
	require.False(t, sheep.UpdatePen(false))
	for i := 1; i < penDwellTicks; i++ {
		require.False(t, sheep.UpdatePen(true))
	}
	assert.True(t, sheep.UpdatePen(true))
}

func TestHerd_AnUnattendedSheepIsPennedWithoutCredit(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	for i := 1; i < penDwellTicks; i++ {
		require.False(t, sheep.UpdatePen(true))
	}
	assert.True(t, sheep.UpdatePen(true), "it leaves anyway, so the pen never fills")
	assert.Zero(t, sheep.Health())
}

func TestHerd_AHerderIsRememberedForTenSeconds(t *testing.T) {
	for _, tc := range []struct {
		idle     int
		credited bool
	}{
		{herderMemoryTicks, true},
		{herderMemoryTicks + 1, false},
	} {
		sheep := newSheep(phy.VEC2F_ZERO)
		p := playerAt(-1, 0)
		sensesAll(sheep, p)
		require.True(t, sheep.Update(0))
		sensesAll(sheep) // the player walks off

		for i := 0; i < tc.idle; i++ {
			require.True(t, sheep.Update(0))
		}
		for i := 1; i < penDwellTicks; i++ {
			sheep.UpdatePen(true)
		}
		require.True(t, sheep.UpdatePen(true))

		credited := p.ledger.KillCount(sheep.definition.ID) == 1
		assert.Equal(t, tc.credited, credited, "%d ticks after the last push", tc.idle)
	}
}

func TestHerd_ADepartedPlayerIsForgotten(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	p := playerAt(-1, 0)
	sensesAll(sheep, p)
	require.True(t, sheep.Update(0))

	sheep.ForgetEntity(p.basic.ID())

	assert.Empty(t, sheep.herders)
}

func TestHerd_SleepForgetsHerdersAndAPenTimerKeepsItAwake(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	sensesAll(sheep, playerAt(-1, 0))
	require.True(t, sheep.Update(0))
	sheep.SetDormant(true)
	assert.Empty(t, sheep.herders, "a slept mob's clock stops, so its memory goes")

	sheep.SetDormant(false)
	sheep.UpdatePen(true)
	assert.False(t, sheep.Pristine(), "a running pen timer must not freeze")
}

func TestHerd_AnAnimalInConversationHoldsStill(t *testing.T) {
	sheep := newSheep(phy.VEC2F_ZERO)
	sensesAll(sheep, playerAt(-1, 0))
	sheep.SetConversing(true)

	require.True(t, sheep.Update(0))
	assert.Equal(t, phy.VEC2F_ZERO, sheep.Position(), "a talk holds it, as it holds a patrolling NPC (D13)")

	sheep.SetConversing(false)
	require.True(t, sheep.Update(0))
	assert.Greater(t, sheep.Position().X, float32(0), "and it runs again once the talk ends")
}

// A talking stray's sensor is the wider of its run radius and its talk range
// (SenseRadius), so the run radius must be judged on its own: a stubborn stray
// lets you walk into talk range before it moves (plan-herding.md D12).
func TestHerd_TheRunRadiusIsAggroRadiusNotTheTalkRange(t *testing.T) {
	def := sheepDefinition()
	def.Body.AggroRadius = 1.5
	def.Interaction = &mobs.Interaction{Range: 2.0}
	stray := NewMob(def, 0, nil)
	stray.SetPosition(phy.VEC2F_ZERO)

	sensesAll(stray, playerAt(-1.9, 0))
	require.True(t, stray.Update(0))
	assert.Equal(t, phy.VEC2F_ZERO, stray.Position(), "in talk range, outside the run radius: it stays")

	sensesAll(stray, playerAt(-1.2, 0))
	require.True(t, stray.Update(0))
	assert.Greater(t, stray.Position().X, float32(0), "inside the run radius: it runs")
}
