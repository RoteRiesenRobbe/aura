package persist

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"
)

// ErrGone marks a save that can NEVER succeed: the character row this snapshot
// belongs to is not there any more. store.SaveCharacter wraps it when its UPDATE
// matches no live row.
//
// ⚑ It is the sink's half of a contract, which is why it lives here rather than
// in store: this package depends on nothing else in aura (see the package doc),
// so the writer cannot ask store what its errors mean — but store already
// imports persist, so the arrow points the right way.
//
// ⚑ IT EXISTS BECAUSE RETRYING A TERMINAL ERROR ONCE COST 37 MINUTES OF SAVES.
// A cleanup script deleted character rows while the server still held those
// characters stashed in the reconnect window; their session-expiry saves then
// failed against rows that were gone, were re-queued unconditionally, and the
// retry ladder they drove starved every real write until the process was
// restarted. A write that cannot succeed must LEAVE the queue.
var ErrGone = errors.New("persist: the character row no longer exists")

// retryBackoff is the delay ladder after a failed write, capped at the last
// entry. [PLACEHOLDER]
//
// ⚑ PER CHARACTER, not per writer. A database outage must not spin: the queue is
// bounded by construction (one entry per live character, newest wins), so the
// only cost of waiting is staleness. But the wait belongs to the snapshot that
// failed — see takeLocked.
var retryBackoff = []time.Duration{
	1 * time.Second,
	2 * time.Second,
	5 * time.Second,
	15 * time.Second,
	30 * time.Second,
}

// abandonAfter is how long one character's writes may keep failing before the
// writer gives up on that snapshot and says so. [PLACEHOLDER]
//
// ⚑ A BOUND, NOT A THROUGHPUT PROTECTION — per-character backoff already keeps a
// failing snapshot from costing anything but one attempt every 30 s. This exists
// so an error nobody classified as terminal degrades into "one character lost,
// loudly logged" instead of an entry that lives until the process dies.
//
// ⚑ Generous on purpose. A live character is re-snapshotted every 5 minutes and
// on every forced event, so abandoning one costs almost nothing; the snapshot
// that is genuinely irreplaceable is a stashed character's session-expiry save,
// and half an hour is longer than an outage that snapshot could usefully survive.
var abandonAfter = 30 * time.Minute

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

// entry is one queued snapshot plus what is known about trying to write it.
type entry struct {
	state CharacterState

	// attempts counts consecutive failures FOR THIS CHARACTER and drives its own
	// backoff.
	attempts int
	// retryAfter is when this snapshot becomes eligible again.
	retryAfter time.Time
	// firstFailure is when this character's current run of failures began; the
	// abandonAfter window is measured from it.
	//
	// ⚑ Deliberately NOT reset when a newer snapshot replaces the state. The
	// failures belong to the character's write path, not to the bytes, so a
	// character saving often enough would otherwise never age out of a permanent
	// failure — which is the exact entry the window exists to catch.
	firstFailure time.Time
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
//
// ⚑ ONE GOROUTINE IS NOT ONE FATE. Everything about a failure — the attempt
// count, the backoff, the give-up clock — is per character, because the single
// goroutine means anything global becomes everybody's problem: see ErrGone.
type Writer struct {
	sink Sink

	mu      sync.Mutex
	pending map[int64]*entry
	// inflight is the snapshot currently being written, held so Flush counts it
	// as unfinished business. Without it a flush could return "all clear" while
	// a transaction is still open, which on shutdown means exiting mid-write.
	inflight *CharacterState
	// written is the last successfully persisted fingerprint per character, and
	// it is what implements "save if dirty": an identical snapshot is dropped.
	written map[int64]string
	// failures counts consecutive TRANSIENT write failures across all characters
	// and is what Failing() reports.
	//
	// ⚑ Terminal errors are excluded on purpose. A deleted row is not a database
	// that has stopped accepting writes, and telling every live player their
	// progress is at risk because of one is precisely the false alarm §5b's grace
	// period exists to avoid.
	failures int

	// wake stands in for a sync.Cond: the run loop waits for "a new snapshot" OR
	// "the earliest retry falls due" OR "shutdown", and a Cond cannot be waited
	// on with a timeout.
	wake    chan struct{}
	closed  bool
	closeCh chan struct{}
	done    chan struct{}
}

// NewWriter starts the writer goroutine.
func NewWriter(sink Sink) *Writer {
	w := &Writer{
		sink:    sink,
		pending: map[int64]*entry{},
		written: map[int64]string{},
		wake:    make(chan struct{}, 1),
		closeCh: make(chan struct{}),
		done:    make(chan struct{}),
	}
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
	if w.closed {
		w.mu.Unlock()
		return
	}
	if queued, ok := w.pending[state.CharacterID]; ok {
		// Newest snapshot wins — but only the snapshot. The failure bookkeeping
		// is the character's, so a fresh copy of the state must not reset a
		// backoff or restart the give-up clock.
		queued.state = state
	} else {
		w.pending[state.CharacterID] = &entry{state: state}
	}
	w.mu.Unlock()
	w.signal()
}

// signal nudges the run loop. Non-blocking: the buffer holds one wakeup and the
// loop re-reads the whole queue anyway, so a dropped signal loses nothing.
func (w *Writer) signal() {
	select {
	case w.wake <- struct{}{}:
	default:
	}
}

// Pending reports every snapshot that has not been durably written yet, the one
// in flight included. Used by the shutdown flush to name what it is about to
// lose.
//
// ⚑ Abandoned snapshots are absent, and that is right in both cases: a snapshot
// dropped for ErrGone has no progress to lose because its row is gone, and one
// dropped by the abandonAfter window has already been logged as lost by name.
func (w *Writer) Pending() []CharacterState {
	w.mu.Lock()
	defer w.mu.Unlock()
	left := make([]CharacterState, 0, len(w.pending)+1)
	if w.inflight != nil {
		left = append(left, *w.inflight)
	}
	for id, queued := range w.pending {
		if w.inflight != nil && w.inflight.CharacterID == id {
			continue // the newer copy of a character already listed
		}
		left = append(left, queued.state)
	}
	return left
}

// Failing reports whether writes are not reaching the database — the signal
// behind the in-client "your progress is not being saved" warning (§5b).
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

// Close stops the writer once the queue drains, abandoning the retry ladder:
// every remaining snapshot gets one immediate attempt and anything that still
// fails is dropped, rather than holding the process open for a backoff nobody is
// waiting on.
//
// ⚑ It blocks until the goroutine has stopped, so a caller on a deadline —
// the shutdown path is the only one — must bound its own wait: a hung database
// makes each of those last attempts block for its connect timeout.
func (w *Writer) Close() {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		<-w.done
		return
	}
	w.closed = true
	close(w.closeCh)
	w.mu.Unlock()
	<-w.done
}

func (w *Writer) run() {
	defer close(w.done)
	for {
		w.mu.Lock()
		id, queued, wait := w.takeLocked(time.Now(), w.closed)
		if queued == nil {
			closed := w.closed
			w.mu.Unlock()
			if closed {
				return // closed and drained
			}
			w.await(wait)
			continue
		}
		state := queued.state
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

		// ⚑ `queued` is safe to touch after the write without the lock held —
		// and this is the invariant that makes it so: takeLocked REMOVED it from
		// pending, and Save only ever reaches entries that are in pending (a
		// snapshot arriving now creates a fresh entry). An in-flight entry is
		// owned by this goroutine alone until requeueLocked hands it back.
		err := w.sink.SaveCharacter(context.Background(), state)

		w.mu.Lock()
		w.inflight = nil

		if err == nil {
			w.written[id] = fingerprint
			w.failures = 0
			w.mu.Unlock()
			continue
		}

		// ① TERMINAL. Another attempt can only produce the same answer, and
		// there is no progress to protect: the row it belonged to is gone.
		// Deliberately not counted as a failure — see Writer.failures.
		if errors.Is(err, ErrGone) {
			delete(w.written, id)
			w.mu.Unlock()
			slog.Warn("💾 dropped a character save: its row no longer exists",
				slog.Int64("character_id", id),
				slog.String("name", state.Name),
				slog.Any("err", err))
			continue
		}

		now := time.Now()
		if queued.firstFailure.IsZero() {
			queued.firstFailure = now
		}
		queued.attempts++
		w.failures++
		attempts, failures := queued.attempts, w.failures
		failingFor := now.Sub(queued.firstFailure)
		// ③ The bound: give up on a snapshot whose failures nobody classified,
		// rather than carrying it for the life of the process.
		gaveUp := failingFor >= abandonAfter
		if gaveUp || w.closed {
			delete(w.written, id)
		} else {
			queued.retryAfter = now.Add(backoffFor(queued.attempts))
			w.requeueLocked(id, queued)
		}
		w.mu.Unlock()

		slog.Error("💾 could not save a character",
			slog.Int64("character_id", id),
			slog.String("name", state.Name),
			slog.Int("attempts", attempts),
			slog.Int("characters_failing_since_last_success", failures),
			slog.Any("err", err))
		if gaveUp {
			slog.Error("💾 PROGRESS LOST: giving up on a character that will not save",
				slog.Int64("character_id", id),
				slog.String("name", state.Name),
				slog.Int("level", state.Level),
				slog.Duration("failing_for", failingFor))
		}
	}
}

// requeueLocked puts a failed snapshot back.
//
// ⚑ A newer snapshot that arrived while this one was in flight supersedes it,
// failure or not — but it INHERITS the failure bookkeeping, so the backoff and
// the give-up clock survive the handover instead of resetting every time the
// game re-snapshots a character it cannot save.
func (w *Writer) requeueLocked(id int64, failed *entry) {
	if newer, ok := w.pending[id]; ok {
		newer.attempts = failed.attempts
		newer.retryAfter = failed.retryAfter
		newer.firstFailure = failed.firstFailure
		return
	}
	w.pending[id] = failed
}

// takeLocked moves one eligible snapshot into flight. It returns the entry, or
// nil plus how long until the earliest queued snapshot falls due (0 when the
// queue is empty). force ignores the retry schedule — the shutdown drain.
//
// Map order is arbitrary, which is fine: snapshots for different characters are
// independent, and there is only ever one per character.
//
// ⚑ ② AN INELIGIBLE ENTRY IS SKIPPED, NOT WAITED FOR, and that one word is the
// difference between this and the version that produced a 37-minute save
// outage. There the backoff was a sleep in the run loop, so one unwritable
// snapshot's retry ladder was the whole writer's — with 44 of them queued, a
// healthy save had a 1-in-45 chance of being attempted per 30-second cycle.
func (w *Writer) takeLocked(now time.Time, force bool) (int64, *entry, time.Duration) {
	var wait time.Duration
	for id, queued := range w.pending {
		if !force && queued.retryAfter.After(now) {
			if due := queued.retryAfter.Sub(now); wait == 0 || due < wait {
				wait = due
			}
			continue
		}
		delete(w.pending, id)
		held := queued.state
		w.inflight = &held
		return id, queued, 0
	}
	return 0, nil, wait
}

// await blocks until there is something to do: a new snapshot, the earliest
// queued retry falling due (wait > 0), or shutdown.
func (w *Writer) await(wait time.Duration) {
	if wait <= 0 {
		select {
		case <-w.wake:
		case <-w.closeCh:
		}
		return
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-w.wake:
	case <-timer.C:
	case <-w.closeCh:
	}
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
