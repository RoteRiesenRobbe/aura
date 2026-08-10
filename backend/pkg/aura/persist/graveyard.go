package persist

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

// GraveyardName is one name cut into the memorial (D11, P24): what the player
// called themselves and the level they were laid down at.
//
// ⚑ AccountID never reaches a client. It exists so the memorial can mark the
// reading player's own line (D25), and that marker is composed server-side into
// the row's text, exactly as a gate's progress is.
type GraveyardName struct {
	Name      string
	Level     int
	AccountID int64
}

// Graveyard is the memorial's whole answer: the newest names, and how many
// there are altogether.
//
// ⚑ Total is not decoration. The listing is CAPPED because a generated
// conversation row carries its position as a ubyte, so without a count the stone
// would quietly show the newest handful and read as though that were everyone.
type Graveyard struct {
	Names []GraveyardName
	Total int
}

// GraveyardSink is the graveyard read, seen from here. Implemented by
// *store.Store, declared as an interface for the same reason the other sinks in
// this package are: nothing here may depend on the rest of aura.
type GraveyardSink interface {
	AscendedNames(ctx context.Context, limit int) (Graveyard, error)
}

// graveyardReadTimeout bounds one refresh. It is generous because nothing waits
// on it: a slow read delays the monument by one tick and blocks no player.
const graveyardReadTimeout = 10 * time.Second

// GraveyardReader holds the memorial's names in memory and re-reads them on a timer.
//
// ⭐ WHY A SNAPSHOT AT ALL: the memorial's rows are served by a RowSource, whose
// contract is that PresentRows runs per tick per conversing player and may not
// "query a database or walk the world to answer it" (sys.RowSource, L15). The
// names live in Postgres. So the loop reads a slice it already holds, and this
// is what keeps that slice fresh from the other side of the seam.
//
// ⭐ WHY A RE-READ RATHER THAN AN APPEND, which is the design's one real choice:
// the cheap-looking version keeps a list and appends whenever the loop observes
// an ascension complete. It is wrong, and the erasure rule is what makes it
// wrong — DiscardAnonymousAccount renames every row of an account to
// 'deleted_' || id, sacrificed ones included, and it does that OFF the loop,
// invisible to anything watching ascensions go by. An append-only monument would
// keep an erased name cut into it until the next restart, and D11 rules that
// erasure wins. Re-reading is also correct for any future writer of that table
// without knowing anything about it.
//
// ⚑ It is deliberately NOT the drain-style seam CharacterAscensions uses. That
// one carries EVENTS, which must be consumed exactly once; this carries a value,
// where the only thing anyone wants is the most recent one. An atomic swap says
// that directly, and a drain would invent a queue for a thing with no backlog.
type GraveyardReader struct {
	sink  GraveyardSink
	limit int

	// snapshot is swapped whole, never mutated in place, so a reader on the game
	// loop either sees the previous listing or the next one and never a torn mix
	// of the two.
	snapshot atomic.Pointer[Graveyard]

	// nudge asks for an out-of-band re-read. Buffered to ONE, because the
	// message is "you are stale", which is not a fact that gets truer by
	// repeating: several nudges arriving together coalesce into one read.
	nudge chan struct{}

	stop     chan struct{}
	stopOnce sync.Once
	done     chan struct{}
}

// NewGraveyard reads the graveyard once, then keeps re-reading it every
// interval until Stop.
//
// ⚑ THE FIRST READ IS SYNCHRONOUS (P25), and that is not impatience: a monument
// that filled in a minute after boot would be blank for the first player to walk
// up to it, and blank is exactly what an empty graveyard legitimately looks
// like — so they would have no way to tell "nobody has ascended yet" from "the
// server just started".
//
// ⚑ A failed boot read is NOT fatal. The world runs; the stone is empty until a
// later tick succeeds. Nothing about a memorial justifies refusing to start.
func NewGraveyard(sink GraveyardSink, limit int, interval time.Duration) *GraveyardReader {
	g := &GraveyardReader{
		sink:  sink,
		limit: limit,
		nudge: make(chan struct{}, 1),
		stop:  make(chan struct{}),
		done:  make(chan struct{}),
	}
	g.snapshot.Store(&Graveyard{})
	g.refresh()

	go g.loop(interval)
	return g
}

// Latest is the most recent successful listing.
//
// ⚑ Called from the GAME LOOP, on the conversation present path, so it is one
// atomic load and nothing else: no lock a slow reader could hold, and no
// allocation. The value it returns is immutable by convention — the refresher
// only ever swaps a fresh one in.
func (g *GraveyardReader) Latest() Graveyard {
	return *g.snapshot.Load()
}

// Stop ends the refresh loop. Safe to call more than once, because shutdown
// paths overlap.
func (g *GraveyardReader) Stop() {
	g.stopOnce.Do(func() {
		close(g.stop)
		<-g.done
	})
}

// RefreshSoon asks for a re-read now rather than at the next tick.
//
// ⭐ IT EXISTS BECAUSE THE TIMER ALONE READS AS A BUG (PO feedback 2026-08-11).
// Spend a character, walk back to the monument, and the name is missing for up
// to a minute — and an empty stone is ALSO what a world with no dead looks like,
// so a player cannot tell "stale" from "broken". An ascension is the one event
// that certainly changed this listing, so it says so.
//
// ⚑ The timer STAYS, and this does not replace it: a name can also LEAVE the
// monument (DiscardAnonymousAccount erases one off the loop), and nothing
// announces that. The nudge makes additions prompt; the timer is what makes
// removals eventual.
//
// ⚑ NON-BLOCKING, and safe to call from any goroutine — including after Stop,
// since the buffered slot absorbs it and nobody is left to read it.
func (g *GraveyardReader) RefreshSoon() {
	select {
	case g.nudge <- struct{}{}:
	default: // a re-read is already pending; one is enough
	}
}

func (g *GraveyardReader) loop(interval time.Duration) {
	defer close(g.done)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-g.stop:
			return
		case <-ticker.C:
			g.refresh()
		case <-g.nudge:
			g.refresh()
		}
	}
}

// refresh re-reads the listing and swaps it in.
//
// ⛑ A FAILED READ KEEPS THE LAST GOOD ANSWER rather than clearing it. An empty
// monument is a MEANINGFUL statement here (nobody has ascended yet) rather than
// an obvious error state, so emptying it on a transient database hiccup would
// put a plausible lie on screen instead of a visible fault.
func (g *GraveyardReader) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), graveyardReadTimeout)
	defer cancel()

	yard, err := g.sink.AscendedNames(ctx, g.limit)
	if err != nil {
		slog.Warn("could not refresh the memorial's names, keeping the last listing",
			slog.Any("err", err))
		return
	}
	g.snapshot.Store(&yard)
}
