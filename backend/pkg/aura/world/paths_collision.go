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

// taperLengthPerWidth is how far along the arc a pointed end (Path.Ends
// "point") narrows to nothing, as a multiple of the path's width.
// [PLACEHOLDER] — PO-ruled a fixed number rather than an authored one.
//
// ⚑ The client holds the SAME number (frontend Paths.ts
// TAPER_LENGTH_PER_WIDTH), and the two must agree: one draws the tip, the
// other walls it. Each side pins it with a test.
const taperLengthPerWidth = 2

// capLengthPerWidth is how long a faded end's cap is drawn (Path.Ends "fade",
// plan-cliffs.md D2), as a multiple of the path's width. [PLACEHOLDER].
//
// ⚑ The client holds the SAME number (frontend Paths.ts CAP_LENGTH_PER_WIDTH):
// it stretches the cap art over this length, and the wall below narrows with
// it. Each side pins it with a test.
const capLengthPerWidth = 2

// faceBand is the strip across a path its wall covers, in world units from the
// centreline: top < bottom, positive toward the FACE side, which is the right
// hand walking the path (the client's `v > 0.5`, PathRibbon's segmentNormal).
type faceBand struct{ top, bottom float32 }

// drawnFaces is the band each CLIFF profile's art really draws, so its wall
// covers what the eye sees and no more (PO 2026-10-25: the cliff "height"
// blocked more than was visible). It is asymmetric because the art is: the lip
// or coping sits further from the centreline than the foot, and the baked
// shadow past the foot is walkable ground.
//
// ⚑ The one place the server names a terrain profile; everywhere else Profile
// is client-only (D5). These are measurements of the tiles, not tuning:
// TestDrawnFacesMatchTheirTiles re-measures every PNG (rows at least half
// opaque) and requires an entry for every profile that draws a `cap`. Every
// other blocking path walls its full width.
var drawnFaces = map[string]faceBand{
	"Cliff":          {-0.617, 0.575},
	"Cliff Smooth":   {-0.625, 0.517},
	"Retaining Wall": {-0.617, 0.442},
}

// pathBand is the band a path's wall covers away from its ends: its drawn face
// when it has one, cropped to the path's width (a narrower path crops the art).
func pathBand(p *Path) faceBand {
	half := p.Width / 2
	b := faceBand{-half, half}
	if face, ok := drawnFaces[p.Profile]; ok {
		b = faceBand{max(b.top, face.top), min(b.bottom, face.bottom)}
	}
	return b
}

// taper is a pointed or faded path's profile along its arc. The zero value
// changes nothing, which is every path that authors neither "point" nor
// "fade".
type taper struct {
	length, total float32
	// start and end say which ends narrow (plan-cliffs.md D1: each end has
	// its own shape).
	start, end bool
	// capStart and capEnd are the arc each faded end's cap covers, 0 when the
	// end is not faded. Across a cap the band's top SINKS to its foot, the way
	// the cap art steps down: walled to the tip, never wider than the art (PO
	// 2026-10-25, re-ruling plan-cliffs.md Q1 and D2's "never narrows": an
	// open stretch read as a bug, a full-width one blocked thin air).
	capStart, capEnd float32
}

// pathTaper measures the taper an open path's "point" ends get: 2 × width at
// each pointed end, clamped to half the path so two never overlap (and one
// alone is clamped the same way, as the client does). The taper is INSIDE the
// drawn length (PO-ruled) — the endpoint is the tip.
//
// A "fade" end is measured the same way: a cap of capLengthPerWidth × width,
// clamped to half the path.
func pathTaper(p *Path) taper {
	start, end := p.endOf(true) == "point", p.endOf(false) == "point"
	fadeStart, fadeEnd := p.endOf(true) == "fade", p.endOf(false) == "fade"
	if !(start || end || fadeStart || fadeEnd) || p.Closed {
		return taper{}
	}
	var total float32
	for i := 0; i+1 < len(p.Points); i++ {
		a, b := p.Points[i], p.Points[i+1]
		total += float32(math.Hypot(float64(b.X-a.X), float64(b.Y-a.Y)))
	}
	tp := taper{total: total, start: start, end: end}
	if start || end {
		tp.length = min(taperLengthPerWidth*p.Width, total/2)
	}
	capLength := min(capLengthPerWidth*p.Width, total/2)
	if fadeStart {
		tp.capStart = capLength
	}
	if fadeEnd {
		tp.capEnd = capLength
	}
	return tp
}

// sunk is how far a faded end's band has sunk toward its foot at arc s: 0
// outside the caps, 1 at a tip.
func (tp taper) sunk(s float32) float32 {
	q := float32(0)
	if tp.capStart > 0 {
		q = max(q, 1-s/tp.capStart)
	}
	if tp.capEnd > 0 {
		q = max(q, 1-(tp.total-s)/tp.capEnd)
	}
	return min(1, q)
}

// bandAt is the wall's band at arc s: the path's band, cropped about the
// centreline by a pointed end (the ribbon narrows symmetrically) and sunk
// toward the foot by a faded one.
func (tp taper) bandAt(band faceBand, half, s float32) faceBand {
	f := tp.at(s)
	b := faceBand{max(band.top, -half*f), min(band.bottom, half*f)}
	b.top += (b.bottom - b.top) * tp.sunk(s)
	return b
}

func (tp taper) at(s float32) float32 {
	if tp.length <= 0 {
		return 1
	}
	f := float32(1)
	if tp.start {
		f = min(f, s/tp.length)
	}
	if tp.end {
		f = min(f, (tp.total-s)/tp.length)
	}
	return max(0, f)
}

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
		// A ring needs three points; validate() refuses fewer, and this is the
		// belt for the hand-edited file that never went through it — a 2-point
		// "ring" would lay its wraparound straight back over its one segment.
		if p.Closed && len(p.Points) < 3 {
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
	base := pathBand(p)
	n := len(p.Points)

	// A CLOSED path walks one segment MORE than it has gaps: the wraparound
	// from the last point back to the first (plan-zone-polygons.md P1). Every
	// vertex of a ring is therefore a bend, INCLUDING the seam at point 0 —
	// the one joint an open path never needs, and the one a reader would forget,
	// because it is the only bend whose two segments are not adjacent in the
	// array.
	segments := n - 1
	if p.Closed {
		segments = n
	}
	tp := pathTaper(p)

	// along is the arc position of the current segment's start, which is what
	// the taper is measured in.
	var along float32
	for i := 0; i < segments; i++ {
		a, b := p.Points[i], p.Points[(i+1)%n]
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
		//
		// ⭐ Inside a pointed end's taper or a faded end's cap every sample is
		// its OWN rect, on the band the drawing has at that sample's middle:
		// the wall narrows with the cliff instead of standing full width round
		// a tip the eye sees as nothing. Only full-band samples merge.
		runStart := -1
		for s := 0; s <= steps; s++ {
			blocked := false
			band := base
			if s < steps {
				t := (float32(s) + 0.5) * step
				band = tp.bandAt(base, half, along+t)
				blocked = !coveredByBridge(a.X+ux*t, a.Y+uy*t, bridges) && band.bottom > band.top
			}
			tapered := blocked && band != base
			if runStart >= 0 && (!blocked || tapered) {
				out = emitRun(out, a.X, a.Y, ux, uy, float32(runStart)*step, float32(s)*step, base, angle)
				runStart = -1
			}
			switch {
			case tapered:
				out = emitRun(out, a.X, a.Y, ux, uy, float32(s)*step, float32(s+1)*step, band, angle)
			case blocked && runStart < 0:
				runStart = s
			}
		}
		along += length

		// The joint at the far end of this segment, where the next one turns
		// away: two rects meeting at an angle leave a wedge open on the OUTER
		// corner, and a circle of the same half-width fills it for either turn
		// direction without knowing which way the bend goes.
		//
		// ⚑ An OPEN path's last segment ends in a CAP, not a bend, so it gets
		// no joint. A closed one has a segment after every segment, seam
		// included — which is why this asks "is there a next SEGMENT" rather
		// than "is there a next point".
		//
		// ⚑ A joint sits on the band, not the centreline: half its width, at
		// its middle, pushed out along the MITRE so it lands where the two
		// offset rects' centrelines meet. Inside a taper or a cap it shrinks
		// with the band (along is now this joint's arc position): a full-width
		// circle at a vertex the drawing has already narrowed would be an
		// invisible wall.
		//
		// ⚑ And it shrinks to its clearance from any bridge: a vertex just past
		// a deck edge would otherwise stamp a half-width disc back over the
		// walkable deck. A vertex UNDER a deck has no clearance and no joint.
		// What that gives up is a sliver of the outer wedge beside the deck — a
		// notch in the bank, never a way across.
		if i+1 < segments || p.Closed {
			band := tp.bandAt(base, half, along)
			mx, my := jointMitre(-uy, ux, b, p.Points[(i+2)%n])
			c := (band.top + band.bottom) / 2
			x, y := b.X+mx*c, b.Y+my*c
			if r := min((band.bottom-band.top)/2, bridgeClearance(x, y, bridges)); r > 0 {
				out = append(out, Corridor{X: x, Y: y, Radius: r})
			}
		}
	}
	return out
}

// jointMitre is the vector a band offset is scaled by at a bend: the sum of the
// two segments' face normals over 1 + their dot, so an offset of c along it
// lies c from BOTH segments' centrelines. A hairpin (or a duplicated vertex
// after the bend) falls back to the incoming normal rather than reaching
// towards infinity; the offset there is a fraction of a unit either way.
func jointMitre(nx, ny float32, b, next Point) (float32, float32) {
	dx, dy := next.X-b.X, next.Y-b.Y
	l := float32(math.Hypot(float64(dx), float64(dy)))
	if l == 0 {
		return nx, ny
	}
	mx, my := nx-dy/l, ny+dx/l
	d := 1 + nx*(-dy/l) + ny*(dx/l)
	if d < 0.25 {
		return nx, ny
	}
	return mx / d, my / d
}

// emitRun turns one blocked interval [from, to) along a segment into rects, each
// no longer than maxCorridorSegment, laid on the band across it.
func emitRun(out []Corridor, ax, ay, ux, uy, from, to float32, band faceBand, angle float32) []Corridor {
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
		// (−uy, ux) is the face normal, the side `bottom` counts toward.
		c := (band.top + band.bottom) / 2
		out = append(out, Corridor{
			X:      ax + ux*mid - uy*c,
			Y:      ay + uy*mid + ux*c,
			Length: pieceLen,
			Width:  band.bottom - band.top,
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
	return distanceToPropBody(x, y, p) == 0
}

// bridgeClearance is how far a point is from the nearest bridge's visual
// footprint: 0 on or under a deck, +Inf with no bridges at all.
func bridgeClearance(x, y float32, bridges []*Prop) float32 {
	d := float32(math.Inf(1))
	for _, b := range bridges {
		d = min(d, distanceToPropBody(x, y, b))
	}
	return d
}

// distanceToPropBody is the distance from a point to a prop's visual body, 0
// on or inside it. A body with no size is infinitely far: it covers nothing.
func distanceToPropBody(x, y float32, p *Prop) float32 {
	body := p.VisualBody()
	dx, dy := x-p.X, y-p.Y
	if body.Radius > 0 {
		return max(0, float32(math.Hypot(float64(dx), float64(dy)))-body.Radius)
	}
	if body.Width <= 0 || body.Height <= 0 {
		return float32(math.Inf(1))
	}
	// Into the rect's own frame: turn the offset back by the prop's angle.
	sin, cos := math.Sincos(float64(-p.Rotation))
	lx := dx*float32(cos) - dy*float32(sin)
	ly := dx*float32(sin) + dy*float32(cos)
	ox := max(0, abs32(lx)-body.Width/2)
	oy := max(0, abs32(ly)-body.Height/2)
	return float32(math.Hypot(float64(ox), float64(oy)))
}
