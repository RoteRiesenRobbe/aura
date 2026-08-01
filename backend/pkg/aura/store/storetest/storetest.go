// Package storetest is shared test support for the packages whose tests drive a
// real Postgres.
//
// ⚑ IT EXISTS BECAUSE `go test ./...` RUNS PACKAGES IN PARALLEL AND THEY SHARE
// ONE DATABASE. Every DB-touching test rolls the schema all the way down and
// re-applies it, so that each test starts from a known empty database — which
// works perfectly within a package and destroys another package's run halfway
// through. Chunk 1a never saw it: `store` was the only such package. Chunk 1c
// added `accounts`, and the whole suite went red with "relation game.accounts
// does not exist", which reads as a broken migration rather than as two test
// binaries fighting.
//
// A Postgres ADVISORY LOCK is the right tool precisely because the contenders
// are separate processes: a Go mutex cannot span them, and -p 1 would serialise
// the entire suite to fix two packages.
package storetest

import (
	"context"
	"fmt"
	"os"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// schemaLockKey is an arbitrary constant every DB-touching test package agrees
// on. Postgres advisory locks are just numbers in a shared namespace, so the
// only requirement is that nothing else in this database uses the same one.
const schemaLockKey int64 = 8747110

// RunSerialised runs a package's tests while holding an exclusive lock on the
// test database, so no two test binaries manipulate its schema at once.
//
// Call it from TestMain:
//
//	func TestMain(m *testing.M) { os.Exit(storetest.RunSerialised(m)) }
//
// With AURA_TEST_DB_URL unset it does nothing at all — those tests skip anyway,
// and a machine without Postgres must still run `go test ./...` green.
func RunSerialised(m *testing.M) int {
	url := os.Getenv(store.EnvTestURL)
	if url == "" {
		return m.Run()
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		// Not fatal: the individual tests report an unreachable database far more
		// clearly than a TestMain can, and swallowing it here would hide it.
		fmt.Fprintf(os.Stderr, "storetest: could not take the schema lock: %v\n", err)
		return m.Run()
	}
	defer conn.Close(ctx)

	// Blocks until whichever package holds it finishes. The lock is session
	// scoped, which is why this holds a dedicated connection rather than
	// borrowing one from a pool that might hand the next query to another.
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, schemaLockKey); err != nil {
		fmt.Fprintf(os.Stderr, "storetest: could not take the schema lock: %v\n", err)
		return m.Run()
	}
	defer func() { _, _ = conn.Exec(ctx, `SELECT pg_advisory_unlock($1)`, schemaLockKey) }()

	return m.Run()
}
