package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// The constraint names CreateCharacter maps conflicts through. Postgres
// generates the second one, so both are pinned by TestUniqueConstraintNames —
// a rename would otherwise turn "that name is taken" into a 500.
const (
	constraintSlotOccupied = "one_alive_character_per_slot"
	constraintNameTaken    = "characters_name_key"
)

var (
	// ErrNameTaken is the globally unique, case-insensitive character name losing
	// its index. A player-facing rejection, not a bug.
	ErrNameTaken = errors.New("store: that character name is taken")
	// ErrSlotsFull means every configured slot already holds an alive character.
	ErrSlotsFull = errors.New("store: all character slots are full")
	// ErrNoCharacter means no ALIVE character with that id belongs to that
	// account. ⚑ Deliberately one error for "no such id", "not yours" and
	// "already deleted": ids are BIGSERIAL and therefore guessable, so telling
	// them apart would confirm which ids exist.
	ErrNoCharacter = errors.New("store: no such character for that account")
	// ErrNotAnonymous guards the discard path from ever running on a registered
	// account — see DiscardAnonymousAccount.
	ErrNotAnonymous = errors.New("store: that account is registered")
)

// Character is one life, as character-select and the game path read it.
//
// It is deliberately NOT the whole row: HP, position, the spellbook, the loadout
// and the quest ledger belong to chunk 4's snapshot, and nothing 1c does should
// make them look like fields anyone has to fill in.
type Character struct {
	ID         int64
	AccountID  int64
	SlotIndex  int
	Name       string
	Avatar     string
	Faction    string
	Level      int
	Experience int64
	CreatedAt  time.Time
}

// NewCharacter is what creating one needs.
//
// ⚑ SlotIndex is absent on purpose: it is server-assigned (the lowest free
// slot), never client-chosen. A caller that could pass one could put a character
// in slot 7 of a three-slot account.
type NewCharacter struct {
	// AccountID is the account to create under, or 0 to mint a fresh anonymous
	// account behind this character — the anonymous-first path.
	AccountID int64
	// AnonymousSecretKey is required when AccountID is 0, ignored otherwise.
	AnonymousSecretKey string

	Name    string
	Avatar  string
	Faction string

	// MaxAlive is game.player.maxAliveCharacters. ⚑ An APPLICATION concern by
	// design — nothing in the DDL bounds slot_index, because the cap is a config
	// knob and the schema invariant is only "at most one alive per slot".
	MaxAlive int
}

// CreateCharacter assigns the lowest free slot and inserts the character,
// enforcing the cap in the SAME transaction as the insert — and mints the
// account first when there is none.
//
// ⚑ IT RETRIES ONCE, and the retry is not defensive coding. Two concurrent
// creates both compute "lowest free slot", both aim at it, and one loses the
// partial unique index (plan-accounts-frontend.md §9 item 3). The database is
// behaving correctly; surfacing that raw conflict to a player would not be. The
// retry lives here rather than in the handler so no caller can forget it — and
// it is scoped to the SLOT conflict only, because a name conflict is a decision
// the player has to make, not a race to re-run.
func (s *Store) CreateCharacter(ctx context.Context, params NewCharacter) (Character, error) {
	created, err := s.createCharacterOnce(ctx, params)
	if errors.Is(err, errSlotRace) {
		created, err = s.createCharacterOnce(ctx, params)
		if errors.Is(err, errSlotRace) {
			// Losing twice is no longer a race — treat it as the cap being full,
			// which is what a player would see if the winner filled the last slot.
			return Character{}, ErrSlotsFull
		}
	}
	return created, err
}

// errSlotRace is internal: CreateCharacter is the only thing that ever sees it,
// and it converts it into a retry or into ErrSlotsFull. Exporting it would
// invite a handler to make the same decision differently.
var errSlotRace = errors.New("store: the chosen character slot filled up concurrently")

func (s *Store) createCharacterOnce(ctx context.Context, params NewCharacter) (Character, error) {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return Character{}, fmt.Errorf("starting the character-creation transaction: %w", err)
	}
	// Rollback on every path that does not reach Commit. A committed transaction
	// makes this a no-op, so the defer needs no flag to guard it.
	defer func() { _ = tx.Rollback(ctx) }()

	accountID := params.AccountID
	if accountID == 0 {
		if accountID, err = CreateAnonymousAccount(ctx, tx, params.AnonymousSecretKey); err != nil {
			return Character{}, err
		}
	}

	slot, err := lowestFreeSlot(ctx, tx, accountID, params.MaxAlive)
	if err != nil {
		return Character{}, err
	}

	created := Character{
		AccountID: accountID,
		SlotIndex: slot,
		Name:      params.Name,
		Avatar:    params.Avatar,
		Faction:   params.Faction,
	}
	err = tx.QueryRow(ctx,
		`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, level, experience, created_at`,
		accountID, slot, params.Name, params.Avatar, params.Faction).
		Scan(&created.ID, &created.Level, &created.Experience, &created.CreatedAt)
	switch {
	case isUniqueViolation(err, constraintNameTaken):
		return Character{}, ErrNameTaken
	case isUniqueViolation(err, constraintSlotOccupied):
		return Character{}, errSlotRace
	case err != nil:
		return Character{}, fmt.Errorf("creating a character: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return Character{}, fmt.Errorf("committing the character creation: %w", err)
	}
	return created, nil
}

// lowestFreeSlot is the assignment rule: the lowest slot_index below the cap not
// currently held by an alive character.
//
// ⚑ Reading occupied slots cannot be locked against a concurrent INSERT — there
// is no row yet to lock — which is precisely why the unique index, not this
// function, is the authority. This decides WHICH slot to try; the index decides
// whether the try was allowed.
func lowestFreeSlot(ctx context.Context, tx pgx.Tx, accountID int64, maxAlive int) (int, error) {
	rows, err := tx.Query(ctx,
		`SELECT slot_index FROM game.characters
		  WHERE account_id = $1 AND sacrificed_at IS NULL AND deleted_at IS NULL
		  ORDER BY slot_index`, accountID)
	if err != nil {
		return 0, fmt.Errorf("reading occupied character slots: %w", err)
	}
	occupied := map[int]bool{}
	for rows.Next() {
		var slot int
		if err := rows.Scan(&slot); err != nil {
			rows.Close()
			return 0, fmt.Errorf("reading an occupied character slot: %w", err)
		}
		occupied[slot] = true
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("reading occupied character slots: %w", err)
	}

	for slot := 0; slot < maxAlive; slot++ {
		if !occupied[slot] {
			return slot, nil
		}
	}
	return 0, ErrSlotsFull
}

// AliveCharacters lists what character-select shows, in SLOT order.
//
// ⚑ Slot order, not creation order. A slot is a continuous bloodline (a
// sacrifice successor inherits its predecessor's slot), so ordering by anything
// else would reshuffle a player's slots under them
// (plan-accounts-frontend.md §5.3).
func (s *Store) AliveCharacters(ctx context.Context, accountID int64) ([]Character, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, account_id, slot_index, name, avatar, faction, level, experience, created_at
		   FROM game.characters
		  WHERE account_id = $1 AND sacrificed_at IS NULL AND deleted_at IS NULL
		  ORDER BY slot_index`, accountID)
	if err != nil {
		return nil, fmt.Errorf("listing characters: %w", err)
	}
	defer rows.Close()

	characters := []Character{}
	for rows.Next() {
		var c Character
		if err := rows.Scan(&c.ID, &c.AccountID, &c.SlotIndex, &c.Name, &c.Avatar,
			&c.Faction, &c.Level, &c.Experience, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("reading a character: %w", err)
		}
		characters = append(characters, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("listing characters: %w", err)
	}
	return characters, nil
}

// AliveCharacter reads one alive character, and OWNERSHIP IS PART OF THE QUERY.
//
// ⚑ That is the whole guard for /select and /delete: a caller who does not own
// the row gets the same answer as one naming an id that does not exist. Checking
// ownership after the read, in Go, is the version that eventually forgets.
func (s *Store) AliveCharacter(ctx context.Context, accountID, characterID int64) (Character, error) {
	var c Character
	err := s.Pool.QueryRow(ctx,
		`SELECT id, account_id, slot_index, name, avatar, faction, level, experience, created_at
		   FROM game.characters
		  WHERE id = $1 AND account_id = $2 AND sacrificed_at IS NULL AND deleted_at IS NULL`,
		characterID, accountID).
		Scan(&c.ID, &c.AccountID, &c.SlotIndex, &c.Name, &c.Avatar,
			&c.Faction, &c.Level, &c.Experience, &c.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Character{}, ErrNoCharacter
	}
	if err != nil {
		return Character{}, fmt.Errorf("reading a character: %w", err)
	}
	return c, nil
}

// SoftDeleteCharacter stamps deleted_at and RELEASES THE NAME, in one statement.
//
// ⚑ Soft, never a hard DELETE: the row keeps the succession chain readable, and
// an actual DELETE would need ON DELETE CASCADE through the spellbook, loadout
// and flags — exactly the silent-breakage surface the schema avoids by carrying
// no ON DELETE clauses at all.
//
// ⚑ The name is rewritten in the same UPDATE because releasing it is not
// optional: names are globally unique forever, so a soft-deleted row holding its
// name would keep it out of circulation with no way to ever get it back. The
// harness depends on the release being immediate — delete-then-create is how it
// gets a pristine character every run (plan-accounts-frontend.md §11).
//
// ⚑ Deletion grants nothing and mints no successor. It is character-select
// housekeeping; sacrifice is the chain event, and the schema's CHECK keeps a row
// from ever being both.
func (s *Store) SoftDeleteCharacter(ctx context.Context, accountID, characterID int64) error {
	tag, err := s.Pool.Exec(ctx,
		`UPDATE game.characters SET deleted_at = now(), name = 'deleted_' || id
		  WHERE id = $1 AND account_id = $2 AND sacrificed_at IS NULL AND deleted_at IS NULL`,
		characterID, accountID)
	if err != nil {
		return fmt.Errorf("deleting a character: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNoCharacter
	}
	return nil
}

// HasProgress reports whether an anonymous account holds anything worth warning
// a player about before it is discarded: at least one alive character, or at
// least one bloodline unlock (plan-accounts-frontend.md §6).
//
// ⚑ The unlock half is not speculative padding, it is the half that stops the
// predicate rotting. Sacrifice does not exist yet, so today "has progress" and
// "has a character" agree — and the day sacrifice ships, an account whose only
// character was sacrificed would read as empty and be discarded silently,
// unlocks and all, if this only counted characters.
func (s *Store) HasProgress(ctx context.Context, accountID int64) (bool, error) {
	var has bool
	err := s.Pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM game.characters
		                 WHERE account_id = $1 AND sacrificed_at IS NULL AND deleted_at IS NULL)
		     OR EXISTS (SELECT 1 FROM game.bloodline_unlocks WHERE account_id = $1)`,
		accountID).Scan(&has)
	if err != nil {
		return false, fmt.Errorf("checking an account for progress: %w", err)
	}
	return has, nil
}

// DiscardAnonymousAccount abandons an anonymous account: every alive character
// is soft-deleted, every name released, the credentials row deleted and the
// account anonymised.
//
// This is what happens when a player logs into a DIFFERENT account from a
// browser that carries an anonymous secret and confirms the warning
// (plan-accounts-frontend.md §6). It composes the two mechanisms already
// designed — soft-delete and the erasure path — rather than inventing a third,
// and deleting the credentials row is what makes the stale local secret
// unresolvable rather than merely unused.
//
// ⚑ IT REFUSES ON A REGISTERED ACCOUNT (ErrNotAnonymous). This path is reachable
// from a request that names the account by a bearer secret alone; if it ran on a
// registered account it would be an unauthenticated way to erase someone. The
// guard is a WHERE clause, so the check and the delete are the same statement.
func (s *Store) DiscardAnonymousAccount(ctx context.Context, accountID int64) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting the discard transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`DELETE FROM game.account_credentials WHERE account_id = $1 AND username IS NULL`, accountID)
	if err != nil {
		return fmt.Errorf("discarding credentials: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotAnonymous
	}

	if _, err := tx.Exec(ctx,
		`UPDATE game.characters SET deleted_at = now()
		  WHERE account_id = $1 AND sacrificed_at IS NULL AND deleted_at IS NULL`, accountID); err != nil {
		return fmt.Errorf("discarding characters: %w", err)
	}
	// Every name, not just the alive ones — same reasoning as erasure: names are
	// player-authored free text and routinely contain real ones.
	if _, err := tx.Exec(ctx,
		`UPDATE game.characters SET name = 'deleted_' || id WHERE account_id = $1`, accountID); err != nil {
		return fmt.Errorf("releasing character names: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE game.accounts SET anonymised_at = now() WHERE id = $1`, accountID); err != nil {
		return fmt.Errorf("anonymising an account: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing the discard: %w", err)
	}
	return nil
}
