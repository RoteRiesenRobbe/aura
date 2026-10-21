package store_test

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/appearance"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
)

// plan-appearance.md C3, migration 000004_appearance: the chosen ring is a
// column beside the chosen portrait (characters.avatar, D19), and every row
// written before it reads the default ring.

func TestCharacterKeepsItsChosenLook(t *testing.T) {
	db, ctx := freshSchema(t)
	params := character("Lookwright", 0)
	params.AnonymousSecretKey = "look-secret"
	params.Avatar = "green-hood"
	params.Ring = "ring-leather"
	created, err := db.CreateCharacter(ctx, params)
	require.NoError(t, err)
	assert.Equal(t, "green-hood", created.Avatar)
	assert.Equal(t, "ring-leather", created.Ring)

	alive, err := db.AliveCharacter(ctx, created.AccountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, "ring-leather", alive.Ring)

	list, err := db.AliveCharacters(ctx, created.AccountID)
	require.NoError(t, err)
	require.Len(t, list, 1)
	assert.Equal(t, "green-hood", list[0].Avatar)
	assert.Equal(t, "ring-leather", list[0].Ring)
}

// The backfill: the column default IS the catalog's default ring, so a row
// that predates the migration names an item the catalog holds.
func TestRingColumnDefaultsToTheCatalogsDefaultRing(t *testing.T) {
	db, _ := freshSchema(t)
	def := scalar[string](t, db.Pool,
		`SELECT column_default FROM information_schema.columns
		  WHERE table_schema = 'game' AND table_name = 'characters' AND column_name = 'ring'`)
	assert.Equal(t, "'"+appearance.DefaultRing+"'::text", def)
}

// appearance_unlocks ships with the migration so C5 adds none (§4.3). Its
// owner columns follow the scope, and a grant is unique per owner.
func TestAppearanceUnlocksScopeRules(t *testing.T) {
	db, ctx := freshSchema(t)
	params := character("Unlocker", 0)
	params.AnonymousSecretKey = "unlock-secret"
	c, err := db.CreateCharacter(ctx, params)
	require.NoError(t, err)

	insert := func(scope string, slot, char any, key string) error {
		_, err := db.Pool.Exec(ctx,
			`INSERT INTO game.appearance_unlocks (account_id, scope, slot_index, character_id, item_key)
			 VALUES ($1, $2, $3, $4, $5)`, c.AccountID, scope, slot, char, key)
		return err
	}
	code := func(err error) string {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) {
			return pgErr.Code
		}
		return ""
	}
	const checkViolation, uniqueViolation = "23514", "23505"

	require.NoError(t, insert("account", nil, nil, "ring-a"))
	require.NoError(t, insert("bloodline", c.SlotIndex, nil, "ring-a"))
	require.NoError(t, insert("character", nil, c.ID, "ring-a"))

	assert.Equal(t, uniqueViolation, code(insert("account", nil, nil, "ring-a")), "account grant twice")
	assert.Equal(t, uniqueViolation, code(insert("bloodline", c.SlotIndex, nil, "ring-a")), "bloodline grant twice")
	assert.Equal(t, uniqueViolation, code(insert("character", nil, c.ID, "ring-a")), "character grant twice")

	assert.Equal(t, checkViolation, code(insert("account", c.SlotIndex, nil, "x")), "account with a slot")
	assert.Equal(t, checkViolation, code(insert("bloodline", nil, nil, "x")), "bloodline without a slot")
	assert.Equal(t, checkViolation, code(insert("bloodline", c.SlotIndex, c.ID, "x")), "bloodline with a character")
	assert.Equal(t, checkViolation, code(insert("character", nil, nil, "x")), "character without a character")
	assert.Equal(t, checkViolation, code(insert("character", c.SlotIndex, c.ID, "x")), "character with a slot")
	assert.Equal(t, checkViolation, code(insert("world", nil, nil, "x")), "unknown scope")
}

// plan-appearance.md C4: a save writes the worn look into the row the next
// /select reads (characters.avatar and characters.ring).
func TestSaveCharacterWritesTheLook(t *testing.T) {
	db, ctx := freshSchema(t)
	params := character("Restyler", 0)
	params.AnonymousSecretKey = "restyle-secret"
	created, err := db.CreateCharacter(ctx, params)
	require.NoError(t, err)

	require.NoError(t, db.SaveCharacter(ctx, persist.CharacterState{
		CharacterID: created.ID, Level: 1, Portrait: "green-hood", Ring: "ring-leather",
	}))

	alive, err := db.AliveCharacter(ctx, created.AccountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, "green-hood", alive.Avatar)
	assert.Equal(t, "ring-leather", alive.Ring)
}
