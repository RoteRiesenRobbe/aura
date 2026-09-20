package world

// Containment for the closed-area primitives (plan-area-effects.md E2).
//
// ⭐ THE SERVER'S OWN COPY, and the duplication is deliberate rather than a DRY
// slip. The client has the same predicate (`Regions.pointInPolygon`) because it
// resolves ground colour, darkness and haze every frame; the server needs it
// because an area effect acts on what stands inside. Neither can call the other,
// and a shared definition across the Go/TypeScript boundary is not a thing this
// repo has. What CAN be shared is the RULE, so both are ray casts written the
// same way round, and the fixtures below are the same shapes.
//
// ⚑ Vertices and edges are NOT special-cased, matching the client verbatim: a
// point exactly on a shared edge lands in one shape or the other, never neither.
// At the scale anything reads this — a character's centre against an authored
// polygon — no consumer can tell, and special-casing would only produce two
// predicates that disagree on the one input they both see.

// PointInPolygon reports whether (x, y) lies inside the polygon, by ray cast.
//
// ⚑ Coordinates are whatever the caller's are, so long as they agree. Every
// caller in this package works in WORLD coordinates — Place() has already
// applied each zone's origin by the time anything asks (zone.go's Origin note),
// so a shape from the underworld and a player on the surface are comparable
// without either knowing zones exist.
//
// A polygon of fewer than 3 points encloses nothing and is always outside;
// validate() refuses those at boot, so this is a belt on a shape that cannot
// reach here rather than a supported case.
func PointInPolygon(x, y float32, polygon []Point) bool {
	inside := false
	for i, j := 0, len(polygon)-1; i < len(polygon); j, i = i, i+1 {
		a, b := polygon[i], polygon[j]
		if (a.Y > y) != (b.Y > y) &&
			x < (b.X-a.X)*(y-a.Y)/(b.Y-a.Y)+a.X {
			inside = !inside
		}
	}
	return inside
}

// BoundingBox is the axis-aligned extent of a polygon: the cheap prefilter in
// front of PointInPolygon.
//
// ⚑ Not used by E2's first cut and deliberately built anyway — it is four floats
// per shape, computed once, and it is the named escape hatch for the day a zone
// authors more hazards than a linear scan wants to walk (§3.2). Keeping it beside
// the predicate is what stops the future version being a second copy of the
// geometry somewhere else.
type BoundingBox struct {
	MinX, MinY, MaxX, MaxY float32
}

// Contains reports whether the point is inside the box — true for a point on the
// boundary, because this is a PREFILTER: it must never exclude anything
// PointInPolygon would have accepted.
func (b BoundingBox) Contains(x, y float32) bool {
	return x >= b.MinX && x <= b.MaxX && y >= b.MinY && y <= b.MaxY
}

// BoundsOf computes a polygon's bounding box. An empty polygon yields the zero
// box, which contains only the origin — harmless, since an empty polygon is
// refused at boot and PointInPolygon would reject it anyway.
func BoundsOf(polygon []Point) BoundingBox {
	if len(polygon) == 0 {
		return BoundingBox{}
	}
	box := BoundingBox{
		MinX: polygon[0].X, MinY: polygon[0].Y,
		MaxX: polygon[0].X, MaxY: polygon[0].Y,
	}
	for _, p := range polygon[1:] {
		if p.X < box.MinX {
			box.MinX = p.X
		}
		if p.X > box.MaxX {
			box.MaxX = p.X
		}
		if p.Y < box.MinY {
			box.MinY = p.Y
		}
		if p.Y > box.MaxY {
			box.MaxY = p.Y
		}
	}
	return box
}
