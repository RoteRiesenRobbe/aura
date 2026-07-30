// Package quests is the quest system's content and state core (plan-quests.md
// chunk C1): authored quest definitions — a stage graph per quest — and the
// per-character Ledger that walks it off the kill-credit and conversation
// events. Backend only; the wire and journal UI are chunk C3.
package quests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"path"
	"sort"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
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
)

// Objective is one satisfaction condition of an objective stage, checked
// against the ledger's lifetime state (D3: thresholds are lifetime totals, L7).
// Target is the authored species' / conversant's MobID — never EntityType, and
// never a process-local entity id (L12).
type Objective struct {
	Kind   ObjectiveKind
	Target mobs.MobID
	Count  uint64
}

// Stage is one node of the quest graph. Either it carries Objectives and a
// single Next (an objective stage — auto-advances when the lifetime counters
// satisfy every objective), or neither (a dialogue stage — advanced only by
// authored conversation rows, D1). Journal is the diary prose appended when
// the stage is entered; it is served by the C3 catalog, never the wire.
type Stage struct {
	ID         string
	Journal    string
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
			if o.Target == 0 {
				return fmt.Errorf("quest %q stage %q: objective without a target", q.ID, s.ID)
			}
			if o.Count == 0 {
				return fmt.Errorf("quest %q stage %q: objective with count 0", q.ID, s.ID)
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
}

type jsonStage struct {
	ID         string          `json:"id"`
	Journal    string          `json:"journal"`
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
		s := &Stage{ID: js.ID, Journal: js.Journal, Next: js.Next}
		for _, jo := range js.Objectives {
			o, err := mapObjective(jo, mr)
			if err != nil {
				return nil, fmt.Errorf("quest %q stage %q: %w", jq.ID, js.ID, err)
			}
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
	// L12: ten definitions are legacy: true — proving-grounds content the live
	// world never spawns. Naming one boots green and produces a quest no player
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
	return Objective{Kind: kind, Target: def.ID, Count: count}, nil
}
