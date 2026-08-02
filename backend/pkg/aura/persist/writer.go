package persist

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// retryBackoff is the delay ladder after a failed write, capped at the last
// entry. [PLACEHOLDER]
//
// A database outage must not spin: the queue is bounded by construction (one
// entry per live character, newest wins), so the only cost of waiting is
// staleness, and the only cost of not waiting is a log line per tick.
var retryBackoff = []time.Duration{
	1 * time.Second,
	2 * time.Second,
	5 * time.Second,
	15 * time.Second,
	30 * time.Second,
}

// flushPollInterval is how often Flush re-checks the queue. Short enough that a
// clean shutdown is not visibly delayed, long enough not to spin a core.
const flushPollInterval = 20 * time.Millisecond

// Sink is the database, seen from here. Implemented by *store.Store.
//
// ⚑ Declared as an interface rather than importing store, so this package keeps
// its no-aura-dependencies property (see the package doc) and so the writer's
// own tests need no Postgres.
type Sink interface {
	SaveCharacter(ctx context.Context, state CharacterState) error
}

// Writer serialises character snapshots into the database on its own goroutine.
//
// It exists for one rule (plan-accounts-implementation.md §4): SNAPSHOT INSIDE
// THE TICK, WRITE OUTSIDE IT. The game loop is a single goroutine, so a
// synchronous write in a save trigger would stall every player in the world for
// the duration of the transaction. Save() is a memory copy into a map and
// returns immediately.
//
// ⚑ ONE writer goroutine, which is stronger than §5's "at most one in-flight
// write per character" and much harder to get subtly wrong: writes cannot
// overtake each other at all, so a tick-100 snapshot can never commit after the
// tick-150 one and quietly revert progress.
//
// ⚑ The queue is keyed by character and the NEWEST SNAPSHOT WINS. That bounds
// it by the number of live characters — a long outage degrades into staleness,
// never into unbounded memory — and it is correct rather than merely cheap: a
// newer snapshot fully supersedes an older one, so writing both would only ever
// write the same rows twice.
type Writer struct {
	sink Sink

	mu      sync.Mutex
	cond    *sync.Cond
	pending map[int64]CharacterState
	// inflight is the snapshot currently being written, held so Flush counts it
	// as unfinished business. Without it a flush could return "all clear" while
	// a transaction is still open, which on shutdown means exiting mid-write.
	inflight *CharacterState
	// written is the last successfully persisted fingerprint per character, and
	// it is what implements "save if dirty": an identical snapshot is dropped.
	written map[int64]string
	// failures counts consecutive write failures; the backoff and the
	// save-is-failing signal both read it.
	failures int

	closed  bool
	closeCh chan struct{}
	done    chan struct{}
}

// NewWriter starts the writer goroutine.
func NewWriter(sink Sink) *Writer {
	w := &Writer{
		sink:    sink,
		pending: map[int64]CharacterState{},
		written: map[int64]string{},
		closeCh: make(chan struct{}),
		done:    make(chan struct{}),
	}
	w.cond = sync.NewCond(&w.mu)
	go w.run()
	return w
}

// Save queues a snapshot. It never blocks and never fails: a character with a
// snapshot already waiting has it replaced.
//
// ⚑ Safe to call from the game loop, and that is the whole contract. Anything
// added here that could block — a channel send, a database call, a log write to
// a full pipe — moves the stall this type exists to prevent back onto the loop.
func (w *Writer) Save(state CharacterState) {
	if state.CharacterID == 0 {
		return // no row to write to; see sys.characterByClient
	}
	w.mu.Lock()
	defer w.mu.Unlock()
	if w.closed {
		return
	}
	w.pending[state.CharacterID] = state
	w.cond.Signal()
}

// Pending reports every snapshot that has not been durably written yet, the one
// in flight included. Used by the shutdown flush to name what it is about to
// lose.
func (w *Writer) Pending() []CharacterState {
	w.mu.Lock()
	defer w.mu.Unlock()
	left := make([]CharacterState, 0, len(w.pending)+1)
	if w.inflight != nil {
		left = append(left, *w.inflight)
	}
	for id, state := range w.pending {
		if w.inflight != nil && w.inflight.CharacterID == id {
			continue // the newer copy of a character already listed
		}
		left = append(left, state)
	}
	return left
}

// Failing reports whether the last write attempt failed — the signal behind the
// in-client "your progress is not being saved" warning (§5b).
func (w *Writer) Failing() bool {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.failures > 0
}

// Flush waits until nothing is queued or in flight, and reports whatever is
// still outstanding when ctx runs out.
//
// ⚑ The return value is the whole point on shutdown (§2): if the timeout fires,
// the one case where progress is knowingly discarded is otherwise also the one
// case with no record that it happened, and a player reporting lost progress
// after a deploy would be unfalsifiable.
func (w *Writer) Flush(ctx context.Context) []CharacterState {
	ticker := time.NewTicker(flushPollInterval)
	defer ticker.Stop()
	for {
		if left := w.Pending(); len(left) == 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return w.Pending()
		case <-ticker.C:
		}
	}
}

// Close stops the writer once the queue drains, abandoning the retry ladder.
// Not part of normal operation — the process exits — but the shutdown path and
// the tests both need it.
func (w *Writer) Close() {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		<-w.done
		return
	}
	w.closed = true
	close(w.closeCh)
	w.cond.Broadcast()
	w.mu.Unlock()
	<-w.done
}

func (w *Writer) run() {
	defer close(w.done)
	for {
		w.mu.Lock()
		for len(w.pending) == 0 && !w.closed {
			w.cond.Wait()
		}
		if len(w.pending) == 0 {
			w.mu.Unlock()
			return // closed and drained
		}
		id, state := w.takeLocked()
		fingerprint := state.Fingerprint()
		if fingerprint != "" && w.written[id] == fingerprint {
			// Nothing changed since the last successful write. This is what
			// makes the interval and session-expiry triggers free for an idle
			// character rather than a guaranteed duplicate write.
			w.inflight = nil
			w.mu.Unlock()
			continue
		}
		w.mu.Unlock()

		err := w.sink.SaveCharacter(context.Background(), state)

		w.mu.Lock()
		w.inflight = nil
		if err == nil {
			w.written[id] = fingerprint
			w.failures = 0
			w.mu.Unlock()
			continue
		}
		// Re-queue unless a newer snapshot arrived while the write was in
		// flight — that one supersedes this one, failure or not.
		if _, newer := w.pending[id]; !newer {
			w.pending[id] = state
		}
		w.failures++
		attempt := w.failures
		w.mu.Unlock()

		slog.Error("💾 could not save a character",
			slog.Int64("character_id", id),
			slog.String("name", state.Name),
			slog.Int("consecutive_failures", attempt),
			slog.Any("err", err))

		select {
		case <-time.After(backoffFor(attempt)):
		case <-w.closeCh:
			// Shutting down: drop the retry ladder and let Flush report what is
			// left, rather than holding the process open for the full window.
			w.mu.Lock()
			delete(w.pending, id)
			w.mu.Unlock()
		}
	}
}

// takeLocked moves one queued snapshot into flight. Map order is arbitrary,
// which is fine: snapshots for different characters are independent, and there
// is only ever one per character.
func (w *Writer) takeLocked() (int64, CharacterState) {
	for id, state := range w.pending {
		delete(w.pending, id)
		held := state
		w.inflight = &held
		return id, state
	}
	return 0, CharacterState{}
}

func backoffFor(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if attempt > len(retryBackoff) {
		attempt = len(retryBackoff)
	}
	return retryBackoff[attempt-1]
}
