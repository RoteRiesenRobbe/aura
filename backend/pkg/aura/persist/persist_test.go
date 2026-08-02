package persist

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeSink records what the writer hands it and can be told to fail.
type fakeSink struct {
	mu      sync.Mutex
	writes  []CharacterState
	failFor int // fail this many calls, then succeed
	saved   chan struct{}
}

func newFakeSink() *fakeSink {
	return &fakeSink{saved: make(chan struct{}, 64)}
}

func (f *fakeSink) SaveCharacter(_ context.Context, state CharacterState) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failFor > 0 {
		f.failFor--
		return errors.New("the database is having a moment")
	}
	f.writes = append(f.writes, state)
	select {
	case f.saved <- struct{}{}:
	default:
	}
	return nil
}

func (f *fakeSink) written() []CharacterState {
	f.mu.Lock()
	defer f.mu.Unlock()
	return append([]CharacterState(nil), f.writes...)
}

func stateAt(id int64, level int) CharacterState {
	return CharacterState{
		CharacterID: id, Name: "Barney", Level: level,
		ActiveAuraSlot: NoActiveAura, Spellbook: map[int32]int{1: 1},
	}
}

func flushed(t *testing.T, w *Writer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	require.Empty(t, w.Flush(ctx), "the writer should have drained")
}

// TestWriterWritesWhatItIsGiven is the baseline.
func TestWriterWritesWhatItIsGiven(t *testing.T) {
	sink := newFakeSink()
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 5))
	flushed(t, w)

	require.Len(t, sink.written(), 1)
	assert.Equal(t, 5, sink.written()[0].Level)
}

// TestWriterSkipsAnUnchangedSnapshot is what makes the interval and
// session-expiry triggers free rather than a guaranteed duplicate write — and
// what makes §2's "if dirty" a real rule instead of a comment.
func TestWriterSkipsAnUnchangedSnapshot(t *testing.T) {
	sink := newFakeSink()
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 5))
	flushed(t, w)
	for i := 0; i < 5; i++ {
		w.Save(stateAt(1, 5))
		flushed(t, w)
	}
	assert.Len(t, sink.written(), 1, "an identical snapshot must not be written again")

	w.Save(stateAt(1, 6))
	flushed(t, w)
	assert.Len(t, sink.written(), 2, "...but a changed one must be")
}

// TestWriterKeepsOnlyTheNewestSnapshot pins §5's stale-write rule: a newer
// snapshot fully supersedes an older one, so the older must never reach the
// database and quietly revert progress.
func TestWriterKeepsOnlyTheNewestSnapshot(t *testing.T) {
	sink := newFakeSink()
	block := make(chan struct{})
	slow := newBlockingSink(sink, block)
	w := NewWriter(slow)
	defer w.Close()

	w.Save(stateAt(1, 1)) // this one is taken and blocks in the sink
	slow.awaitEntered(t)
	for level := 2; level <= 10; level++ {
		w.Save(stateAt(1, level)) // all collapse onto one queue entry
	}
	close(block)
	flushed(t, w)

	written := sink.written()
	require.Len(t, written, 2, "the blocked write plus exactly one survivor")
	assert.Equal(t, 1, written[0].Level)
	assert.Equal(t, 10, written[1].Level, "the newest snapshot is the one that lands")
}

// TestWriterRetriesAFailedWrite: a database outage must not lose the snapshot.
func TestWriterRetriesAFailedWrite(t *testing.T) {
	restore := shortenBackoff()
	defer restore()

	sink := newFakeSink()
	sink.failFor = 3
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 7))
	flushed(t, w)

	require.Len(t, sink.written(), 1)
	assert.Equal(t, 7, sink.written()[0].Level)
	assert.False(t, w.Failing(), "a recovered writer is not failing")
}

// TestWriterReportsWhatItCouldNotSave is the shutdown contract: if the flush
// times out, the caller must be able to name the characters whose progress is
// being discarded. Otherwise the one case where loss is knowingly accepted is
// also the one case with no record of it.
func TestWriterReportsWhatItCouldNotSave(t *testing.T) {
	restore := shortenBackoff()
	defer restore()

	sink := newFakeSink()
	sink.failFor = 1 << 20 // never recovers
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(42, 9))

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()
	lost := w.Flush(ctx)

	require.Len(t, lost, 1)
	assert.Equal(t, int64(42), lost[0].CharacterID)
	assert.Equal(t, "Barney", lost[0].Name, "a lost character must be nameable, not just an id")
	assert.True(t, w.Failing())
}

// TestWriterAbandonsAWriteThatCanNeverSucceed pins the first half of the
// terminal-error rule: a snapshot whose row is gone leaves the queue after one
// attempt instead of being retried until the process dies.
func TestWriterAbandonsAWriteThatCanNeverSucceed(t *testing.T) {
	restore := shortenBackoff()
	defer restore()

	sink := newScriptedSink()
	sink.failWith(1, ErrGone)
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 5))
	flushed(t, w) // the entry must LEAVE the queue, not sit in it retrying

	assert.Equal(t, 1, sink.callCount(1), "a row that no longer exists is written to exactly once")
	assert.False(t, w.Failing(), "a deleted row is not a database that stopped accepting writes")
}

// TestWriterKeepsSavingWhileOneCharacterIsFailing is the outage regression pin.
//
// One snapshot that will not write must cost one attempt every backoff, and
// nothing else. In the version that produced the 37-minute save outage the
// backoff was the WHOLE WRITER's, so a healthy character queued behind a failing
// one waited out its retry ladder — with 44 failing entries, forever.
func TestWriterKeepsSavingWhileOneCharacterIsFailing(t *testing.T) {
	// A long first backoff, so "did the healthy save wait for it" is not a race:
	// the assertion below allows 500 ms against a 2 s ladder.
	restore := setBackoff(2 * time.Second)
	defer restore()

	sink := newScriptedSink()
	sink.failWith(1, errors.New("the database is having a moment"))
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 5))
	sink.awaitCall(t, 1, 5*time.Second) // character 1 has failed; its backoff starts now

	w.Save(stateAt(2, 5))
	sink.awaitCall(t, 2, 500*time.Millisecond)
}

// TestWriterRetryWritesTheNewestSnapshot: a failed snapshot does not hold back
// the progress made since it failed. The retry writes the NEWEST state — the
// failed one is superseded in place, never queued in front of its successor, so
// a character's own backoff can cost staleness but never ordering.
func TestWriterRetryWritesTheNewestSnapshot(t *testing.T) {
	// Long enough that the newer snapshot is reliably in place before the retry
	// fires; a short ladder would let the retry win the race and write twice.
	restore := setBackoff(500 * time.Millisecond)
	defer restore()

	sink := newScriptedSink()
	sink.failTimes(1, 1, errors.New("the database is having a moment"))
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 5))
	sink.awaitCall(t, 1, 5*time.Second) // level 5 has been attempted and refused

	w.Save(stateAt(1, 9)) // progress made while the retry is still backing off
	flushed(t, w)

	written := sink.written()
	require.Len(t, written, 1, "only the successful write lands")
	assert.Equal(t, 9, written[0].Level, "the retry writes the newest state, not the one that failed")
}

// TestWriterDoesNotSpinWhenAFailingCharacterKeepsSaving is the other edge of the
// same rule, and the reason the backoff is inherited rather than reset: a player
// levelling through a database outage re-snapshots constantly, and if each
// snapshot restarted the ladder the writer would hammer a sick database exactly
// when it is least able to answer.
func TestWriterDoesNotSpinWhenAFailingCharacterKeepsSaving(t *testing.T) {
	restore := setBackoff(2 * time.Second)
	defer restore()

	sink := newScriptedSink()
	sink.failWith(1, errors.New("the database is having a moment"))
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(1, 1))
	sink.awaitCall(t, 1, 5*time.Second) // the ladder starts here

	for level := 2; level <= 20; level++ {
		w.Save(stateAt(1, level))
	}
	time.Sleep(300 * time.Millisecond) // against a 2 s ladder

	assert.Equal(t, 1, sink.callCount(1),
		"re-snapshotting a failing character must not restart its retry ladder")
}

// TestWriterCarriesFailureBookkeepingOntoASupersedingSnapshot covers the one
// window the test above cannot reach: a snapshot arriving while a failing write
// is IN FLIGHT finds no queue entry to replace, so it becomes a brand-new one —
// and the failure it never saw has to be handed over to it.
//
// ⚑ Without the handover the give-up clock restarts every time the game
// re-snapshots, so a character being saved often enough would never age out of a
// permanent failure — the exact entry the window exists to catch.
func TestWriterCarriesFailureBookkeepingOntoASupersedingSnapshot(t *testing.T) {
	restore := setBackoff(2 * time.Second)
	defer restore()

	sink := newScriptedSink()
	sink.failWith(1, errors.New("the database is having a moment"))
	release := make(chan struct{})
	slow := newBlockingSink(sink, release)
	w := NewWriter(slow)
	defer w.Close()

	w.Save(stateAt(1, 1))
	slow.awaitEntered(t) // in flight, and about to fail

	w.Save(stateAt(1, 2)) // pending holds no entry for 1, so this is a NEW one
	close(release)
	sink.awaitCall(t, 1, 5*time.Second)

	time.Sleep(300 * time.Millisecond) // against a 2 s ladder
	assert.Equal(t, 1, sink.callCount(1),
		"the superseding snapshot inherits the ladder instead of starting a fresh one")
}

// TestWriterGivesUpOnACharacterThatNeverSucceeds pins the bound: an error nobody
// classified as terminal must still degrade into one lost character, loudly
// logged, rather than an entry that outlives the process.
func TestWriterGivesUpOnACharacterThatNeverSucceeds(t *testing.T) {
	restoreBackoff := shortenBackoff()
	defer restoreBackoff()
	restoreWindow := setAbandonAfter(50 * time.Millisecond)
	defer restoreWindow()

	sink := newScriptedSink()
	sink.failWith(7, errors.New("the database is having a moment"))
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(7, 3))
	flushed(t, w)

	assert.Greater(t, sink.callCount(7), 1, "it is retried before it is given up on")
}

// TestWriterIgnoresACharacterlessSnapshot: tests and any pre-accounts join
// produce players with no character row, and those must be dropped rather than
// written to id 0.
func TestWriterIgnoresACharacterlessSnapshot(t *testing.T) {
	sink := newFakeSink()
	w := NewWriter(sink)
	defer w.Close()

	w.Save(stateAt(0, 5))
	flushed(t, w)
	assert.Empty(t, sink.written())
}

// TestFingerprintIsStable: the dedupe above is only correct if a re-derived
// identical snapshot fingerprints identically. Maps are the risk — Go
// randomises their iteration order.
func TestFingerprintIsStable(t *testing.T) {
	build := func() CharacterState {
		return CharacterState{
			CharacterID: 1,
			Spellbook:   map[int32]int{9: 1, 3: 2, 7: 3, 1: 4, 5: 5},
			Flags: map[string]json.RawMessage{
				"b": json.RawMessage(`1`), "a": json.RawMessage(`2`), "c": json.RawMessage(`3`),
			},
			Loadout: []LoadoutSlot{{Type: SlotAura, Index: 0, SkillID: 1}},
		}
	}
	first := build().Fingerprint()
	for i := 0; i < 50; i++ {
		require.Equal(t, first, build().Fingerprint())
	}
}

// TestCanonicalFlagsSurvivesJsonbReordering: Postgres re-renders a jsonb value
// on the way out, so the bytes that come back are not the bytes that went in.
// Canonicalising both sides is what keeps the round trip an equality.
func TestCanonicalFlagsSurvivesJsonbReordering(t *testing.T) {
	fromGo := CanonicalFlags(map[string]json.RawMessage{
		"quest.x": json.RawMessage(`{"path":["a"],"running":true,"completed":false}`),
	})
	// What jsonb would hand back: same value, its own key order and spacing.
	fromPostgres := CanonicalFlags(map[string]json.RawMessage{
		"quest.x": json.RawMessage(`{"completed": false, "path": ["a"], "running": true}`),
	})
	assert.Equal(t, fromGo, fromPostgres)
}

// TestCanonicalFlagsKeepsBigCountersExact: kill counters are uint64, and
// round-tripping them through float64 would silently corrupt large ones.
func TestCanonicalFlagsKeepsBigCountersExact(t *testing.T) {
	out := CanonicalFlags(map[string]json.RawMessage{
		"quests.killCounts": json.RawMessage(`{"3":9007199254740993}`),
	})
	assert.JSONEq(t, `{"3":9007199254740993}`, string(out["quests.killCounts"]))
	assert.Contains(t, string(out["quests.killCounts"]), "9007199254740993")
}

// TestSortLoadoutMatchesTheLoadQuery pins the shared ordering: the load path
// sorts in SQL (ORDER BY slot_type, slot_index), the save path sorts here, and
// the round-trip comparison only holds if they agree.
func TestSortLoadoutMatchesTheLoadQuery(t *testing.T) {
	slots := []LoadoutSlot{
		{Type: SlotPassive, Index: 1}, {Type: SlotAura, Index: 2},
		{Type: SlotCooldown, Index: 0}, {Type: SlotAura, Index: 0},
	}
	SortLoadout(slots)
	assert.Equal(t, []LoadoutSlot{
		{Type: SlotAura, Index: 0}, {Type: SlotAura, Index: 2},
		{Type: SlotCooldown, Index: 0}, {Type: SlotPassive, Index: 1},
	}, slots)
}

// --- helpers ---

// blockingSink holds the first write open so a test can queue snapshots behind
// an in-flight one.
type blockingSink struct {
	inner   Sink
	release chan struct{}
	entered chan struct{}
	once    sync.Once
}

func newBlockingSink(inner Sink, release chan struct{}) *blockingSink {
	return &blockingSink{inner: inner, release: release, entered: make(chan struct{})}
}

func (b *blockingSink) SaveCharacter(ctx context.Context, state CharacterState) error {
	b.once.Do(func() {
		close(b.entered)
		<-b.release
	})
	return b.inner.SaveCharacter(ctx, state)
}

func (b *blockingSink) awaitEntered(t *testing.T) {
	t.Helper()
	select {
	case <-b.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("the writer never started its first write")
	}
}

// scriptedSink answers per character: the ids given to failWith return their
// error forever, everything else succeeds. Every call is counted, which is what
// lets a test say "attempted once and never again".
type scriptedSink struct {
	mu   sync.Mutex
	errs map[int64]error
	// remaining counts down the failures left for a character set up by
	// failTimes; absent means failWith's "forever".
	remaining map[int64]int
	calls     map[int64]int
	writes    []CharacterState
	called    chan int64
}

func newScriptedSink() *scriptedSink {
	return &scriptedSink{
		errs:      map[int64]error{},
		remaining: map[int64]int{},
		calls:     map[int64]int{},
		called:    make(chan int64, 256),
	}
}

func (s *scriptedSink) failWith(id int64, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.errs[id] = err
}

// failTimes fails that character's next n writes, then lets it through.
func (s *scriptedSink) failTimes(id int64, n int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.errs[id] = err
	s.remaining[id] = n
}

func (s *scriptedSink) written() []CharacterState {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]CharacterState(nil), s.writes...)
}

func (s *scriptedSink) SaveCharacter(_ context.Context, state CharacterState) error {
	s.mu.Lock()
	s.calls[state.CharacterID]++
	err := s.errs[state.CharacterID]
	if left, capped := s.remaining[state.CharacterID]; capped {
		if left <= 0 {
			err = nil
		} else {
			s.remaining[state.CharacterID] = left - 1
		}
	}
	if err == nil {
		s.writes = append(s.writes, state)
	}
	s.mu.Unlock()
	select {
	case s.called <- state.CharacterID:
	default:
	}
	return err
}

func (s *scriptedSink) callCount(id int64) int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls[id]
}

// awaitCall blocks until the sink has been asked to write that character.
func (s *scriptedSink) awaitCall(t *testing.T, id int64, within time.Duration) {
	t.Helper()
	deadline := time.After(within)
	for {
		if s.callCount(id) > 0 {
			return
		}
		select {
		case <-s.called:
		case <-deadline:
			t.Fatalf("character %d was never written within %s", id, within)
		}
	}
}

// shortenBackoff makes the retry ladder test-speed and returns a restore func.
func shortenBackoff() func() {
	return setBackoff(time.Millisecond, time.Millisecond)
}

// setBackoff replaces the retry ladder and returns a restore func.
func setBackoff(ladder ...time.Duration) func() {
	original := retryBackoff
	retryBackoff = ladder
	return func() { retryBackoff = original }
}

// setAbandonAfter shortens the give-up window and returns a restore func.
func setAbandonAfter(d time.Duration) func() {
	original := abandonAfter
	abandonAfter = d
	return func() { abandonAfter = original }
}
