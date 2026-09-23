package spectator

import (
	"math"
	"math/rand"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// The start-screen tour: the pre-join spectator sweeps slowly across the
// primary zone, holds still for a moment, then cuts to a sweep somewhere else.
// The motion lives on the server because only the server's AOI box streams
// entities: a client-side pan would scroll over terrain with nothing on it.
//
// ⚑ THE HOLD IS THE CLIENT'S FADE CUE. The wire carries nothing but the
// position, so "the view stopped moving" is how the client knows a cut is
// coming and fades to black BEFORE the entities of the old spot stop
// streaming (SpectateFade.ts). TourHoldSeconds must stay longer than the
// client's stop detection plus its cover fade, or the old spot's entities pop
// under a half-drawn fade. The failure is cosmetic, which is why this is a
// comment and not a cross-language pin.
const (
	// TourViewportScale grows the touring spectator's AOI box, "a bit zoomed
	// out, giving an idea of the scale".
	//
	// ⚑ SYNCED WITH THE CLIENT: SPECTATE_VIEWPORT_SCALE in
	// frontend/src/features/camera/logic/Zoom.ts, the FlightViewportScale
	// discipline exactly. TestTourViewportScale_MatchesTheClient reads that
	// file. Retune BOTH. [PLACEHOLDER]
	TourViewportScale = 2.0

	TourSpeed        = 1.0  // units per second [PLACEHOLDER]
	TourSweepSeconds = 20.0 // [PLACEHOLDER]
	TourHoldSeconds  = 0.8  // [PLACEHOLDER], see the hold note above
)

// TourPlan is the immutable half every touring spectator shares: where a sweep
// may be centred (the primary zone's mob spawns, so there is life on screen)
// and the rectangle the view centre must stay inside.
type TourPlan struct {
	anchors  []phy.Vec2f
	min, max phy.Vec2f
}

// NewTourPlan builds the plan for one zone rectangle, centred on origin. The
// centre is kept a full (scaled) AOI half-extent off every edge, so the view
// never shows past the border wall and the client's camera clamp never binds.
// An axis the zone is too small for locks to the zone's centre. Anchors outside
// the rectangle (another zone's spawns) are dropped; with none left the zone
// centre is the only anchor.
func NewTourPlan(origin phy.Vec2f, width, height float32, spawns []phy.Vec2f) *TourPlan {
	insetX := float32(math.Max(0, float64(width/2-constant.ViewPortWidth/2*TourViewportScale)))
	insetY := float32(math.Max(0, float64(height/2-constant.ViewPortHeight/2*TourViewportScale)))
	p := &TourPlan{
		min: phy.Vec2f{X: origin.X - insetX, Y: origin.Y - insetY},
		max: phy.Vec2f{X: origin.X + insetX, Y: origin.Y + insetY},
	}
	for _, s := range spawns {
		if s.X < origin.X-width/2 || s.X > origin.X+width/2 ||
			s.Y < origin.Y-height/2 || s.Y > origin.Y+height/2 {
			continue
		}
		p.anchors = append(p.anchors, s)
	}
	if len(p.anchors) == 0 {
		p.anchors = []phy.Vec2f{origin}
	}
	return p
}

func (p *TourPlan) clamp(v phy.Vec2f) phy.Vec2f {
	return phy.Vec2f{
		X: float32(math.Min(float64(p.max.X), math.Max(float64(p.min.X), float64(v.X)))),
		Y: float32(math.Min(float64(p.max.Y), math.Max(float64(p.min.Y), float64(v.Y)))),
	}
}

// Tour is one spectator's walk through the plan.
type Tour struct {
	plan     *TourPlan
	rng      *rand.Rand
	from, to phy.Vec2f
	elapsed  float32 // seconds into the current sweep + hold
}

// NewTour starts a tour on its first sweep.
func (p *TourPlan) NewTour(rng *rand.Rand) *Tour {
	t := &Tour{plan: p, rng: rng}
	t.nextSweep()
	return t
}

// nextSweep centres a sweep on a random anchor, in a random direction. The
// centre is clamped into the plan's rectangle FIRST (a spawn beside the wall
// would otherwise collapse both ends onto one point: a sweep that never moves),
// then both ends are, so a sweep near an edge is at worst half as long and half
// as fast, never out of bounds.
func (t *Tour) nextSweep() {
	mid := t.plan.clamp(t.plan.anchors[t.rng.Intn(len(t.plan.anchors))])
	angle := t.rng.Float64() * 2 * math.Pi
	half := float32(TourSpeed * TourSweepSeconds / 2)
	dir := phy.Vec2f{X: float32(math.Cos(angle)) * half, Y: float32(math.Sin(angle)) * half}
	t.from = t.plan.clamp(phy.Vec2f{X: mid.X - dir.X, Y: mid.Y - dir.Y})
	t.to = t.plan.clamp(phy.Vec2f{X: mid.X + dir.X, Y: mid.Y + dir.Y})
	t.elapsed = 0
}

// Advance moves the tour on by dt milliseconds and returns the new position.
func (t *Tour) Advance(dtMillis float32) phy.Vec2f {
	t.elapsed += dtMillis / 1000
	if t.elapsed >= TourSweepSeconds+TourHoldSeconds {
		t.nextSweep()
	}
	return t.Position()
}

// Position is where the view centre sits right now.
func (t *Tour) Position() phy.Vec2f {
	f := t.elapsed / TourSweepSeconds
	if f > 1 {
		f = 1 // the hold
	}
	return phy.Vec2f{
		X: t.from.X + (t.to.X-t.from.X)*f,
		Y: t.from.Y + (t.to.Y-t.from.Y)*f,
	}
}
