package persist

import (
	"context"
	"log/slog"
	"sync"

	"github.com/google/uuid"
)

// AscensionRequest is one character's sacrifice, handed off the game loop.
//
// ⚑ It carries the CLIENT as well as the character, because the outcome has to
// find its way back to a connection: the loop is what ends the session, and by
// the time the transaction returns the only thing that still identifies "the
// player who asked" is this uuid.
//
// ⚑ No slot index, deliberately. Both halves of the bloodline_unlocks key
// matter, but the transaction reads the slot off the row it is already
// updating — a value carried from here could drift from the row and file a
// reward under a bloodline that did not earn it.
type AscensionRequest struct {
	AccountID   int64
	CharacterID int64
	ClientUUID  uuid.UUID
	// UnlockKey is the picked reward, or "" when the catalog had nothing left to
	// offer — an ordinary ascension that grants no unlock (D14).
	UnlockKey string
}

// AscensionResult is a finished attempt, waiting for the loop to observe it.
type AscensionResult struct {
	AscensionRequest
	// Err is nil when the character is retired and the unlock is safe. On
	// anything else NOTHING was committed — the transaction is atomic — so the
	// character is still alive and still playable.
	Err error
}

// AscensionSink is the sacrifice transaction, seen from here. Implemented by
// *store.Store, declared as an interface for the same reason Sink is: this
// package depends on nothing else in aura.
type AscensionSink interface {
	AscendCharacter(ctx context.Context, accountID, characterID int64, unlockKey string) (int, error)
}

// Ascender runs sacrifice transactions off the game loop and holds their
// outcomes until the loop collects them.
//
// ⚑ THE CODEBASE'S FIRST MID-SESSION GAME-WORLD→DB WRITE, and it exists as its
// own seam because the game must never hold a *store.Store (see
// sys.CharacterSaves). The loop asks; this writes; the loop observes.
//
// ⚑ ONE ATTEMPT, NEVER RETRIED, which is the opposite of the save path's
// policy and deliberately so. A save is a snapshot that can be taken again a
// moment later; this is irreversible, and re-running it after a timeout whose
// transaction actually committed would report "no such character" for a
// character that was in fact sacrificed. A failed attempt commits nothing, so
// the honest recovery is to leave the player standing in the world and let them
// ask again.
type Ascender struct {
	sink AscensionSink
	// onCommitted is told when a sacrifice has actually landed. Optional: a
	// build with no memorial installs none.
	onCommitted func()

	mu   sync.Mutex
	done []AscensionResult
	// live counts in-flight requests, so tests (and a shutdown) can tell "none
	// finished" from "none started".
	live sync.WaitGroup
}

func NewAscender(sink AscensionSink) *Ascender {
	return &Ascender{sink: sink}
}

// OnCommitted registers a callback for a sacrifice that COMMITTED.
//
// ⭐ It exists so the memorial can be told a name was just added (PO feedback
// 2026-08-11), and it lives here rather than on the loop side for one hard
// reason: the callback triggers a DATABASE READ, and the game loop is a single
// goroutine that must never do one. This runs on the per-request goroutine
// below, which is already off the loop and is the only place that knows the
// transaction succeeded.
//
// ⚑ Set once at boot, before any request is made, so it needs no lock.
//
// ⚑ SUCCESS ONLY. A failed attempt commits nothing, so re-reading after one
// would be a round trip bought by an error.
func (a *Ascender) OnCommitted(fn func()) {
	a.onCommitted = fn
}

// Ascend starts one sacrifice and returns immediately. The outcome arrives via
// Completed.
//
// ⚑ A goroutine per request rather than a queue and a worker: a character
// ascends at most once in its life, so there is no throughput to manage, and a
// queue would only add a second place for one to sit unnoticed.
func (a *Ascender) Ascend(req AscensionRequest) {
	a.live.Add(1)
	go func() {
		defer a.live.Done()
		_, err := a.sink.AscendCharacter(context.Background(), req.AccountID, req.CharacterID, req.UnlockKey)
		if err == nil && a.onCommitted != nil {
			// ⚑ AFTER the transaction returns, never before: the re-read has to
			// see the committed row, and a nudge sent early would refresh the
			// listing to exactly what it already held.
			a.onCommitted()
		}
		if err != nil {
			slog.Error("an ascension did not commit",
				slog.Int64("account_id", req.AccountID),
				slog.Int64("character_id", req.CharacterID),
				slog.String("unlock_key", req.UnlockKey),
				slog.Any("err", err))
		}
		a.mu.Lock()
		a.done = append(a.done, AscensionResult{AscensionRequest: req, Err: err})
		a.mu.Unlock()
	}()
}

// Completed hands the loop every finished attempt and forgets them.
//
// ⚑ Drained rather than pushed, for the reason every other loop inbox is: the
// world belongs to one goroutine, so a transaction finishing on another must
// wait to be picked up rather than reach into it.
func (a *Ascender) Completed() []AscensionResult {
	a.mu.Lock()
	defer a.mu.Unlock()
	if len(a.done) == 0 {
		return nil
	}
	done := a.done
	a.done = nil
	return done
}

// Wait blocks until every started ascension has finished.
//
// ⚑ TESTS ONLY, and shutdown deliberately does NOT call it. Waiting would buy
// nothing there: the loop is stopping, so an outcome that arrives during the
// wait has nobody left to observe it. An ascension caught by a SIGTERM either
// committed (the character is sacrificed, and character-select shows the slot
// empty on the next boot) or did not (it is still alive) — both are consistent
// states, which is the point of doing it in one transaction.
func (a *Ascender) Wait() { a.live.Wait() }
