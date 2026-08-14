package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"

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

// SlotBloodline is one slot's bloodline as CHARACTER SELECT needs it, which is
// deliberately not what the play ticket needs.
//
// ⚑ IT IS KEYED BY SLOT, NEVER BY CHARACTER, and that is structural rather than
// stylistic: the rows carrying a bloodline's history are the SACRIFICED ones,
// which is exactly what AliveCharacters excludes — and the slot this matters
// most for has no character row at all, because ascending is what emptied it.
type SlotBloodline struct {
	// Unlocks are the slot's unlock keys, sorted, exactly as Bloodline's are.
	// Never nil for a slot this read returns.
	Unlocks []string
	// Ascensions is how many lives this slot has spent. Sacrificed rows only,
	// for Bloodline.Ascensions' reason: counting deletions would make the count
	// farmable.
	Ascensions int
	// PredecessorName is the name of the MOST RECENTLY sacrificed life in this
	// slot — the one an heir directly continues (P16), not the founder.
	//
	// ⛑ EMPTY MEANS ERASED, and empty is a state the caller must render rather
	// than treat as impossible (D24). DiscardAnonymousAccount renames every row
	// of an account to 'deleted_' || id, sacrificed ones included, because names
	// are player-authored free text and erasure wins. The filter lives in the
	// SQL below so there is exactly one of it, and C3's memorial inherits it.
	PredecessorName string
}

// SlotBloodlines reads every bloodline an account has, keyed by slot.
//
// ⚑ A slot with no history is ABSENT, not a zeroed entry. "Never ascended" and
// "ascended zero times" are the same fact, and the caller already knows how many
// slots exist (game.player.maxAliveCharacters) — so the map answers "which slots
// carry something" without this read having to know the cap.
//
// ⚑ It is NOT LoadBloodline in a loop, and LoadBloodline was not widened to
// serve it. LoadBloodline rides the /select ticket path, where a predecessor's
// name is dead weight; this one is character-select's and never touches a
// ticket. Two reads, two callers, no shared field either of them has to ignore.
func (s *Store) SlotBloodlines(ctx context.Context, accountID int64) (map[int]SlotBloodline, error) {
	slots := map[int]SlotBloodline{}

	// The history half: how many lives a slot has spent, and whose name the next
	// card should say it continues.
	//
	// ⚑ The name filter is EXACT-MATCH against the expression the rename writes,
	// never LIKE 'deleted_%'. auth.ValidateCharacterName reserves the deleted_
	// prefix since plan-code-health.md C7 (2026-08-14), but rows named before
	// that may still hold the shape on a live database, and a prefix test would
	// cut such a player out of their own bloodline's card.
	//
	// ⚑ The array_agg ORDER BY carries a tie-break on id, so two lives spent in
	// the same clock tick still resolve to the later one.
	rows, err := s.Pool.Query(ctx,
		`SELECT slot_index,
		        count(*),
		        coalesce((array_agg(NULLIF(name, 'deleted_' || id)
		                            ORDER BY sacrificed_at DESC, id DESC))[1], '')
		   FROM game.characters
		  WHERE account_id = $1 AND sacrificed_at IS NOT NULL
		  GROUP BY slot_index`, accountID)
	if err != nil {
		return nil, fmt.Errorf("reading a bloodline history: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var slot int
		var b SlotBloodline
		if err := rows.Scan(&slot, &b.Ascensions, &b.PredecessorName); err != nil {
			return nil, fmt.Errorf("reading a bloodline history row: %w", err)
		}
		b.Unlocks = []string{}
		slots[slot] = b
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("reading a bloodline history: %w", err)
	}

	unlocks, err := s.Pool.Query(ctx,
		`SELECT slot_index, array_agg(unlock_key ORDER BY unlock_key)
		   FROM game.bloodline_unlocks
		  WHERE account_id = $1
		  GROUP BY slot_index`, accountID)
	if err != nil {
		return nil, fmt.Errorf("reading bloodline unlocks: %w", err)
	}
	defer unlocks.Close()
	for unlocks.Next() {
		var slot int
		var keys []string
		if err := unlocks.Scan(&slot, &keys); err != nil {
			return nil, fmt.Errorf("reading a bloodline unlock row: %w", err)
		}
		// ⚑ An unlock row whose slot the history half did not report cannot
		// happen — AscendCharacter writes both or neither, and takes the unlock's
		// slot from the sacrifice's own RETURNING. If it ever did, this shows the
		// gift against a zero count rather than dropping it: a bloodline that
		// visibly knows something is a better bug report than a silent one.
		b := slots[slot]
		b.Unlocks = keys
		slots[slot] = b
	}
	if err := unlocks.Err(); err != nil {
		return nil, fmt.Errorf("reading bloodline unlocks: %w", err)
	}

	return slots, nil
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

// AscendedNames reads the graveyard: every character any account has spent,
// newest first, capped at limit.
//
// ⭐ THE FIRST GRAVEYARD QUERY IN THE CODEBASE. The data and the policy that
// preserves it have existed since step 8a (AscendCharacter deliberately does
// NOT rewrite the name, unlike SoftDeleteCharacter, "because deletion releases a
// name while sacrifice holds one for the memorial"), but until now nothing read
// it back.
//
// ⛑ THE NAME FILTER IS EXACT-MATCH, never LIKE 'deleted_%', and this is the D11
// privacy landmine rather than a style choice. DiscardAnonymousAccount renames
// EVERY row of an account to 'deleted_' || id, sacrificed ones included, because
// names are player-authored free text and erasure wins; so those must not be
// listed. auth.ValidateCharacterName reserves the deleted_ prefix since
// plan-code-health.md C7 (2026-08-14), but a row named before that may still
// hold the shape on a live database, and a prefix test would cut that real
// person off their own monument. It is the same filter SlotBloodlines already
// ships, and the two must stay identical.
//
// ⚑ CITEXT makes the comparison case-insensitive, which is inherited rather
// than chosen: `name` is CITEXT so the whole column compares that way. The only
// player it could over-filter is one named a case variant of their own row's
// `deleted_<id>`, which is the same (accepted) edge SlotBloodlines carries.
//
// ⚑ Two plain queries rather than one clever one, following SlotBloodlines'
// recorded preference: each half reads on its own and neither needs a window
// function to explain itself.
//
// ⚑ It is a SEQUENTIAL SCAN today and that is deliberate: there is no index on
// sacrificed_at, a graveyard is small by construction (one row per life ever
// spent), and the read happens on a timer off the loop rather than per tick. The
// day it is worth an index is the day this is slow, and that is a migration, not
// a guess.
func (s *Store) AscendedNames(ctx context.Context, limit int) (persist.Graveyard, error) {
	var yard persist.Graveyard
	if limit <= 0 {
		return yard, fmt.Errorf("a graveyard listing needs a positive limit, got %d", limit)
	}

	rows, err := s.Pool.Query(ctx,
		`SELECT name, level, account_id
		   FROM game.characters
		  WHERE sacrificed_at IS NOT NULL
		    AND name <> 'deleted_' || id
		  ORDER BY sacrificed_at DESC, id DESC
		  LIMIT $1`, limit)
	if err != nil {
		return persist.Graveyard{}, fmt.Errorf("reading the graveyard: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var n persist.GraveyardName
		if err := rows.Scan(&n.Name, &n.Level, &n.AccountID); err != nil {
			return persist.Graveyard{}, fmt.Errorf("reading a graveyard row: %w", err)
		}
		yard.Names = append(yard.Names, n)
	}
	if err := rows.Err(); err != nil {
		return persist.Graveyard{}, fmt.Errorf("reading the graveyard: %w", err)
	}

	// ⚑ The same WHERE, deliberately duplicated rather than derived: a count that
	// filtered differently from the list would make "and N more" lie in the one
	// direction nobody would notice, since the visible rows would still be right.
	if err := s.Pool.QueryRow(ctx,
		`SELECT count(*)
		   FROM game.characters
		  WHERE sacrificed_at IS NOT NULL
		    AND name <> 'deleted_' || id`).Scan(&yard.Total); err != nil {
		return persist.Graveyard{}, fmt.Errorf("counting the graveyard: %w", err)
	}
	return yard, nil
}

// ⚑ THE SINKS THIS STORE IMPLEMENTS, PINNED AT COMPILE TIME, for the same
// reason core/game.go pins the seams cmd/aurad type-asserts: these interfaces
// live in persist and are satisfied structurally, so a signature drifting on
// either side would otherwise surface as a boot-time wiring failure in
// cmd/aurad rather than as a build error here.
var (
	_ persist.AscensionSink = (*Store)(nil)
	_ persist.GraveyardSink = (*Store)(nil)
)
