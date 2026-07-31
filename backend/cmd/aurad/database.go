package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// openDatabase brings up persistence: it applies any pending migrations, then
// opens the connection pool. Returns nil when no database is configured.
//
// Migrations run here rather than as a deploy step (plan-accounts-implementation
// §8): one less thing to forget, and it makes a schema/binary mismatch
// impossible by construction.
//
// ⚑ Migrate BEFORE Open, deliberately. golang-migrate takes its own connection,
// so a failed migration costs no pool — and a pool that exists against a schema
// that failed to migrate is a pool aimed at a database nobody should be querying.
//
// ⚑ An UNSET AURA_DB_URL is a warning, not a fatal error, and that is a
// scoped-to-now decision. §8 rules that an unreachable Postgres must refuse the
// boot — but that reasoning is "never present as healthy while being unusable",
// and until chunk 1c there is nothing to log into: no endpoint, no account, no
// save path. Hard-requiring it today would only break every harness script and
// local run on a machine without Postgres, for no protection at all.
//
// ⚑ CHUNK 1c MUST FLIP THIS. Once the accounts endpoints exist, an unset URL
// means a game nobody can enter, which is exactly the case §8 describes. A
// CONFIGURED-but-unreachable database is already fatal below, which is the half
// that matters today.
func openDatabase() *store.Store {
	url := os.Getenv(store.EnvURL)
	if url == "" {
		slog.Warn("🗄️ no database configured — running without persistence",
			slog.String("env", store.EnvURL))
		return nil
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
