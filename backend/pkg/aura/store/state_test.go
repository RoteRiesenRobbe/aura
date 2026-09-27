package store_test

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// TestCharacterStateRoundTrips IS THE ACCEPTANCE TEST FOR CHUNK 4.
//
// ⚑ Save and load ship together for exactly this reason: a column written by
// one half and ignored by the other looks like working code from either side
// alone, and the resulting bug surfaces as "my progress reverted", days later,
// with nothing failing. Comparing the loaded state against the saved one
// field-for-field is the only check that cannot pass while the halves disagree.
func TestCharacterStateRoundTrips(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret-roundtrip")
	created, err := db.CreateCharacter(ctx, character("Barney Rubble", accountID))
	require.NoError(t, err)

	saved := persist.CharacterState{
		CharacterID:    created.ID,
		Name:           "Barney Rubble",
		Level:          14,
		Experience:     123456,
		ActiveAuraSlot: 2,
		HomeCampfireID: "spawnpoint-3",
		// Deliberately given out of order — the load path's ORDER BY and
		// persist.SortCampfires have to agree, or the round-trip equality below
		// fails for a reason that has nothing to do with persistence.
		DiscoveredCampfires: []string{"spawnpoint-1", "spawnpoint-3"},
		// Negative indices on purpose: world.json spans the origin (L3).
		MapFog: []persist.FogChunk{
			fogChunk(-3, -2, 0x81), fogChunk(-3, 1, 0x01), fogChunk(0, -1, 0xf0),
		},
		Spellbook: map[int32]int{1: 3, 7: 1, 42: 9},
		Loadout: []persist.LoadoutSlot{
			{Type: persist.SlotAura, Index: 2, SkillID: 42},
			{Type: persist.SlotCooldown, Index: 0, SkillID: 7},
			{Type: persist.SlotPassive, Index: 1, SkillID: 1},
		},
		Flags: persist.CanonicalFlags(map[string]json.RawMessage{
			"quests.killCounts": json.RawMessage(`{"3":12,"9":4}`),
			"quests.talkedTo":   json.RawMessage(`[3,7]`),
			"quest.the-lost-lamp": json.RawMessage(
				`{"path":["start","middle"],"running":true,"completed":false}`),
		}),
	}
	persist.SortLoadout(saved.Loadout)

	require.NoError(t, db.SaveCharacter(ctx, saved))

	loaded, err := db.LoadCharacterState(ctx, accountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, saved, loaded, "a loaded character must equal the one that was saved")

	// And a second save over the top replaces rather than accumulating — the
	// child tables are full-replacement, so an unequipped skill has to vanish.
	saved.Spellbook = map[int32]int{1: 4}
	saved.Loadout = []persist.LoadoutSlot{{Type: persist.SlotPassive, Index: 0, SkillID: 1}}
	saved.Flags = map[string]json.RawMessage{}
	saved.ActiveAuraSlot = persist.NoActiveAura
	// Unbinding must round-trip too: "" has to reach the column as NULL and come
	// back as "", or a spawn point deleted from the zone could never be cleared.
	saved.HomeCampfireID = ""
	// ⚑ THE ONE COLLECTION THAT IS NOT REPLACED. Discovery is monotonic, so the
	// save path inserts with ON CONFLICT DO NOTHING and a shorter list does not
	// un-discover anything — the loaded set is still both fires. Asserting the
	// full set here is what keeps someone from "fixing" the asymmetry back into
	// a delete-and-reinsert, which would let a stale snapshot erase progress.
	saved.DiscoveredCampfires = []string{"spawnpoint-1"}
	require.NoError(t, db.SaveCharacter(ctx, saved))

	loaded, err = db.LoadCharacterState(ctx, accountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"spawnpoint-1", "spawnpoint-3"}, loaded.DiscoveredCampfires,
		"discovery only grows: a save must never remove a discovered campfire")

	saved.DiscoveredCampfires = loaded.DiscoveredCampfires
	// The map fog is upserted and never deleted; the second save still carries
	// it, so it is unchanged.
	assert.Equal(t, saved, loaded, "a save must replace the previous one, not add to it")
}

// TestLoadCharacterStateOfANeverSavedCharacter pins what a freshly created
// character reads back as — the state the restore path recognises as "leave the
// new skill component alone".
//
// ⚑ active_aura_slot is NULL on a new row, and it must load as "no aura active",
// not as slot 0. Slot 0 is a real slot; a NULL silently becoming it would switch
// an aura on for a character who never chose one.
func TestLoadCharacterStateOfANeverSavedCharacter(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret-fresh")
	created, err := db.CreateCharacter(ctx, character("Fred", accountID))
	require.NoError(t, err)

	loaded, err := db.LoadCharacterState(ctx, accountID, created.ID)
	require.NoError(t, err)

	assert.Equal(t, "Fred", loaded.Name)
	assert.Equal(t, 1, loaded.Level)
	assert.Equal(t, int64(0), loaded.Experience)
	assert.Equal(t, persist.NoActiveAura, loaded.ActiveAuraSlot)
	assert.Empty(t, loaded.HomeCampfireID, "a character that never dwelled at a fire loads unbound")
	assert.Empty(t, loaded.DiscoveredCampfires, "and has discovered nothing — an empty map")
	assert.Empty(t, loaded.MapFog, "and has revealed nothing")
	assert.Empty(t, loaded.Spellbook, "an empty spellbook is what marks a character as never saved")
	assert.Empty(t, loaded.Loadout)
	assert.Empty(t, loaded.Flags)
}

// fogChunk is a chunk on the stored grid with its first byte set to first.
func fogChunk(x, y int16, first byte) persist.FogChunk {
	bits := make([]byte, 64*64/8)
	bits[0] = first
	return persist.FogChunk{X: x, Y: y, CellSize: 2, ChunkCells: 64, Bits: bits}
}

// TestMapFogSaveGrowsAndNeverShrinks: plan-map-fog-persistence.md F1. A chunk's
// bits are overwritten by a later save (in play they only ever gain bits), a
// chunk the later snapshot lacks is kept, and a row on another grid comes back
// from the load as stored: skipping it is the game's call at seed time (D10),
// not the store's.
func TestMapFogSaveGrowsAndNeverShrinks(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret-fog")
	created, err := db.CreateCharacter(ctx, character("Wilma", accountID))
	require.NoError(t, err)

	state := persist.CharacterState{
		CharacterID: created.ID, Level: 1, ActiveAuraSlot: persist.NoActiveAura,
		MapFog: []persist.FogChunk{fogChunk(-1, -1, 0x01), fogChunk(2, 0, 0x02)},
	}
	require.NoError(t, db.SaveCharacter(ctx, state))

	// The next snapshot fills one chunk further, omits another, adds a third.
	foreign := persist.FogChunk{X: 5, Y: 5, CellSize: 4, ChunkCells: 32, Bits: make([]byte, 32*32/8)}
	state.MapFog = []persist.FogChunk{fogChunk(-1, -1, 0x03), foreign}
	require.NoError(t, db.SaveCharacter(ctx, state))

	loaded, err := db.LoadCharacterState(ctx, accountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, []persist.FogChunk{fogChunk(-1, -1, 0x03), fogChunk(2, 0, 0x02), foreign}, loaded.MapFog,
		"filled chunk grown, omitted chunk kept, foreign grid returned as stored, sorted by (x, y)")

	// ⚑ A STALE SNAPSHOT MUST NOT SHRINK A CHUNK. A session seeded from a load
	// that raced a still-pending save carries fewer bits than the row; the save
	// ORs, so the row keeps them. And a chunk on a different grid at the same
	// (x, y) is REPLACED, not ORed: its bits mean different cells (D10).
	state.MapFog = []persist.FogChunk{fogChunk(-1, -1, 0x04), fogChunk(2, 0, 0x00)}
	require.NoError(t, db.SaveCharacter(ctx, state))
	regridded := persist.FogChunk{X: 5, Y: 5, CellSize: 2, ChunkCells: 64, Bits: fogChunk(5, 5, 0x10).Bits}
	state.MapFog = []persist.FogChunk{regridded}
	require.NoError(t, db.SaveCharacter(ctx, state))

	loaded, err = db.LoadCharacterState(ctx, accountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, []persist.FogChunk{fogChunk(-1, -1, 0x07), fogChunk(2, 0, 0x02), regridded}, loaded.MapFog,
		"a save only ever adds bits; a regridded chunk replaces the old one")
}

// TestLoadCharacterStateChecksOwnership: the load path is a second reader of a
// character row, so it enforces ownership in the query exactly as
// AliveCharacter does rather than trusting its caller to have done it.
func TestLoadCharacterStateChecksOwnership(t *testing.T) {
	db, ctx := freshSchema(t)
	owner := newAccount(t, db, "secret-owner")
	stranger := newAccount(t, db, "secret-stranger")
	created, err := db.CreateCharacter(ctx, character("Wilma", owner))
	require.NoError(t, err)

	_, err = db.LoadCharacterState(ctx, stranger, created.ID)
	assert.ErrorIs(t, err, store.ErrNoCharacter)
}

// TestSaveCharacterRefusesADeletedCharacter: a player can delete a character
// from character-select while it is still in the world, and its in-flight
// autosave must not write progress back into a row that is gone.
func TestSaveCharacterRefusesADeletedCharacter(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret-deleted")
	created, err := db.CreateCharacter(ctx, character("Betty", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, created.ID))

	err = db.SaveCharacter(ctx, persist.CharacterState{
		CharacterID: created.ID, Level: 30, ActiveAuraSlot: persist.NoActiveAura,
	})
	assert.ErrorIs(t, err, store.ErrNoCharacter)
	// ⚑ And it must say so in the writer's vocabulary, not just the HTTP layer's.
	// This is the wire the save queue reads to drop a doomed snapshot instead of
	// retrying it forever; without it the refusal above is indistinguishable from
	// a database having a bad minute.
	assert.ErrorIs(t, err, persist.ErrGone,
		"a save refused because the row is gone must be marked terminal")
}

// TestSaveCharacterOrdersItsStatements is the FK-ordering pin.
//
// character_loadout_slots has a composite foreign key into character_spellbook,
// so a save must delete slots before the spellbook and insert them after it.
// This exercises the case that would break first: a second save that *shrinks*
// the spellbook while a slot still references the skill being removed.
func TestSaveCharacterOrdersItsStatements(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret-ordering")
	created, err := db.CreateCharacter(ctx, character("Pebbles", accountID))
	require.NoError(t, err)

	require.NoError(t, db.SaveCharacter(ctx, persist.CharacterState{
		CharacterID:    created.ID,
		ActiveAuraSlot: 0,
		Spellbook:      map[int32]int{5: 1},
		Loadout:        []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 5}},
	}))

	// Skill 5 is gone from the spellbook and from the loadout at the same time.
	// Deleting the spellbook first would violate the FK from the surviving slot
	// row; inserting the slot before the spellbook would violate it the other way.
	require.NoError(t, db.SaveCharacter(ctx, persist.CharacterState{
		CharacterID:    created.ID,
		ActiveAuraSlot: 0,
		Spellbook:      map[int32]int{6: 2},
		Loadout:        []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 6}},
	}))

	loaded, err := db.LoadCharacterState(ctx, accountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, map[int32]int{6: 2}, loaded.Spellbook)
	assert.Equal(t, []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 6}}, loaded.Loadout)
}
