package mob

// Mob-vs-mob soft separation pins (playtest round 6 item 3, PO decision
// 2026-07-26: soft separation, NOT hard collision — backlog §34). Packs bend
// around each other while they move; nothing blocks anything, no player is
// ever repelled, and the head-on detour latch stays a statics-only mechanism.

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// spawnChaser plants a steering mob in the space, chasing t.
func spawnChaser(space *phy.Space, pos phy.Vec2f, t model.Combatant) *Mob {
	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(pos)
	space.AddShape(m.Body)
	m.aggroTarget = t
	return m
}

// tickAll runs one mob step for every mob, then one physics step — the order
// core.Loop uses (MobSystem before PhysicsSystem).
func tickAll(t *testing.T, space *phy.Space, ms ...*Mob) {
	t.Helper()
	for _, m := range ms {
		require.True(t, m.Update(0))
	}
	space.Update()
}

// plantBody adds a dynamic body to the space the way a real entity's body sits
// in it: a layered circle carrying the entity in UserData.
func plantBody(space *phy.Space, pos phy.Vec2f, radius float32, layer model.CollisionLayer, userData interface{}) *phy.Circle {
	c := phy.NewCircle(pos, radius)
	c.Shape().Layer = int(layer)
	c.Shape().UserData = userData
	space.AddShape(c)
	return c
}

func TestMobSeparation_ChasingPackSpreadsOut(t *testing.T) {
	space := phy.NewSpace()
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 8, Y: 0} // far enough that both keep approaching

	a := spawnChaser(space, phy.Vec2f{X: 0, Y: 0.05}, p)
	b := spawnChaser(space, phy.Vec2f{X: 0, Y: -0.05}, p)

	start := a.Position().Sub(b.Position()).Abs()
	require.Less(t, start, float32(0.2), "test setup: the pair starts overlapping")

	for i := 0; i < 80; i++ {
		tickAll(t, space, a, b)
	}

	d := a.Position().Sub(b.Position()).Abs()
	assert.Greater(t, d, float32(0.6),
		"two mobs chasing the same target must push apart while they travel (got %v)", d)
}

func TestMobSeparation_CoLocatedMobsSeparate(t *testing.T) {
	space := phy.NewSpace()
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 8, Y: 0}

	// Exactly one point, same heading — what a summon/wave spawn produces.
	// circleRepulsion's dead-center fallback pushes along the heading, so
	// without a tie-break the pair pushes identically and stays welded.
	a := spawnChaser(space, phy.VEC2F_ZERO, p)
	b := spawnChaser(space, phy.VEC2F_ZERO, p)
	require.Equal(t, a.heading, b.heading, "test setup: identical headings")

	for i := 0; i < 40; i++ {
		tickAll(t, space, a, b)
	}

	d := a.Position().Sub(b.Position()).Abs()
	assert.Greater(t, d, float32(0.2),
		"mobs spawned on one point must come apart, not travel welded (got %v)", d)
}

func TestMobSeparation_SingleFilePackSplits(t *testing.T) {
	space := phy.NewSpace()
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 10, Y: 0}

	// Nose to tail on the line of travel — what a chase converges every pack
	// into. The trailing mob's push is straight backwards, and steering sets
	// direction, not speed, so without blendSeparation's rotation the two
	// travel welded the whole way.
	a := spawnChaser(space, phy.Vec2f{X: 0.5, Y: 0}, p)
	b := spawnChaser(space, phy.VEC2F_ZERO, p)

	for i := 0; i < 80; i++ {
		tickAll(t, space, a, b)
	}

	lateral := a.Position().Y - b.Position().Y
	if lateral < 0 {
		lateral = -lateral
	}
	assert.Greater(t, lateral, float32(0.4),
		"a single-file pair must split sideways, not travel welded (lateral gap %v)", lateral)
}

func TestMobSeparation_DoesNotLatchTheDetour(t *testing.T) {
	space := phy.NewSpace()
	p := newFakeAuraPlayer()
	p.pos = phy.Vec2f{X: 6, Y: 0}

	m := spawnChaser(space, phy.VEC2F_ZERO, p)

	// A standing mob dead on the line, its only obstruction. The head-on latch
	// was tuned against stationary STATICS; a moving blocker that latches it
	// makes the mob walk sideways until it is clear of everything.
	still := NewMob(standingMobDefinition(), 0, space)
	still.SetPosition(phy.Vec2f{X: 1, Y: 0})
	space.AddShape(still.Body)

	reach := m.aura.Radius + p.radius
	reached := false
	for i := 0; i < 300; i++ {
		tickAll(t, space, m, still)
		require.Zero(t, m.steerSide, "another mob must never latch a detour (tick %d)", i)
		if m.Position().Sub(p.pos).Abs() <= reach {
			reached = true
			break
		}
	}
	assert.True(t, reached, "separation must bend the path, not block it; final pos %v", m.Position())
}

func TestMobSeparation_IgnoresPlayerBodies(t *testing.T) {
	space := phy.NewSpace()
	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)

	// A player body right next to the mob, layered exactly like model/player
	// lays its own out. No player↔mob separation is a PO rejection (round 6)
	// and must hold structurally, not by tuning.
	plantBody(space, phy.Vec2f{X: 0.4, Y: 0}, 0.25,
		model.LayerViewportCollision|model.LayerPlayerCollision, newFakeAuraPlayer())
	space.Update()

	assert.Equal(t, phy.VEC2F_ZERO, m.mobSeparation(), "a player body must not repel a mob")

	// Discriminating control: a MOB body in the same spot does repel.
	other := NewMob(steeringMobDefinition(), 0, space)
	other.SetPosition(phy.Vec2f{X: 0.4, Y: 0})
	space.AddShape(other.Body)
	space.Update()

	assert.NotEqual(t, phy.VEC2F_ZERO, m.mobSeparation(), "a mob body must repel a mob")
}

func TestMobSeparation_NeverReversesThePull(t *testing.T) {
	space := phy.NewSpace()
	m := NewMob(steeringMobDefinition(), 0, space)
	m.SetPosition(phy.VEC2F_ZERO)
	space.AddShape(m.Body)

	// Ring the mob in mobs, all pushing outward from the same point: the sum
	// is clamped, so the step direction still leans toward the desired one.
	for _, o := range []phy.Vec2f{{X: 0.2, Y: 0}, {X: 0.25, Y: 0.1}, {X: 0.2, Y: -0.1}, {X: 0.3, Y: 0.2}} {
		other := NewMob(steeringMobDefinition(), 0, space)
		other.SetPosition(o)
		space.AddShape(other.Body)
	}
	space.Update()

	desired := phy.Vec2f{X: 1, Y: 0} // straight into the crowd
	dir := m.steer(desired)
	assert.Greater(t, dir.Dot(desired), float32(0),
		"separation may bend the step direction, never reverse it (got %v)", dir)
}

// standingMobDefinition is a mob that never moves — a stationary blocker to
// steer around (speed 0 short-circuits moveTowards).
func standingMobDefinition() *mobs.MobDefinition {
	d := steeringMobDefinition()
	d.Factors.Speed = 0
	return d
}
