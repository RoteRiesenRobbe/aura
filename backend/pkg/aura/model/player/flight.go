package player

import (
	"github.com/RoteRiesenRobbe/aura/pkg/aura/model/constant"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/phy"
)

// flightState is a campfire-to-campfire flight in progress
// (plan-flight-paths.md §4.1). The space reference is held for exactly the
// duration of the flight: takeoff is the one exit from the ground world and
// Ground() the one re-entry, so the shapes' whereabouts and the flight flag
// can never disagree (D13). World-side effects — the mob forget sweep, the
// §4.2 input gates — belong to the driving system, not here.
type flightState struct {
	active bool

	fromID, toID string
	from, to     phy.Vec2f

	startTick, arrivalTick uint64

	// space the shapes left at takeoff and return to on Ground().
	space *phy.Space
}

// Flying reports whether the player is airborne between two campfires.
func (p *player) Flying() bool {
	return p.flight.active
}

// FlightDest is the landing position; zero while not flying. On the wire as
// Character.flight_dest.
func (p *player) FlightDest() phy.Vec2f {
	if !p.flight.active {
		return phy.Vec2f{}
	}
	return p.flight.to
}

// FlightArrivalTick is the server tick the lerp completes on; 0 while not
// flying. On the wire as Character.flight_arrival_tick.
func (p *player) FlightArrivalTick() uint64 {
	if !p.flight.active {
		return 0
	}
	return p.flight.arrivalTick
}

// BeginFlight arms the flight state and leaves the ground world (D13): the
// body and aura sensor are removed from the space — `Space.RemoveShape`
// purges them from every other shape's collision set on the spot (the §54
// invariant), so nothing can hold or re-acquire the flyer — and the viewport
// grows to the flight scale. The viewport shape deliberately STAYS in the
// space: the flyer still sees everything below (§4.2 — the two directions of
// visibility live in different shapes).
//
// Validation is the caller's job (core/input.go holds the precondition list,
// §4.4). Speed and viewport scale come from the player config so the two
// flight knobs live beside every other tuning value. arrivalTick is derived
// from distance so the endpoints and the timer can never disagree.
func (p *player) BeginFlight(space *phy.Space, fromID, toID string, dest phy.Vec2f, startTick uint64) {
	if p.flight.active {
		return
	}
	from := p.Position()

	speed := p.config.WalkingSpeedPerTick * p.config.FlightSpeedFactor
	ticks := uint64(1)
	if speed > 0 {
		if t := uint64(from.DistanceTo(dest) / speed); t > 0 {
			ticks = t
		}
	}

	p.flight = flightState{
		active:      true,
		fromID:      fromID,
		toID:        toID,
		from:        from,
		to:          dest,
		startTick:   startTick,
		arrivalTick: startTick + ticks,
		space:       space,
	}

	if space != nil {
		for _, s := range p.flightShapes() {
			space.RemoveShape(s)
		}
	}
	p.setViewportScale(flightViewportScale)
}

// FlightPosition is the lerp: where the flyer is at the given tick, and
// whether the flight is complete. Exact at both endpoints — at arrivalTick the
// returned position IS the destination.
func (p *player) FlightPosition(tick uint64) (pos phy.Vec2f, arrived bool) {
	f := &p.flight
	if !f.active {
		return p.Position(), false
	}
	if tick >= f.arrivalTick {
		return f.to, true
	}
	if tick <= f.startTick {
		return f.from, false
	}
	t := float32(tick-f.startTick) / float32(f.arrivalTick-f.startTick)
	return f.from.Add(f.to.Sub(f.from).Mult(t)), false
}

// Ground re-enters the ground world: shapes back into the space, viewport back
// to its default extent, flight state cleared. The ONE re-entry — landing and
// a mid-flight WARP both come through here, so a half-restored flyer cannot
// exist. No-op on the ground. The caller decides the final position (the
// landing snap, or the warp target).
func (p *player) Ground() {
	if !p.flight.active {
		return
	}
	space := p.flight.space
	p.flight = flightState{}
	if space != nil {
		for _, s := range p.flightShapes() {
			space.AddShape(s)
		}
	}
	p.setViewportScale(1)
}

// flightShapes are the shapes that leave the space at takeoff and return on
// Ground(): body, aura sensor — NOT the viewport.
func (p *player) flightShapes() []phy.DynamicCollider {
	return []phy.DynamicCollider{p.Body, p.aura}
}

// flightViewportScale is how much the server-side AOI grows while flying
// (§4.3, D3) — ~2.5× linear is ~6.25× streamed area, so this is a perf knob
// as much as a feel knob.
//
// ⚑ RETUNING THIS ALONE IS A BUG. The client's zoom-out must move with it or
// entities pop in at the screen edges (landmine 3), and the client's copy is a
// separate literal in a separate language: FLIGHT_VIEWPORT_SCALE in
// frontend/src/features/camera/logic/Zoom.ts. Nothing but
// TestFlightViewportScale_MatchesTheClient can notice when the two drift —
// both language's suites stay green, because each side is internally
// consistent.
//
// Cut twice by the PO's in-air passes on 2026-08-05: 2.5 → 1.75 → 1.2, each
// time "still too far out". The two cuts together take the streamed area from
// ~6.25× the ground viewport to ~1.4×, so what began as the flight feature's
// biggest mobile-perf cost is now nearly free. [PLACEHOLDER]
const flightViewportScale = 1.2

// setViewportScale resizes the AOI box around the default viewport extent.
func (p *player) setViewportScale(factor float32) {
	if factor <= 0 {
		factor = 1
	}
	p.viewport.SetExtent(phy.Vec2f{
		X: constant.ViewPortWidth / 2 * factor,
		Y: constant.ViewPortHeight / 2 * factor,
	})
}
