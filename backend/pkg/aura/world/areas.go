package world

// The one list of area ids (plan-prop-draw-order.md P4b, D15): a zone's area
// may name only an id api/areas/areas.json holds, so a typo in one zone file
// cannot quietly make a second area. Tiled offers the same list as a dropdown
// (the AuraAreaId enum, generated from this file).
//
// ⚑ A separate pass, beside CrossValidateAreaEffects and for its reason: the
// list is content of its own, and threading it through ~70 LoadZoneFS call
// sites would buy nothing the boot's one cross-check does not.

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"slices"
)

// AreaListFile is the list's file name inside api/areas/.
const AreaListFile = "areas.json"

// LoadAreaIDs reads the area list, in file order. Every id obeys D12's rule
// (checkAreaIDs), and an empty list is refused: it would refuse every area.
func LoadAreaIDs(fsys fs.FS) ([]string, error) {
	data, err := fs.ReadFile(fsys, AreaListFile)
	if err != nil {
		return nil, fmt.Errorf("area list: %w", err)
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var doc struct {
		Areas []string `json:"areas"`
	}
	if err := dec.Decode(&doc); err != nil {
		return nil, fmt.Errorf("%s: cannot parse: %w", AreaListFile, err)
	}
	if len(doc.Areas) == 0 {
		return nil, fmt.Errorf("%s lists no areas", AreaListFile)
	}
	if err := checkAreaIDs(doc.Areas); err != nil {
		return nil, fmt.Errorf("%s: %w", AreaListFile, err)
	}
	return doc.Areas, nil
}

// CrossValidateAreaIDs refuses every zone area whose id the list does not
// hold, all of them at once.
func CrossValidateAreaIDs(ids []string, zones []*Zone) error {
	var errs []error
	for _, z := range zones {
		for i, id := range z.AreaIDs {
			if !slices.Contains(ids, id) {
				errs = append(errs, fmt.Errorf("zone %q: area %d: id %q is not in api/areas/%s "+
					"(add it there and regenerate the Tiled palette, or pick a listed one)", z.ID, i, id, AreaListFile))
			}
		}
	}
	return errors.Join(errs...)
}
