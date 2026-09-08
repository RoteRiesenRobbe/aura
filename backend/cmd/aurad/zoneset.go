package main

import (
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/cfg"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/world"
)

// The boot-time flattening of a placed zone set (plan-underworld.md U1).
//
// ⭐ These six functions are the entire cost of holding more than one zone.
// Everything downstream — the physics space, the mob system, the AOI query,
// every aura — takes flat lists of world-coordinate geometry and has no idea
// zones exist. world.Place has already applied each Origin by the time any of
// these run, so concatenating is genuinely all there is to do.

// splitZoneList parses the -zones flag: comma-separated file stems, order
// significant, blanks and stray whitespace forgiven.
func splitZoneList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// wallsFor turns the placed set into one border rectangle per zone.
//
// ⚑ Each keeps its OWN size and centre. A single rectangle spanning everything
// would be catastrophically wrong in the quiet way: the empty space between two
// zones would become walkable, and the wall that is supposed to hold a player
// inside their zone would sit hundreds of units away.
func wallsFor(zones []*world.Zone) []cfg.PlacedBounds {
	walls := make([]cfg.PlacedBounds, 0, len(zones))
	for _, z := range zones {
		walls = append(walls, cfg.PlacedBounds{
			Bounds:  cfg.Bounds{Width: z.Bounds.Width, Height: z.Bounds.Height},
			OriginX: z.Origin.X,
			OriginY: z.Origin.Y,
			ZoneID:  z.ID,
		})
	}
	return walls
}

// zoneIDs is the loaded set's stems, primary first — what the client is told so
// it knows which of the zone files it already bundles are real this boot.
func zoneIDs(zones []*world.Zone) []string {
	ids := make([]string, 0, len(zones))
	for _, z := range zones {
		ids = append(ids, z.ID)
	}
	return ids
}

func allSpawns(zones []*world.Zone) []world.Spawn {
	if len(zones) == 1 {
		return zones[0].Spawns
	}
	total := 0
	for _, z := range zones {
		total += len(z.Spawns)
	}
	out := make([]world.Spawn, 0, total)
	for _, z := range zones {
		out = append(out, z.Spawns...)
	}
	return out
}

func allCampfires(zones []*world.Zone) []world.Campfire {
	if len(zones) == 1 {
		return zones[0].Campfires
	}
	total := 0
	for _, z := range zones {
		total += len(z.Campfires)
	}
	out := make([]world.Campfire, 0, total)
	for _, z := range zones {
		out = append(out, z.Campfires...)
	}
	return out
}

// allAnchors flattens every zone's named anchors into the one lookup a
// travel_to row resolves against (plan-underworld.md U3).
//
// ⭐ A FLAT MAP, NOT A PER-ZONE ONE, and that is the whole reason an anchor
// travel needs no zone argument: names are unique across the placed set
// (world.Place checkSetWide, L5b), so "underworld-entry" identifies a point
// in the shared space and nothing has to know which file authored it. The
// positions are already world coordinates by here - Place applied each
// Origin before this runs.
//
// ⚑ Built once at boot and never mutated. That is why it is a plain map and
// not the interface AnchorSource is: a campfire anchor is live CONNECTION
// state, a zone anchor is authored geometry.
func allAnchors(zones []*world.Zone) map[string]world.Point {
	total := 0
	for _, z := range zones {
		total += len(z.Anchors)
	}
	if total == 0 {
		return nil
	}
	out := make(map[string]world.Point, total)
	for _, z := range zones {
		for i := range z.Anchors {
			a := &z.Anchors[i]
			out[a.Name] = world.Point{X: a.X, Y: a.Y}
		}
	}
	return out
}

// allCorridors builds each zone's blocking-path collision bodies and
// concatenates them. Per zone rather than over a merged path list because
// world.PathCorridors resolves bridges against that zone's own props
// (plan-world-paths.md C2) — merging first would let a bridge in one zone clear
// a river in another.
func allCorridors(zones []*world.Zone) []world.Corridor {
	if len(zones) == 1 {
		return world.PathCorridors(zones[0])
	}
	var out []world.Corridor
	for _, z := range zones {
		out = append(out, world.PathCorridors(z)...)
	}
	return out
}
