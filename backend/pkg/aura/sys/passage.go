package sys

import (
	"github.com/EngoEngine/ecs"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// passageDwellTicks is how long a player stands in a touch exit before it
// moves them (plan-passages.md D8, Q1): long enough that brushing an edge does
// nothing and that the client's curtain (COVER_MS 180 ms) is down before the
// cut. [PLACEHOLDER 0.3 s at 30 ticks/s]
const passageDwellTicks = 9

// passageArrivalJump is the distance in one tick past which a move is an
// ARRIVAL (a travel, a warp, a respawn, a landing), never a walk: an arrival
// inside an exit is disarmed (D8). Far above any walking or dashing step,
// far below the shortest teleport. [PLACEHOLDER]
const passageArrivalJump = 3.0

// passenger is what the PassageSystem needs of a player: where they are,
// whether they are in the air, the travel recipe, and the crossing byte.
type passenger interface {
	traveller
	Basic() ecs.BasicEntity
	Position() phy.Vec2f
	Flying() bool
	// SetCrossing is the own-player crossing byte (D9): the way the dwell
	// will move them, 0 otherwise. Written every tick.
	SetCrossing(d model.TravelDirection)
}

// touchExit is one exit area, ready to test: its bounding box for the cheap
// precheck, and the anchor-mode travel resolved once at boot.
type touchExit struct {
	area      world.ExitArea
	min, max  world.Point
	travel    portalTravel
	direction model.TravelDirection
}

// riderState is the one tiny state a player carries through the areas (D8).
type riderState struct {
	p     passenger
	prev  phy.Vec2f
	seen  bool
	armed bool
	// dwellIn is the area being dwelt in, -1 for none.
	dwellIn    int
	dwellTicks int
}

// PassageSystem moves players who walk into a touch exit (plan-passages.md
// P4, D8). Players only; a flat scan of the areas (a handful per world, so no
// grid until measured), after an AABB precheck.
//
// ⭐ IT FIRES ON ENTERING, NEVER ON STANDING. A player who arrives inside an
// area is disarmed until they have stood outside every area once: that is the
// ping-pong guard (L3), and world.CrossValidateExitAreas, which refuses an
// anchor inside any area, is its belt.
//
// ⚑ Not gated in v1 (Q2): combat, an open panel, nothing refuses a crossing.
// A gated passage is a talk exit with a custom door.
type PassageSystem struct {
	exits  []touchExit
	riders []*riderState
}

// NewPassageSystem takes the placed areas (world coordinates) and the same
// anchor table and zone rectangles the talk exits travel by.
func NewPassageSystem(areas []world.ExitArea, zoneAnchors map[string]phy.Vec2f,
	zones []cfg.PlacedBounds) *PassageSystem {
	s := &PassageSystem{}
	for _, a := range areas {
		c := a.Centroid()
		t := touchExit{area: a, min: a.Points[0], max: a.Points[0],
			travel: portalTravel{zoneAnchors: zoneAnchors, from: phy.Vec2f{X: c.X, Y: c.Y}, zones: zones}}
		for _, p := range a.Points {
			t.min.X, t.min.Y = min(t.min.X, p.X), min(t.min.Y, p.Y)
			t.max.X, t.max.Y = max(t.max.X, p.X), max(t.max.Y, p.Y)
		}
		t.direction = t.travel.Direction(mobs.TravelAnchor, a.Anchor)
		s.exits = append(s.exits, t)
	}
	return s
}

// Priority 20, beside the InteractionSystem: both read the position the last
// physics step left and move a player the same way.
func (s *PassageSystem) Priority() int { return 20 }

func (s *PassageSystem) New(*ecs.World) {}

func (s *PassageSystem) AddPlayer(p passenger) {
	s.riders = append(s.riders, &riderState{p: p, dwellIn: -1})
}

func (s *PassageSystem) Remove(b ecs.BasicEntity) {
	for i, r := range s.riders {
		if r.p.Basic().ID() == b.ID() {
			s.riders = append(s.riders[:i], s.riders[i+1:]...)
			return
		}
	}
}

func (s *PassageSystem) Update(float32) {
	if len(s.exits) == 0 {
		return
	}
	for _, r := range s.riders {
		s.step(r)
	}
}

func (s *PassageSystem) step(r *riderState) {
	p := r.p
	if p.Flying() {
		// The landing is an arrival like any other.
		r.seen, r.dwellIn = false, -1
		p.SetCrossing(model.TravelNone)
		return
	}
	pos := p.Position()
	at := s.exitAt(pos)
	arrived := !r.seen || pos.DistanceToSquared(r.prev) > passageArrivalJump*passageArrivalJump
	r.prev, r.seen = pos, true
	switch {
	case arrived:
		r.armed, r.dwellIn = at < 0, -1
	case at < 0:
		r.armed, r.dwellIn = true, -1
	case !r.armed:
		// Inside since arriving: nothing until they have been out.
	case r.dwellIn != at:
		r.dwellIn, r.dwellTicks = at, 1
	default:
		r.dwellTicks++
	}
	if r.dwellIn < 0 {
		p.SetCrossing(model.TravelNone)
		return
	}
	e := &s.exits[r.dwellIn]
	// ⚑ Still set on the travel tick: the client sees the arrival while the
	// byte holds, so the curtain covers the cut instead of cancelling (D9).
	p.SetCrossing(e.direction)
	if r.dwellTicks < passageDwellTicks {
		return
	}
	t := e.travel
	t.rider = p
	t.Travel(mobs.TravelAnchor, e.area.Anchor)
	r.armed, r.dwellIn = false, -1
}

// exitAt is the index of the touch exit pos stands in, -1 for none.
func (s *PassageSystem) exitAt(pos phy.Vec2f) int {
	for i := range s.exits {
		e := &s.exits[i]
		if pos.X < e.min.X || pos.X > e.max.X || pos.Y < e.min.Y || pos.Y > e.max.Y {
			continue
		}
		if world.PointInPolygon(pos.X, pos.Y, e.area.Points) {
			return i
		}
	}
	return -1
}
