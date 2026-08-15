package phy

// LineBlockedByStatics reports whether the straight segment from→to is
// blocked by any static collider whose Layer matches mask (LoS prototype,
// docs/plan-prototype-aura-los.md). Occluders that contain either endpoint
// never block (D3: an entity overlapped into a prop is not sealed off by
// it), and inverse shapes (the world border) never block an in-world
// segment. Allocates per call; prototype-grade, not a hot-path citizen.
func (s *Space) LineBlockedByStatics(from, to Vec2f, mask int) bool {
	// Any static overlapping the segment also overlaps the segment's
	// bounding circle, so one masked static query gathers every candidate.
	probe := NewCircle(from.Add(to).Mult(0.5), from.Sub(to).Abs()/2)
	probe.Shape().Mask = mask

	for _, c := range s.QueryCircleStatics(probe) {
		if lineHitsStatic(from, to, c) {
			return true
		}
	}
	return false
}

func lineHitsStatic(from, to Vec2f, c Collider) bool {
	switch occluder := c.(type) {
	case *Circle:
		if occluder.StabQuery(from) || occluder.StabQuery(to) {
			return false
		}
		return occluder.ImpaleQuery(Segment{from, to.Sub(from)}) >= 0
	case *SolidAABB:
		bb := occluder.BoundingBox()
		if bb.StabQuery(from) || bb.StabQuery(to) {
			return false
		}
		return segmentHitsAABB(from, to, bb)
	default:
		// Inverse shapes (world border) and anything unknown never occlude.
		return false
	}
}

// segmentHitsAABB is the standard slab test, parametric over from→to.
func segmentHitsAABB(from, to Vec2f, bb AABB) bool {
	d := to.Sub(from)
	tmin, tmax := float32(0), float32(1)

	if d.X == 0 {
		if from.X < bb.Left || from.X > bb.Right {
			return false
		}
	} else {
		t1 := (bb.Left - from.X) / d.X
		t2 := (bb.Right - from.X) / d.X
		if t1 > t2 {
			t1, t2 = t2, t1
		}
		tmin = max(tmin, t1)
		tmax = min(tmax, t2)
	}

	if d.Y == 0 {
		if from.Y < bb.Bottom || from.Y > bb.Upper {
			return false
		}
	} else {
		t1 := (bb.Bottom - from.Y) / d.Y
		t2 := (bb.Upper - from.Y) / d.Y
		if t1 > t2 {
			t1, t2 = t2, t1
		}
		tmin = max(tmin, t1)
		tmax = min(tmax, t2)
	}

	return tmin <= tmax
}
