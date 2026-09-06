package world

import "math"

// Corridor is one static collision shape a blocking path asks for, in server
// units (plan-world-paths.md C2). Pure geometry: this package cannot build
// phy bodies (world imports nothing from model or phy, and prop.FromZone is the
// same seam for the same reason), so the boot seam in core/game.go turns each
// of these into a phy shape and registers it.
//
// ⚑ Exactly one form is ever set, mirroring PropBody: Radius > 0 is a circle at
// a bend joint, otherwise it is a Length x Width rect turned by Angle. Reading
// the wrong form gets you zeroes, not a wrong shape.
type Corridor struct {
	// X, Y is the centre of either form.
	X, Y float32

	// Radius, when positive, makes this a CIRCLE — the wedge filler at a bend
	// (see PathCorridors). Length, Width and Angle are then zero.
	Radius float32

	// Length runs ALONG the path, Width across it, Angle is the segment's
	// direction in radians. All zero when Radius is set.
	Length, Width, Angle float32
}

// IsCircle reports which form is set.
func (c Corridor) IsCircle() bool { return c.Radius > 0 }

// clearStep is how finely a blocking centreline is sampled when looking for the
// gaps a bridge opens, in server units. [PLACEHOLDER] — it bounds how precisely
// a deck edge can be met, and nothing else: it does NOT set the number of
// bodies, because adjacent blocked samples are merged back into one rect.
const clearStep = 0.5

// maxCorridorSegment caps how long one emitted rect may be, in server units.
// [PLACEHOLDER].
//
// ⛔ Not a cosmetic cap. The broadphase is a sparse spatial hash that inserts by
// BOUNDING BOX, so a single 40-unit diagonal rect occupies a box the size of a
// city block and gets paired against everything in it, every tick — and
// PhysicsSystem was measured at 74 % of the tick budget at 10x density
// (plan-world-scale.md M1-F3). Splitting costs a few more static shapes, which
// the hash is built for, and buys back tight boxes.
const maxCorridorSegment = 8

// PathCorridors builds the static collision shapes for every blocking path in
// the zone, minus whatever the bridges clear (D6).
//
// ⚑ Props must be RESOLVED first: the bridge test reads Def.CrossesPaths. An
// unresolved zone simply finds no bridges and walls its rivers solid, which is
// wrong in the direction that is obvious in-game rather than silent.
//
// ⚑ Ordering does not enter it. Bridges are props, a separate array, so ANY
// crossing prop clears wherever it is authored — there is no "the bridge must
// come after the river" trap to document, which is the whole simplification D6
// bought over the first draft's last-wins rule between paths.
func PathCorridors(z *Zone) []Corridor {
	bridges := crossingProps(z)
	var out []Corridor
	for i := range z.Paths {
		p := &z.Paths[i]
		if !p.BlocksMovement || len(p.Points) < 2 || p.Width <= 0 {
			continue
		}
		out = appendPathCorridors(out, p, bridges)
	}
	return out
}

// crossingProps collects the resolved bridge placements once, so the sampling
// loop below does not re-walk every prop in the zone per sample.
func crossingProps(z *Zone) []*Prop {
	var out []*Prop
	for i := range z.Props {
		if z.Props[i].Def != nil && z.Props[i].Def.CrossesPaths {
			out = append(out, &z.Props[i])
		}
	}
	return out
}

func appendPathCorridors(out []Corridor, p *Path, bridges []*Prop) []Corridor {
	half := p.Width / 2

	for i := 0; i+1 < len(p.Points); i++ {
		a, b := p.Points[i], p.Points[i+1]
		dx, dy := b.X-a.X, b.Y-a.Y
		length := float32(math.Hypot(float64(dx), float64(dy)))
		if length == 0 {
			// A duplicated vertex. Authorable by a stray double-click in Tiled,
			// and a zero-length rect is a degenerate body, so skip it rather
			// than hand the physics engine a NaN angle.
			continue
		}
		angle := float32(math.Atan2(float64(dy), float64(dx)))
		ux, uy := dx/length, dy/length

		// Sub-intervals of at most clearStep, sampled at their MIDPOINTS: a
		// midpoint sample means a sub-interval is cleared only when the deck
		// actually covers its middle, so a deck edge never half-clears a piece.
		steps := int(math.Ceil(float64(length / clearStep)))
		if steps < 1 {
			steps = 1
		}
		step := length / float32(steps)

		// Walk the samples and merge maximal BLOCKED runs back into single
		// rects — the sampling exists to find the bridge gaps, not to set the
		// body count. An unbridged 40-unit segment comes out of here as one run.
		runStart := -1
		for s := 0; s <= steps; s++ {
			blocked := false
			if s < steps {
				t := (float32(s) + 0.5) * step
				blocked = !coveredByBridge(a.X+ux*t, a.Y+uy*t, bridges)
			}
			switch {
			case blocked && runStart < 0:
				runStart = s
			case !blocked && runStart >= 0:
				out = emitRun(out, a.X, a.Y, ux, uy, float32(runStart)*step, float32(s)*step, p.Width, angle)
				runStart = -1
			}
		}

		// The joint at the far end of this segment, where the next one turns
		// away: two rects meeting at an angle leave a wedge open on the OUTER
		// corner, and a circle of the same half-width fills it for either turn
		// direction without knowing which way the bend goes.
		if i+2 < len(p.Points) && !coveredByBridge(b.X, b.Y, bridges) {
			out = append(out, Corridor{X: b.X, Y: b.Y, Radius: half})
		}
	}
	return out
}

// emitRun turns one blocked interval [from, to) along a segment into rects, each
// no longer than maxCorridorSegment.
func emitRun(out []Corridor, ax, ay, ux, uy, from, to, width, angle float32) []Corridor {
	total := to - from
	if total <= 0 {
		return out
	}
	pieces := int(math.Ceil(float64(total / maxCorridorSegment)))
	if pieces < 1 {
		pieces = 1
	}
	pieceLen := total / float32(pieces)
	for k := 0; k < pieces; k++ {
		mid := from + pieceLen*(float32(k)+0.5)
		out = append(out, Corridor{
			X:      ax + ux*mid,
			Y:      ay + uy*mid,
			Length: pieceLen,
			Width:  width,
			Angle:  angle,
		})
	}
	return out
}

// coveredByBridge reports whether a point lies inside any bridge's VISUAL
// footprint (see PropDefinition.CrossesPaths for why visual and not collision).
func coveredByBridge(x, y float32, bridges []*Prop) bool {
	for _, b := range bridges {
		if pointInPropBody(x, y, b) {
			return true
		}
	}
	return false
}

// pointInPropBody tests a point against a prop's visual body, honouring the
// placement's rotation for a rect. Mirrors phy's own rotated-rect test rather
// than importing it: world cannot import phy.
func pointInPropBody(x, y float32, p *Prop) bool {
	body := p.VisualBody()
	dx, dy := x-p.X, y-p.Y
	if body.Radius > 0 {
		return dx*dx+dy*dy <= body.Radius*body.Radius
	}
	if body.Width <= 0 || body.Height <= 0 {
		return false
	}
	// Into the rect's own frame: turn the offset back by the prop's angle.
	sin, cos := math.Sincos(float64(-p.Rotation))
	lx := dx*float32(cos) - dy*float32(sin)
	ly := dx*float32(sin) + dy*float32(cos)
	return lx >= -body.Width/2 && lx <= body.Width/2 &&
		ly >= -body.Height/2 && ly <= body.Height/2
}
