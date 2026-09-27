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

	// ⚑ NOT DELETED FIRST, deliberately (nor is the map fog below). Discovery is
	// monotonic — a character never un-discovers a campfire — so there is no
	// removal for a snapshot to represent, and delete-and-reinsert would reset
	// every row's discovered_at on every save. ON CONFLICT DO NOTHING is
	// idempotent over the same set and preserves the timestamp.
	for _, campfireID := range state.DiscoveredCampfires {
		if _, err := tx.Exec(ctx,
			`INSERT INTO game.character_campfires (character_id, campfire_id) VALUES ($1, $2)
			 ON CONFLICT (character_id, campfire_id) DO NOTHING`,
			state.CharacterID, campfireID); err != nil {
			return fmt.Errorf("saving discovered campfire %q: %w", campfireID, err)
		}
	}

	// The map reveal is monotonic too (plan-map-fog-persistence.md), but a
	// chunk's bits DO change as it fills in, so each explored chunk is upserted
	// and a chunk the snapshot lacks simply stays.
	//
	// ⚑ THE STORED BITS ARE ORed IN, never overwritten. "The live set was
	// seeded from the load" is not enough: /select can read a row while this
	// character's previous save is still queued (a database that just came
	// back while the writer is in backoff), and that session's next save would
	// then overwrite the newer bits with its stale ones. Postgres has no bytea
	// OR, so the rows are read under FOR UPDATE and merged here — one query per
	// save. A row on another grid is NOT merged: its bits name other cells, so
	// the snapshot's chunk replaces it (D10).
	if len(state.MapFog) > 0 {
		if err := mergeStoredFog(ctx, tx, state.CharacterID, state.MapFog); err != nil {
			return err
		}
	}
	for _, chunk := range state.MapFog {
		if _, err := tx.Exec(ctx,
			`INSERT INTO game.character_map_fog (character_id, chunk_x, chunk_y, cell_size, chunk_cells, bits)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (character_id, chunk_x, chunk_y) DO UPDATE
			    SET cell_size = EXCLUDED.cell_size, chunk_cells = EXCLUDED.chunk_cells,
			        bits = EXCLUDED.bits, updated_at = now()`,
			state.CharacterID, chunk.X, chunk.Y, chunk.CellSize, chunk.ChunkCells, chunk.Bits); err != nil {
			return fmt.Errorf("saving map fog chunk (%d, %d): %w", chunk.X, chunk.Y, err)
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

// mergeStoredFog ORs each stored chunk on the same grid into the snapshot's
// chunk at the same (x, y), in place.
//
// ⚑ It writes into the snapshot's Bits. Those are the writer's own copy
// (mapfog.Fog.Chunks copies), never the loop's live bitmap, so this is safe —
// and a retried save simply ORs the same bits again.
func mergeStoredFog(ctx context.Context, tx pgx.Tx, characterID int64, chunks []persist.FogChunk) error {
	type key struct{ x, y int16 }
	byKey := make(map[key]*persist.FogChunk, len(chunks))
	for i := range chunks {
		byKey[key{chunks[i].X, chunks[i].Y}] = &chunks[i]
	}
	rows, err := tx.Query(ctx,
		`SELECT chunk_x, chunk_y, cell_size, chunk_cells, bits FROM game.character_map_fog
		  WHERE character_id = $1 FOR UPDATE`, characterID)
	if err != nil {
		return fmt.Errorf("reading stored map fog to merge: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var stored persist.FogChunk
		if err := rows.Scan(&stored.X, &stored.Y, &stored.CellSize, &stored.ChunkCells, &stored.Bits); err != nil {
			return fmt.Errorf("reading a stored map fog chunk: %w", err)
		}
		chunk := byKey[key{stored.X, stored.Y}]
		if chunk == nil || chunk.CellSize != stored.CellSize || chunk.ChunkCells != stored.ChunkCells ||
			len(chunk.Bits) != len(stored.Bits) {
			continue
		}
		for i, b := range stored.Bits {
			chunk.Bits[i] |= b
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("reading stored map fog to merge: %w", err)
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

	// ORDER BY matches persist.SortCampfires, for the same round-trip reason the
	// loadout query is ordered.
	rows, err = s.Pool.Query(ctx,
		`SELECT campfire_id FROM game.character_campfires
		  WHERE character_id = $1 ORDER BY campfire_id`, characterID)
	if err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading discovered campfires: %w", err)
	}
	for rows.Next() {
		var campfireID string
		if err := rows.Scan(&campfireID); err != nil {
			rows.Close()
			return persist.CharacterState{}, fmt.Errorf("reading a discovered campfire: %w", err)
		}
		state.DiscoveredCampfires = append(state.DiscoveredCampfires, campfireID)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading discovered campfires: %w", err)
	}

	// ORDER BY matches persist.SortFogChunks. Every row comes back, whatever its
	// grid: skipping a foreign grid is the game's call at seed time (D10), not
	// the store's, which knows nothing about the grid the server draws on.
	rows, err = s.Pool.Query(ctx,
		`SELECT chunk_x, chunk_y, cell_size, chunk_cells, bits FROM game.character_map_fog
		  WHERE character_id = $1 ORDER BY chunk_x, chunk_y`, characterID)
	if err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading map fog: %w", err)
	}
	for rows.Next() {
		var chunk persist.FogChunk
		if err := rows.Scan(&chunk.X, &chunk.Y, &chunk.CellSize, &chunk.ChunkCells, &chunk.Bits); err != nil {
			rows.Close()
			return persist.CharacterState{}, fmt.Errorf("reading a map fog chunk: %w", err)
		}
		state.MapFog = append(state.MapFog, chunk)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return persist.CharacterState{}, fmt.Errorf("loading map fog: %w", err)
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
