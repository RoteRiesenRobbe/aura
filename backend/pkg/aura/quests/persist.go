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
type questFlag struct {
	Path      []string `json:"path"`
	Running   bool     `json:"running"`
	Completed bool     `json:"completed"`
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
		// Sorted so the encoding is stable, which is what lets the writer's
		// fingerprint recognise an unchanged ledger — Go randomises map order.
		talked := make([]mobs.MobID, 0, len(l.talkedTo))
		for id := range l.talkedTo {
			talked = append(talked, id)
		}
		sort.Slice(talked, func(i, j int) bool { return talked[i] < talked[j] })
		raw, err := json.Marshal(talked)
		if err != nil {
			return nil, fmt.Errorf("encoding talked-to conversants: %w", err)
		}
		flags[FlagTalkedTo] = raw
	}

	for id, p := range l.quests {
		if !p.Running && !p.Completed {
			continue
		}
		raw, err := json.Marshal(questFlag{Path: p.Path, Running: p.Running, Completed: p.Completed})
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
			state.Quests[strings.TrimPrefix(key, FlagQuestPrefix)] = Progress{
				Path: q.Path, Running: q.Running, Completed: q.Completed,
			}
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
		}
	}
}
