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

	// notify pings the owning player's client when a quest moves (D17). Nil
	// until an owner installs it — the sim and the tests run without one, and a
	// carried ledger has none until its new owner adopts it (L11).
	notify func(Notice)

	// revision counts QUEST STATE changes — a stage entered, a quest abandoned.
	//
	// ⚑ The counters deliberately do NOT bump it. Accepting or finishing a quest
	// is a forced-save event (plan-accounts-implementation.md §2: visible,
	// memorable progress); a kill counter ticking is not, and bumping on NoteKill
	// would force a database write on every mob the player kills. Counters ride
	// the 5-minute interval like XP does.
	revision uint64
}

// Revision is the quest-state change counter. See the field.
func (l *Ledger) Revision() uint64 {
	if l == nil {
		return 0
	}
	return l.revision
}

// Notice is one journal event: a quest reached a new stage, or ended. It carries
// the Title because the banner is a sentence and only the registry knows the
// words; everything durable rides GameState instead (L8).
type Notice struct {
	QuestID   string
	Title     string
	StageID   string
	Completed bool
}

// SetNotifier installs the journal-ping callback.
//
// ⚑ Installed by the player that OWNS the ledger right now, not once at
// construction: the ledger survives death and reconnect while the player struct
// and its client do not (L11), so a callback fixed at birth would fire a banner
// at a client that has been closed since.
func (l *Ledger) SetNotifier(fn func(Notice)) {
	l.notify = fn
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

// MatchesStage answers a `quest_at_stage` dialogue condition (C2): does this
// character's ledger have questID at want, where want is a stage id or one of
// mobs.QuestStageNotStarted / mobs.QuestStageCompleted.
//
// ⚑ O(1), and that is a requirement rather than a nicety (L15): present() runs
// per tick per conversing player and evaluates node conditions on the way, so
// anything that walked the stage graph here would multiply into the render path.
// It is also the reason this reads the ledger's own maps and never the registry.
//
// The three cases are mutually exclusive by construction: an abandoned quest is
// not-started (D13), and a completed one matches `completed` but NOT the terminal
// stage it ended on — otherwise a turn-in row gated on that stage would stay
// clickable forever after the quest was over.
func (l *Ledger) MatchesStage(questID, want string) bool {
	if l == nil {
		return false // fail closed: a conversation is not the place to panic
	}
	p, ok := l.quests[questID]

	switch want {
	case mobs.QuestStageNotStarted:
		return !ok || (!p.Running && !p.Completed)
	case mobs.QuestStageCompleted:
		return ok && p.Completed
	default:
		return ok && p.Running && len(p.Path) > 0 && p.Path[len(p.Path)-1] == want
	}
}

// ProgressEntry is one quest as the wire carries it (chunk C3, §6): its id, the
// ordered stages this character entered, and whether it is finished. Ids only —
// the titles and diary prose live in the /quests catalog (D14).
type ProgressEntry struct {
	QuestID   string
	Path      []string
	Completed bool
}

// Snapshot projects every running and completed quest for the per-tick
// GameState, sorted by quest id and nil when there is nothing to send.
//
// ⚑ The sort is load-bearing, not tidiness: the client diffs this with a view
// signature, and Go randomises map iteration order, so an unsorted projection
// would rebuild the journal panel ~30×/s and drop clicks on its abandon rows —
// exactly what the signature exists to prevent (the same lesson the conversation
// panel learned the hard way).
//
// Quests that are neither running nor completed are absent: an abandoned quest
// is back to not-started (D13), and it must leave the journal with its diary.
func (l *Ledger) Snapshot() []ProgressEntry {
	if l == nil || len(l.quests) == 0 {
		// Fails closed like MatchesStage: a world without quest state sends an
		// empty journal, it does not panic in the marshaller.
		return nil
	}
	entries := make([]ProgressEntry, 0, len(l.quests))
	for id, p := range l.quests {
		if !p.Running && !p.Completed {
			continue
		}
		entries = append(entries, ProgressEntry{QuestID: id, Path: p.Path, Completed: p.Completed})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].QuestID < entries[j].QuestID })
	return entries
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
	l.revision++
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
//
// It pings the journal ONCE at the end of the cascade (D17), reporting where the
// quest came to rest — a retroactive accept can walk several stages in one go
// (D3), and that is one player action, so it is one banner.
func (l *Ledger) enter(q *QuestDefinition, p *Progress, s *Stage) {
	for {
		p.Path = append(p.Path, s.ID)
		if q.IsTerminal(s) {
			p.Running = false
			p.Completed = true
			break
		}
		if len(s.Objectives) == 0 || !l.satisfied(s) {
			break // waiting: on a dialogue edge, or on the counters
		}
		s = q.Stage(s.Next)
	}
	l.revision++
	if l.notify != nil {
		l.notify(Notice{QuestID: q.ID, Title: q.Title, StageID: s.ID, Completed: p.Completed})
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
