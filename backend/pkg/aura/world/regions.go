package world

// The one list of places (plan-region-identity.md D2): a region names a place
// by an id api/regions/regions.json holds, and the list holds what the player
// reads for it, the title and an optional subtitle. Rewording a title touches
// no zone file. Tiled offers the ids as a dropdown (the AuraRegionId enum,
// generated from this file).
//
// ⚑ A separate pass beside CrossValidateAreaIDs, for its reason: the list is
// content of its own, and the zone loader does not take it.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"strings"
)

// RegionListFile is the list's file name inside api/regions/.
const RegionListFile = "regions.json"

// RegionName is one place: its id, and the banner text the client shows on
// entering it. Client-only text; the server reads only the id.
type RegionName struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Subtitle string `json:"subtitle,omitempty"`
}

// LoadRegionList reads the place list, in file order. Every id is a slug and
// unique, every entry has a title (a subtitle sits UNDER one, and an id with
// nothing to show would announce a blank banner).
func LoadRegionList(fsys fs.FS) ([]RegionName, error) {
	data, err := fs.ReadFile(fsys, RegionListFile)
	if err != nil {
		return nil, fmt.Errorf("region list: %w", err)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var doc struct {
		Regions []RegionName `json:"regions"`
	}
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("%s: cannot parse: %w", RegionListFile, err)
	}
	if len(doc.Regions) == 0 {
		return nil, fmt.Errorf("%s lists no regions", RegionListFile)
	}
	seen := map[string]bool{}
	for i, r := range doc.Regions {
		switch {
		case !areaIDPattern.MatchString(r.ID):
			return nil, fmt.Errorf("%s: region %d: id %q must be a slug of a-z, 0-9 and '-'", RegionListFile, i, r.ID)
		case seen[r.ID]:
			return nil, fmt.Errorf("%s: region %d: duplicate id %q", RegionListFile, i, r.ID)
		case strings.TrimSpace(r.Title) == "":
			return nil, fmt.Errorf("%s: region %d (%q): title must not be empty", RegionListFile, i, r.ID)
		}
		seen[r.ID] = true
	}
	return doc.Regions, nil
}

// CrossValidateRegionIDs refuses every drawn region id the list does not hold,
// all at once, and returns the listed ids no zone draws, for a WARNING: nothing
// references an id in R1, the debug zone set draws none of the shipped places,
// and a place may be listed before it is drawn.
func CrossValidateRegionIDs(list []RegionName, zones []*Zone) (undrawn []string, err error) {
	listed := map[string]bool{}
	for _, r := range list {
		listed[r.ID] = true
	}
	drawn := map[string]bool{}
	var errs []error
	for _, z := range zones {
		for i, r := range z.Regions {
			if r.ID == "" {
				continue
			}
			drawn[r.ID] = true
			if !listed[r.ID] {
				errs = append(errs, fmt.Errorf("zone %q: %s: id %q is not in api/regions/%s "+
					"(add it there and regenerate the Tiled palette, or pick a listed one)",
					z.ID, objectRef("region", z.Regions, i), r.ID, RegionListFile))
			}
		}
	}
	for _, r := range list {
		if !drawn[r.ID] {
			undrawn = append(undrawn, r.ID)
		}
	}
	return undrawn, errors.Join(errs...)
}

// PlacedRegion is one polygon of a place, in WORLD coordinates (after Place),
// with its bounds for the prefilter (plan-region-identity.md R2).
type PlacedRegion struct {
	Points []Point
	Bounds BoundingBox
}

// CollectRegions maps every place id to its polygons across the placed zone set
// and every area (zones are already flattened). A region without an id names no
// place and is left out. Several polygons may share an id (D3), and a reach
// objective tests ITS region's polygons whatever is drawn above them (D4).
//
// ⛔ It must run AFTER world.Place, for CollectAreaEffects' reason: unplaced
// points are zone-local, which origin {0,0} makes indistinguishable from right.
func CollectRegions(zones []*Zone) map[string][]PlacedRegion {
	out := map[string][]PlacedRegion{}
	for _, z := range zones {
		for _, r := range z.Regions {
			if r.ID == "" {
				continue
			}
			out[r.ID] = append(out[r.ID], PlacedRegion{Points: r.Points, Bounds: BoundsOf(r.Points)})
		}
	}
	return out
}

// InRegion reports the point inside any of the place's polygons: bounds first,
// then the exact test, as the area effects do.
func InRegion(polygons []PlacedRegion, x, y float32) bool {
	for i := range polygons {
		if polygons[i].Bounds.Contains(x, y) && PointInPolygon(x, y, polygons[i].Points) {
			return true
		}
	}
	return false
}
