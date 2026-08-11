package ascension

// Cross-validation between the catalog and the sites that offer it
// (plan-ascension-sites.md C3, P4/P7): the reward keys authored on a stone's
// catalog node.
//
// ⚑ Why this is a separate pass and not part of either loader. The keys are
// authored in `api/mobs/`, so the mob loader is where you would look for the
// check — but `mobs` holds no catalog and cannot import one: `ascension` imports
// `mobs` for the shared condition vocabulary, so the reverse is a cycle. And the
// catalog loader cannot do it either, because it does not know who offers what.
// This is the one place both are in scope, and it follows quests.CrossValidate,
// which exists for the same reason one registry over.

import (
	"fmt"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// conversantSource is the slice of mobs.Registry this pass needs.
type conversantSource interface {
	Mobs() []*mobs.MobDefinition
}

// CrossValidate checks every reward key authored on a site's catalog node.
//
// Errors are boot failures, the loader ethos: an unknown key would reach a
// player as a row that is locked, unpickable and indistinguishable from a gate
// that is merely hard (P4).
//
// Warnings are content that loads and runs but that no site offers, so nobody
// can ever pick it (P7). A warning rather than a failure because authoring a
// reward file and placing it on a stone are two edits, and the order between
// them should stay free — the same rule quests.CrossValidate applies to a quest
// whose rows do not exist yet.
func CrossValidate(mr conversantSource, c Catalog) ([]string, error) {
	known := make(map[string]bool, len(c.entries))
	for _, e := range c.entries {
		known[e.UnlockKey] = true
	}

	offered := make(map[string]bool, len(known))
	for _, def := range mr.Mobs() {
		if def.Interaction == nil {
			continue
		}
		for ni := range def.Interaction.Nodes {
			node := &def.Interaction.Nodes[ni]
			// ⚑ The row source, not the presence of a list: the loader refuses
			// `rewards` on any other node, and a second row source landing here must
			// not silently start consuming the catalog.
			if node.Rows != mobs.RowSourceAscensionCatalog {
				continue
			}
			for _, key := range node.Rewards {
				if !known[key] {
					return nil, fmt.Errorf("mob %q: interaction node %q offers reward %q, which no ascension entry "+
						"claims — it would render as a row locked forever, indistinguishable from a gate that is "+
						"merely hard", def.Name, node.ID, key)
				}
				offered[key] = true
			}
		}
	}

	var warnings []string
	for key := range known {
		if !offered[key] {
			warnings = append(warnings, fmt.Sprintf("ascension reward %q is offered by no site, so no bloodline "+
				"can ever pick it", key))
		}
	}
	// Sorted because a map walk is randomised and a boot log that reorders itself
	// between two identical boots is one nobody can diff.
	sort.Strings(warnings)
	return warnings, nil
}
