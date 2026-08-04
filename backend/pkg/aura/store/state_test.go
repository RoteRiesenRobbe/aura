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
		Spellbook:           map[int32]int{1: 3, 7: 1, 42: 9},
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
	assert.Empty(t, loaded.Spellbook, "an empty spellbook is what marks a character as never saved")
	assert.Empty(t, loaded.Loadout)
	assert.Empty(t, loaded.Flags)
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
