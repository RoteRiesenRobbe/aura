// Package quests is the quest system's content and state core (plan-quests.md
// chunk C1): authored quest definitions — a stage graph per quest — and the
// per-character Ledger that walks it off the kill-credit and conversation
// events. Backend only; the wire and journal UI are chunk C3.
package quests

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
)

// ObjectiveKind is what an objective stage counts. Kill and harvest share the
// lifetime kill counters (D2: harvest-N is kill-N of a harvest species — same
// counters, no separate machinery); the two names exist so authored content
// reads as intended.
type ObjectiveKind int

const (
	ObjectiveKill ObjectiveKind = iota
	ObjectiveHarvest
	ObjectiveTalkTo
	// ObjectiveReach is done when the player stands inside a region while the
	// stage is current (plan-region-identity.md R2, D5). It names a REGION id,
	// never a MobID, and stands alone in its stage (D6): arrival advances the
	// stage at once, so nothing about it is persisted.
	ObjectiveReach
)

// String is the authored spelling, for messages.
func (k ObjectiveKind) String() string {
	for name, kind := range objectiveKinds {
		if kind == k {
			return name
		}
	}
	return fmt.Sprintf("ObjectiveKind(%d)", int(k))
}

// Objective is one satisfaction condition of an objective stage, checked
// against the ledger's lifetime state (D3: thresholds are lifetime totals, L7).
// Target is the authored species' / conversant's MobID — never EntityType, and
// never a process-local entity id (L12). TargetName is its display name,
// resolved at LOAD through the one display-name path (§35 C3:
// skills.DeriveDisplayName, the same rule /mobs serves) so the Q2 objective
// line never touches the mob registry at runtime.
//
// Tracker optionally rewords a talk_to objective's derived "Talk to the X"
// line while keeping its ✓ — the per-objective counterpart of Stage.Tracker,
// which replaces every line and loses the ticks. talk_to only: a kill/harvest
// line carries a live count that static text would hide.
//
// Chance > 0 makes a kill/harvest objective a FIND: each credit of the target
// while the stage is current rolls it, and a hit advances the stage at once.
// GuaranteedAt > 0 is the hidden pity: the Nth credit since stage entry
// always finds. A chance objective stands alone in its stage (a hit IS the
// stage moving, so no "found" state exists to persist) behind an authored
// stage tracker (the count is hidden, so nothing derives a line).
//
// Region is a reach objective's target, a region id from
// api/regions/regions.json (plan-region-identity.md R2); Target stays zero on
// one. Its TargetName is the place's TITLE, bound after the zones load
// (BindRegions), because the region list is not the quest loader's input; until
// then it holds the id, so an unbound registry still reads "Go to <id>".
type Objective struct {
	Kind         ObjectiveKind
	Target       mobs.MobID
	Region       string
	TargetName   string
	Count        uint64
	Tracker      string
	Chance       float64
	GuaranteedAt uint64
}

// Stage is one node of the quest graph. Either it carries Objectives and a
// single Next (an objective stage — auto-advances when the lifetime counters
// satisfy every objective), or neither (a dialogue stage — advanced only by
// authored conversation rows, D1). Journal is the diary prose appended when
// the stage is entered; it is served by the C3 catalog, never the wire.
//
// Tracker is the optional authored objective line (Q2/R2): when set it wins
// over the derived "3/8 Wolf slain" lines, with {n}/{m} substituted live from
// the stage's first countable objective. Dialogue stages have nothing
// derivable, so a tracker is their only way to a line at all.
type Stage struct {
	ID         string
	Journal    string
	Tracker    string
	Objectives []Objective
	Next       string
}

// QuestDefinition is one authored quest (api/quests/*.json). The file
// deliberately does not know who offers or advances it — those rows live in
// the conversants' interaction JSON and reference the quest (D9/D11).
type QuestDefinition struct {
	ID         string
	Title      string
	Repeatable bool // schema room, unauthored (D6)
	Stages     []*Stage

	stagesByID map[string]*Stage
	// dialogueEdgeFrom marks stages with at least one outgoing dialogue edge —
	// an advance_quest row somewhere in the world. C2's interaction loader
	// registers them; until then only tests (and no shipped content) do. A
	// dialogue stage with no outgoing edge of either kind is terminal.
	dialogueEdgeFrom map[string]bool
}

// Stage resolves a stage id, or nil.
func (q *QuestDefinition) Stage(id string) *Stage {
	if q.stagesByID == nil {
		q.stagesByID = make(map[string]*Stage, len(q.Stages))
		for _, s := range q.Stages {
			q.stagesByID[s.ID] = s
		}
	}
	return q.stagesByID[id]
}

// First is the quest's entry stage: the first authored one.
func (q *QuestDefinition) First() *Stage {
	return q.Stages[0]
}

// NoteDialogueEdgeFrom records that an authored conversation row advances this
// quest out of the given stage, which is what keeps that stage from being
// terminal. Called by C2's interaction loader at boot.
func (q *QuestDefinition) NoteDialogueEdgeFrom(stageID string) {
	if q.dialogueEdgeFrom == nil {
		q.dialogueEdgeFrom = make(map[string]bool)
	}
	q.dialogueEdgeFrom[stageID] = true
}

// IsTerminal reports whether entering the stage completes the quest: a
// dialogue stage with no outgoing edge (objective stages always have Next).
func (q *QuestDefinition) IsTerminal(s *Stage) bool {
	return len(s.Objectives) == 0 && s.Next == "" && !q.dialogueEdgeFrom[s.ID]
}

// Registry is the boot-loaded quest catalog.
type Registry interface {
	Get(id string) (*QuestDefinition, error)
	All() []*QuestDefinition
}

type registry struct {
	quests map[string]*QuestDefinition
}

func (r *registry) Get(id string) (*QuestDefinition, error) {
	q, ok := r.quests[id]
	if !ok {
		return nil, fmt.Errorf("QuestDefinition %q not found", id)
	}
	return q, nil
}

func (r *registry) All() []*QuestDefinition {
	all := make([]*QuestDefinition, 0, len(r.quests))
	for _, q := range r.quests {
		all = append(all, q)
	}
	sort.Slice(all, func(i, j int) bool { return all[i].ID < all[j].ID })
	return all
}

// NewRegistry builds and validates a registry from in-memory definitions —
// the seam Go tests in other packages use for fixture quests.
func NewRegistry(defs ...*QuestDefinition) (Registry, error) {
	r := &registry{quests: make(map[string]*QuestDefinition, len(defs))}
	for _, q := range defs {
		if err := validateQuest(q); err != nil {
			return nil, err
		}
		if _, dup := r.quests[q.ID]; dup {
			return nil, fmt.Errorf("duplicate quest id %q", q.ID)
		}
		r.quests[q.ID] = q
	}
	return r, nil
}

func validateQuest(q *QuestDefinition) error {
	if q.ID == "" {
		return fmt.Errorf("quest without an id")
	}
	if q.Title == "" {
		return fmt.Errorf("quest %q: missing title", q.ID)
	}
	if len(q.Stages) == 0 {
		return fmt.Errorf("quest %q: no stages", q.ID)
	}
	seen := make(map[string]bool, len(q.Stages))
	for _, s := range q.Stages {
		if s.ID == "" {
			return fmt.Errorf("quest %q: stage without an id", q.ID)
		}
		if seen[s.ID] {
			return fmt.Errorf("quest %q: duplicate stage id %q", q.ID, s.ID)
		}
		seen[s.ID] = true
		if s.Journal == "" {
			return fmt.Errorf("quest %q stage %q: missing journal prose", q.ID, s.ID)
		}
		// The stage shape is binary by design (§4): objectives with a single
		// next, or a bare dialogue stage.
		if len(s.Objectives) > 0 && s.Next == "" {
			return fmt.Errorf("quest %q stage %q: objectives without a next stage", q.ID, s.ID)
		}
		if len(s.Objectives) == 0 && s.Next != "" {
			return fmt.Errorf("quest %q stage %q: next without objectives (a dialogue stage advances via rows)", q.ID, s.ID)
		}
		for _, o := range s.Objectives {
			if o.Kind == ObjectiveReach {
				if o.Region == "" {
					return fmt.Errorf("quest %q stage %q: reach names a region", q.ID, s.ID)
				}
				// D6: arrival IS the stage moving, so there is no "reached"
				// state to persist beside a sibling that still holds the stage.
				if len(s.Objectives) != 1 {
					return fmt.Errorf("quest %q stage %q: a reach objective must be its stage's only objective", q.ID, s.ID)
				}
			} else if o.Target == 0 {
				return fmt.Errorf("quest %q stage %q: objective without a target", q.ID, s.ID)
			}
			if o.Count == 0 {
				return fmt.Errorf("quest %q stage %q: objective with count 0", q.ID, s.ID)
			}
			if o.Tracker != "" && s.Tracker != "" {
				return fmt.Errorf("quest %q stage %q: an objective tracker under a stage tracker is never shown", q.ID, s.ID)
			}
			if err := validateChance(o, s); err != nil {
				return fmt.Errorf("quest %q stage %q: %w", q.ID, s.ID, err)
			}
		}
		// Q2: {n}/{m} substitute from a countable (kill/harvest) objective; on
		// a stage without one they would render literally forever.
		if strings.Contains(s.Tracker, "{n}") || strings.Contains(s.Tracker, "{m}") {
			if firstCountable(s) == nil {
				return fmt.Errorf("quest %q stage %q: tracker uses {n}/{m} but the stage has no kill/harvest objective to count", q.ID, s.ID)
			}
		}
	}
	for _, s := range q.Stages {
		if s.Next == "" {
			continue
		}
		if s.Next == s.ID {
			return fmt.Errorf("quest %q stage %q: next points to itself", q.ID, s.ID)
		}
		if q.Stage(s.Next) == nil {
			return fmt.Errorf("quest %q stage %q: next %q is not a stage", q.ID, s.ID, s.Next)
		}
	}
	return validateAcyclicObjectiveChains(q)
}

// validateChance enforces the chance objective's shape (see Objective).
func validateChance(o Objective, s *Stage) error {
	if o.Chance == 0 {
		if o.GuaranteedAt != 0 {
			return fmt.Errorf("guaranteedAt needs a chance")
		}
		return nil
	}
	switch {
	case o.Chance < 0 || o.Chance > 1:
		return fmt.Errorf("chance %v is not in (0, 1]", o.Chance)
	case o.Kind == ObjectiveTalkTo || o.Kind == ObjectiveReach:
		return fmt.Errorf("a chance rides a kill/harvest objective, not %s", o.Kind)
	case len(s.Objectives) != 1:
		return fmt.Errorf("a chance objective must be its stage's only objective")
	case o.Count != 1:
		return fmt.Errorf("a chance objective takes no count")
	case s.Tracker == "":
		return fmt.Errorf("a chance objective's stage must author a tracker (its count is hidden)")
	}
	return nil
}

// firstCountable is the objective whose counters {n}/{m} substitution reads:
// the first kill/harvest one (talk_to and reach have no meaningful count to
// show, and a chance objective's count is hidden).
func firstCountable(s *Stage) *Objective {
	for i := range s.Objectives {
		if s.Objectives[i].Kind.counts() && s.Objectives[i].Chance == 0 {
			return &s.Objectives[i]
		}
	}
	return nil
}

// counts reports a kind that reads the kill counters (D2: kill and harvest
// share them).
func (k ObjectiveKind) counts() bool {
	return k == ObjectiveKill || k == ObjectiveHarvest
}

// validateAcyclicObjectiveChains rejects a cycle in the objective-stage next
// graph: retroactively satisfied, such a loop would cascade forever at accept.
// Dialogue stages break a chain (they wait for a click), so only next-edges
// between objective stages matter.
func validateAcyclicObjectiveChains(q *QuestDefinition) error {
	for _, start := range q.Stages {
		steps := 0
		for s := start; s != nil && s.Next != ""; s = q.Stage(s.Next) {
			steps++
			if steps > len(q.Stages) {
				return fmt.Errorf("quest %q: objective stages form a cycle through %q", q.ID, start.ID)
			}
		}
	}
	return nil
}

// speciesResolver is the slice of mobs.Registry the loader needs: authored
// species/conversant names resolve to their MobID (L12).
type speciesResolver interface {
	GetByName(name string) (*mobs.MobDefinition, error)
}

type jsonObjective struct {
	Kind    string `json:"kind"`
	Species string `json:"species"` // kill / harvest
	NPC     string `json:"npc"`     // talk_to
	Count   uint64 `json:"count"`   // absent → 1
	Tracker string `json:"tracker"` // any kind; required on talk_to and reach without a stage tracker (Q2)
	Region  string `json:"region"`  // reach

	Chance       float64 `json:"chance"`       // kill/harvest: a find rolled per credit
	GuaranteedAt uint64  `json:"guaranteedAt"` // with chance: the Nth credit always finds
}

type jsonStage struct {
	ID         string          `json:"id"`
	Journal    string          `json:"journal"`
	Tracker    string          `json:"tracker"`
	Objectives []jsonObjective `json:"objectives"`
	Next       string          `json:"next"`
}

type jsonQuest struct {
	// Comment is parsed and discarded: the _comment key is the content
	// convention for authoring notes (the factions/mobs precedent).
	Comment string `json:"_comment"`

	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Repeatable bool        `json:"repeatable"`
	Stages     []jsonStage `json:"stages"`
}

var objectiveKinds = map[string]ObjectiveKind{
	"kill":    ObjectiveKill,
	"harvest": ObjectiveHarvest,
	"talk_to": ObjectiveTalkTo,
	"reach":   ObjectiveReach,
}

// RegistryFromFS loads every quest definition, resolving authored species and
// conversant names against the mob registry. Unknown keys are rejected — the
// standing loader contract. Non-.json files (the directory README) are
// skipped.
func RegistryFromFS(fileSystem fs.FS, mr speciesResolver) (Registry, error) {
	var defs []*QuestDefinition
	err := fs.WalkDir(fileSystem, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", p, err)
		}
		if d.IsDir() || path.Ext(p) != ".json" {
			return nil
		}
		data, err := fs.ReadFile(fileSystem, p)
		if err != nil {
			return fmt.Errorf("cannot read %q: %w", p, err)
		}
		q, err := parseQuest(data, mr)
		if err != nil {
			return fmt.Errorf("cannot parse %q: %w", p, err)
		}
		defs = append(defs, q)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return NewRegistry(defs...)
}

func parseQuest(data []byte, mr speciesResolver) (*QuestDefinition, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var jq jsonQuest
	if err := dec.Decode(&jq); err != nil {
		return nil, err
	}

	q := &QuestDefinition{ID: jq.ID, Title: jq.Title, Repeatable: jq.Repeatable}
	for _, js := range jq.Stages {
		s := &Stage{ID: js.ID, Journal: js.Journal, Tracker: js.Tracker, Next: js.Next}
		seen := map[string]bool{}
		for _, jo := range js.Objectives {
			o, err := mapObjective(jo, mr)
			if err != nil {
				return nil, fmt.Errorf("quest %q stage %q: %w", jq.ID, js.ID, err)
			}
			// D20: an objective's tracker is keyed by kind + target, so two of
			// one kind + target in a stage would share a key.
			id := o.Kind.String() + "." + ObjectiveTargetKey(&o)
			if seen[id] {
				return nil, fmt.Errorf("quest %q stage %q: two %s objectives name %s", jq.ID, js.ID, jo.Kind, ObjectiveTargetKey(&o))
			}
			seen[id] = true
			s.Objectives = append(s.Objectives, o)
		}
		q.Stages = append(q.Stages, s)
	}
	return q, nil
}

func mapObjective(jo jsonObjective, mr speciesResolver) (Objective, error) {
	kind, ok := objectiveKinds[jo.Kind]
	if !ok {
		return Objective{}, fmt.Errorf("unknown objective kind %q", jo.Kind)
	}
	if kind == ObjectiveReach {
		return mapReach(jo)
	}
	if jo.Region != "" {
		return Objective{}, fmt.Errorf("only a reach objective names a region")
	}

	name := jo.Species
	if kind == ObjectiveTalkTo {
		if jo.Species != "" {
			return Objective{}, fmt.Errorf("talk_to names an npc, not a species")
		}
		name = jo.NPC
	} else if jo.NPC != "" {
		return Objective{}, fmt.Errorf("%s names a species, not an npc", jo.Kind)
	}
	if name == "" {
		return Objective{}, fmt.Errorf("objective %q without a target", jo.Kind)
	}
	def, err := mr.GetByName(name)
	if err != nil {
		return Objective{}, fmt.Errorf("objective %q: unknown target %q", jo.Kind, name)
	}
	displayName := skills.DeriveDisplayName(def.Name)
	// L12: a legacy: true definition is retired content the live world never
	// spawns (none ship since zone-editor C3, 2026-08-16). Naming one boots
	// green and produces a quest no player
	// can ever finish, which is the worst class of content defect: it looks
	// authored, it looks loaded, and it is unwinnable. Elsewhere a legacy
	// reference is a warning (a live mob teaching a legacy skill still works);
	// here it is fatal, because the objective's target simply is not in the world.
	if def.Legacy {
		return Objective{}, fmt.Errorf("objective %q names %q, which is legacy: true — the live world never spawns "+
			"it, so the objective could never be completed", jo.Kind, name)
	}

	count := jo.Count
	if count == 0 {
		count = 1
	}
	return Objective{Kind: kind, Target: def.ID, TargetName: displayName, Count: count, Tracker: jo.Tracker,
		Chance: jo.Chance, GuaranteedAt: jo.GuaranteedAt}, nil
}

// mapReach maps a reach objective (plan-region-identity.md R2). The region id is
// checked against the list and the drawn zones after the zones load
// (BindRegions); here only its shape is.
func mapReach(jo jsonObjective) (Objective, error) {
	switch {
	case jo.Species != "" || jo.NPC != "":
		return Objective{}, fmt.Errorf("reach names a region, not a species or an npc")
	case jo.Region == "":
		return Objective{}, fmt.Errorf("reach names a region")
	case jo.Count != 0:
		return Objective{}, fmt.Errorf("a reach objective takes no count")
	}
	return Objective{Kind: ObjectiveReach, Region: jo.Region, TargetName: jo.Region, Count: 1,
		Tracker: jo.Tracker, Chance: jo.Chance, GuaranteedAt: jo.GuaranteedAt}, nil
}

// BindRegions checks every reach objective against the place list and the
// drawn zones, and gives it the place's title (plan-region-identity.md R2).
//
// ⚑ It runs after the zones load, beside world.CrossValidateRegionIDs, because
// that is the first point at which the quest registry, the list and the zones
// all exist. An UNLISTED id is a boot failure (a typo). An UNDRAWN one is a
// WARNING, for world.CrossValidateTravelAnchors' reason: the debug zone set
// draws none of the shipped places, and a quest may be authored before its
// place is drawn. All failures are reported at once.
func BindRegions(r Registry, titles map[string]string, drawn map[string]bool) (warnings []string, err error) {
	var errs []error
	for _, q := range r.All() {
		for _, s := range q.Stages {
			for i := range s.Objectives {
				o := &s.Objectives[i]
				if o.Kind != ObjectiveReach {
					continue
				}
				title, listed := titles[o.Region]
				switch {
				case !listed:
					errs = append(errs, fmt.Errorf("quest %q stage %q: reach names region %q, which "+
						"api/regions/regions.json does not list", q.ID, s.ID, o.Region))
				default:
					o.TargetName = title
					if !drawn[o.Region] {
						warnings = append(warnings, fmt.Sprintf("quest %q stage %q: reach names region %q, which no "+
							"loaded zone draws, so the quest cannot be completed in this world", q.ID, s.ID, o.Region))
					}
				}
			}
		}
	}
	return warnings, errors.Join(errs...)
}
