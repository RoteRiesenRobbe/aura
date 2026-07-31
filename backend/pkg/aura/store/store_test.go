package store_test

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// These tests need a real Postgres, and that is not incidental: the slot cap is
// enforced by a PARTIAL UNIQUE INDEX, so the invariant *is* the database. A mock
// or an in-memory fake would test the mock, not the rule
// (plan-accounts-frontend.md §11).
//
// ⚑ They skip when AURA_TEST_DB_URL is unset, so `go test ./...` still passes on
// a machine without Postgres — the same precedent as pkg/aura/net/net_test.go.
//
// ⚑ AURA_TEST_DB_URL must point at the DISPOSABLE aura_test database. Every test
// here rolls the schema all the way down.
func testURL(t *testing.T) string {
	t.Helper()
	url := os.Getenv(store.EnvTestURL)
	if url == "" {
		t.Skipf("%s is not set; skipping the database tests", store.EnvTestURL)
	}
	return url
}

// freshSchema rolls the test database all the way down, then applies every
// migration — so each test starts from a known empty database regardless of what
// the last run left behind.
func freshSchema(t *testing.T) (*store.Store, context.Context) {
	t.Helper()
	url := testURL(t)

	require.NoError(t, store.Rollback(url), "rolling back before the test")
	require.NoError(t, store.Migrate(url), "applying the migrations")
	t.Cleanup(func() { assert.NoError(t, store.Rollback(url), "rolling back after the test") })

	db, err := store.Open(context.Background(), url)
	require.NoError(t, err)
	t.Cleanup(db.Close)

	return db, context.Background()
}

// scalar runs a one-value query, failing the test on any error.
func scalar[T any](t *testing.T, pool *pgxpool.Pool, sql string, args ...any) T {
	t.Helper()
	var v T
	require.NoError(t, pool.QueryRow(context.Background(), sql, args...).Scan(&v), sql)
	return v
}

// TestMigrateCreatesTheWholeSchema is chunk 1a's deliverable, first half:
// migrations apply to an empty database.
func TestMigrateCreatesTheWholeSchema(t *testing.T) {
	db, ctx := freshSchema(t)

	// Every table the schema doc's DDL declares. Asserted by name rather than by
	// count so a missing one names itself.
	want := []string{
		"accounts",
		"account_credentials",
		"characters",
		"bloodline_unlocks",
		"character_spellbook",
		"character_loadout_slots",
		"character_flags",
		"audit_log",
	}
	for _, table := range want {
		t.Run(table, func(t *testing.T) {
			n := scalar[int](t, db.Pool,
				`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'game' AND table_name = $1`, table)
			assert.Equal(t, 1, n, "game.%s should exist", table)
		})
	}

	// Nothing beyond those eight — a stray table means the migration and the
	// plan have drifted.
	assert.Equal(t, len(want), scalar[int](t, db.Pool,
		`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'game'`),
		"game holds exactly the tables the plan declares")

	// citext is the migration's own job, not manual provisioning: a fresh
	// database must be reproducible from migrations alone.
	assert.Equal(t, 1, scalar[int](t, db.Pool,
		`SELECT count(*) FROM pg_extension WHERE extname = 'citext'`), "citext installed by the migration")

	// Both indexes, by name. The partial one carries the slot invariant.
	for _, index := range []string{"one_alive_character_per_slot", "characters_by_account"} {
		assert.Equal(t, 1, scalar[int](t, db.Pool,
			`SELECT count(*) FROM pg_indexes WHERE schemaname = 'game' AND indexname = $1`, index),
			"index %s should exist", index)
	}

	_ = ctx
}

// TestTokenGenerationShipsInThisChunk pins the one column most likely to be
// deferred to the password-reset plan by mistake.
//
// It is the REVOCATION PRIMITIVE, and 8a itself ships the two things that need
// it: logout that only clears a cookie is not revocation, and silent refresh
// without it is an immortal session (schema doc §"Session revocation").
func TestTokenGenerationShipsInThisChunk(t *testing.T) {
	db, ctx := freshSchema(t)

	dataType := scalar[string](t, db.Pool,
		`SELECT data_type FROM information_schema.columns
		  WHERE table_schema = 'game' AND table_name = 'account_credentials' AND column_name = 'token_generation'`)
	assert.Equal(t, "integer", dataType)

	accountID := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)
	generation := scalar[int](t, db.Pool,
		`INSERT INTO game.account_credentials (account_id, anonymous_secret_sha256)
		 VALUES ($1, 'sha') RETURNING token_generation`, accountID)
	assert.Equal(t, 0, generation, "a new account starts at generation 0")

	_ = ctx
}

// TestRollbackLeavesAnEmptyDatabase is chunk 1a's deliverable, second half:
// migrations roll back cleanly.
//
// ⚑ It asserts citext is gone too. Leaving it behind would make the round-trip
// look clean while the database still carried state the migration created — and
// the whole point of testing the down direction is that a down migration nobody
// runs is a down migration that does not work.
func TestRollbackLeavesAnEmptyDatabase(t *testing.T) {
	url := testURL(t)
	require.NoError(t, store.Rollback(url))
	require.NoError(t, store.Migrate(url))
	require.NoError(t, store.Rollback(url))

	db, err := store.Open(context.Background(), url)
	require.NoError(t, err)
	defer db.Close()

	assert.Equal(t, 0, scalar[int](t, db.Pool,
		`SELECT count(*) FROM information_schema.schemata WHERE schema_name = 'game'`), "the game schema is gone")
	assert.Equal(t, 0, scalar[int](t, db.Pool,
		`SELECT count(*) FROM pg_extension WHERE extname = 'citext'`), "citext is gone")

	// And it can be applied again from there — the property that makes the
	// rollback usable rather than merely non-erroring.
	require.NoError(t, store.Migrate(url))
	require.NoError(t, store.Rollback(url))
}

// TestMigrateIsIdempotent covers the ordinary restart: aurad migrates on every
// boot, so the overwhelmingly common case is that there is nothing to do.
// golang-migrate signals that with ErrNoChange, which Migrate must swallow
// rather than treat as a failed boot.
func TestMigrateIsIdempotent(t *testing.T) {
	url := testURL(t)
	require.NoError(t, store.Rollback(url))
	t.Cleanup(func() { assert.NoError(t, store.Rollback(url)) })

	require.NoError(t, store.Migrate(url))
	require.NoError(t, store.Migrate(url), "a second boot must not fail")
	require.NoError(t, store.Migrate(url), "nor a third")
}

// TestOneAliveCharacterPerSlot is the reason these tests need a real database.
//
// The slot cap is enforced by a partial unique index, not by application code
// counting correctly before an insert — so this asserts the DATABASE refuses the
// second alive occupant, and equally that it permits a successor once the
// predecessor is sacrificed. Both halves matter: an index missing its WHERE
// clause would pass the first assertion and fail the second.
func TestOneAliveCharacterPerSlot(t *testing.T) {
	db, ctx := freshSchema(t)

	accountID := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)
	insert := func(name string) (int64, error) {
		var id int64
		err := db.Pool.QueryRow(ctx,
			`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
			 VALUES ($1, 0, $2, 'default', 'aligned') RETURNING id`, accountID, name).Scan(&id)
		return id, err
	}

	first, err := insert("Barney Rubble")
	require.NoError(t, err)

	_, err = insert("Wilma Slaghoople")
	require.Error(t, err, "a second ALIVE character in slot 0 must be rejected")

	// Sacrificing the occupant frees the slot for a successor — the graveyard
	// row stays, and the partial index stops seeing it.
	_, err = db.Pool.Exec(ctx, `UPDATE game.characters SET sacrificed_at = now() WHERE id = $1`, first)
	require.NoError(t, err)

	successor, err := insert("Tex McMagma")
	require.NoError(t, err, "a successor may occupy a slot whose previous life was sacrificed")

	// The chain links, and the composite FK pins it to the same account.
	_, err = db.Pool.Exec(ctx,
		`UPDATE game.characters SET previous_character_id = $1 WHERE id = $2`, first, successor)
	require.NoError(t, err)

	// A soft-deleted character also frees its slot, and by a different column —
	// so the index's WHERE clause has to name both.
	_, err = db.Pool.Exec(ctx, `UPDATE game.characters SET deleted_at = now() WHERE id = $1`, successor)
	require.NoError(t, err)
	_, err = insert("Betty Rubble")
	assert.NoError(t, err, "a soft-deleted character frees its slot too")
}

// TestCaseInsensitiveIdentityColumns pins what CITEXT is there for: "Bob" and
// "bob" must be the same character name and the same login, or the uniqueness
// guarantee the whole naming design rests on is only skin deep.
func TestCaseInsensitiveIdentityColumns(t *testing.T) {
	db, ctx := freshSchema(t)

	accountA := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)
	accountB := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)

	_, err := db.Pool.Exec(ctx,
		`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
		 VALUES ($1, 0, 'Bob', 'default', 'aligned')`, accountA)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
		 VALUES ($1, 0, 'bob', 'default', 'aligned')`, accountB)
	assert.Error(t, err, "character names are case-insensitively unique")

	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.account_credentials (account_id, username, password_hash) VALUES ($1, 'Bob', 'hash')`, accountA)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.account_credentials (account_id, username, password_hash) VALUES ($1, 'bob', 'hash')`, accountB)
	assert.Error(t, err, "usernames are case-insensitively unique")
}

// TestCredentialsCheckConstraint pins the CHECK that keeps a half-registered
// account impossible: a username and a password hash arrive together or not at
// all, because neither is meaningful alone.
func TestCredentialsCheckConstraint(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)

	_, err := db.Pool.Exec(ctx,
		`INSERT INTO game.account_credentials (account_id, username) VALUES ($1, 'lonely')`, accountID)
	assert.Error(t, err, "a username without a password hash must be rejected")

	// Anonymous-but-playable is the normal state: a secret, no credentials.
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.account_credentials (account_id, anonymous_secret_sha256) VALUES ($1, 'sha')`, accountID)
	assert.NoError(t, err, "anonymous accounts carry a secret and no credentials")
}

// TestSacrificedAndDeletedAreMutuallyExclusive pins the CHECK that should be
// unreachable in practice — the delete button only ever targets alive rows — and
// exists so a future bug fails loudly instead of producing a row that is
// ambiguously both a chain event and housekeeping.
func TestSacrificedAndDeletedAreMutuallyExclusive(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)

	id := scalar[int64](t, db.Pool,
		`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
		 VALUES ($1, 0, 'Doomed', 'default', 'aligned') RETURNING id`, accountID)

	_, err := db.Pool.Exec(ctx,
		`UPDATE game.characters SET sacrificed_at = now(), deleted_at = now() WHERE id = $1`, id)
	assert.Error(t, err, "a character cannot be both sacrificed and deleted")
}

// TestLoadoutSlotsCannotReferenceAnUnknownSkill pins the composite FK into the
// spellbook: a loadout slot may not hold a skill the character does not know.
//
// ⚑ That FK is also what dictates snapshot ordering — slots are deleted before
// the spellbook and inserted after it (implementation.md §4). Reverse either and
// every autosave fails on this constraint, so it is worth seeing it bite once.
func TestLoadoutSlotsCannotReferenceAnUnknownSkill(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)
	characterID := scalar[int64](t, db.Pool,
		`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
		 VALUES ($1, 0, 'Slotted', 'default', 'aligned') RETURNING id`, accountID)

	_, err := db.Pool.Exec(ctx,
		`INSERT INTO game.character_loadout_slots (character_id, slot_type, slot_index, skill_id)
		 VALUES ($1, 'aura', 0, 42)`, characterID)
	assert.Error(t, err, "equipping a skill that is not in the spellbook must be rejected")

	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.character_spellbook (character_id, skill_id, skill_level) VALUES ($1, 42, 3)`, characterID)
	require.NoError(t, err)
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.character_loadout_slots (character_id, slot_type, slot_index, skill_id)
		 VALUES ($1, 'aura', 0, 42)`, characterID)
	assert.NoError(t, err, "equipping a known skill is fine")

	// An empty slot is a NULL skill_id, not a missing row.
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.character_loadout_slots (character_id, slot_type, slot_index) VALUES ($1, 'aura', 1)`, characterID)
	assert.NoError(t, err, "an empty slot stores a NULL skill_id")

	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.character_loadout_slots (character_id, slot_type, slot_index) VALUES ($1, 'trinket', 0)`, characterID)
	assert.Error(t, err, "slot_type is constrained to the three authored kinds")
}

// TestOpenRejectsAnUnparseableURL pins the trap that cost this chunk its first
// hour: psql accepts a raw '^' or '>' in the password, Go's net/url does not, so
// a connection string that works in psql fails here with "invalid userinfo".
//
// The assertion worth having is that the error names AURA_DB_URL — the raw
// net/url message on its own sends people hunting for a typo in the hostname.
func TestOpenRejectsAnUnparseableURL(t *testing.T) {
	_, err := store.Open(context.Background(), "postgres://aura:sec^ret@localhost:5432/aura")
	require.Error(t, err)
	assert.Contains(t, err.Error(), store.EnvURL)
	assert.NotContains(t, err.Error(), "sec^ret", "the error must never carry the password")
}
