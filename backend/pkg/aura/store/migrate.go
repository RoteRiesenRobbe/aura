package store

import (
	"embed"
	"errors"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	// Imported for its init(), which registers the "pgx5" scheme toMigrateURL
	// produces. Nothing here calls it directly.
	_ "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

// migrationsFS carries the versioned SQL into the binary.
//
// ⚑ golang-migrate is used as a LIBRARY, never as the CLI: migrations run
// inside aurad at boot, so the tool never has to exist on the server and a
// schema/binary mismatch is impossible by construction. Embedding is what keeps
// that true — without it the single-binary deploy silently grows a second
// artifact that has to travel with it.
//
// ⚑ These are code, not content: they live here rather than under api/, so
// `make cp-defs` neither knows nor needs to know about them.
//
// The pattern is *.sql rather than *, matching real files — go:embed rejects a
// pattern that matches nothing, which is how an empty content directory once
// broke a build.
//
//go:embed migrations/*.sql
var migrationsFS embed.FS

// Migrate applies every pending migration and reports the version it left the
// database on. Called at aurad boot, before the game loop starts.
//
// golang-migrate takes a Postgres advisory lock for the duration, so two
// processes starting together cannot both migrate. ⚑ That is currently belt to
// the deployment's braces — aura runs a single instance — but it becomes the
// only protection the day a second one exists.
func Migrate(url string) error {
	m, err := newMigrator(url)
	if err != nil {
		return err
	}
	defer closeMigrator(m)

	switch err := m.Up(); {
	case errors.Is(err, migrate.ErrNoChange):
		// Not an error: the overwhelmingly common case on a normal restart.
	case err != nil:
		return fmt.Errorf("applying migrations: %w%s", err, dirtyHint(err))
	}

	version, dirty, err := m.Version()
	if err != nil {
		return fmt.Errorf("reading the schema version: %w", err)
	}
	slog.Info("🗄️ database schema ready", slog.Uint64("version", uint64(version)), slog.Bool("dirty", dirty))
	return nil
}

// Rollback reverses every applied migration, leaving an empty database.
//
// ⚑ Deliberately never called at boot, and there is no operator flag for it.
// It exists so the migrations' reversibility is a tested property rather than a
// claim — a down migration nobody ever runs is a down migration that does not
// work. Its caller is the test suite.
func Rollback(url string) error {
	m, err := newMigrator(url)
	if err != nil {
		return err
	}
	defer closeMigrator(m)

	switch err := m.Down(); {
	case errors.Is(err, migrate.ErrNoChange):
	case err != nil:
		return fmt.Errorf("rolling back migrations: %w", err)
	}
	return nil
}

// dirtyHint appends recovery instructions when the failure is a dirty database.
//
// ⚑ Worth the twelve lines, learned the hard way during this chunk. golang-migrate
// marks the version dirty BEFORE running a migration and clears it after, so a
// migration that fails leaves the flag set even though the DDL itself rolled back
// cleanly (each file runs as one implicit transaction). From then on aurad
// REFUSES TO BOOT AT ALL, with a message that says the database is dirty and
// nothing about what to do — and since the schema is simultaneously *absent*,
// the obvious inspection makes it look like migrations never ran.
//
// The two states are recoverable in opposite directions, which is exactly why
// the operator needs to be told which one they are in.
func dirtyHint(err error) string {
	var dirty migrate.ErrDirty
	if !errors.As(err, &dirty) {
		return ""
	}
	return fmt.Sprintf("\n\nThe database is marked dirty at version %d: a previous migration failed part-way.\n"+
		"The DDL of a failed migration rolls back on its own, so the schema is most likely absent rather than\n"+
		"half-applied — check with:\n"+
		"    SELECT version, dirty FROM public.schema_migrations;\n"+
		"    SELECT count(*) FROM information_schema.tables WHERE table_schema = 'game';\n"+
		"If the schema is absent, clear the flag so this version can be retried:\n"+
		"    DELETE FROM public.schema_migrations;\n"+
		"If it is half-applied, drop what landed first. Fix the migration before restarting either way.", dirty.Version)
}

func newMigrator(url string) (*migrate.Migrate, error) {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return nil, fmt.Errorf("reading the embedded migrations: %w", err)
	}
	migrateURL, err := toMigrateURL(url)
	if err != nil {
		return nil, err
	}
	m, err := migrate.NewWithSourceInstance("iofs", src, migrateURL)
	if err != nil {
		// ⚑ Never wrap this with the URL — it carries the password.
		return nil, fmt.Errorf("opening the database for migration: %w", err)
	}
	return m, nil
}

// toMigrateURL rewrites the connection string's scheme to the one the
// golang-migrate driver registers itself under.
//
// ⚑ This is not cosmetic. migrate dispatches on the scheme, so a plain
// postgres:// string finds no driver and fails with "database driver: unknown
// driver postgres" — which reads like a missing import rather than a naming
// convention. The driver swaps it back to postgres:// before connecting.
func toMigrateURL(url string) (string, error) {
	u, err := parseURL(url)
	if err != nil {
		return "", err
	}
	u.Scheme = "pgx5"
	return u.String(), nil
}

// closeMigrator reports either half of the two-sided close, which
// golang-migrate returns separately. Logged rather than returned: by the time
// it runs the migration has already succeeded or failed on its own terms, and
// masking that outcome with a cleanup error would be the wrong trade.
func closeMigrator(m *migrate.Migrate) {
	if srcErr, dbErr := m.Close(); srcErr != nil || dbErr != nil {
		slog.Warn("failed to close the migration handle",
			slog.Any("source_err", srcErr), slog.Any("db_err", dbErr))
	}
}
