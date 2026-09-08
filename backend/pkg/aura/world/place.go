package world

import (
	"fmt"
	"strings"
)

// MaxWorldCoordinate caps how far from the origin any authored point may end up
// once its zone's Origin has been applied (plan-underworld.md L12).
//
// ⛔ THIS IS NOT AN ARBITRARY BIG NUMBER, AND RAISING IT IS NOT FREE. phy.Vec2f
// is float32, so a zone offset lands in collision resolution and movement
// integration, not just on the wire. A float32's ULP at magnitude C is C×2^-23:
//
//	C =   8192  ->  0.00098 u  (0.12 px)  the player's 0.05 u step is ~51 ULPs
//	C =  65536  ->  0.0078  u  (0.94 px)  the step is 6 ULPs
//	C = 100000  ->  0.0119  u  (1.43 px)  visibly jittery — and resolveInvAABB
//	                                      computes penetration as the difference
//	                                      of two ~1e5 numbers, which cancels
//
// Zones need to be far enough apart to clear each other's doubled wall bounding
// boxes (separationFor below) and no further. For today's 144×72 world that is
// ~154 units, so this ceiling leaves room for dozens of zones while keeping
// every coordinate where float32 still resolves a single step cleanly. Raising
// it re-opens a jitter class this repo has already fought once
// (docs/archive/plan-render-jitter.md).
const MaxWorldCoordinate = 8192

// gridCellMargin is one broadphase cell (phy's gridWidth). Two walls whose
// bounding boxes merely touch can still land in the same cell, so the
// separation rule clears a whole cell beyond the boxes.
//
// ⚑ Restated rather than imported: the world package is deliberately phy-free
// (see AnchorPos). place_test.go pins the two values against each other.
const gridCellMargin = 10

// Place puts every zone's geometry into the one shared coordinate space by
// applying its Origin, and enforces the rules that make "separated by distance"
// a guarantee rather than an assumption.
//
// ⭐ WHY THIS FUNCTION IS THE WHOLE FEATURE. Nothing downstream knows that
// zones exist: the broadphase, the AOI viewport query, every aura overlap and
// each border wall work on positions alone. Two zones cannot reach each other
// purely because their coordinates are far apart — so the checks here are not
// hygiene, they ARE the isolation. A bad Origin does not fail loudly somewhere
// later; it quietly streams an underworld mob into a surface player's viewport.
//
// Zones are mutated in place. Afterwards their coordinate-bearing arrays hold
// WORLD coordinates, while Bounds stays the zone-local size and Origin says
// where its centre sits.
//
// ⚑ Client-visual arrays (Terrain, Regions, DarkAreas) are deliberately NOT
// offset. The server never reads them — the client reads the zone file itself
// and applies Origin on its own — so shifting them here would be dead work that
// only invites the two sides to disagree. Paths ARE offset, because
// PathCorridors turns them into collision bodies.
func Place(zones []*Zone) error {
	if len(zones) == 0 {
		return fmt.Errorf("no zones to place")
	}
	for _, z := range zones {
		if err := placeOne(z); err != nil {
			return err
		}
	}
	if err := checkSeparation(zones); err != nil {
		return err
	}
	return checkSetWide(zones)
}

func abs32(v float32) float32 {
	if v < 0 {
		return -v
	}
	return v
}

func placeOne(z *Zone) error {
	// Check the zone's far EDGE, not its origin: a modest offset on a huge
	// zone reaches just as far as a big offset on a small one.
	reach := abs32(z.Origin.X)
	if y := abs32(z.Origin.Y); y > reach {
		reach = y
	}
	extent := z.Bounds.Width
	if z.Bounds.Height > extent {
		extent = z.Bounds.Height
	}
	if reach+extent/2 > MaxWorldCoordinate {
		return fmt.Errorf("zone %q: origin (%g, %g) puts its far edge past the %d-unit coordinate ceiling. "+
			"Zones only need to clear each other's walls; a larger offset buys nothing and costs float32 "+
			"precision in collision resolution, not just on the wire (plan-underworld.md L12)",
			z.ID, z.Origin.X, z.Origin.Y, MaxWorldCoordinate)
	}

	ox, oy := z.Origin.X, z.Origin.Y
	if ox == 0 && oy == 0 {
		return nil // the overworld, and every zone authored before this field
	}
	for i := range z.Props {
		z.Props[i].X += ox
		z.Props[i].Y += oy
	}
	for i := range z.Spawns {
		z.Spawns[i].X += ox
		z.Spawns[i].Y += oy
		for j := range z.Spawns[i].Waypoints {
			z.Spawns[i].Waypoints[j].X += ox
			z.Spawns[i].Waypoints[j].Y += oy
		}
	}
	for i := range z.Campfires {
		z.Campfires[i].X += ox
		z.Campfires[i].Y += oy
	}
	for i := range z.Anchors {
		z.Anchors[i].X += ox
		z.Anchors[i].Y += oy
	}
	// Collision geometry, so it has to move with the zone (PathCorridors).
	for i := range z.Paths {
		for j := range z.Paths[i].Points {
			z.Paths[i].Points[j].X += ox
			z.Paths[i].Points[j].Y += oy
		}
	}
	return nil
}

// separationFor is the minimum centre-to-centre distance two zones need on one
// axis before their border walls stop sharing broadphase cells.
//
// ⛔ IT IS THE SUM OF BOTH ZONES' FULL SIZES, NOT THE LARGER ONE'S — a rule the
// plan first got wrong by a factor of two. phy's InvAABB.updateBB deliberately
// gives the wall a bounding box 2× its half-extents on every side, so a wall of
// full width W reaches W in each direction from its centre; two of them need
// W_a + W_b between centres, plus a cell.
//
// The failure it prevents is not cosmetic. A player inside zone A who shares a
// cell with zone B's wall gets resolveInvAABB computing a force toward B's
// rectangle — a yank of the entire offset, from a wall they cannot see.
func separationFor(a, b float32) float32 { return a + b + gridCellMargin }

func checkSeparation(zones []*Zone) error {
	for i := 0; i < len(zones); i++ {
		for j := i + 1; j < len(zones); j++ {
			a, b := zones[i], zones[j]
			needX := separationFor(a.Bounds.Width, b.Bounds.Width)
			needY := separationFor(a.Bounds.Height, b.Bounds.Height)
			// One axis is enough: two boxes miss if they miss anywhere.
			if abs32(a.Origin.X-b.Origin.X) > needX || abs32(a.Origin.Y-b.Origin.Y) > needY {
				continue
			}
			return fmt.Errorf("zones %q and %q are too close: origins (%g, %g) and (%g, %g) must differ by "+
				"more than %g in x or %g in y. Their border walls would share broadphase cells, and a player "+
				"in one would be shoved toward the other's rectangle by a wall they cannot see "+
				"(plan-underworld.md L1)",
				a.ID, b.ID, a.Origin.X, a.Origin.Y, b.Origin.X, b.Origin.Y, needX, needY)
		}
	}
	return nil
}

// checkSetWide enforces the three identity rules that were only ever validated
// per FILE, and go silently wrong the moment a second zone loads.
func checkSetWide(zones []*Zone) error {
	// L5 — spawn-point ids reach the DATABASE. game.character_campfires stores
	// campfire_id as bare TEXT, so two zones each minting "spawnpoint-1" would
	// collide in persisted player state, not merely in memory. Zone-wide
	// uniqueness (see Campfire.ID) stops being enough here.
	seenFire := map[string]string{}
	// L5b — anchor names are what a travel destination resolves by, so a
	// duplicate silently delivers to whichever zone was enumerated first.
	seenAnchor := map[string]string{}
	// L4 — a starting spawn outside the primary zone would put fresh
	// characters underground: defaultSpawnPosition picks a random flagged fire
	// across everything that is loaded, with no idea which zone it is in.
	starts := 0
	for i, z := range zones {
		for c := range z.Campfires {
			id := strings.TrimSpace(z.Campfires[c].ID)
			if other, dup := seenFire[id]; dup {
				return fmt.Errorf("zones %q and %q both author spawn point %q; ids reach the database as "+
					"bare text, so they must be unique across every loaded zone (plan-underworld.md L5)",
					other, z.ID, id)
			}
			seenFire[id] = z.ID
			if !z.Campfires[c].StartingSpawn {
				continue
			}
			if i != 0 {
				return fmt.Errorf("zone %q flags campfire %q as a starting spawn, but only the primary zone "+
					"(%q) may: fresh characters land on a random flagged fire, so this would spawn them "+
					"outside the starting world (plan-underworld.md L4)", z.ID, id, zones[0].ID)
			}
			starts++
		}
		for a := range z.Anchors {
			name := z.Anchors[a].Name
			if other, dup := seenAnchor[name]; dup {
				return fmt.Errorf("zones %q and %q both author anchor %q; a travel destination resolves by "+
					"bare name across every loaded zone (plan-underworld.md L5b)", other, z.ID, name)
			}
			seenAnchor[name] = z.ID
		}
	}
	// Moved here from Zone.validate: with several zones the question is whether
	// the WORLD has somewhere to put a fresh character, not whether each file
	// does. A zone with no fires of its own is now legal — a cave nobody binds
	// in — while a set with none is still not.
	if len(seenFire) > 0 && starts == 0 {
		return fmt.Errorf("%d campfire(s) are placed but none is flagged startingSpawn; fresh characters "+
			"would have nowhere to land", len(seenFire))
	}
	return nil
}
