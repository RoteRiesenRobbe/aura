package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// constraintUnlockOwned is the bloodline_unlocks primary key, which enforces
// P4's no-duplicate-picks rule in the database. Pinned by
// TestUniqueConstraintNames for the same reason the character constraints are:
// a rename would turn a player-facing refusal into a 500.
const constraintUnlockOwned = "bloodline_unlocks_pkey"

// ErrUnlockAlreadyOwned means this bloodline already holds that unlock key. The
// pick is refused and the character stays ALIVE — the app-level filter should
// never have offered it, so this is the database catching a bug, not a player
// doing something wrong.
var ErrUnlockAlreadyOwned = errors.New("store: that bloodline already owns that unlock")

// Bloodline is what a character slot carries across the lives that occupy it:
// what it has learned, and how many times it has ascended.
//
// ⚑ Both halves are resolved ONCE, at /select, and ride the play ticket
// (D16/D18 tier B). The game loop is a single goroutine and must never query
// the database to answer a Join; and by construction neither half can change
// during a session, because ascending is what ends one.
type Bloodline struct {
	// Unlocks are the slot's unlock keys — skill names (D17) — sorted, so a
	// ticket minted twice for the same bloodline carries the same list.
	Unlocks []string
	// Ascensions is how many lives this slot has spent. It is a COUNT OF
	// SACRIFICED ROWS, never of gone ones: counting deletions would make an
	// "ascend 3 times" gate farmable by creating and deleting three characters.
	Ascensions int
}

// LoadBloodline reads a slot's bloodline in ONE round trip.
//
// ⚑ Empty is the ordinary answer for a first life, and it is an answer rather
// than an error: every account starts here.
func (s *Store) LoadBloodline(ctx context.Context, accountID int64, slotIndex int) (Bloodline, error) {
	var b Bloodline
	err := s.Pool.QueryRow(ctx,
		`SELECT
		   ARRAY(SELECT unlock_key FROM game.bloodline_unlocks
		          WHERE account_id = $1 AND slot_index = $2
		          ORDER BY unlock_key),
		   (SELECT count(*) FROM game.characters
		     WHERE account_id = $1 AND slot_index = $2 AND sacrificed_at IS NOT NULL)`,
		accountID, slotIndex).Scan(&b.Unlocks, &b.Ascensions)
	if err != nil {
		return Bloodline{}, fmt.Errorf("reading a bloodline: %w", err)
	}
	return b, nil
}

// AscendCharacter is the sacrifice transaction: it retires a character and
// grants its bloodline one unlock, atomically.
//
// unlockKey is the picked entry's key (the skill's name, D17), or "" when the
// catalog had nothing left to offer — D14 makes that an ordinary ascension that
// commits with zero unlock rows, not a refusal.
//
// It returns the slot the bloodline lives in, read from the row itself.
//
// ⚑ TWO WRITES, ONE TRANSACTION, and the reason is not symmetry: a
// sacrificed_at without its unlock row is a life spent for nothing. Crash
// anywhere in here and the character is still alive.
//
// ⚑ The guard is aliveness and ownership only. MAX LEVEL IS NOT CHECKED HERE
// (P1): the row's level is eventually consistent by design — saves are periodic
// and the teardown deliberately skips the final one — so a `level >= 30` clause
// here would refuse a player who genuinely just dinged. The live level is the
// authority, and the request site checks it.
//
// ⚑ It does NOT rewrite the name, unlike SoftDeleteCharacter. Two paths through
// one table with opposite name policies, both deliberate: deletion releases a
// name because names are unique forever, sacrifice holds one because the
// memorial lists it.
//
// ⚑ No synchronous_commit = off here, per the standing note in state.go. That
// treatment is for the periodic save path, where losing the last few seconds is
// acceptable; this is irreversible and happens once per life.
func (s *Store) AscendCharacter(ctx context.Context, accountID, characterID int64, unlockKey string) (int, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("starting the ascension transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Ownership and aliveness are part of the WHERE clause, so "not yours",
	// "no such id", "already sacrificed" and "deleted" are one answer — and the
	// sacrificed⊕deleted CHECK stays unreachable rather than becoming a 500.
	var slotIndex int
	err = tx.QueryRow(ctx,
		`UPDATE game.characters SET sacrificed_at = now()
		  WHERE id = $1 AND account_id = $2 AND sacrificed_at IS NULL AND deleted_at IS NULL
		  RETURNING slot_index`,
		characterID, accountID).Scan(&slotIndex)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNoCharacter
	}
	if err != nil {
		return 0, fmt.Errorf("sacrificing a character: %w", err)
	}

	if unlockKey != "" {
		// ⚑ slot_index comes from the UPDATE's RETURNING, never from a caller.
		// It is half of the unlock's primary key, so a passed-in value could
		// drift from the row and file the reward under a bloodline that did not
		// earn it.
		_, err = tx.Exec(ctx,
			`INSERT INTO game.bloodline_unlocks (account_id, slot_index, unlock_key) VALUES ($1, $2, $3)`,
			accountID, slotIndex, unlockKey)
		switch {
		case isUniqueViolation(err, constraintUnlockOwned):
			return 0, ErrUnlockAlreadyOwned
		case err != nil:
			return 0, fmt.Errorf("granting a bloodline unlock: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("committing the ascension: %w", err)
	}
	return slotIndex, nil
}
