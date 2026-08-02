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

// snapshotTimeout bounds the wait for the game loop to take its snapshots, and
// flushTimeout the wait for those snapshots to reach Postgres. [PLACEHOLDER]
//
// ⚑ TWO timeouts, not one, because the two steps fail for different reasons and
// want different diagnoses: a loop that never answers is a hung game, a flush
// that never finishes is a hung database.
const (
	snapshotTimeout = 3 * time.Second
	flushTimeout    = 10 * time.Second
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

		db.Close()
		slog.Info("👋 shutdown complete")
		os.Exit(0)
	}()
}
