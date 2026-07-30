package quests

import (
	"fmt"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// Progress is one quest's per-character state: the ordered list of stages this
// character actually entered (L6 — branch paths differ, and the journal
// renders the walked path, not a position), whether a run is live, and whether
// the quest has ever been completed. Completed never unsets (D13: a sealed
// branch is forever); a repeatable re-accept starts a fresh path with the flag
// still standing.
type Progress struct {
	Path      []string
	Running   bool
	Completed bool
}

// Ledger is a character's lifetime quest state (D3/D5): per-species kill
// counters, the talked-to conversant set, and per-quest progress. It lives on
// the player, survives death and reconnect via the connection-state stash
// (L11), and is session-scoped until step 8 persists it.
//
// It advances quests event-driven — at the kill-credit fan-out and at
// conversation events — never on a tick scan (the idle-alloc discipline).
type Ledger struct {
	// reg is the boot quest catalog; nil in worlds without quest content (the
	// sim), where the counters still count and no quest can advance.
	reg Registry

	killCounts map[mobs.MobID]uint64
	talkedTo   map[mobs.MobID]bool
	quests     map[string]*Progress
}

func NewLedger(reg Registry) *Ledger {
	return &Ledger{reg: reg}
}

// NoteKill counts one credited kill (or harvest — same counters, D2) of the
// species and re-checks every running objective stage. Called from the mob's
// death-reward fan-out for every participant: credit fires on participation,
// not XP amount (L13).
func (l *Ledger) NoteKill(species mobs.MobID) {
	if l.killCounts == nil {
		l.killCounts = make(map[mobs.MobID]uint64)
	}
	l.killCounts[species]++
	l.recheck()
}

// NoteTalkedTo stamps a conversant as talked-to and re-checks running stages.
// A set, so the non-edge-triggered session-open stamping is harmless.
func (l *Ledger) NoteTalkedTo(conversant mobs.MobID) {
	if l.talkedTo == nil {
		l.talkedTo = make(map[mobs.MobID]bool)
	}
	l.talkedTo[conversant] = true
	l.recheck()
}

func (l *Ledger) KillCount(species mobs.MobID) uint64 {
	return l.killCounts[species]
}

func (l *Ledger) HasTalkedTo(conversant mobs.MobID) bool {
	return l.talkedTo[conversant]
}

// Progress reports one quest's walked stage path and state; an untouched quest
// is all zero values.
func (l *Ledger) Progress(questID string) (path []string, running, completed bool) {
	p, ok := l.quests[questID]
	if !ok {
		return nil, false, false
	}
	return p.Path, p.Running, p.Completed
}

// Accept moves a quest from not-started onto its first stage — and cascades
// immediately, so a veteran whose lifetime counters already satisfy the
// objectives auto-completes on the spot (D3, the accepted consequence).
func (l *Ledger) Accept(questID string) error {
	if l.reg == nil {
		return fmt.Errorf("no quest content loaded")
	}
	q, err := l.reg.Get(questID)
	if err != nil {
		return err
	}
	p := l.progressOf(questID)
	if p.Running {
		return fmt.Errorf("quest %q is already running", questID)
	}
	if p.Completed && !q.Repeatable {
		return fmt.Errorf("quest %q is completed and not repeatable", questID)
	}
	p.Running = true
	p.Path = nil
	l.enter(q, p, q.First())
	return nil
}

// Abandon returns a running quest to not-started (D13): its stage path — and
// with it its diary — is cleared. Lifetime counters and the completed set are
// untouched by construction; a completed quest can never be abandoned.
func (l *Ledger) Abandon(questID string) error {
	p, ok := l.quests[questID]
	if !ok || !p.Running {
		return fmt.Errorf("quest %q is not running", questID)
	}
	p.Running = false
	p.Path = nil
	return nil
}

// AdvanceDialogue walks one authored branch edge (D1/D9): the current stage
// must be the named dialogue stage, and the destination one of the quest's
// stages. This is the op behind C2's advance_quest rows; until then the QUEST
// cheat drives it.
func (l *Ledger) AdvanceDialogue(questID, from, to string) error {
	if l.reg == nil {
		return fmt.Errorf("no quest content loaded")
	}
	q, err := l.reg.Get(questID)
	if err != nil {
		return err
	}
	p, ok := l.quests[questID]
	if !ok || !p.Running {
		return fmt.Errorf("quest %q is not running", questID)
	}
	current := p.Path[len(p.Path)-1]
	if current != from {
		return fmt.Errorf("quest %q is at stage %q, not %q", questID, current, from)
	}
	fromStage := q.Stage(from)
	if len(fromStage.Objectives) > 0 {
		return fmt.Errorf("quest %q stage %q is an objective stage; it advances off its counters", questID, from)
	}
	toStage := q.Stage(to)
	if toStage == nil {
		return fmt.Errorf("quest %q has no stage %q", questID, to)
	}
	l.enter(q, p, toStage)
	return nil
}

func (l *Ledger) progressOf(questID string) *Progress {
	if l.quests == nil {
		l.quests = make(map[string]*Progress)
	}
	p, ok := l.quests[questID]
	if !ok {
		p = &Progress{}
		l.quests[questID] = p
	}
	return p
}

// enter appends the stage to the walked path and cascades: a terminal stage
// completes the quest, a satisfied objective stage falls through to its next.
// The loader's acyclic guarantee bounds the walk.
func (l *Ledger) enter(q *QuestDefinition, p *Progress, s *Stage) {
	for {
		p.Path = append(p.Path, s.ID)
		if q.IsTerminal(s) {
			p.Running = false
			p.Completed = true
			return
		}
		if len(s.Objectives) == 0 || !l.satisfied(s) {
			return // waiting: on a dialogue edge, or on the counters
		}
		s = q.Stage(s.Next)
	}
}

// recheck advances every running quest whose current objective stage the
// lifetime counters now satisfy. Event-driven at the credit event; the map is
// as small as the character's quest history, so the walk is negligible.
func (l *Ledger) recheck() {
	if l.reg == nil {
		return
	}
	for questID, p := range l.quests {
		if !p.Running {
			continue
		}
		q, err := l.reg.Get(questID)
		if err != nil {
			continue // defensive: content changed under a live ledger
		}
		s := q.Stage(p.Path[len(p.Path)-1])
		if len(s.Objectives) == 0 || !l.satisfied(s) {
			continue
		}
		l.enter(q, p, q.Stage(s.Next))
	}
}

// satisfied checks an objective stage against the lifetime state (D3:
// thresholds are lifetime totals, L7).
func (l *Ledger) satisfied(s *Stage) bool {
	for _, o := range s.Objectives {
		switch o.Kind {
		case ObjectiveTalkTo:
			if !l.talkedTo[o.Target] {
				return false
			}
		default: // kill and harvest share the counters (D2)
			if l.killCounts[o.Target] < o.Count {
				return false
			}
		}
	}
	return true
}

// DebugLines renders the whole ledger for the QUEST cheat, sorted for
// deterministic output.
func (l *Ledger) DebugLines() []string {
	var lines []string

	species := make([]int, 0, len(l.killCounts))
	for id := range l.killCounts {
		species = append(species, int(id))
	}
	sort.Ints(species)
	for _, id := range species {
		lines = append(lines, fmt.Sprintf("kills mob:%d = %d", id, l.killCounts[mobs.MobID(id)]))
	}

	talked := make([]int, 0, len(l.talkedTo))
	for id := range l.talkedTo {
		talked = append(talked, int(id))
	}
	sort.Ints(talked)
	for _, id := range talked {
		lines = append(lines, fmt.Sprintf("talked-to mob:%d", id))
	}

	questIDs := make([]string, 0, len(l.quests))
	for id := range l.quests {
		questIDs = append(questIDs, id)
	}
	sort.Strings(questIDs)
	for _, id := range questIDs {
		p := l.quests[id]
		state := "abandoned"
		if p.Running {
			state = "running"
		} else if p.Completed {
			state = "completed"
		}
		lines = append(lines, fmt.Sprintf("quest %s [%s] path: %s", id, state, strings.Join(p.Path, " > ")))
	}
	return lines
}
