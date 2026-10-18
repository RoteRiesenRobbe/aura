package sys

import (
	"testing"

	"github.com/EngoEngine/ecs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Touch exits (plan-passages.md P4, D8/D9): walk in, stay passageDwellTicks,
// and the player is moved to the area's anchor; the crossing byte says which
// way while the dwell runs.

type fakePassenger struct {
	basic      ecs.BasicEntity
	pos        phy.Vec2f
	flying     bool
	grounded   int
	conversing uint64
	crossings  []model.TravelDirection
}

func newFakePassenger(x, y float32) *fakePassenger {
	return &fakePassenger{basic: ecs.NewBasic(), pos: phy.Vec2f{X: x, Y: y}, conversing: 7}
}

func (p *fakePassenger) Basic() ecs.BasicEntity           { return p.basic }
func (p *fakePassenger) Position() phy.Vec2f              { return p.pos }
func (p *fakePassenger) Flying() bool                     { return p.flying }
func (p *fakePassenger) Ground()                          { p.grounded++ }
func (p *fakePassenger) SetPosition(pos phy.Vec2f)        { p.pos = pos }
func (p *fakePassenger) SetConversingWith(id uint64)      { p.conversing = id }
func (p *fakePassenger) SetCrossing(d model.TravelDirection) { p.crossings = append(p.crossings, d) }
func (p *fakePassenger) crossing() model.TravelDirection {
	if len(p.crossings) == 0 {
		return model.TravelNone
	}
	return p.crossings[len(p.crossings)-1]
}

// A surface zone with one touch area at (10, 10) ± 1 leading DOWN to a cave
// anchor at (0, 300).
func passageFixture(t *testing.T) (*PassageSystem, phy.Vec2f) {
	t.Helper()
	area := world.ExitArea{Anchor: "cave", Points: []world.Point{{X: 9, Y: 9}, {X: 11, Y: 9}, {X: 11, Y: 11}, {X: 9, Y: 11}}}
	dest := phy.Vec2f{X: 0, Y: 300}
	zones := []cfg.PlacedBounds{
		{ZoneID: "world", Bounds: cfg.Bounds{Width: 100, Height: 100}},
		{ZoneID: "cave", Bounds: cfg.Bounds{Width: 100, Height: 100}, OriginY: 300},
	}
	return NewPassageSystem([]world.ExitArea{area}, map[string]phy.Vec2f{"cave": dest}, zones), dest
}

func steps(s *PassageSystem, n int) {
	for i := 0; i < n; i++ {
		s.Update(1.0 / 30)
	}
}

func near(a, b phy.Vec2f, r float32) bool { return a.DistanceToSquared(b) <= r*r }

func TestPassage_WalkInDwellThenTravel(t *testing.T) {
	s, dest := passageFixture(t)
	p := newFakePassenger(8, 10)
	s.AddPlayer(p)
	steps(s, 2) // seen outside: armed

	p.pos = phy.Vec2f{X: 9.5, Y: 10} // one step in
	steps(s, passageDwellTicks-1)
	assert.Equal(t, phy.Vec2f{X: 9.5, Y: 10}, p.pos, "the dwell has not run out yet")
	assert.Equal(t, model.TravelDescend, p.crossing(), "the curtain may start: the byte says which way")

	steps(s, 1)
	assert.True(t, near(p.pos, dest, respawnJitterRadius), "moved to the anchor, got %v", p.pos)
	assert.Equal(t, 1, p.grounded, "the travel recipe: Ground() first")
	assert.Zero(t, p.conversing, "an open panel closes with the move")
	assert.Equal(t, model.TravelDescend, p.crossing(), "still set on the travel tick, so the client sees the arrival under cover")

	steps(s, 1)
	assert.Equal(t, model.TravelNone, p.crossing(), "and clear once arrived")
}

func TestPassage_LeavingDuringTheDwellCancels(t *testing.T) {
	s, _ := passageFixture(t)
	p := newFakePassenger(8, 10)
	s.AddPlayer(p)
	steps(s, 1)
	p.pos = phy.Vec2f{X: 9.5, Y: 10}
	steps(s, passageDwellTicks-2)
	p.pos = phy.Vec2f{X: 8.5, Y: 10} // brushed the edge and stepped back out
	steps(s, 1)
	assert.Equal(t, model.TravelNone, p.crossing(), "the curtain is told to cancel")
	steps(s, passageDwellTicks*2)
	assert.Equal(t, phy.Vec2f{X: 8.5, Y: 10}, p.pos, "nobody moved")

	// Back in: a fresh dwell, not the remainder of the old one.
	p.pos = phy.Vec2f{X: 9.5, Y: 10}
	steps(s, passageDwellTicks-1)
	assert.Equal(t, phy.Vec2f{X: 9.5, Y: 10}, p.pos)
}

// ⭐ D8: it fires on ENTERING, never on standing. A player who arrives inside
// (a login, a respawn, a warp, a landing) is disarmed until they have been
// outside once, which is the ping-pong guard.
func TestPassage_ArrivingInsideIsDisarmedUntilOutside(t *testing.T) {
	s, _ := passageFixture(t)

	t.Run("a login inside", func(t *testing.T) {
		p := newFakePassenger(10, 10)
		s.AddPlayer(p)
		steps(s, passageDwellTicks*3)
		assert.Equal(t, phy.Vec2f{X: 10, Y: 10}, p.pos)
		assert.Equal(t, model.TravelNone, p.crossing())

		p.pos = phy.Vec2f{X: 8.5, Y: 10} // out
		steps(s, 1)
		p.pos = phy.Vec2f{X: 9.5, Y: 10} // and in again: now it counts
		steps(s, passageDwellTicks)
		assert.NotEqual(t, phy.Vec2f{X: 9.5, Y: 10}, p.pos)
	})

	t.Run("a warp inside", func(t *testing.T) {
		p := newFakePassenger(-30, 10)
		s.AddPlayer(p)
		steps(s, 2)
		p.pos = phy.Vec2f{X: 10, Y: 10} // a jump, not a walk
		steps(s, passageDwellTicks*3)
		assert.Equal(t, phy.Vec2f{X: 10, Y: 10}, p.pos)
	})
}

// A flyer is never crossing anything: flight removes the body (the quest
// reach's D8), and the landing is an arrival like any other.
func TestPassage_FlyersAreSkipped(t *testing.T) {
	s, _ := passageFixture(t)
	p := newFakePassenger(8, 10)
	s.AddPlayer(p)
	steps(s, 1)
	p.flying = true
	p.pos = phy.Vec2f{X: 9.5, Y: 10}
	steps(s, passageDwellTicks*2)
	assert.Equal(t, phy.Vec2f{X: 9.5, Y: 10}, p.pos)
	assert.Equal(t, model.TravelNone, p.crossing())

	p.flying = false // landed inside: disarmed
	steps(s, passageDwellTicks*2)
	assert.Equal(t, phy.Vec2f{X: 9.5, Y: 10}, p.pos)
}

func TestPassage_RemovedPlayersAreForgotten(t *testing.T) {
	s, _ := passageFixture(t)
	p := newFakePassenger(8, 10)
	s.AddPlayer(p)
	s.Remove(p.Basic())
	p.pos = phy.Vec2f{X: 9.5, Y: 10}
	steps(s, passageDwellTicks*2)
	assert.Equal(t, phy.Vec2f{X: 9.5, Y: 10}, p.pos)
	require.Empty(t, s.riders)
}
