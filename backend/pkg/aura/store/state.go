package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// SaveCharacter writes one character snapshot: the three progress columns plus a
// full replacement of the spellbook, loadout and flag rows
// (plan-accounts-implementation.md §4).
//
// ⚑ THE STATEMENT ORDER IS A CONSTRAINT, NOT A STYLE. character_loadout_slots
// has a composite foreign key into character_spellbook, so slots are deleted
// BEFORE the spellbook and inserted AFTER it. Reverse either and every save
// fails on the constraint — reliably, which is the good case; the bad case is
// reversing only one of the two and failing solely for characters who have
// unequipped a skill.
//
// ⚑ Delete-and-reinsert rather than dirty tracking is the deliberate cost of
// snapshot-over-deltas. At this scale (≤ ~80 spellbook rows, ≤ 9 slots, 3 flag
// rows per character, roughly one write every 3 seconds at 100 players) it is
// free, and it cannot drift the way a diff can.
//
// ⚑ synchronous_commit is turned off FOR THIS TRANSACTION ONLY. Postgres then
// reports the commit as soon as the WAL record is buffered instead of waiting
// for the fsync, so an unclean shutdown can lose the last ~200 ms of
// "committed" saves — three to four orders of magnitude inside the accepted
// ~5-minute loss tolerance (§1). It is a durability knob, not a consistency
// one: nothing a live connection can read changes. The sacrifice transaction
// (§3) deliberately does NOT get this treatment.
func (s *Store) SaveCharacter(ctx context.Context, state persist.CharacterState) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("starting the character-save transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `SET LOCAL synchronous_commit = off`); err != nil {
		return fmt.Errorf("relaxing durability for a character save: %w", err)
	}

	// ⚑ The alive check is part of the UPDATE rather than a prior SELECT: a
	// character can be deleted from character-select while it is still in the
	// world, and a save that resurrected the row's numbers afterwards would be a
	// deleted character quietly keeping its progress.
	//
	// ⚑ `name` is NOT in the SET list. The row owns the name (it is globally
	// unique and decided at creation); the game only ever read it.
	//
	// ⚑ home_campfire_id goes in as NULL when the character is unbound, and
	// writing that NULL is the point: a bind whose spawn point was deleted from
	// the zone resolves to unbound at join, and this is what clears the dead id
	// instead of leaving it to fail resolution on every future login.
	tag, err := tx.Exec(ctx,
		`UPDATE game.characters
		    SET level = $2, experience = $3, active_aura_slot = $4, home_campfire_id = $5
		  WHERE id = $1 AND sacrificed_at IS NULL AND deleted_at IS NULL`,
		state.CharacterID, state.Level, state.Experience, state.ActiveAuraSlot,
		nullableString(state.HomeCampfireID))
	if err != nil {
		return fmt.Errorf("saving a character: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// ⚑ Wrapped as persist.ErrGone so the writer can tell "this can never
		// succeed" from "the database is unwell" and stop retrying it — the
		// distinction the save queue has no other way to make, and whose absence
		// once turned a routine row deletion into a 37-minute save outage.
		//
		// ⚑ Scoped to the SAVE path deliberately, rather than folded into the
		// sentinel itself. The other ErrNoCharacter sites answer HTTP requests,
		// where "terminal" means nothing and would only be a claim nobody reads.
		return fmt.Errorf("%w: %w", ErrNoCharacter, persist.ErrGone)
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM game.character_loadout_slots WHERE character_id = $1`, state.CharacterID); err != nil {
		return fmt.Errorf("clearing a loadout: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM game.character_spellbook WHERE character_id = $1`, state.CharacterID); err != nil {
		return fmt.Errorf("clearing a spellbook: %w", err)
	}
	for skillID, level := range state.Spellbook {
		if _, err := tx.Exec(ctx,
			`INSERT INTO game.character_spellbook (character_id, skill_id, skill_level) VALUES ($1, $2, $3)`,
			state.CharacterID, skillID, level); err != nil {
			return fmt.Errorf("saving spellbook skill %d: %w", skillID, err)
		}
	}
	for _, slot := range state.Loadout {
		if _, err := tx.Exec(ctx,
			`INSERT INTO game.character_loadout_slots (character_id, slot_type, slot_index, skill_id)
			 VALUES ($1, $2, $3, $4)`,
			state.CharacterID, slot.Type, slot.Index, slot.SkillID); err != nil {
			return fmt.Errorf("saving loadout slot %s/%d: %w", slot.Type, slot.Index, err)
		}
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM game.character_flags WHERE character_id = $1`, state.CharacterID); err != nil {
		return fmt.Errorf("clearing character flags: %w", err)
	}
	for key, value := range state.Flags {
		if _, err := tx.Exec(ctx,
			`INSERT INTO game.character_flags (character_id, flag_key, flag_value) VALUES ($1, $2, $3)`,
			state.CharacterID, key, []byte(value)); err != nil {
			return fmt.Errorf("saving character flag %q: %w", key, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing a character save: %w", err)
	}
	return nil
}

// nullableString maps the empty string to SQL NULL. The game says "unbound"
// with "", the column says it with NULL, and the two must agree in both
// directions or an unbound character round-trips as one bound to a spawn point
// named "".
func nullableString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// LoadCharacterState reads everything SaveCharacter writes, plus the name.
//
// ⚑ OWNERSHIP IS PART OF THE QUERY, exactly as in AliveCharacter: a caller who
// does not own the row gets the same answer as one naming an id that does not
// exist. This is called from /select, one statement after ownership was already
// proven — checking it twice costs nothing and means the load path cannot become
// an ownership hole if it ever gains a second caller.
//
// A character that has never been saved comes back with its creation defaults
// (level 1, no experience) and an EMPTY spellbook, which is how the restore path
// recognises "leave the freshly built skill component alone".
func (s *Store) LoadCharacterState(ctx context.Context, accountID, characterID int64) (persist.CharacterState, error) {
	state := persist.CharacterState{
		CharacterID: characterID,
		Spellbook:   map[int32]int{},
		Flags:       map[string]json.RawMessage{},
	}

	// active_aura_slot is nullable, and NULL is what a never-saved character
	// carries — map it to "no aura active" rather than to slot 0.
	var activeAuraSlot *int
	// home_campfire_id is nullable too, and NULL is the ordinary state of any
	// character that has not dwelled at a fire yet — "" for the game, which
	// spawns it at the zone's default spawn.
	var homeCampfireID *string
	err := s.Pool.QueryRow(ctx,
		`SELECT name, level, experience, active_aura_slot, home_campfire_id
		   FROM game.characters
		  WHERE id = $1 AND account_id = $2 AND sacrificed_at IS NULL AND deleted_at IS NULL`,
		characterID, accountID).
		Scan(&state.Name, &state.Level, &state.Experience, &activeAuraSlot, &homeCampfireID)
	if errors.Is(err, pgx.ErrNoRows) {
		return persist.CharacterState{}, ErrNoCharacter
	}
	if err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading a character: %w", err)
	}
	state.ActiveAuraSlot = persist.NoActiveAura
	if activeAuraSlot != nil {
		state.ActiveAuraSlot = *activeAuraSlot
	}
	if homeCampfireID != nil {
		state.HomeCampfireID = *homeCampfireID
	}

	rows, err := s.Pool.Query(ctx,
		`SELECT skill_id, skill_level FROM game.character_spellbook WHERE character_id = $1`, characterID)
	if err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading a spellbook: %w", err)
	}
	for rows.Next() {
		var skillID int32
		var level int
		if err := rows.Scan(&skillID, &level); err != nil {
			rows.Close()
			return persist.CharacterState{}, fmt.Errorf("reading a spellbook row: %w", err)
		}
		state.Spellbook[skillID] = level
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading a spellbook: %w", err)
	}

	// ORDER BY matches persist.SortLoadout, so a saved state and a loaded one
	// compare equal — the round-trip property this whole pair exists to have.
	rows, err = s.Pool.Query(ctx,
		`SELECT slot_type, slot_index, skill_id FROM game.character_loadout_slots
		  WHERE character_id = $1 AND skill_id IS NOT NULL
		  ORDER BY slot_type, slot_index`, characterID)
	if err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading a loadout: %w", err)
	}
	for rows.Next() {
		var slot persist.LoadoutSlot
		if err := rows.Scan(&slot.Type, &slot.Index, &slot.SkillID); err != nil {
			rows.Close()
			return persist.CharacterState{}, fmt.Errorf("reading a loadout row: %w", err)
		}
		state.Loadout = append(state.Loadout, slot)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading a loadout: %w", err)
	}

	rows, err = s.Pool.Query(ctx,
		`SELECT flag_key, flag_value FROM game.character_flags WHERE character_id = $1`, characterID)
	if err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading character flags: %w", err)
	}
	for rows.Next() {
		var key string
		var value []byte
		if err := rows.Scan(&key, &value); err != nil {
			rows.Close()
			return persist.CharacterState{}, fmt.Errorf("reading a character flag: %w", err)
		}
		state.Flags[key] = json.RawMessage(value)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading character flags: %w", err)
	}
	// jsonb re-renders what it stored, so the bytes coming back are not the
	// bytes that went in. Canonicalising here is what keeps save → load →
	// compare an equality rather than a semantic comparison — see
	// persist.CanonicalFlags.
	state.Flags = persist.CanonicalFlags(state.Flags)

	return state, nil
}
