// Package ascension holds the ascension reward catalog: the curated list of
// skills a bloodline may pick from when a max-level character is sacrificed
// (plan-ascension.md, D13 — one pick from a list is the ENTIRE v1 reward
// mechanic; there is no roll, no price and no banked balance).
//
// It is authored content, not schema: api/ascension/*.json, one file per entry,
// loaded and fully validated at boot like every other registry.
package ascension

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// Entry is one reward a bloodline may pick.
type Entry struct {
	// UnlockKey is the skill's unique CamelCase name (D17), and it is the exact
	// string stored in game.bloodline_unlocks.
	//
	// ⚑ ONE namespace, deliberately: milestone-unlocks.json already references
	// skills by name, the column is TEXT while the spellbook keys by int id, so
	// some string mapping had to exist — this one adds nothing to keep in sync.
	UnlockKey string

	// Skill is UnlockKey resolved against the registry at boot. An unknown name
	// is a boot failure, following the milestone-unlock and teach_skill
	// discipline: a reward nobody can be granted must never reach a player as a
	// row that silently does nothing.
	Skill *skills.SkillDefinition

	// Conditions gate the entry (D18). Empty is the common case and means
	// pickable by anyone. All of them must pass — AND semantics, exactly as a
	// dialogue node's conditions, because they ARE a dialogue node's conditions:
	// one vocabulary, two surfaces.
	//
	// ⚑ A gated entry is NOT hidden. C2 renders it locked with the gate named
	// and its progress, which is what keeps "this bloodline has learned
	// everything it can teach" (D14) from being a lie.
	Conditions []mobs.InteractionCondition
}

// Gated reports whether this entry carries a condition at all.
func (e Entry) Gated() bool { return len(e.Conditions) > 0 }

// Catalog is the authored reward list, in a stable order.
type Catalog struct {
	entries []Entry
}

// All returns every authored entry, gated ones included.
func (c Catalog) All() []Entry { return c.entries }

// Remaining answers "what can this bloodline still learn": the catalog minus
// the unlock keys it has already spent (P4 — a taken entry leaves that
// bloodline's catalog forever, and the bloodline_unlocks primary key enforces
// the same rule in the database).
//
// ⚑ Gates are NOT applied here. A locked entry is still unlearned, and C2 needs
// it in hand to render the locked row; filtering it out would make a gated
// entry indistinguishable from an exhausted catalog, which is precisely the
// state D14's "nothing left to teach" sentence describes.
//
// ⚑ An unknown taken key (a retired reward) is ignored rather than an error:
// the database holds what a bloodline picked historically, and the catalog is
// free to change under it.
func (c Catalog) Remaining(taken []string) []Entry {
	if len(c.entries) == 0 {
		return nil
	}
	spent := make(map[string]bool, len(taken))
	for _, key := range taken {
		spent[key] = true
	}

	remaining := make([]Entry, 0, len(c.entries))
	for _, e := range c.entries {
		if !spent[e.UnlockKey] {
			remaining = append(remaining, e)
		}
	}
	if len(remaining) == 0 {
		return nil
	}
	return remaining
}

// skillResolver is the narrow half of skills.Registry the catalog needs,
// following the quests speciesResolver precedent.
type skillResolver interface {
	GetByName(name string) (*skills.SkillDefinition, error)
}

type jsonEntry struct {
	UnlockKey  string               `json:"unlockKey"`
	Conditions []mobs.JSONCondition `json:"conditions"`
}

// CatalogFromFS walks fsys for .json files and parses each as one entry, with
// every skill name resolved against r.
//
// ⚑ AN EMPTY DIRECTORY IS VALID, and that is not laziness: api/ascension/ ships
// README-only from C1 until C3 authors the seed, and D14 makes "no entries a
// bloodline can still learn" an ordinary end state anyway — a catalog that
// refused to be empty would turn the loop's designed exhaustion into a boot
// failure the first time someone spent it.
func CatalogFromFS(fsys fs.FS, r skillResolver) (Catalog, error) {
	var entries []Entry
	seen := map[string]string{} // unlock key → the file that claimed it

	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", p, err)
		}
		if d.IsDir() || path.Ext(p) != ".json" {
			return nil
		}
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", p, err)
		}
		entry, err := parseEntry(data, r)
		if err != nil {
			return fmt.Errorf("ascension entry %q: %w", p, err)
		}
		if first, dup := seen[entry.UnlockKey]; dup {
			return fmt.Errorf("ascension entry %q: unlockKey %q is already claimed by %q — "+
				"two entries spending one bloodline_unlocks key leaves the second unpickable forever",
				p, entry.UnlockKey, first)
		}
		seen[entry.UnlockKey] = p
		entries = append(entries, entry)
		return nil
	})
	if err != nil {
		return Catalog{}, err
	}

	// Stable order, independent of the walk: the pick list is rendered to a
	// player, and rows that reshuffle between two boots for no authored reason
	// are the kind of thing nobody notices until they misclick.
	sort.Slice(entries, func(i, j int) bool { return entries[i].UnlockKey < entries[j].UnlockKey })
	return Catalog{entries: entries}, nil
}

func parseEntry(data []byte, r skillResolver) (Entry, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var je jsonEntry
	if err := dec.Decode(&je); err != nil {
		return Entry{}, err
	}

	if strings.TrimSpace(je.UnlockKey) == "" {
		return Entry{}, fmt.Errorf("unlockKey must name a skill")
	}
	def, err := r.GetByName(je.UnlockKey)
	if err != nil {
		return Entry{}, fmt.Errorf("unlockKey %q does not name a known skill", je.UnlockKey)
	}

	entry := Entry{UnlockKey: je.UnlockKey, Skill: def}
	for i, jc := range je.Conditions {
		cond, err := mobs.ParseCondition(jc)
		if err != nil {
			return Entry{}, fmt.Errorf("condition %d: %w", i, err)
		}
		entry.Conditions = append(entry.Conditions, cond)
	}
	return entry, nil
}
