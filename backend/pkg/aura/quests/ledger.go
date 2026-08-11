package quests

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// Progress is one quest's per-character state: the ordered list of stages this
// character actually entered (L6 — branch paths differ, and the journal
// renders the walked path, not a position), whether a run is live, and whether
// the quest has ever been completed. Completed never unsets (D13: a sealed
// branch is forever); a repeatable re-accept starts a fresh path with the flag
// still standing.
//
// Objectives is the CURRENT stage's composed objective lines (Q2/R2 — "3/8
// Wolf slain"), cached here and recomputed only when a counter or the stage
// moves (L4): Snapshot copies the slice header per tick, it never composes.
// Nil while the quest is not running — a completed quest's diary is its record.
//
// KillBase/TalkBase are the N4/D4 baselines (plan-feel-pass-2.md, reversing
// D3): every objective means "since this stage started", so entering an
// objective stage snapshots the lifetime counters here and the three read
// sites subtract. KillBase holds each countable target's lifetime count at
// entry; TalkBase marks talk targets that were ALREADY talked-to at entry and
// therefore need a fresh talk (a talk event lifts the mark). Rewritten whole
// on every stage entry; nil on dialogue stages.
//
// ⚑ Persisted state: the baselines belong in the character record step 8a
// writes (recorded in plan-accounts-schema.md), or a reload would hand every
// in-flight objective its lifetime totals back.
type Progress struct {
	Path       []string
	Running    bool
	Completed  bool
	Objectives []string
	KillBase   map[mobs.MobID]uint64
	TalkBase   map[mobs.MobID]bool
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
	// This runs at the session-OPEN edge, so firing here is by definition a
	// talk AFTER the stage was entered — the fresh talk D4 requires. Lifting
	// the baseline mark is what lets satisfied()/objectiveLines() read the
	// lifetime set again. A stage entered mid-conversation (the giver-as-
	// target case) keeps its mark until the player re-opens: D4's documented
	// awkward case, accepted for uniformity.
	for _, p := range l.quests {
		if p.Running {
			delete(p.TalkBase, conversant)
		}
	}
	l.recheck()
}

// KillCount reports how many of species this character has credited kills for,
// which is what a kills_this_life condition reads (plan-ascension.md D18 tier A).
//
// ⚑ Nil-guarded for the same reason MatchesStage is: it is read on the
// conversation present path, per tick per conversing player, and a conversation
// is not the place to panic. Zero is also the honest answer: no ledger is no
// proof of any kill.
func (l *Ledger) KillCount(species mobs.MobID) uint64 {
	if l == nil {
		return 0
	}
	return l.killCounts[species]
}

func (l *Ledger) HasTalkedTo(conversant mobs.MobID) bool {
	return l.talkedTo[conversant]
}

// Title is the quest's name as a player has seen it, for a gate that names one
// (plan-ascension-sites.md C2 / D2). The registry holds the only spelling they
// know: the id is an authoring key, and `complete "thin-the-orc-line"` in a
// panel is the same mistake as showing a CamelCase mob name on a nameplate.
//
// ⚑ It falls back to the ID rather than to an empty string. Both degrade paths
// are real (the sim runs with no registry, and an unknown id can only reach
// here through a gate the cross-validation somehow let past), and a gate reading
// `complete ""` names nothing at all, which is strictly worse than naming a key.
//
// ⚑ Nil-guarded and O(1) like its neighbours: this is read on the per-tick
// conversation present path (L15).
func (l *Ledger) Title(questID string) string {
	if l == nil || l.reg == nil {
		return questID
	}
	q, err := l.reg.Get(questID)
	if err != nil || q == nil || q.Title == "" {
		return questID
	}
	return q.Title
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
// mobs.QuestStageNotStarted / mobs.QuestStageCompleted / mobs.QuestStageRunning.
//
// ⚑ O(1), and that is a requirement rather than a nicety (L15): present() runs
// per tick per conversing player and evaluates node conditions on the way, so
// anything that walked the stage graph here would multiply into the render path.
// It is also the reason this reads the ledger's own maps and never the registry.
//
// not_started / running / completed partition the space and are mutually
// exclusive by construction: an abandoned quest is not-started (D13), and a
// completed one matches `completed` but NOT the terminal stage it ended on —
// otherwise a turn-in row gated on that stage would stay clickable forever after
// the quest was over. A stage id is a refinement inside `running`.
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
	case mobs.QuestStageRunning:
		// The band, not a stage: true from Accept until the quest ends, across
		// every stage it rests on. Running and Completed are mutually exclusive
		// by construction (enter() clears one as it sets the other), so this
		// needs no second test, and an abandoned quest is not running either.
		return ok && p.Running
	default:
		return ok && p.Running && len(p.Path) > 0 && p.Path[len(p.Path)-1] == want
	}
}

// ProgressEntry is one quest as the wire carries it (chunk C3, §6): its id, the
// ordered stages this character entered, and whether it is finished. Ids only —
// the titles and diary prose live in the /quests catalog (D14) — plus the
// CURRENT stage's composed objective lines (Q2/R2), which are per-player state
// and deliberately NOT on the catalog: serving thresholds for unreached stages
// would reverse D14 (L5).
type ProgressEntry struct {
	QuestID    string
	Path       []string
	Completed  bool
	Objectives []string
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
		entries = append(entries, ProgressEntry{QuestID: id, Path: p.Path, Completed: p.Completed, Objectives: p.Objectives})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].QuestID < entries[j].QuestID })
	return entries
}

// Accept moves a quest from not-started onto its first stage. Entering it
// snapshots the N4 baselines, so objectives start at zero — the old D3
// veteran auto-complete at accept cannot happen any more (see enter).
func (l *Ledger) Accept(questID string) error {
	q, err := l.canAccept(questID)
	if err != nil {
		return err
	}
	p := l.progressOf(questID)
	p.Running = true
	p.Path = nil
	l.enter(q, p, q.First())
	return nil
}

// canAccept is Accept's whole judgement, extracted so CanApply and the op
// cannot disagree (Q1 L3 — a second copy of "can the ledger take this?" is N1
// in a new costume). ⚑ A pure read: it must not touch progressOf, which
// creates the map entry it looks for — CanApply runs on the present path.
func (l *Ledger) canAccept(questID string) (*QuestDefinition, error) {
	if l.reg == nil {
		return nil, fmt.Errorf("no quest content loaded")
	}
	q, err := l.reg.Get(questID)
	if err != nil {
		return nil, err
	}
	if p, ok := l.quests[questID]; ok {
		if p.Running {
			return nil, fmt.Errorf("quest %q is already running", questID)
		}
		if p.Completed && !q.Repeatable {
			return nil, fmt.Errorf("quest %q is completed and not repeatable", questID)
		}
	}
	return q, nil
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
	p.Objectives = nil
	p.KillBase, p.TalkBase = nil, nil // re-accept re-baselines via enter anyway; keep no stale state
	l.revision++
	return nil
}

// AdvanceDialogue walks one authored branch edge (D1/D9): the current stage
// must be the named dialogue stage, and the destination one of the quest's
// stages. This is the op behind C2's advance_quest rows; the QUEST cheat
// drives it too.
func (l *Ledger) AdvanceDialogue(questID, from, to string) error {
	q, p, toStage, err := l.canAdvanceDialogue(questID, from, to)
	if err != nil {
		return err
	}
	l.enter(q, p, toStage)
	return nil
}

// canAdvanceDialogue is AdvanceDialogue's whole judgement, extracted for the
// same L3 reason as canAccept, and a pure read like it.
func (l *Ledger) canAdvanceDialogue(questID, from, to string) (*QuestDefinition, *Progress, *Stage, error) {
	if l.reg == nil {
		return nil, nil, nil, fmt.Errorf("no quest content loaded")
	}
	q, err := l.reg.Get(questID)
	if err != nil {
		return nil, nil, nil, err
	}
	p, ok := l.quests[questID]
	if !ok || !p.Running {
		return nil, nil, nil, fmt.Errorf("quest %q is not running", questID)
	}
	current := p.Path[len(p.Path)-1]
	if current != from {
		return nil, nil, nil, fmt.Errorf("quest %q is at stage %q, not %q", questID, current, from)
	}
	fromStage := q.Stage(from)
	if len(fromStage.Objectives) > 0 {
		return nil, nil, nil, fmt.Errorf("quest %q stage %q is an objective stage; it advances off its counters", questID, from)
	}
	toStage := q.Stage(to)
	if toStage == nil {
		return nil, nil, nil, fmt.Errorf("quest %q has no stage %q", questID, to)
	}
	return q, p, toStage, nil
}

// CanApply reports whether a quest row's ledger op would succeed right now —
// the quest-row show-rule (plan-conversation-journal.md Q1 §4.1 ②): present()
// shows an offer_quest or advance_quest row iff this says so, which is what
// makes an Accept row vanish once taken while its sibling questions stay.
//
// It is D17's existing already-known rule applied to a second grant kind, and
// deliberately the SAME code path the mutating ops run (L3): canAccept /
// canAdvanceDialogue are their extracted judgements, so the row on screen and
// the click's verdict cannot disagree.
//
// Nil-safe and fail-closed like MatchesStage — it runs on the present path.
func (l *Ledger) CanApply(g *mobs.InteractionGrant) bool {
	if l == nil {
		return false
	}
	switch g.Kind {
	case mobs.GrantOfferQuest:
		_, err := l.canAccept(g.Quest)
		return err == nil
	case mobs.GrantAdvanceQuest:
		_, _, _, err := l.canAdvanceDialogue(g.Quest, g.FromStage, g.ToStage)
		return err == nil
	default:
		return false
	}
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

// enter appends the stage to the walked path, snapshots the N4 baselines, and
// cascades: a terminal stage completes the quest, a satisfied objective stage
// falls through to its next. The loader's acyclic guarantee bounds the walk.
//
// Since N4 the baseline makes a fresh objective stage unsatisfied by
// construction (its "since entry" counts start at zero), so the old D3
// veteran cascade cannot happen at accept any more — that reversal is the
// chunk's point. The cascade survives for the credit path: recheck enters the
// next stage only once the since-entry counters clear the thresholds.
//
// It pings the journal ONCE at the end of the cascade (D17), reporting where
// the quest came to rest — one player action, one banner.
func (l *Ledger) enter(q *QuestDefinition, p *Progress, s *Stage) {
	for {
		p.Path = append(p.Path, s.ID)
		l.baseline(p, s)
		if q.IsTerminal(s) {
			p.Running = false
			p.Completed = true
			break
		}
		if len(s.Objectives) == 0 || !l.satisfied(p, s) {
			break // waiting: on a dialogue edge, or on the counters
		}
		s = q.Stage(s.Next)
	}
	// The objective line follows the stage the quest came to rest on (Q2);
	// a completed quest carries none — its diary is the record (§7.1 ruling).
	if p.Running {
		p.Objectives = l.objectiveLines(p, s)
	} else {
		p.Objectives = nil
	}
	l.revision++
	if l.notify != nil {
		l.notify(Notice{QuestID: q.ID, Title: q.Title, StageID: s.ID, Completed: p.Completed})
	}
}

// baseline rewrites the Progress baselines for a just-entered stage (N4/D4):
// each countable objective records the target's lifetime count, each talk
// objective whether the target was already talked-to (⇒ a fresh talk is
// required; NoteTalkedTo lifts the mark). Whole-replacement per entry — the
// baselines always describe the CURRENT stage, and a dialogue stage carries
// none.
func (l *Ledger) baseline(p *Progress, s *Stage) {
	p.KillBase, p.TalkBase = nil, nil
	for i := range s.Objectives {
		o := &s.Objectives[i]
		if o.Kind == ObjectiveTalkTo {
			if l.talkedTo[o.Target] {
				if p.TalkBase == nil {
					p.TalkBase = make(map[mobs.MobID]bool, 1)
				}
				p.TalkBase[o.Target] = true
			}
		} else if n := l.killCounts[o.Target]; n > 0 {
			if p.KillBase == nil {
				p.KillBase = make(map[mobs.MobID]uint64, len(s.Objectives))
			}
			p.KillBase[o.Target] = n
		}
	}
}

// countSince is a countable target's progress since the current stage was
// entered. ⚑ Clamped at 0, not trusted to subtract cleanly: content reloaded
// under a live ledger can leave a baseline above the lifetime counter, and a
// journal line must never read "-2/5".
func (l *Ledger) countSince(p *Progress, target mobs.MobID) uint64 {
	n := l.killCounts[target]
	if base := p.KillBase[target]; base < n {
		return n - base
	}
	return 0
}

// talkedSince reports a talk objective satisfied by a talk at or after stage
// entry: the lifetime set must hold the target AND no stale-talk mark may
// remain (D4 — a fresh talk is required).
func (l *Ledger) talkedSince(p *Progress, target mobs.MobID) bool {
	return l.talkedTo[target] && !p.TalkBase[target]
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
		if len(s.Objectives) == 0 {
			continue // a dialogue stage: no counter can move it, or its line
		}
		if !l.satisfied(p, s) {
			// The stage holds, but a counter moved — the "3/8" must move with
			// it (Q2). Event-driven: this is a credit event, never a tick.
			p.Objectives = l.objectiveLines(p, s)
			continue
		}
		l.enter(q, p, q.Stage(s.Next))
	}
}

// objectiveLines composes the current stage's journal lines (Q2/R2): the
// server sends the finished sentence, the client renders it verbatim. An
// authored Tracker wins outright, with {n}/{m} substituted live; otherwise one
// line per objective is derived from its load-resolved display name. Counts
// are since stage entry (N4) and capped at the threshold — the counters keep
// climbing while a sibling objective holds the stage, the display must not.
//
// ⚑ Never called per tick (L4): callers cache the result on Progress and
// recompute only at credit events and stage entries.
func (l *Ledger) objectiveLines(p *Progress, s *Stage) []string {
	if s.Tracker != "" {
		line := s.Tracker
		if o := firstCountable(s); o != nil {
			line = strings.ReplaceAll(line, "{n}", strconv.FormatUint(min(l.countSince(p, o.Target), o.Count), 10))
			line = strings.ReplaceAll(line, "{m}", strconv.FormatUint(o.Count, 10))
		}
		return []string{line}
	}
	if len(s.Objectives) == 0 {
		return nil // a dialogue stage without a tracker has nothing derivable
	}
	lines := make([]string, 0, len(s.Objectives))
	for i := range s.Objectives {
		o := &s.Objectives[i]
		switch o.Kind {
		case ObjectiveTalkTo:
			line := "Talk to the " + o.TargetName
			if l.talkedSince(p, o.Target) {
				line += " ✓"
			}
			lines = append(lines, line)
		case ObjectiveHarvest:
			lines = append(lines, fmt.Sprintf("%d/%d %s harvested", min(l.countSince(p, o.Target), o.Count), o.Count, o.TargetName))
		default:
			lines = append(lines, fmt.Sprintf("%d/%d %s slain", min(l.countSince(p, o.Target), o.Count), o.Count, o.TargetName))
		}
	}
	return lines
}

// satisfied checks an objective stage against progress SINCE STAGE ENTRY
// (N4/D4, reversing D3's lifetime reading; the counters themselves stay
// lifetime — the Progress baselines are what localise them).
func (l *Ledger) satisfied(p *Progress, s *Stage) bool {
	for _, o := range s.Objectives {
		switch o.Kind {
		case ObjectiveTalkTo:
			if !l.talkedSince(p, o.Target) {
				return false
			}
		default: // kill and harvest share the counters (D2)
			if l.countSince(p, o.Target) < o.Count {
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
