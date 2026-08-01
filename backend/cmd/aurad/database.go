package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// openDatabase brings up persistence: it applies any pending migrations, then
// opens the connection pool.
//
// Migrations run here rather than as a deploy step (plan-accounts-implementation
// §8): one less thing to forget, and it makes a schema/binary mismatch
// impossible by construction.
//
// ⚑ Migrate BEFORE Open, deliberately. golang-migrate takes its own connection,
// so a failed migration costs no pool — and a pool that exists against a schema
// that failed to migrate is a pool aimed at a database nobody should be querying.
//
// ⚑ AN UNSET AURA_DB_URL IS NOW FATAL (chunk 1c flipped this; 1a warned and
// carried on). §8's rule is "refuse to start rather than present as healthy
// while being unusable", and until 1c there was genuinely nothing to log into —
// no endpoint, no account, no save path — so requiring it would have broken
// every local run and harness script for no protection at all. That is no longer
// true: without a database the eight accounts endpoints cannot answer, so a
// server that boots is a server nobody can get into.
//
// ⚑ Consequence, stated because it bites the next person to run the harness:
// EVERY aurad boot now needs AURA_DB_URL and AURA_JWT_KEY set, including headless
// smoke runs.
func openDatabase() *store.Store {
	url := os.Getenv(store.EnvURL)
	if url == "" {
		slog.Error("🗄️ no database configured — aura cannot run without one",
			slog.String("env", store.EnvURL),
			slog.String("hint", "set it to postgres://user:password@host:port/database, percent-encoding the password"))
		os.Exit(1)
	}

	if err := store.Migrate(url); err != nil {
		slog.Error("failed to migrate the database", slog.Any("err", err))
		panic(err)
	}

	db, err := store.Open(context.Background(), url)
	if err != nil {
		slog.Error("failed to connect to the database", slog.Any("err", err))
		panic(err)
	}
	return db
}
