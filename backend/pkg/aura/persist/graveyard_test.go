package persist_test

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// scriptedYard is a graveyard source that answers whatever it is told to, and
// counts how often it was asked. No database: this file owns the REFRESH
// policy, and store/ascension_test.go owns the query.
type scriptedYard struct {
	mu    sync.Mutex
	yard  persist.Graveyard
	err   error
	calls atomic.Int64
}

func (s *scriptedYard) AscendedNames(_ context.Context, limit int) (persist.Graveyard, error) {
	s.calls.Add(1)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return persist.Graveyard{}, s.err
	}
	yard := s.yard
	if len(yard.Names) > limit {
		yard.Names = yard.Names[:limit]
	}
	return yard, nil
}

func (s *scriptedYard) set(yard persist.Graveyard, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.yard, s.err = yard, err
}

func namesOf(yard persist.Graveyard) []string {
	out := []string{}
	for _, n := range yard.Names {
		out = append(out, n.Name)
	}
	return out
}

func yardOf(names ...string) persist.Graveyard {
	yard := persist.Graveyard{Total: len(names)}
	for _, n := range names {
		yard.Names = append(yard.Names, persist.GraveyardName{Name: n, Level: 30})
	}
	return yard
}

// ⭐ THE FIRST READ IS SYNCHRONOUS (P25). A monument that filled in a minute
// after boot would be blank for the first player to walk up to it, and blank is
// exactly what an empty graveyard legitimately looks like — so they could not
// tell the two apart.
func TestGraveyard_ReadsOnceBeforeItReturns(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric", "Maren"), nil)

	yard := persist.NewGraveyard(src, 5, time.Hour)
	defer yard.Stop()

	assert.Equal(t, int64(1), src.calls.Load(), "the boot read is not deferred to the ticker")
	assert.Equal(t, []string{"Aelric", "Maren"}, namesOf(yard.Latest()))
}

// ⛑ THE REFRESH IS A RE-READ, NOT AN APPEND, and the erasure landmine is what
// decides it. DiscardAnonymousAccount renames rows OFF the loop, invisible to
// anything watching ascensions go by, so a snapshot that only grew would keep an
// erased name cut into the monument until the next restart — and D11 says
// erasure wins.
func TestGraveyard_ARefreshCanREMOVEAName(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Ghost", "Maren"), nil)

	yard := persist.NewGraveyard(src, 5, 10*time.Millisecond)
	defer yard.Stop()
	require.Equal(t, []string{"Ghost", "Maren"}, namesOf(yard.Latest()))

	src.set(yardOf("Maren"), nil) // Ghost's account was discarded
	require.Eventually(t, func() bool {
		return len(namesOf(yard.Latest())) == 1
	}, 2*time.Second, 10*time.Millisecond)
	assert.Equal(t, []string{"Maren"}, namesOf(yard.Latest()))
}

// ⚑ A FAILED READ KEEPS THE LAST GOOD ANSWER. The alternative is a monument that
// empties itself whenever the database hiccups, and an empty stone is a
// meaningful statement here (nobody has ascended yet) rather than an obvious
// error state — so a transient failure would put a lie on screen.
func TestGraveyard_AFailedRefreshKeepsTheLastGoodSnapshot(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric"), nil)

	yard := persist.NewGraveyard(src, 5, 10*time.Millisecond)
	defer yard.Stop()
	require.Equal(t, []string{"Aelric"}, namesOf(yard.Latest()))

	src.set(persist.Graveyard{}, errors.New("the database is having a moment"))
	before := src.calls.Load()
	require.Eventually(t, func() bool {
		return src.calls.Load() > before+1
	}, 2*time.Second, 10*time.Millisecond)

	assert.Equal(t, []string{"Aelric"}, namesOf(yard.Latest()),
		"a hiccup must not erase the dead")
}

// A boot read that fails is survivable too: the world runs, the stone is simply
// empty until the next tick succeeds. Nothing about the memorial is load-bearing
// enough to refuse to start a server over.
func TestGraveyard_AFailedBootReadStillStarts(t *testing.T) {
	src := &scriptedYard{}
	src.set(persist.Graveyard{}, errors.New("no database yet"))

	yard := persist.NewGraveyard(src, 5, time.Hour)
	defer yard.Stop()

	assert.Empty(t, namesOf(yard.Latest()))
	assert.Zero(t, yard.Latest().Total)
}

// Latest is read on the conversation present path, so it must be safe to call
// from the game loop while the refresher is writing from its own goroutine.
// ⚑ Run with -race, which is what makes this test mean anything.
func TestGraveyard_LatestIsSafeBesideARunningRefresh(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric"), nil)

	yard := persist.NewGraveyard(src, 5, time.Millisecond)
	defer yard.Stop()

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 500; i++ {
			_ = yard.Latest()
		}
	}()
	for i := 0; i < 50; i++ {
		src.set(yardOf("Aelric", "Maren"), nil)
		src.set(yardOf("Aelric"), nil)
	}
	<-done
}

// Stop ends the ticker, so a second Stop (shutdown paths overlap) must not panic
// and no read may follow.
func TestGraveyard_StopIsIdempotentAndEndsTheReads(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric"), nil)

	yard := persist.NewGraveyard(src, 5, time.Millisecond)
	yard.Stop()
	yard.Stop()

	settled := src.calls.Load()
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, settled, src.calls.Load(), "no read outlives Stop")
}

// --- the post-ascension nudge (PO feedback 2026-08-11) ---

// ⭐ THE MONUMENT SHOULD NOT LAG A WHOLE INTERVAL BEHIND THE THING IT EXISTS TO
// RECORD. The timer alone is correct but slow: spend a character, walk back, and
// the name is missing for up to a minute — which reads as "the memorial does not
// work" rather than "the memorial is a minute stale", because an empty stone is
// also what a world with no dead looks like.
func TestGraveyard_RefreshSoonReReadsWithoutWaitingForTheTimer(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric"), nil)

	yard := persist.NewGraveyard(src, 5, time.Hour) // the timer must not be what fixes this
	defer yard.Stop()
	require.Equal(t, []string{"Aelric"}, namesOf(yard.Latest()))

	src.set(yardOf("Aelric", "Maren"), nil)
	yard.RefreshSoon()

	require.Eventually(t, func() bool {
		return len(namesOf(yard.Latest())) == 2
	}, 2*time.Second, 10*time.Millisecond, "an hour-long timer must not be the thing that saves this")
}

// ⚑ Coalesced, not queued: several nudges arriving together are one re-read. The
// nudge says "you are stale", which is not a fact that gets truer by repeating.
func TestGraveyard_ManyNudgesCoalesce(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric"), nil)

	yard := persist.NewGraveyard(src, 5, time.Hour)
	defer yard.Stop()
	before := src.calls.Load()

	for i := 0; i < 50; i++ {
		yard.RefreshSoon()
	}
	require.Eventually(t, func() bool { return src.calls.Load() > before }, 2*time.Second, 10*time.Millisecond)
	time.Sleep(100 * time.Millisecond)

	assert.Less(t, src.calls.Load()-before, int64(50), "50 nudges must not mean 50 database reads")
}

// A nudge after Stop must not panic or resurrect the loop: shutdown paths
// overlap, and an ascension can complete while the server is going down.
func TestGraveyard_RefreshSoonAfterStopIsHarmless(t *testing.T) {
	src := &scriptedYard{}
	src.set(yardOf("Aelric"), nil)

	yard := persist.NewGraveyard(src, 5, time.Hour)
	yard.Stop()

	assert.NotPanics(t, func() { yard.RefreshSoon() })
	settled := src.calls.Load()
	time.Sleep(50 * time.Millisecond)
	assert.Equal(t, settled, src.calls.Load())
}
