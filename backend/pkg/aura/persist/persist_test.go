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

// shortenBackoff makes the retry ladder test-speed and returns a restore func.
func shortenBackoff() func() {
	original := retryBackoff
	retryBackoff = []time.Duration{time.Millisecond, time.Millisecond}
	return func() { retryBackoff = original }
}
