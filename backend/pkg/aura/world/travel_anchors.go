package world

// Cross-validation between the mob definitions, their PLACEMENTS and the zone
// set: does every anchor-mode travel_to row a player can walk up to name a
// destination that exists (plan-underworld.md U3 / U3b)?
//
// ⚑ Why it is a separate pass and not part of either loader, the reason
// quests.CrossValidate and ascension.CrossValidate both exist. The anchor name
// is authored in api/mobs/ AND in api/zones/, and the mob registry is built
// BEFORE any zone, because the zone loader takes it as an argument to resolve
// spawns. This package is the first point at which both are in scope.

import (
	"fmt"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// conversantSource is the slice of mobs.Registry this pass needs.
type conversantSource interface {
	Mobs() []*mobs.MobDefinition
}

// travelAnchorOf resolves one placement's destination for one grant: the
// PLACEMENT wins, the definition is the fallback. The same tri-state idiom
// Spawn already uses for wanderRadius, idleSpeedFactor and level.
func travelAnchorOf(s *Spawn, g *mobs.InteractionGrant) string {
	if s != nil && s.Anchor != "" {
		return s.Anchor
	}
	return g.Anchor
}

// anchorGrants visits every anchor-mode travel grant a definition authors,
// with the node that carries it (the error message has to name it).
func anchorGrants(def *mobs.MobDefinition, visit func(nodeID string, g *mobs.InteractionGrant)) {
	if def.Interaction == nil {
		return
	}
	for ni := range def.Interaction.Nodes {
		node := &def.Interaction.Nodes[ni]
		for oi := range node.Options {
			for gi := range node.Options[oi].Grants {
				g := &node.Options[oi].Grants[gi]
				if g.Kind == mobs.GrantTravelTo && g.Travel == mobs.TravelAnchor {
					visit(node.ID, g)
				}
			}
		}
	}
}

// CrossValidateTravelAnchors checks every anchor-mode travel_to row against the
// anchors the loaded zones actually place.
//
// ⭐ IT WALKS PLACEMENTS, NOT DEFINITIONS, and that is the whole design since
// U3b. A door's destination comes from where it STANDS, so the same CaveMouth
// definition legitimately leads to two different places in two different spots,
// and a definition alone no longer says where anything goes. Only a placement
// does.
//
// ⭐ THE SPLIT BETWEEN ERROR AND WARNING IS PLACEMENT. A door SOME ZONE PLACES
// is one a player can walk up to: a missing destination means it swallows the
// keypress, which is the exact failure the whole loader is written against, so
// it fails the boot. A definition nobody places cannot be pressed at all, so a
// broken DEFAULT on one only warns - the rule ascension.CrossValidate applies
// to a reward no site offers, and what lets the two edits an entrance needs
// (the mob def, the zone that places it) land in either order.
//
// ⛑ "Placed" means a zone spawn, so a SUMMONED anchor-traveller would warn
// rather than fail. No content summons one and none is planned (the modes that
// exist for summons resolve through their owner), and the runtime lookup fails
// closed anyway - the row simply renders locked.
func CrossValidateTravelAnchors(mr conversantSource, zones []*Zone) ([]string, error) {
	// Anchor names are unique across the placed set - checkSetWide (L5b) proves
	// it - so one flat map is a faithful index rather than a lossy merge.
	anchors := map[string]string{}
	for _, z := range zones {
		for i := range z.Anchors {
			anchors[z.Anchors[i].Name] = z.ID
		}
	}

	placedDefs := map[string]bool{}
	for _, z := range zones {
		for si := range z.Spawns {
			spawn := &z.Spawns[si]
			def := spawn.Def
			if def == nil {
				// An unresolved spawn is the zone loader's error, not this pass's.
				continue
			}
			placedDefs[def.Name] = true
			var bad error
			anchorGrants(def, func(nodeID string, g *mobs.InteractionGrant) {
				if bad != nil {
					return
				}
				name := travelAnchorOf(spawn, g)
				if name == "" {
					bad = fmt.Errorf("zone %q places %q at (%g, %g) and its interaction node %q travels by "+
						"anchor, but neither the placement nor the definition names one - the row would render, "+
						"take the keypress and move nobody. Name the destination on the spawn "+
						"(plan-underworld.md U3b)", z.ID, def.Name, spawn.X, spawn.Y, nodeID)
					return
				}
				if _, ok := anchors[name]; !ok {
					bad = fmt.Errorf("zone %q places %q at (%g, %g) travelling to anchor %q, which no loaded "+
						"zone authors - the row would render, take the keypress and move nobody "+
						"(plan-underworld.md U3)", z.ID, def.Name, spawn.X, spawn.Y, name)
				}
			})
			if bad != nil {
				return nil, bad
			}
		}
	}

	// What is left is definitions nobody placed. Their own default is all they
	// have, and an unresolvable one is content waiting for a zone rather than a
	// broken world.
	var warnings []string
	for _, def := range mr.Mobs() {
		if placedDefs[def.Name] {
			continue
		}
		anchorGrants(def, func(nodeID string, g *mobs.InteractionGrant) {
			if g.Anchor == "" {
				warnings = append(warnings, fmt.Sprintf("mob %q travels by anchor and no zone places it, so "+
					"nothing can reach it yet; a placement will have to name its destination", def.Name))
				return
			}
			if _, ok := anchors[g.Anchor]; !ok {
				warnings = append(warnings, fmt.Sprintf("mob %q defaults to anchor %q, which no loaded zone "+
					"authors; no zone places the mob either, so nothing can reach it yet", def.Name, g.Anchor))
			}
		})
	}
	// Sorted because a registry walk is stable but a reader diffing two boot logs
	// should not have to prove that. ascension.CrossValidate's reason verbatim.
	sort.Strings(warnings)
	return warnings, nil
}
