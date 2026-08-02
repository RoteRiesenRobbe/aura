package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/sys"
)

// snapshotTimeout bounds the wait for the game loop to take its snapshots,
// flushTimeout the wait for those snapshots to reach Postgres, and closeTimeout
// the wait for the writer goroutine to stop afterwards. [PLACEHOLDER]
//
// ⚑ THREE timeouts, not one, because the three steps fail for different reasons
// and want different diagnoses: a loop that never answers is a hung game, a flush
// that never finishes is a hung database, and a writer that will not stop is
// working through the last of its queue against one. The process is exiting
// either way; each bound only decides how long it waits for the courtesy.
const (
	snapshotTimeout = 3 * time.Second
	flushTimeout    = 10 * time.Second
	closeTimeout    = 2 * time.Second
)

// installShutdownFlush saves every live character on SIGTERM/SIGINT before the
// process exits.
//
// ⚑ NOT OPTIONAL (plan-accounts-implementation.md §2). Without it a routine
// deploy is indistinguishable from a crash for every connected player: everyone
// loses up to the full autosave interval, every time, and it looks like the
// database is broken rather than like the deploy did it.
//
// ⚑ The exit is bounded. A stuck write must not hold the process open forever —
// so if the flush times out, this logs EXACTLY WHICH CHARACTERS were lost, by id
// and name. Otherwise the one case where progress is knowingly discarded is also
// the one case with no record that it happened, and a player reporting lost
// progress after a deploy would be unfalsifiable.
func installShutdownFlush(world sys.PersistenceSink, writer *persist.Writer, db *store.Store) {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-signals
		slog.Info("🛑 shutting down — saving every live character", slog.String("signal", sig.String()))

		snapshotted := make(chan struct{})
		world.FlushLiveCharacters(snapshotted)
		select {
		case <-snapshotted:
		case <-time.After(snapshotTimeout):
			slog.Error("the game loop did not answer the shutdown snapshot in time; " +
				"saving only what was already queued")
		}

		ctx, cancel := context.WithTimeout(context.Background(), flushTimeout)
		defer cancel()
		for _, lost := range writer.Flush(ctx) {
			slog.Error("💾 PROGRESS LOST: could not save a character before shutdown",
				slog.Int64("character_id", lost.CharacterID),
				slog.String("name", lost.Name),
				slog.Int("level", lost.Level))
		}

		// ⚑ Close AFTER Flush has reported, and bounded. Before, it would empty
		// the queue Flush exists to name; unbounded, a stuck write would hold the
		// process open exactly as the flush timeout above refuses to.
		//
		// ⚑ It is not decoration: it is what stops the writer, so the pool below
		// is not closed underneath an open transaction — and until it was called
		// the shutdown escape inside the retry ladder was unreachable code.
		stopped := make(chan struct{})
		go func() {
			writer.Close()
			close(stopped)
		}()
		select {
		case <-stopped:
		case <-time.After(closeTimeout):
			slog.Warn("the save writer did not stop in time; exiting anyway")
		}

		db.Close()
		slog.Info("👋 shutdown complete")
		os.Exit(0)
	}()
}
