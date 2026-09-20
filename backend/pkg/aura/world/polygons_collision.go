package world

import "math"

// ---- the three tuning numbers, deliberately beside maxCorridorSegment ------
//
// ⚑ NOT in conf.json (§11 item 3): conf.json is player-facing balance, this is
// geometry, and the reader who needs one of these has just read the other.

// polygonCellSize is how coarsely a filled polygon's INTERIOR is sampled, in
// server units. [PLACEHOLDER].
//
// ⛔ IT IS NOT A FREE KNOB, and the PO pass of 2026-09-10 is why. A cell is
// blocked only when it lies WHOLLY inside the polygon (see fillAt), so the band
// the fill cannot reach is up to one cell DIAGONAL wide at a slanted edge. The
// boundary stroke has to bridge that band, which ties this number to
// polygonBoundaryThickness:
//
//	polygonBoundaryThickness >= polygonCellSize * sqrt(2)
//
// pinned by TestTheStrokeCanBridgeWhatTheFillCannotReach. Raise this and the
// stroke must thicken with it — which is exactly what coarsening does per
// polygon (strokeThickness).
const polygonCellSize = 0.5

// polygonBoundaryThickness is the boundary stroke's MINIMUM thickness T, in
// server units. [PLACEHOLDER], and ⛔ THE ONE NUMBER HERE THAT IS SAFETY-CRITICAL
// (L11). See strokeThickness for what a given polygon actually gets.
//
// Too thin and a fast mover steps straight THROUGH the surface into the interior
// fill — where it is ejected, so it self-heals, but it self-heals by a
// teleport-looking pop. ⚑ A ground player steps 0.05 u/tick; flight lerps and
// knockback do not. Pick this against the FASTEST mover, never the player.
//
// ⚑ Written as a FLOAT literal on purpose: as an untyped INTEGER constant,
// `polygonBoundaryThickness / 2` below is integer division and silently yields
// ZERO — a boundary of no thickness, which is a collider that walls nothing and
// looks like the feature simply not working.
const polygonBoundaryThickness = 1.0

// maxPolygonInteriorBodies caps how many bodies ONE polygon's interior fill may
// emit before the fill is coarsened (D6). [PLACEHOLDER].
//
// ⚑ It counts the INTERIOR ONLY. The boundary stroke is set by the perimeter and
// the segment cap, not by the cell size, so coarsening cannot reduce it and must
// not be expected to.
//
// ⛔ Not a legality rule: over this, the polygon's own cell size is raised until
// it fits (see PolygonColliders). A boot refusal was offered and declined —
// PO 2026-09-09, an authoring session must not be stoppable by having drawn a
// big rock.
const maxPolygonInteriorBodies = 256

// PolygonCoarsening records that one polygon's interior was sampled more coarsely
// than authored, so the boot log can say so (D6 mitigation 1).
//
// ⚑ It exists because the accepted cost of never refusing is that ONE rock's
// collision is blockier than every other rock's and nothing on screen says so.
// Dropping this on the floor would turn a stated trade-off into a silent one.
type PolygonCoarsening struct {
	Index          int
	FromCell, Cell float32
	FromBodies     int
	Bodies         int
}

// PolygonColliders builds the static collision shapes for every blocking polygon
// in the zone, minus whatever the bridges clear, and reports any polygon whose
// interior had to be coarsened to fit the cap.
//
// ⭐ D2: a HYBRID, and each half does the one job the other does badly.
//
//  1. The BOUNDARY is every edge stroked as a SolidRotatedAABB — the surface
//     players actually touch, and it is rotated, so a diagonal wall SLIDES.
//     ⛔ This is not a refinement: resolveSolidAABB ejects along the axis of
//     least penetration, never the true face normal, so a diagonal wall tiled
//     out of axis-aligned cells is a STAIRCASE — alternating X and Y pushes,
//     zigzag, snagging. A feel defect, and cave walls are where it would be felt.
//  2. The INTERIOR is a coarse axis-aligned fill whose only job is EJECTION,
//     never defining the surface. It is what makes anything that arrives inside
//     — a knockback, a WARP, a spawn a metre off, a mob shoved by another mob —
//     able to get out again.
//
// ⭐ A boundary-only shell was refused for exactly that: its failure mode is a
// TRAPPED entity, sealed in, unable to leave and unable to reach anything while
// auras pass through it. Wrong-but-recoverable beats cheap-but-sealed — and the
// hybrid is not even a trade, because it is CHEAPER than the uniform fill it
// replaces (the interior no longer has to be fine).
//
// ⚑ Props must be RESOLVED first, exactly as for PathCorridors: the bridge test
// reads Def.CrossesPaths. An unresolved zone finds no bridges and walls its lakes
// solid — wrong in the direction that is obvious in-game rather than silent.
func PolygonColliders(z *Zone) ([]Corridor, []PolygonCoarsening) {
	bridges := crossingProps(z)
	var out []Corridor
	var coarsened []PolygonCoarsening
	for i := range z.Polygons {
		g := &z.Polygons[i]
		if !g.BlocksMovement || len(g.Points) < 3 {
			continue
		}
		pts := windingNormalised(g.Points)
		if pts == nil {
			// Zero area: a degenerate shape (all points collinear, or every
			// vertex duplicated). It has no inside, so it walls nothing rather
			// than handing the physics engine a NaN normal.
			continue
		}
		// ⚑ INTERIOR FIRST, deliberately: coarsening can raise this polygon's
		// cell size, and the stroke has to be thick enough to bridge whatever
		// band that leaves. Sizing the stroke before knowing the cell would open
		// a ring-shaped gap inside the wall on exactly the shapes D6 exists for.
		fill, cell, note := polygonInterior(pts, bridges)
		if note != nil {
			note.Index = i
			coarsened = append(coarsened, *note)
		}
		out = appendPolygonBoundary(out, pts, bridges, strokeThickness(pts, cell))
		out = append(out, fill...)
	}
	return out, coarsened
}

// strokeThickness is how thick THIS polygon's boundary stroke is, in server
// units — derived, never authored.
//
// ⭐ Two forces, and both are consequences rather than taste:
//
//  1. It must bridge the band the interior fill cannot reach. The fill blocks
//     only cells lying WHOLLY inside, so at a slanted edge that band is up to
//     one cell diagonal wide — hence cell * sqrt(2).
//  2. ⛔ It must never cross to the far side of a thin shape, or the stroke
//     inset from one edge pokes out through the opposite one and the
//     under-cover ruling silently inverts. area/perimeter is the inradius of
//     any shape with an inscribed circle touching every side, and conservative
//     for everything else, so it is a safe ceiling.
//
// ⭐ When the ceiling BINDS there is still no gap, which is the part worth
// stating: two opposite edges each reaching the inradius inward meet in the
// middle, so a shape too thin for the derived thickness is covered by its own
// strokes end to end.
func strokeThickness(pts []Point, cell float32) float32 {
	t := float32(polygonBoundaryThickness)
	if bridged := cell * float32(math.Sqrt2); bridged > t {
		t = bridged
	}
	area := float32(math.Abs(float64(signedArea(pts)))) / 2
	var perimeter float32
	n := len(pts)
	for i := 0; i < n; i++ {
		b := pts[(i+1)%n]
		perimeter += float32(math.Hypot(float64(b.X-pts[i].X), float64(b.Y-pts[i].Y)))
	}
	if perimeter > 0 {
		if ceiling := area / perimeter; ceiling < t {
			t = ceiling
		}
	}
	return t
}

// signedArea is the shoelace sum. Its SIGN is the winding order; its magnitude is
// twice the area.
func signedArea(pts []Point) float32 {
	var a float32
	for i := range pts {
		b := pts[(i+1)%len(pts)]
		a += pts[i].X*b.Y - b.X*pts[i].Y
	}
	return a
}

// windingNormalised returns a copy of pts wound so that signedArea is POSITIVE,
// which is the orientation inwardNormal below is written against. nil when the
// shape encloses nothing.
//
// ⛔ L10 — TILED LETS YOU DRAW EITHER WAY, and without this a clockwise-authored
// polygon strokes its whole boundary OUTSIDE the art. That inverts the
// under-cover ruling silently: nothing looks wrong, the collision is simply and
// mysteriously fat, and no other test in the suite would notice.
func windingNormalised(pts []Point) []Point {
	if len(pts) < 3 {
		return nil
	}
	area := signedArea(pts)
	if area == 0 {
		return nil
	}
	out := make([]Point, len(pts))
	if area > 0 {
		copy(out, pts)
		return out
	}
	for i := range pts {
		out[i] = pts[len(pts)-1-i]
	}
	return out
}

// inwardNormal is the unit normal of edge a→b pointing INTO a positively-wound
// polygon.
//
// ⚑ Pinned by example rather than by reasoning about handedness, because the
// world's Y axis points down and that inverts every intuition: for the unit
// square (0,0) (1,0) (1,1) (0,1) the shoelace sum is +2, and on its first edge
// (heading +X) the interior is at +Y — which is (-uy, ux).
func inwardNormal(ux, uy float32) (float32, float32) { return -uy, ux }

// appendPolygonBoundary strokes every edge as a rotated box, INSET so the box's
// outer face lies on the drawn outline, and fills each vertex wedge with a circle.
//
// ⚑ INSET, NEVER CENTRED. A centred stroke would over-cover by T/2 and quietly
// invert the under-cover ruling (§9). ⛔ And no true polygon offsetting (mitring)
// is needed or wanted: shifting each segment along its own normal overlaps
// harmlessly at concave corners and under-covers slightly at convex ones, which
// is the ruled direction, and the joint circles cover the inner wedge.
func appendPolygonBoundary(out []Corridor, pts []Point, bridges []*Prop, thickness float32) []Corridor {
	half := thickness / 2
	n := len(pts)
	for i := 0; i < n; i++ {
		a, b := pts[i], pts[(i+1)%n]
		dx, dy := b.X-a.X, b.Y-a.Y
		length := float32(math.Hypot(float64(dx), float64(dy)))
		if length == 0 {
			continue // a duplicated vertex; one stray double-click in Tiled
		}
		ux, uy := dx/length, dy/length
		nx, ny := inwardNormal(ux, uy)
		// The stroke's CENTRE line: the edge pushed inward by half a thickness,
		// so its outer face sits on the edge itself.
		ax, ay := a.X+nx*half, a.Y+ny*half

		// Sampled for bridge gaps exactly as a path's centreline is, at
		// sub-interval MIDPOINTS — so a causeway across a filled lake is
		// authorable on day one, and by the same rule as one across a river.
		steps := int(math.Ceil(float64(length / clearStep)))
		if steps < 1 {
			steps = 1
		}
		step := length / float32(steps)
		runStart := -1
		for s := 0; s <= steps; s++ {
			blocked := false
			if s < steps {
				t := (float32(s) + 0.5) * step
				blocked = !coveredByBridge(ax+ux*t, ay+uy*t, bridges)
			}
			switch {
			case blocked && runStart < 0:
				runStart = s
			case !blocked && runStart >= 0:
				out = emitRun(out, ax, ay, ux, uy,
					float32(runStart)*step, float32(s)*step,
					thickness, float32(math.Atan2(float64(dy), float64(dx))))
				runStart = -1
			}
		}

		// The wedge at b, where this edge turns into the next. The circle sits on
		// the ANGLE BISECTOR — the sum of the two inward normals — pushed in by
		// half a thickness, so it too stays inside the drawn outline.
		c, d := pts[(i+1)%n], pts[(i+2)%n]
		ex, ey := d.X-c.X, d.Y-c.Y
		el := float32(math.Hypot(float64(ex), float64(ey)))
		if el == 0 {
			continue
		}
		mx, my := inwardNormal(ex/el, ey/el)
		bx, by := nx+mx, ny+my
		bl := float32(math.Hypot(float64(bx), float64(by)))
		if bl == 0 {
			// A 180° reversal — a spike. There is no wedge to fill, and
			// normalising this would divide by zero.
			continue
		}
		// ⚑ INSET ALONG THE BISECTOR TO THE TANGENT POINT, not merely by half a
		// thickness. A circle of radius r is tangent to both edges only at
		// distance r / (b·n) along the unit bisector b; pushing it in by r alone
		// leaves it bulging past a SHARP corner — measured at 0.153 u on a probe
		// quad, which is small but is OUTWARD, the one direction the under-cover
		// ruling refuses.
		//
		// ⚑ The dot product goes to zero as the corner approaches a straight-
		// through spike, so it is floored: past that the wedge has no room for the
		// circle at all and the two edge strokes already overlap.
		ux2, uy2 := bx/bl, by/bl
		grip := ux2*nx + uy2*ny
		if grip < 0.2 {
			grip = 0.2
		}
		inset := half / grip
		jx, jy := b.X+ux2*inset, b.Y+uy2*inset
		if !coveredByBridge(jx, jy, bridges) {
			out = append(out, Corridor{X: jx, Y: jy, Radius: half})
		}
	}
	return out
}

// polygonInterior fills the polygon with coarse axis-aligned rects, doubling the
// cell size until the body count fits under the cap (D6).
//
// ⚑ DETERMINISTIC, and that is a requirement rather than a nicety: the same zone
// file must produce the same colliders on every boot, or a bug reproduces on one
// machine and not another. Double until it fits; never search.
func polygonInterior(pts []Point, bridges []*Prop) ([]Corridor, float32, *PolygonCoarsening) {
	minX, minY, maxX, maxY := bounds(pts)
	span := float32(math.Max(float64(maxX-minX), float64(maxY-minY)))

	cell := float32(polygonCellSize)
	first := fillAt(pts, bridges, minX, minY, maxX, maxY, cell)
	if len(first) <= maxPolygonInteriorBodies {
		return first, cell, nil
	}
	for cell <= span {
		cell *= 2
		got := fillAt(pts, bridges, minX, minY, maxX, maxY, cell)
		if len(got) <= maxPolygonInteriorBodies {
			return got, cell, &PolygonCoarsening{
				FromCell: polygonCellSize, Cell: cell,
				FromBodies: len(first), Bodies: len(got),
			}
		}
	}
	// A cell wider than the shape cannot be coarsened further — it is at most a
	// couple of boxes by then, so the cap is already satisfied in practice and
	// this is the belt for a shape whose bounds are degenerate.
	got := fillAt(pts, bridges, minX, minY, maxX, maxY, span+1)
	return got, span + 1, &PolygonCoarsening{
		FromCell: polygonCellSize, Cell: span + 1,
		FromBodies: len(first), Bodies: len(got),
	}
}

// fillAt samples the polygon on a grid of the given cell size and merges the
// blocked cells into maximal rects.
//
// ⛔⛔ A CELL BLOCKS ONLY WHEN IT LIES WHOLLY INSIDE THE POLYGON, and this is the
// defect the PO found in game on 2026-09-10 rather than a refinement.
//
// It used to block on a CENTRE test. On an axis-aligned edge that is harmless.
// On a SLANTED one a cell whose centre is barely inside sticks out by most of a
// half-diagonal, so the outermost collision surface became an axis-aligned
// STAIRCASE OUTSIDE THE DRAWN OUTLINE — big chunks poking out of the art, no
// sliding, and the rotated boundary stroke buried behind it where nothing ever
// touched it. ⭐ The whole point of D2's hybrid is that the stroke is the surface;
// a fill that reaches past it destroys that, and the merge lifting the segment
// cap only made the teeth bigger.
//
// ⚑ The test is exact, not a corner sample: a cell is inside iff its centre is
// inside AND no polygon edge crosses its rectangle. Four corners alone would
// admit a cell that a thin concave notch cuts straight through.
//
// ⚑ The cost is a band the fill cannot reach, up to one cell DIAGONAL wide at a
// slanted edge. strokeThickness is what covers it, which is why these two
// numbers are tied together and neither can be tuned alone.
func fillAt(pts []Point, bridges []*Prop, minX, minY, maxX, maxY, cell float32) []Corridor {
	cols := int(math.Ceil(float64((maxX - minX) / cell)))
	rows := int(math.Ceil(float64((maxY - minY) / cell)))
	if cols < 1 {
		cols = 1
	}
	if rows < 1 {
		rows = 1
	}
	blocked := make([]bool, cols*rows)
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			x0, y0 := minX+float32(c)*cell, minY+float32(r)*cell
			x, y := x0+cell/2, y0+cell/2
			blocked[r*cols+c] = pointInPolygon(x, y, pts) &&
				!edgeCrossesCell(pts, x0, y0, x0+cell, y0+cell) &&
				!coveredByBridge(x, y, bridges)
		}
	}

	// ⛔ maxCorridorSegment DELIBERATELY DOES NOT APPLY HERE, and the reason is
	// the one measurement that shaped this function.
	//
	// ⭐ Capping the merge is what BREAKS EJECTION. Two abutting SolidAABBs push
	// in OPPOSITE directions at their shared seam — resolveSolidAABB ejects a
	// centre INSIDE a box along its least-penetration axis, and pushes a centre
	// OUTSIDE one away from its nearest point — so a body arriving at a seam
	// finds a stable equilibrium and STOPS THERE. Measured in-game 2026-09-10: a
	// character warped into a probe mass drifted 0.27 u in six seconds and parked
	// exactly on the seam between two 8-unit boxes. That is strictly WORSE than
	// the hollow shell D2 rejected — sealed but mobile beats stuck in place —
	// so the cap had to go, not the fill.
	//
	// ⚑ And it costs the broadphase nothing, which is the part worth
	// understanding rather than trusting. maxCorridorSegment exists because a
	// ROTATED rect's bounding box is far larger than the rect: "a single 40-unit
	// diagonal rect occupies a box the size of a city block" — of WALKABLE
	// ground, pairing against everything standing on it. An interior-fill box is
	// AXIS-ALIGNED, so its bounding box IS the box, and the box is the inside of
	// a solid mass where by construction nothing walks. Big here is free; big
	// there was not. The boundary stroke, which IS rotated, still honours the cap.
	//
	// ⚑ Total body count stays bounded by the D6 cap, which is now doing all the
	// work it was ever meant to.
	maxCells := cols
	if rows > maxCells {
		maxCells = rows
	}

	var out []Corridor
	used := make([]bool, cols*rows)
	for r := 0; r < rows; r++ {
		for c := 0; c < cols; c++ {
			if !blocked[r*cols+c] || used[r*cols+c] {
				continue
			}
			// Greedy: run right, then grow down while the whole span holds.
			// Bigger boxes eject further per tick, so the merge is a
			// CORRECTNESS feature (L5) as much as a performance one.
			w := 0
			for w < maxCells && c+w < cols && blocked[r*cols+c+w] && !used[r*cols+c+w] {
				w++
			}
			h := 1
			for h < maxCells && r+h < rows {
				ok := true
				for k := 0; k < w; k++ {
					if !blocked[(r+h)*cols+c+k] || used[(r+h)*cols+c+k] {
						ok = false
						break
					}
				}
				if !ok {
					break
				}
				h++
			}
			for rr := r; rr < r+h; rr++ {
				for cc := c; cc < c+w; cc++ {
					used[rr*cols+cc] = true
				}
			}
			out = append(out, Corridor{
				X:      minX + (float32(c)+float32(w)/2)*cell,
				Y:      minY + (float32(r)+float32(h)/2)*cell,
				Length: float32(w) * cell,
				Width:  float32(h) * cell,
			})
		}
	}
	return out
}

// edgeCrossesCell reports whether any polygon edge passes through the cell
// rectangle. Combined with a centre-inside test it is an EXACT "wholly inside"
// check: a cell whose centre is inside and which no edge crosses cannot contain
// any point outside the polygon.
func edgeCrossesCell(pts []Point, x0, y0, x1, y1 float32) bool {
	n := len(pts)
	for i := 0; i < n; i++ {
		a, b := pts[i], pts[(i+1)%n]
		// Cheap reject first: an edge whose own bounding box misses the cell
		// cannot cross it, and most edges miss most cells.
		if max(a.X, b.X) < x0 || min(a.X, b.X) > x1 ||
			max(a.Y, b.Y) < y0 || min(a.Y, b.Y) > y1 {
			continue
		}
		if a.X >= x0 && a.X <= x1 && a.Y >= y0 && a.Y <= y1 {
			return true
		}
		if segmentsCross(a, b, Point{x0, y0}, Point{x1, y0}) ||
			segmentsCross(a, b, Point{x1, y0}, Point{x1, y1}) ||
			segmentsCross(a, b, Point{x1, y1}, Point{x0, y1}) ||
			segmentsCross(a, b, Point{x0, y1}, Point{x0, y0}) {
			return true
		}
	}
	return false
}

func segmentsCross(p1, p2, p3, p4 Point) bool {
	d := func(a, b, c Point) float32 {
		return (b.X-a.X)*(c.Y-a.Y) - (b.Y-a.Y)*(c.X-a.X)
	}
	d1, d2 := d(p3, p4, p1), d(p3, p4, p2)
	d3, d4 := d(p1, p2, p3), d(p1, p2, p4)
	return ((d1 > 0) != (d2 > 0)) && ((d3 > 0) != (d4 > 0))
}

func bounds(pts []Point) (minX, minY, maxX, maxY float32) {
	minX, minY = pts[0].X, pts[0].Y
	maxX, maxY = minX, minY
	for _, p := range pts[1:] {
		minX, minY = min(minX, p.X), min(minY, p.Y)
		maxX, maxY = max(maxX, p.X), max(maxY, p.Y)
	}
	return
}

// pointInPolygon is the standard even-odd ray cast. Handles concave shapes, which
// is the whole reason the interior is a CELL FILL and not a phy polygon: every
// standard convex resolver would need the shape decomposed first, and an authored
// cave wall is concave (§4.5).
func pointInPolygon(x, y float32, pts []Point) bool {
	in := false
	n := len(pts)
	for i, j := 0, n-1; i < n; j, i = i, i+1 {
		yi, yj := pts[i].Y, pts[j].Y
		if (yi > y) == (yj > y) {
			continue
		}
		xi := pts[i].X + (y-yi)/(yj-yi)*(pts[j].X-pts[i].X)
		if x < xi {
			in = !in
		}
	}
	return in
}
