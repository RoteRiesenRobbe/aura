package quests

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
)

// The three character_flags keys the ledger occupies.
//
// ⚑ THREE ROWS, NOT ~70. The counters could each have been a row per species,
// and the schema would have allowed it — but §4 rewrites every flag row on every
// autosave, so a row per species would turn one write into seventy for no gain
// (plan-accounts-schema.md §"The quest ledger").
const (
	FlagKillCounts = "quests.killCounts"
	FlagTalkedTo   = "quests.talkedTo"
	// FlagQuestPrefix + quest id is one quest's row. Per quest rather than one
	// blob so a single quest's state can be read or repaired with SQL, which is
	// an operator's only support tool (implementation.md §8).
	FlagQuestPrefix = "quest."
)

// questFlag is one quest's stored shape.
//
// ⚑ ALL THREE MEMBERS ARE PERSISTED, and `running` is not derivable. Today
// `running == !completed` happens to hold for every stored entry — but only
// because no quest authors `repeatable: true`. Ledger.Accept explicitly permits
// re-accepting a completed repeatable quest, which produces Running && Completed
// at once; deriving the flag would silently drop a live run the first time
// content turns that on, long after the code that caused it
// (plan-accounts-schema.md §"The quest ledger").
//
// ⚑ Its own type, with its own lowercase tags, rather than marshalling Progress
// directly: the stored format must not move because someone renames a Go field.
//
// ⚑ THE N4 BASELINES ARE STATE, NOT A CACHE. Every objective counts "since this
// stage started", so KillBase/TalkBase are what the three read sites subtract
// from the lifetime counters. Dropping them on a reload hands an in-flight
// objective its lifetime totals back — the reversed D3 behaviour, for exactly
// one stage per quest, invisible until someone counts wolves
// (plan-accounts-schema.md §"The quest ledger", backlog §49).
//
// ⚑ `Objectives` is deliberately NOT here: it is derived from the stage and the
// counters (objectiveLines), so Restore recomputes it. Storing it would freeze a
// display string authored in content into a player's save.
//
// Both baselines are `omitempty` — a dialogue stage carries neither, and a quest
// stored before they existed decodes to nil, which is what a re-entry produces
// anyway. TalkBase is a sorted array rather than an object for the same reason
// FlagTalkedTo is: the encoding has to be stable or the writer's fingerprint
// calls every reloaded character dirty forever.
type questFlag struct {
	Path      []string              `json:"path"`
	Running   bool                  `json:"running"`
	Completed bool                  `json:"completed"`
	KillBase  map[mobs.MobID]uint64 `json:"killBase,omitempty"`
	TalkBase  []mobs.MobID          `json:"talkBase,omitempty"`
}

// sortedIDs flattens a MobID set to a stable array.
//
// ⚑ The sort is not cosmetic: Go randomises map order, so an unsorted encoding
// would differ byte-for-byte between two identical ledgers and the writer's
// fingerprint would call every character dirty on every autosave.
//
// Returns nil for an empty set so the `omitempty` tags actually elide.
func sortedIDs(set map[mobs.MobID]bool) []mobs.MobID {
	if len(set) == 0 {
		return nil
	}
	ids := make([]mobs.MobID, 0, len(set))
	for id := range set {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	return ids
}

// LedgerState is the whole persisted ledger, in Go terms.
type LedgerState struct {
	KillCounts map[mobs.MobID]uint64
	TalkedTo   []mobs.MobID
	Quests     map[string]Progress
}

// EncodeFlags projects a ledger into character_flags rows.
//
// ⚑ WHICH QUESTS EARN A ROW is Snapshot()'s rule, restated rather than
// reinvented: exactly those with Running || Completed. An abandoned quest is
// back to not-started (D13) and needs no row — but the rule cannot be shortened
// to "running only", because a completed quest that was later re-accepted and
// abandoned still keeps Completed.
//
// Empty maps produce no rows at all, so a character who has never killed
// anything carries no flags rather than three empty ones.
func EncodeFlags(l *Ledger) (map[string]json.RawMessage, error) {
	flags := map[string]json.RawMessage{}
	if l == nil {
		return flags, nil
	}

	if len(l.killCounts) > 0 {
		raw, err := json.Marshal(l.killCounts)
		if err != nil {
			return nil, fmt.Errorf("encoding quest kill counts: %w", err)
		}
		flags[FlagKillCounts] = raw
	}

	if len(l.talkedTo) > 0 {
		raw, err := json.Marshal(sortedIDs(l.talkedTo))
		if err != nil {
			return nil, fmt.Errorf("encoding talked-to conversants: %w", err)
		}
		flags[FlagTalkedTo] = raw
	}

	for id, p := range l.quests {
		if !p.Running && !p.Completed {
			continue
		}
		raw, err := json.Marshal(questFlag{
			Path:      p.Path,
			Running:   p.Running,
			Completed: p.Completed,
			KillBase:  p.KillBase,
			TalkBase:  sortedIDs(p.TalkBase),
		})
		if err != nil {
			return nil, fmt.Errorf("encoding quest %q: %w", id, err)
		}
		flags[FlagQuestPrefix+id] = raw
	}

	return flags, nil
}

// DecodeFlags reads character_flags rows back into ledger state. Keys it does
// not recognise are ignored — the table is shared, and a future flag kind must
// not make the quest loader fail.
func DecodeFlags(flags map[string]json.RawMessage) (LedgerState, error) {
	state := LedgerState{}
	for key, raw := range flags {
		switch {
		case key == FlagKillCounts:
			counts := map[mobs.MobID]uint64{}
			if err := json.Unmarshal(raw, &counts); err != nil {
				return LedgerState{}, fmt.Errorf("decoding quest kill counts: %w", err)
			}
			state.KillCounts = counts
		case key == FlagTalkedTo:
			var talked []mobs.MobID
			if err := json.Unmarshal(raw, &talked); err != nil {
				return LedgerState{}, fmt.Errorf("decoding talked-to conversants: %w", err)
			}
			state.TalkedTo = talked
		case strings.HasPrefix(key, FlagQuestPrefix):
			var q questFlag
			if err := json.Unmarshal(raw, &q); err != nil {
				return LedgerState{}, fmt.Errorf("decoding quest flag %q: %w", key, err)
			}
			if state.Quests == nil {
				state.Quests = map[string]Progress{}
			}
			p := Progress{
				Path: q.Path, Running: q.Running, Completed: q.Completed,
				KillBase: q.KillBase,
			}
			if len(q.TalkBase) > 0 {
				p.TalkBase = make(map[mobs.MobID]bool, len(q.TalkBase))
				for _, id := range q.TalkBase {
					p.TalkBase[id] = true
				}
			}
			state.Quests[strings.TrimPrefix(key, FlagQuestPrefix)] = p
		}
	}
	return state, nil
}

// Restore installs persisted state onto a ledger, replacing whatever it held.
//
// ⚑ IT DOES NOT CASCADE. Accept and NoteKill deliberately re-check objectives
// and can walk a quest several stages forward; this is a load, and the state
// being loaded is already settled. Running the cascade here would replay the
// D3 retroactive-credit walk on every login and fire a banner for a quest that
// completed weeks ago — and, worse, could advance a quest whose content has
// since changed under a character who was never there.
//
// ⚑ The notifier is left alone: it belongs to whichever player owns the ledger
// right now, and adoptQuestLedger installs it (L11).
func (l *Ledger) Restore(state LedgerState) {
	l.killCounts = nil
	l.talkedTo = nil
	l.quests = nil

	if len(state.KillCounts) > 0 {
		l.killCounts = make(map[mobs.MobID]uint64, len(state.KillCounts))
		for id, count := range state.KillCounts {
			l.killCounts[id] = count
		}
	}
	if len(state.TalkedTo) > 0 {
		l.talkedTo = make(map[mobs.MobID]bool, len(state.TalkedTo))
		for _, id := range state.TalkedTo {
			l.talkedTo[id] = true
		}
	}
	if len(state.Quests) > 0 {
		l.quests = make(map[string]*Progress, len(state.Quests))
		for id, p := range state.Quests {
			held := p
			l.quests[id] = &held
			l.restoreObjectives(id, &held)
		}
	}
}

// restoreObjectives rebuilds one quest's objective lines after a load.
//
// The lines are derived (Q2/R2), so they are not stored — enter() composes them
// at every stage entry and the credit sites recompose them, both of which a load
// skips by design. Without this a restored character's journal shows a running
// quest with no objective line at all, which reads as a broken quest.
//
// ⚑ This is NOT the cascade Restore refuses to run. It composes a display string
// for the stage the quest already rests on; it never asks whether that stage is
// satisfied and never advances anything. The distinction is the whole reason it
// is a separate method rather than a call to enter().
//
// A quest or stage the content no longer authors leaves the lines nil rather
// than failing the load: content moves under saved characters, and a player who
// cannot log in is a worse outcome than a journal row missing its counter.
func (l *Ledger) restoreObjectives(id string, p *Progress) {
	if !p.Running || len(p.Path) == 0 || l.reg == nil {
		return // a completed quest's diary is its record (§7.1)
	}
	q, err := l.reg.Get(id)
	if err != nil {
		return
	}
	if s := q.Stage(p.Path[len(p.Path)-1]); s != nil {
		p.Objectives = l.objectiveLines(p, s)
	}
}
