// Package store is aura's Postgres layer: the connection pool, the embedded
// schema migrations, and (from chunk 1b onward) the hand-written SQL that reads
// and writes accounts and characters.
//
// Design decisions this package is the first consumer of live in
// docs/archive/plan-accounts-implementation.md §0:
//
//   - pgx/v5 through pgxpool, deliberately NOT database/sql. The schema is
//     Postgres-only and irreversibly so (CITEXT, JSONB, partial unique indexes,
//     composite FKs), so portability to a database this project will never use
//     is not worth giving up pgx's native types and batching.
//   - Hand-written SQL, one file per aggregate. ~20 queries against 8 tables;
//     sqlc was considered and deferred, and is worth reconsidering past ~40.
//   - The connection string comes from AURA_DB_URL in the environment, never
//     from conf.json — conf.json is tracked and holds game tuning.
//
// ⚑ The URL must be a parseable URL, which is a stricter bar than psql's.
// libpq accepts characters in the password that Go's net/url rejects outright
// (^, >, spaces, braces …), so a connection string that works in psql can still
// fail here with "invalid userinfo". Percent-encode the password.
package store

import (
	"context"
	"errors"
	"fmt"
	"net"
	nurl "net/url"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnvURL is the environment variable holding the connection string, and
// EnvTestURL the disposable database DB-touching tests use. Named as constants
// because three packages and a test helper reach for them and nothing should
// invent its own spelling.
const (
	EnvURL     = "AURA_DB_URL"
	EnvTestURL = "AURA_TEST_DB_URL"
)

// maxConns bounds the pool. [PLACEHOLDER]
//
// One process, one instance: the load is periodic batched autosaves plus
// occasional auth requests, nothing concurrent enough to want a large pool.
// Postgres' own default max_connections is 100, so this leaves ample headroom
// for a psql session and a pg_dump alongside the server.
const maxConns = 10

// connectTimeout bounds the opening handshake so an unreachable database fails
// the boot fast and loudly instead of hanging it. [PLACEHOLDER]
const connectTimeout = 10 * time.Second

// Store owns the connection pool. One per process.
type Store struct {
	Pool *pgxpool.Pool
}

// parseURL validates the connection string and reports a failure WITHOUT ever
// echoing the string back.
//
// ⚑ This exists because of a real leak, not a theoretical one. net/url returns
// a *url.Error whose message embeds the entire input — password included — and
// pgxpool.ParseConfig wraps that error verbatim even though it carefully
// redacts the password in its own half of the message. So the obvious
// `fmt.Errorf("...: %w", err)` writes the database password into the boot log
// the first time someone mistypes the URL.
//
// The hint is worth carrying: psql accepts characters in a password that Go
// rejects outright, so "it works in psql" is exactly the state this error is
// most often seen in.
func parseURL(raw string) (*nurl.URL, error) {
	u, err := nurl.Parse(raw)
	if err == nil {
		return u, nil
	}
	reason := "not a valid URL"
	var urlErr *nurl.Error
	if errors.As(err, &urlErr) {
		reason = urlErr.Err.Error() // the reason alone; urlErr.URL is the leak
	}
	return nil, fmt.Errorf("%s is not a parseable connection string (%s) — "+
		"percent-encode the password if it contains characters like ^, > or a space, "+
		"which psql accepts and Go does not", EnvURL, reason)
}

// Open parses url, builds the pool and proves the database is actually
// reachable before returning.
//
// ⚑ The Ping is not ceremony: pgxpool connects lazily, so without it Open
// succeeds against a database that is down and the failure surfaces later, at
// whichever query happens to run first.
func Open(ctx context.Context, url string) (*Store, error) {
	// Validated here first so an unparseable URL cannot reach pgx — see
	// parseURL for why that ordering is a security property, not tidiness.
	if _, err := parseURL(url); err != nil {
		return nil, err
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		// Safe to wrap: pgx redacts the password in its own messages, and the
		// one nested error that did not is ruled out by parseURL above.
		return nil, fmt.Errorf("parsing the %s connection string: %w", EnvURL, err)
	}
	cfg.MaxConns = maxConns

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("creating the connection pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("connecting to Postgres at %s:%d/%s: %w",
			cfg.ConnConfig.Host, cfg.ConnConfig.Port, cfg.ConnConfig.Database, err)
	}

	return &Store{Pool: pool}, nil
}

// IsUnavailable reports whether err looks like "the database could not be
// reached" rather than "the database answered, and said no".
//
// ⚑ It is a HEURISTIC, and its only job is choosing which of two player-facing
// sentences a failed request gets (implementation.md §5b): an honest "Aura is
// having trouble reaching its database" when Postgres is down, and the generic
// apology otherwise. The server log carries the real error either way, so a
// wrong guess costs a word, not a diagnosis.
//
// A *pgconn.PgError is the decisive negative: Postgres itself composed that
// message, so whatever went wrong, reaching it was not the problem.
func IsUnavailable(err error) bool {
	if err == nil {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return false
	}
	var connErr *pgconn.ConnectError
	if errors.As(err, &connErr) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr)
}

// Close releases every pooled connection. Safe on a nil Store so a caller that
// never opened one (no AURA_DB_URL configured) can defer it unconditionally.
func (s *Store) Close() {
	if s == nil || s.Pool == nil {
		return
	}
	s.Pool.Close()
}
