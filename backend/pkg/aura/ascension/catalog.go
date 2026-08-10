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

// MaxEntries is how many rewards the catalog may hold, and it is a WIRE limit
// rather than a design one (plan-ascension.md §12.4 C2a step 3). A generated
// conversation row carries its position in All() as the `ubyte` OptionIndex, so
// the addressable range is 0..255; **254 is reserved** for D14's empty-pick
// "Ascend" row, which must stay at a fixed index precisely because it is the one
// row whose position cannot depend on how much content exists, and 255 is the
// wire's no-grant sentinel.
//
// ⚑ Refused at BOOT, not clamped. A 255th entry would alias the empty-pick row
// and hand somebody the wrong reward for the one row nobody tested, which is
// exactly the aliasing the interaction loader's own index cap exists to prevent.
const MaxEntries = 254

// Catalog is the authored reward list, in a stable order.
type Catalog struct {
	entries []Entry
}

// All returns every authored entry, gated ones included. ⚑ The ORDER IS THE
// WIRE CONTRACT since C2a step 3: a generated conversation row carries an
// entry's position here as its OptionIndex, so this must be the same sequence on
// every boot. CatalogFromFS sorts by unlock key for exactly that reason.
func (c Catalog) All() []Entry { return c.entries }

// CatalogOf builds a catalog from entries already in hand, applying the same
// stable ordering CatalogFromFS does. For tests and for callers that resolved
// their entries some other way; content always arrives through the loader.
func CatalogOf(entries ...Entry) Catalog {
	sorted := make([]Entry, len(entries))
	copy(sorted, entries)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].UnlockKey < sorted[j].UnlockKey })
	return Catalog{entries: sorted}
}

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

// gateResolver is what an entry's GATES need beyond the skill registry: a
// species name turned into the id the kill ledger counts by, and a quest
// reference checked against the quest graph (plan-ascension.md §13 step 2).
//
// ⛑ IT IS A CONSTRUCTOR PARAMETER, NOT A LATER PASS, and that is deliberate.
// The catalog was the one surface carrying conditions that NOTHING validated:
// quests.CrossValidate walks mob interaction nodes and stops there, and
// mobs.ParseCondition checks shape only because it holds no registry. So a
// typo'd quest id or species name parsed green, conditionsPass answered false
// forever, and the entry rendered locked, unpickable and indistinguishable from
// a gate that is merely hard, discovered (if ever) by the player who spent a
// life chasing it. Taking the resolver here means a caller cannot construct an
// unvalidated catalog at all: it does not compile without one.
//
// ⚑ Narrow on purpose, following skillResolver above. The quest half is phrased
// as a CHECK rather than a lookup because the answer is thrown away: the
// condition already carries what conditionsPass reads.
type gateResolver interface {
	ResolveSpecies(name string) (mobs.MobID, error)
	CheckQuestStage(questID, stage string) error
}

type jsonEntry struct {
	// Comment is parsed and discarded: the _comment key is the content
	// convention for authoring notes, exactly as in the mob, skill, quest and
	// faction definitions. ⚑ Without the field DisallowUnknownFields refuses it,
	// so an author following the repo's own house style would meet a boot failure
	// reading `unknown field "_comment"`, and the rationale that belongs beside
	// a reward (which world content it sits level with, and on which axis it
	// differs) is exactly what D1 asks every entry to be able to state.
	Comment    string               `json:"_comment"`
	UnlockKey  string               `json:"unlockKey"`
	Conditions []mobs.JSONCondition `json:"conditions"`
}

// CatalogFromFS walks fsys for .json files and parses each as one entry, with
// every skill name resolved against r.
//
// ⚑ AN EMPTY DIRECTORY IS VALID, and that is not laziness: api/ascension/ ships
// README-only from C1 until C3 step 4 authored the seed, and D14 makes "no entries a
// bloodline can still learn" an ordinary end state anyway — a catalog that
// refused to be empty would turn the loop's designed exhaustion into a boot
// failure the first time someone spent it.
func CatalogFromFS(fsys fs.FS, r skillResolver, g gateResolver) (Catalog, error) {
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
		entry, err := parseEntry(data, r, g)
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
	if len(entries) > MaxEntries {
		return Catalog{}, fmt.Errorf("%d ascension entries, but only %d are addressable on the wire "+
			"(index 254 is reserved for the empty pick, 255 is the no-grant sentinel)", len(entries), MaxEntries)
	}

	// Stable order, independent of the walk: the pick list is rendered to a
	// player, and rows that reshuffle between two boots for no authored reason
	// are the kind of thing nobody notices until they misclick.
	sort.Slice(entries, func(i, j int) bool { return entries[i].UnlockKey < entries[j].UnlockKey })
	return Catalog{entries: entries}, nil
}

func parseEntry(data []byte, r skillResolver, g gateResolver) (Entry, error) {
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
		if err := resolveGate(&cond, g); err != nil {
			return Entry{}, fmt.Errorf("condition %d: %w", i, err)
		}
		entry.Conditions = append(entry.Conditions, cond)
	}
	return entry, nil
}

// resolveGate finishes one parsed condition against the world it refers to.
//
// ⚑ It takes a POINTER because the species half writes back: the id is what
// conditionsPass reads, and a copy would be resolved and thrown away: the same
// trap resolveConditionSpecies documents on the dialogue-node side.
//
// ⚑ The kinds not listed need nothing: minLevel and bloodline_ascensions are
// self-contained integers. A new kind that referenced content would land in
// this switch, and until it did it would simply go unresolved, which is why
// conditionsPass keeps its own unresolved-species refusal rather than trusting
// this to have run.
func resolveGate(c *mobs.InteractionCondition, g gateResolver) error {
	switch c.Kind {
	case mobs.ConditionKillsThisLife:
		id, err := g.ResolveSpecies(c.Species)
		if err != nil {
			return fmt.Errorf("kills_this_life names species %q, which no mob definition matches", c.Species)
		}
		c.SpeciesID = id
	case mobs.ConditionQuestAtStage:
		// ⭐ The SAME check the dialogue rows run, called rather than copied
		// (§13 step 2). Two checkers would drift the day a third stage sentinel
		// is added, and the drift would show up as content that boots on one
		// surface and not the other.
		return g.CheckQuestStage(c.Quest, c.Stage)
	}
	return nil
}
