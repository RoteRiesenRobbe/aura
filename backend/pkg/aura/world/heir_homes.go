package world

// Resolving the stones' heir homes against the zone set
// (plan-ascension-ceremony.md D13). Here for CrossValidateTravelAnchors'
// reason: the id is authored in api/mobs/, and the mob registry is built before
// any zone.

import (
	"fmt"
	"sort"
)

// ResolveHeirHomes checks every stone's heirHome against the bind points the
// loaded zones place, and records the area its fire stands in on the ceremony,
// which names the place on the summary ("Your heir wakes at: <place>", Q4).
//
// ⭐ A STONE SOME ZONE PLACES FAILS THE BOOT on an unknown id: the runtime would
// treat it as unbound (the home_campfire_id rule) and the heir would silently
// wake at the default spawn. A stone nobody places cannot be reached, so it
// only warns: CrossValidateTravelAnchors' split, and what lets the stone and
// its fire land in either order. Any loaded zone may hold the fire: a bound
// home in a cave is legal today.
func ResolveHeirHomes(mr conversantSource, zones []*Zone) ([]string, error) {
	areas := map[string]string{}
	placed := map[string]bool{}
	for _, z := range zones {
		for i := range z.BindPoints {
			areas[z.BindPoints[i].ID] = z.BindPoints[i].Area
		}
		for i := range z.Spawns {
			if z.Spawns[i].Def != nil {
				placed[z.Spawns[i].Def.Name] = true
			}
		}
	}
	var warnings []string
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for i := range def.Interaction.Nodes {
			cer := def.Interaction.Nodes[i].Ceremony
			if cer == nil || cer.HeirHome == "" {
				continue
			}
			area, ok := areas[cer.HeirHome]
			switch {
			case ok:
				cer.HeirHomeArea = area
			case placed[def.Name]:
				return nil, fmt.Errorf("mob %q: interaction.heirHome %q names no bind point in any loaded zone, "+
					"so its heirs would silently wake at the default spawn (plan-ascension-ceremony.md D13)",
					def.Name, cer.HeirHome)
			default:
				warnings = append(warnings, fmt.Sprintf("mob %q: interaction.heirHome %q names no bind point in "+
					"any loaded zone; no zone places the stone either, so nothing can reach it yet",
					def.Name, cer.HeirHome))
			}
		}
	}
	sort.Strings(warnings)
	return warnings, nil
}
