package store_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// plan-appearance.md C5: grants are written at their scope (L1) through the
// character save, and read back as the owned set.

var oneOfEach = []persist.AppearanceGrant{
	{Item: "crown", Scope: "account"},
	{Item: "ring-claws", Scope: "bloodline"},
	{Item: "ring-forest", Scope: "character"},
}

func createIn(t *testing.T, db *store.Store, name string, accountID int64, slot int) store.Character {
	t.Helper()
	params := character(name, accountID)
	params.SlotIndex = &slot
	c, err := db.CreateCharacter(context.Background(), params)
	require.NoError(t, err)
	return c
}

func TestSaveCharacterWritesEachGrantAtItsScope(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "grant-secret")
	c := createIn(t, db, "Granter", accountID, 1)

	state := persist.CharacterState{CharacterID: c.ID, Level: 3, Portrait: "default", Ring: "ring-plain",
		AppearanceGrants: oneOfEach}
	require.NoError(t, db.SaveCharacter(ctx, state))
	require.NoError(t, db.SaveCharacter(ctx, state), "a repeat save is idempotent")

	assert.Equal(t, 3, scalar[int](t, db.Pool, `SELECT count(*) FROM game.appearance_unlocks`))
	assert.Equal(t, "crown", scalar[string](t, db.Pool,
		`SELECT item_key FROM game.appearance_unlocks WHERE scope = 'account' AND account_id = $1`, accountID))
	assert.Equal(t, 1, scalar[int](t, db.Pool,
		`SELECT slot_index FROM game.appearance_unlocks WHERE scope = 'bloodline' AND account_id = $1`, accountID),
		"the slot comes from the character row")
	assert.Equal(t, c.ID, scalar[int64](t, db.Pool,
		`SELECT character_id FROM game.appearance_unlocks WHERE scope = 'character'`))

	owned, err := db.OwnedAppearance(ctx, accountID, 1, c.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"crown", "ring-claws", "ring-forest"}, owned)
}

// Each scope reaches exactly its owners: the account everywhere, the
// bloodline in its slot (even after a plain delete, like bloodline_unlocks),
// the character item nowhere else.
func TestOwnedAppearanceFollowsTheScope(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "scope-secret")
	first := createIn(t, db, "First", accountID, 1)
	require.NoError(t, db.SaveCharacter(ctx, persist.CharacterState{CharacterID: first.ID, Level: 3,
		Portrait: "default", Ring: "ring-plain", AppearanceGrants: oneOfEach}))

	other := createIn(t, db, "Other", accountID, 2)
	owned, err := db.OwnedAppearance(ctx, accountID, 2, other.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"crown"}, owned, "another slot owns the account item only")

	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, first.ID))
	heir := createIn(t, db, "Heir", accountID, 1)
	owned, err = db.OwnedAppearance(ctx, accountID, 1, heir.ID)
	require.NoError(t, err)
	assert.Equal(t, []string{"crown", "ring-claws"}, owned, "the bloodline item follows the slot")

	owned, err = db.OwnedAppearance(ctx, accountID, 1, 0)
	require.NoError(t, err)
	assert.Equal(t, []string{"crown", "ring-claws"}, owned, "creation asks with no character yet")

	strangerID := newAccount(t, db, "stranger-secret")
	owned, err = db.OwnedAppearance(ctx, strangerID, 1, 0)
	require.NoError(t, err)
	assert.Empty(t, owned, "nothing crosses accounts")
}

// Character select's read: the account's items and each slot's.
func TestAccountAppearance(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "list-secret")
	c := createIn(t, db, "Lister", accountID, 1)
	require.NoError(t, db.SaveCharacter(ctx, persist.CharacterState{CharacterID: c.ID, Level: 3,
		Portrait: "default", Ring: "ring-plain", AppearanceGrants: oneOfEach}))

	looks, err := db.AccountAppearance(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, []string{"crown"}, looks.Account)
	assert.Equal(t, map[int][]string{1: {"ring-claws"}}, looks.BySlot)
}

// D21a: count-based items are granted in the sacrifice's transaction, at the
// slot the row names; a failed ascension grants nothing. Never into
// bloodline_unlocks (L2).
func TestAscendCharacterWritesTheAppearanceGrants(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "ascend-look-secret")
	c := createIn(t, db, "Ascender", accountID, 2)
	grants := []persist.AppearanceGrant{{Item: "ring-claws", Scope: "bloodline"}, {Item: "halo", Scope: "account"}}

	_, err := db.AscendCharacter(ctx, accountID+999, c.ID, "", grants)
	require.ErrorIs(t, err, store.ErrNoCharacter)
	assert.Zero(t, scalar[int](t, db.Pool, `SELECT count(*) FROM game.appearance_unlocks`), "a failed ascension grants nothing")

	_, err = db.AscendCharacter(ctx, accountID, c.ID, "", grants)
	require.NoError(t, err)
	owned, err := db.OwnedAppearance(ctx, accountID, 2, 0)
	require.NoError(t, err)
	assert.Equal(t, []string{"halo", "ring-claws"}, owned)
	assert.Zero(t, scalar[int](t, db.Pool, `SELECT count(*) FROM game.bloodline_unlocks`), "L2")
}

// D12: the slot card carries the predecessor's look for the successor's
// preselect.
func TestSlotBloodlinesCarryThePredecessorsLook(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "pred-secret")
	params := character("Elder", accountID)
	one := 1
	params.SlotIndex = &one
	params.Avatar, params.Ring = "green-hood", "ring-leather"
	elder, err := db.CreateCharacter(ctx, params)
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, elder.ID, "", nil)
	require.NoError(t, err)

	slots, err := db.SlotBloodlines(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, "green-hood", slots[1].PredecessorPortrait)
	assert.Equal(t, "ring-leather", slots[1].PredecessorRing)
}
