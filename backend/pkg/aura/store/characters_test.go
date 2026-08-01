package store_test

import (
	"context"
	"errors"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// newAccount mints a bare anonymous account for a test that needs one to hang
// characters off.
func newAccount(t *testing.T, db *store.Store, secretKey string) int64 {
	t.Helper()
	tx, err := db.Pool.Begin(context.Background())
	require.NoError(t, err)
	defer func() { _ = tx.Rollback(context.Background()) }()

	id, err := store.CreateAnonymousAccount(context.Background(), tx, secretKey)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(context.Background()))
	return id
}

func character(name string, accountID int64) store.NewCharacter {
	return store.NewCharacter{
		AccountID: accountID,
		Name:      name,
		Avatar:    "default",
		Faction:   "aligned",
		MaxAlive:  3,
	}
}

// TestUniqueConstraintNames pins the strings the conflict mapping depends on.
//
// ⚑ THIS IS THE TEST THAT KEEPS "that character name is taken" FROM BECOMING A
// 500. CreateCharacter tells a name collision from a slot collision by the
// CONSTRAINT NAME on the same 23505 error, and two of those names are generated
// by Postgres rather than authored — so nothing but this test notices if a
// future migration renames one, and the failure would be a player-facing
// rejection turning into a server error.
func TestUniqueConstraintNames(t *testing.T) {
	db, ctx := freshSchema(t)
	accountA := newAccount(t, db, "secret-a")
	accountB := newAccount(t, db, "secret-b")

	nameOf := func(t *testing.T, err error) string {
		t.Helper()
		var pgErr *pgconn.PgError
		require.True(t, errors.As(err, &pgErr), "expected a Postgres error, got %v", err)
		require.Equal(t, "23505", pgErr.Code, "expected a unique violation")
		return pgErr.ConstraintName
	}

	insert := func(accountID int64, slot int, name string) error {
		_, err := db.Pool.Exec(ctx,
			`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
			 VALUES ($1, $2, $3, 'default', 'aligned')`, accountID, slot, name)
		return err
	}

	require.NoError(t, insert(accountA, 0, "Barney"))
	assert.Equal(t, "characters_name_key", nameOf(t, insert(accountB, 0, "barney")),
		"a duplicate character name")
	assert.Equal(t, "one_alive_character_per_slot", nameOf(t, insert(accountA, 0, "Wilma")),
		"a second alive character in one slot")

	// Registration is an UPDATE of the row minted with the account, so both the
	// first username and the colliding one arrive that way.
	require.NoError(t, db.SetCredentials(ctx, newAccount(t, db, "secret-c"), "barney", "hash"))
	_, err := db.Pool.Exec(ctx,
		`UPDATE game.account_credentials SET username = 'BARNEY', password_hash = 'hash' WHERE account_id = $1`,
		accountA)
	assert.Equal(t, "account_credentials_username_key", nameOf(t, err), "a duplicate username")
}

// TestCreateCharacterMintsAnAccountBehindIt is the anonymous-first path — the
// most common write in the product.
//
// ⚑ ONE TRANSACTION for account + credentials + character. That coupling is what
// makes registering later cost no progress, and it is also the concrete reason a
// separate accounts database was rejected: this write would have needed 2PC or a
// saga on the hottest path (plan-accounts-frontend.md §10a).
func TestCreateCharacterMintsAnAccountBehindIt(t *testing.T) {
	db, ctx := freshSchema(t)

	created, err := db.CreateCharacter(ctx, store.NewCharacter{
		AnonymousSecretKey: "lookup-key",
		Name:               "Barney Rubble",
		Avatar:             "default",
		Faction:            "aligned",
		MaxAlive:           3,
	})
	require.NoError(t, err)
	assert.NotZero(t, created.ID)
	assert.NotZero(t, created.AccountID)
	assert.Equal(t, 0, created.SlotIndex, "the first character takes the first slot")
	assert.Equal(t, 1, created.Level, "a fresh character is level 1")
	assert.EqualValues(t, 0, created.Experience)

	// The secret resolves back to that account — and to the CREDENTIALS row,
	// because the account it names may since have been registered.
	credentials, err := db.CredentialsByAnonymousSecret(ctx, "lookup-key")
	require.NoError(t, err)
	assert.Equal(t, created.AccountID, credentials.AccountID)
	assert.False(t, credentials.Registered(), "minting an account does not register it")
	assert.Equal(t, 0, credentials.TokenGeneration)
}

// TestCreateCharacterRollsBackTheWholeTransaction proves the coupling above is
// real rather than incidental: if the character insert fails, the account it
// would have belonged to must not survive.
//
// ⚑ Without this, a player whose chosen name was taken would silently accumulate
// an orphan account per attempt — each one holding an anonymous secret their
// browser never received.
func TestCreateCharacterRollsBackTheWholeTransaction(t *testing.T) {
	db, ctx := freshSchema(t)

	first, err := db.CreateCharacter(ctx, store.NewCharacter{
		AnonymousSecretKey: "first", Name: "Barney", Avatar: "default", Faction: "aligned", MaxAlive: 3,
	})
	require.NoError(t, err)

	_, err = db.CreateCharacter(ctx, store.NewCharacter{
		AnonymousSecretKey: "second", Name: "barney", Avatar: "default", Faction: "aligned", MaxAlive: 3,
	})
	require.ErrorIs(t, err, store.ErrNameTaken, "case-insensitively unique")

	assert.Equal(t, 1, scalar[int](t, db.Pool, `SELECT count(*) FROM game.accounts`),
		"the losing attempt must leave no account behind")
	assert.Equal(t, 1, scalar[int](t, db.Pool, `SELECT count(*) FROM game.account_credentials`))
	_, err = db.CredentialsByAnonymousSecret(ctx, "second")
	assert.ErrorIs(t, err, store.ErrNoAccount, "and no orphan secret")

	_ = first
}

// TestSlotAssignmentAndCap is the table-driven half of the chunk's test list:
// the lowest free slot is taken, the cap is enforced, and a freed slot is reused
// rather than skipped.
func TestSlotAssignmentAndCap(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	for _, want := range []struct {
		name string
		slot int
	}{
		{"Barney", 0},
		{"Wilma", 1},
		{"Betty", 2},
	} {
		created, err := db.CreateCharacter(ctx, character(want.name, accountID))
		require.NoError(t, err, want.name)
		assert.Equal(t, want.slot, created.SlotIndex, "%s takes the lowest free slot", want.name)
	}

	_, err := db.CreateCharacter(ctx, character("Tex", accountID))
	assert.ErrorIs(t, err, store.ErrSlotsFull, "a create at the cap is rejected")

	// ⚑ The cap is an APPLICATION number, not a schema one — nothing in the DDL
	// bounds slot_index — so raising it admits a fourth character with no
	// migration, and this is what proves the two halves are wired that way.
	roomier := character("Tex", accountID)
	roomier.MaxAlive = 4
	created, err := db.CreateCharacter(ctx, roomier)
	require.NoError(t, err)
	assert.Equal(t, 3, created.SlotIndex)

	// Deleting the middle character frees slot 1, and the next create takes it —
	// LOWEST free, not next-highest, so slots do not drift upward forever.
	var wilmaID int64
	require.NoError(t, db.Pool.QueryRow(ctx,
		`SELECT id FROM game.characters WHERE name = 'Wilma'`).Scan(&wilmaID))
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, wilmaID))

	created, err = db.CreateCharacter(ctx, character("Pearl", accountID))
	require.NoError(t, err)
	assert.Equal(t, 1, created.SlotIndex, "a freed slot is reused")
}

// TestConcurrentCreatesSurviveTheSlotRace is §9 item 3: two creates both compute
// "lowest free slot", aim at it, and one loses the partial unique index.
//
// ⚑ The database is behaving CORRECTLY there — that is the index doing its job.
// What must not happen is a player seeing a raw constraint violation, so
// CreateCharacter retries once. Both callers here must end up with a character,
// in different slots.
//
// ⚑ Written to count outcomes rather than lean on the race detector: -race needs
// cgo and there is no C toolchain on this box (chunk 1b's finding).
func TestConcurrentCreatesSurviveTheSlotRace(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	var start sync.WaitGroup
	var done sync.WaitGroup
	start.Add(1)

	results := make([]store.Character, 2)
	errs := make([]error, 2)
	for i, name := range []string{"Barney", "Wilma"} {
		done.Add(1)
		go func(i int, name string) {
			defer done.Done()
			start.Wait()
			results[i], errs[i] = db.CreateCharacter(ctx, character(name, accountID))
		}(i, name)
	}
	start.Done()
	done.Wait()

	require.NoError(t, errs[0])
	require.NoError(t, errs[1])
	assert.NotEqual(t, results[0].SlotIndex, results[1].SlotIndex,
		"two concurrent creates must land in different slots")
	assert.Equal(t, 2, scalar[int](t, db.Pool,
		`SELECT count(*) FROM game.characters WHERE deleted_at IS NULL AND sacrificed_at IS NULL`))
}

// TestSoftDeleteReleasesTheNameImmediately covers the soft-delete transaction.
//
// ⚑ The release is not cosmetic: names are globally unique FOREVER, so a
// soft-deleted row holding its name would keep it out of circulation with no way
// to get it back. The harness depends on this being immediate — delete-then-
// create is how it gets a pristine character every run.
func TestSoftDeleteReleasesTheNameImmediately(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, created.ID))

	// The row survives as inert history; only its name and its aliveness changed.
	assert.Equal(t, 1, scalar[int](t, db.Pool, `SELECT count(*) FROM game.characters WHERE id = $1`, created.ID))
	assert.NotEqual(t, "Barney", scalar[string](t, db.Pool, `SELECT name FROM game.characters WHERE id = $1`, created.ID))
	assert.False(t, scalar[bool](t, db.Pool, `SELECT deleted_at IS NULL FROM game.characters WHERE id = $1`, created.ID))

	// And the name is free again, for this account or any other.
	reused, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err, "the released name is immediately available")
	assert.NotEqual(t, created.ID, reused.ID, "a new life, not the old row revived")

	// ⚑ The chain is untouched: deletion is housekeeping, not a chain event, so
	// it neither mints a successor nor links one.
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT previous_character_id IS NULL FROM game.characters WHERE id = $1`, reused.ID))
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT sacrificed_at IS NULL FROM game.characters WHERE id = $1`, created.ID),
		"a deleted character is not a sacrificed one")

	// A second delete finds nothing alive to delete.
	assert.ErrorIs(t, db.SoftDeleteCharacter(ctx, accountID, created.ID), store.ErrNoCharacter)
}

// TestOwnershipIsPartOfTheQuery pins the guard behind /select and /delete.
//
// ⚑ Ids are BIGSERIAL and therefore guessable, so "not yours" and "no such id"
// have to be the same answer — and the check has to be in the WHERE clause
// rather than a Go comparison after the read, because the Go version is the one
// that eventually gets forgotten on a new code path.
func TestOwnershipIsPartOfTheQuery(t *testing.T) {
	db, ctx := freshSchema(t)
	mine := newAccount(t, db, "mine")
	theirs := newAccount(t, db, "theirs")

	created, err := db.CreateCharacter(ctx, character("Barney", mine))
	require.NoError(t, err)

	found, err := db.AliveCharacter(ctx, mine, created.ID)
	require.NoError(t, err)
	assert.Equal(t, "Barney", found.Name)

	_, err = db.AliveCharacter(ctx, theirs, created.ID)
	assert.ErrorIs(t, err, store.ErrNoCharacter, "another account's character is not readable")
	assert.ErrorIs(t, db.SoftDeleteCharacter(ctx, theirs, created.ID), store.ErrNoCharacter,
		"nor deletable")

	// And it is still there — the refused delete did nothing.
	_, err = db.AliveCharacter(ctx, mine, created.ID)
	assert.NoError(t, err)
}

// TestAliveCharactersAreSlotOrdered pins the ordering character-select renders.
//
// ⚑ Slot order, not creation order. A slot is a continuous bloodline, so
// ordering by anything else reshuffles a player's slots under them — and a
// deleted-then-recreated character is exactly the case where the two orders
// disagree.
func TestAliveCharactersAreSlotOrdered(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	for _, name := range []string{"Barney", "Wilma", "Betty"} {
		_, err := db.CreateCharacter(ctx, character(name, accountID))
		require.NoError(t, err)
	}
	// Delete slot 0 and recreate: the newest character now occupies the FIRST
	// slot, so creation order and slot order genuinely differ.
	var barneyID int64
	require.NoError(t, db.Pool.QueryRow(ctx, `SELECT id FROM game.characters WHERE name = 'Barney'`).Scan(&barneyID))
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, barneyID))
	_, err := db.CreateCharacter(ctx, character("Pearl", accountID))
	require.NoError(t, err)

	characters, err := db.AliveCharacters(ctx, accountID)
	require.NoError(t, err)
	require.Len(t, characters, 3, "sacrificed and deleted rows are not listed")
	assert.Equal(t, []string{"Pearl", "Wilma", "Betty"},
		[]string{characters[0].Name, characters[1].Name, characters[2].Name})
	assert.Equal(t, []int{0, 1, 2},
		[]int{characters[0].SlotIndex, characters[1].SlotIndex, characters[2].SlotIndex})

	// An account with nothing returns an empty list, not an error — character-
	// select treats zero characters as an ordinary state.
	empty, err := db.AliveCharacters(ctx, newAccount(t, db, "other"))
	require.NoError(t, err)
	assert.Empty(t, empty)
}
