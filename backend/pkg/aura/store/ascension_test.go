package store_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"testing/fstest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/ascension"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/persist"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// unlockKeys reads a bloodline's unlock rows straight out of the table — the
// step-2 tests assert against SQL rather than through a reader, because the
// reader is the ticket path and lands with it.
func unlockKeys(t *testing.T, db *store.Store, accountID int64, slot int) []string {
	t.Helper()
	rows, err := db.Pool.Query(context.Background(),
		`SELECT unlock_key FROM game.bloodline_unlocks
		  WHERE account_id = $1 AND slot_index = $2 ORDER BY unlock_key`, accountID, slot)
	require.NoError(t, err)
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		require.NoError(t, rows.Scan(&key))
		keys = append(keys, key)
	}
	require.NoError(t, rows.Err())
	return keys
}

// TestAscendCharacter_SpendsTheLifeAndGrantsTheUnlock is the happy path: the
// character becomes graveyard history and its bloodline keeps the pick.
func TestAscendCharacter_SpendsTheLifeAndGrantsTheUnlock(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	slot, err := db.AscendCharacter(ctx, accountID, created.ID, "FrostShield")
	require.NoError(t, err)
	assert.Equal(t, created.SlotIndex, slot, "the transaction reports the slot it wrote")

	assert.False(t, scalar[bool](t, db.Pool,
		`SELECT sacrificed_at IS NULL FROM game.characters WHERE id = $1`, created.ID))
	assert.Equal(t, []string{"FrostShield"}, unlockKeys(t, db, accountID, created.SlotIndex))

	// ⚑ THE NAME IS NOT REWRITTEN, and that is the opposite of what deletion
	// does to the same table. Graveyard names are held forever — the memorial
	// lists them — so the two paths' name policies must stay opposite.
	assert.Equal(t, "Barney", scalar[string](t, db.Pool,
		`SELECT name FROM game.characters WHERE id = $1`, created.ID))
	_, err = db.CreateCharacter(ctx, character("Barney", accountID))
	assert.ErrorIs(t, err, store.ErrNameTaken, "a sacrificed character keeps its name out of circulation")
}

// D14: an exhausted catalog still ascends. The life is spent, no unlock row is
// written, and that commits — the pick step is SKIPPED, never refused.
func TestAscendCharacter_EmptyPickCommitsWithNoUnlockRow(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	_, err = db.AscendCharacter(ctx, accountID, created.ID, "")
	require.NoError(t, err)

	assert.False(t, scalar[bool](t, db.Pool,
		`SELECT sacrificed_at IS NULL FROM game.characters WHERE id = $1`, created.ID))
	assert.Empty(t, unlockKeys(t, db, accountID, created.SlotIndex))
}

// ⚑ THE ATOMICITY PIN, and it is a genuine abort BETWEEN the two writes rather
// than a simulated one: the unlock insert hits the bloodline_unlocks primary
// key, which is P4's no-duplicate rule enforced by the database. A
// sacrificed_at without its unlock row is a life spent for nothing, so the
// whole envelope has to roll back — and it does only while both writes share
// one transaction. Split them and this goes red.
func TestAscendCharacter_ADuplicateUnlockRollsBackTheSacrifice(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	first, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, first.ID, "FrostShield")
	require.NoError(t, err)

	second := character("Wilma", accountID)
	second.SlotIndex = &first.SlotIndex
	successor, err := db.CreateCharacter(ctx, second)
	require.NoError(t, err)

	_, err = db.AscendCharacter(ctx, accountID, successor.ID, "FrostShield")
	require.ErrorIs(t, err, store.ErrUnlockAlreadyOwned)

	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT sacrificed_at IS NULL FROM game.characters WHERE id = $1`, successor.ID),
		"the refused pick must leave the character ALIVE — a life is not spent for nothing")
	assert.Equal(t, []string{"FrostShield"}, unlockKeys(t, db, accountID, first.SlotIndex))
}

func TestAscendCharacter_RefusesASecondAscension(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	_, err = db.AscendCharacter(ctx, accountID, created.ID, "FrostShield")
	require.NoError(t, err)

	_, err = db.AscendCharacter(ctx, accountID, created.ID, "Paralyze")
	assert.ErrorIs(t, err, store.ErrNoCharacter)
	assert.Equal(t, []string{"FrostShield"}, unlockKeys(t, db, accountID, created.SlotIndex),
		"the refused second ascension grants nothing")
}

// Ownership is part of the UPDATE's WHERE clause, exactly like every other
// character write: "not yours" and "no such id" are one answer.
func TestAscendCharacter_RefusesAnotherAccountsCharacter(t *testing.T) {
	db, ctx := freshSchema(t)
	owner := newAccount(t, db, "secret-a")
	stranger := newAccount(t, db, "secret-b")
	created, err := db.CreateCharacter(ctx, character("Barney", owner))
	require.NoError(t, err)

	_, err = db.AscendCharacter(ctx, stranger, created.ID, "FrostShield")
	assert.ErrorIs(t, err, store.ErrNoCharacter)

	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT sacrificed_at IS NULL FROM game.characters WHERE id = $1`, created.ID))
	assert.Empty(t, unlockKeys(t, db, stranger, 0))
}

// The sacrificed⊕deleted CHECK must stay UNREACHABLE: a deleted character is
// not ascendable, so the row can never become ambiguously both. Reaching the
// CHECK would be a 500 where the guard should have answered ErrNoCharacter.
func TestAscendCharacter_RefusesADeletedCharacterRatherThanTrippingTheCheck(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, created.ID))

	_, err = db.AscendCharacter(ctx, accountID, created.ID, "FrostShield")
	assert.ErrorIs(t, err, store.ErrNoCharacter)
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT sacrificed_at IS NULL FROM game.characters WHERE id = $1`, created.ID))
}

// §4.7's benign reachable state: the ascension commits, the successor is never
// created, and the account simply has an empty slot with its unlock safe. It
// needs no recovery code — the tempting-and-wrong alternative is minting an
// heir inside the sacrifice transaction under a placeholder name.
func TestAscendCharacter_LeavesAHeirlessSlotThatLoadsAsEmpty(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	_, err = db.AscendCharacter(ctx, accountID, created.ID, "FrostShield")
	require.NoError(t, err)

	alive, err := db.AliveCharacters(ctx, accountID)
	require.NoError(t, err)
	assert.Empty(t, alive, "an ascended slot is simply empty")
	assert.Equal(t, []string{"FrostShield"}, unlockKeys(t, db, accountID, created.SlotIndex))

	// And the account is still worth warning about before discard — the half of
	// HasProgress that only starts mattering the day sacrifice ships.
	has, err := db.HasProgress(ctx, accountID)
	require.NoError(t, err)
	assert.True(t, has, "unlocks alone are progress")
}

// A bloodline accumulates: each ascension adds one key, and all of them survive.
func TestAscendCharacter_UnlocksAccumulateAcrossLives(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	slot := 1

	for _, step := range []struct{ name, key string }{
		{"Barney", "FrostShield"},
		{"Wilma", "Paralyze"},
		{"Betty", "Recall"},
	} {
		c := character(step.name, accountID)
		c.SlotIndex = &slot
		created, err := db.CreateCharacter(ctx, c)
		require.NoError(t, err, step.name)
		_, err = db.AscendCharacter(ctx, accountID, created.ID, step.key)
		require.NoError(t, err, step.name)
	}

	assert.Equal(t, []string{"FrostShield", "Paralyze", "Recall"}, unlockKeys(t, db, accountID, slot))
	// ⚑ Per SLOT, not per account (D3): a different slot is a different
	// bloodline and inherits none of it.
	assert.Empty(t, unlockKeys(t, db, accountID, 0))
}

// A save can still be in flight when the sacrifice commits — §4.6's teardown
// discards the reconnect stash precisely so one is never re-queued minutes
// later, but the DB is the last line and it must hold.
//
// The refusal is a terminal ErrGone drop, which the writer already knows not to
// count as a failure — so no player sees a false "your progress is not being
// saved" banner — and the graveyard row's children are left exactly as its last
// real save left them.
//
// ⚑ CORRECTION TO plan-ascension.md §7, found by mutating this pin: it says the
// child-table writes "are protected by statement order only — a reorder would
// silently rewrite a sacrificed character's children". They are NOT. Moving the
// early return below them keeps this test green, because the early return is an
// ERROR return: it skips Commit, and the deferred Rollback undoes the child
// writes with everything else. The transaction is the protection; statement
// order is an optimisation on top of it. What this pin actually guards is the
// contract — a late save against a graveyard row changes nothing and is marked
// terminal — which is the thing worth guarding anyway, and it would go red if
// those writes ever left the transaction.
func TestSaveCharacter_AgainstASacrificedRowDropsWithoutTouchingItsChildren(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	require.NoError(t, db.SaveCharacter(ctx, persist.CharacterState{
		CharacterID:    created.ID,
		Level:          30,
		ActiveAuraSlot: 0,
		Spellbook:      map[int32]int{5: 3},
		Loadout:        []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 5}},
	}))

	_, err = db.AscendCharacter(ctx, accountID, created.ID, "FrostShield")
	require.NoError(t, err)

	err = db.SaveCharacter(ctx, persist.CharacterState{
		CharacterID:    created.ID,
		Level:          1,
		ActiveAuraSlot: persist.NoActiveAura,
		Spellbook:      map[int32]int{9: 1},
		Loadout:        []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 9}},
	})
	assert.ErrorIs(t, err, store.ErrNoCharacter)
	assert.ErrorIs(t, err, persist.ErrGone,
		"a save against a sacrificed row is terminal, not a database having a bad minute")

	assert.Equal(t, 1, scalar[int](t, db.Pool,
		`SELECT count(*) FROM game.character_spellbook WHERE character_id = $1 AND skill_id = 5`, created.ID),
		"the graveyard row's spellbook must survive the doomed save")
	assert.Equal(t, 0, scalar[int](t, db.Pool,
		`SELECT count(*) FROM game.character_spellbook WHERE character_id = $1 AND skill_id = 9`, created.ID))
	assert.Equal(t, 30, scalar[int](t, db.Pool,
		`SELECT level FROM game.characters WHERE id = $1`, created.ID))
}

//---------------------------------------------------------------------------
// D15 — the heir's slot is client-chosen, and the chain is derived server-side.
//---------------------------------------------------------------------------

// Without this the whole loop misfires: ascending slot 2 while slot 0 sits empty
// would put the heir in slot 0, cut off from its bloodline, with no way to aim
// at slot 2 at all.
func TestCreateCharacter_HonoursAChosenSlot(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	slot := 2
	c := character("Barney", accountID)
	c.SlotIndex = &slot
	created, err := db.CreateCharacter(ctx, c)
	require.NoError(t, err)
	assert.Equal(t, 2, created.SlotIndex, "the chosen slot wins over the lowest free one")
}

// ⚑ The retry-once that makes concurrent creates survive the slot race must NOT
// apply here. A chosen slot that is occupied is a refusal; retrying would
// re-run lowestFreeSlot and silently drop the heir into a DIFFERENT bloodline.
func TestCreateCharacter_RefusesAnOccupiedChosenSlot(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	require.NoError(t, func() error { _, err := db.CreateCharacter(ctx, character("Barney", accountID)); return err }())

	slot := 0
	c := character("Wilma", accountID)
	c.SlotIndex = &slot
	_, err := db.CreateCharacter(ctx, c)
	assert.ErrorIs(t, err, store.ErrSlotOccupied)
	assert.Equal(t, 1, scalar[int](t, db.Pool,
		`SELECT count(*) FROM game.characters WHERE account_id = $1 AND deleted_at IS NULL AND sacrificed_at IS NULL`,
		accountID), "a refused create must not land in some other slot")
}

func TestCreateCharacter_RefusesAnOutOfRangeChosenSlot(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	for _, slot := range []int{-1, 3, 99} {
		c := character("Barney", accountID)
		c.SlotIndex = &slot
		_, err := db.CreateCharacter(ctx, c)
		assert.ErrorIs(t, err, store.ErrSlotOutOfRange, "slot %d is outside a 3-slot account", slot)
	}
}

// The succession chain, derived INSIDE the create transaction rather than sent
// by the client: the predecessor is the most recent unclaimed sacrificed row
// for that (account, slot).
func TestCreateCharacter_ChainsToTheSacrificedPredecessor(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	slot := 1
	first := character("Barney", accountID)
	first.SlotIndex = &slot
	predecessor, err := db.CreateCharacter(ctx, first)
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, predecessor.ID, "FrostShield")
	require.NoError(t, err)

	second := character("Wilma", accountID)
	second.SlotIndex = &slot
	heir, err := db.CreateCharacter(ctx, second)
	require.NoError(t, err)

	assert.Equal(t, predecessor.ID, scalar[int64](t, db.Pool,
		`SELECT previous_character_id FROM game.characters WHERE id = $1`, heir.ID))
}

// Derivation is UNCONDITIONAL — it is a property of the slot, not of how the
// slot was picked. A server-assigned create into a slot whose life was
// sacrificed chains just the same.
func TestCreateCharacter_ChainsOnAServerAssignedSlotToo(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	predecessor, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	require.Equal(t, 0, predecessor.SlotIndex)
	_, err = db.AscendCharacter(ctx, accountID, predecessor.ID, "FrostShield")
	require.NoError(t, err)

	heir, err := db.CreateCharacter(ctx, character("Wilma", accountID))
	require.NoError(t, err)
	require.Equal(t, 0, heir.SlotIndex, "slot 0 is free again and is the lowest")
	assert.Equal(t, predecessor.ID, scalar[int64](t, db.Pool,
		`SELECT previous_character_id FROM game.characters WHERE id = $1`, heir.ID))
}

// ⚑ ONE sacrifice seeds at most ONE heir, ever. Soft-deleting the heir does not
// release the claim — the row and its FK survive deletion — so the next create
// must chain to nothing rather than fight previous_character_id's UNIQUE and
// surface a constraint violation to a player.
func TestCreateCharacter_DeletingTheHeirDoesNotReleaseItsClaim(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	predecessor, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, predecessor.ID, "FrostShield")
	require.NoError(t, err)

	heir, err := db.CreateCharacter(ctx, character("Wilma", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, heir.ID))

	replacement, err := db.CreateCharacter(ctx, character("Betty", accountID))
	require.NoError(t, err, "the slot is free again and the create must not hit the chain's UNIQUE")
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT previous_character_id IS NULL FROM game.characters WHERE id = $1`, replacement.ID),
		"the predecessor is already claimed by the deleted heir")
	assert.Equal(t, heir.ID, scalar[int64](t, db.Pool,
		`SELECT id FROM game.characters WHERE previous_character_id = $1`, predecessor.ID),
		"the original chain link survives the heir's deletion")
}

// A plain deletion is not a chain event (P6-adjacent): it grants nothing and
// mints no successor, so nothing chains to it.
func TestCreateCharacter_DoesNotChainToADeletedCharacter(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	first, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, first.ID))

	second, err := db.CreateCharacter(ctx, character("Wilma", accountID))
	require.NoError(t, err)
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT previous_character_id IS NULL FROM game.characters WHERE id = $1`, second.ID))
}

// A bloodline's chain only ever links within its own slot: sacrificing slot 0
// must not adopt the next character created in slot 1.
func TestCreateCharacter_DoesNotChainAcrossSlots(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	predecessor, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, predecessor.ID, "FrostShield")
	require.NoError(t, err)

	slot := 1
	other := character("Wilma", accountID)
	other.SlotIndex = &slot
	heir, err := db.CreateCharacter(ctx, other)
	require.NoError(t, err)
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT previous_character_id IS NULL FROM game.characters WHERE id = $1`, heir.ID),
		"slot 1 is a different bloodline")
}

// TestCreateCharacter_LosesTheHeirRaceWithoutSurfacingAConstraint is the race
// the existing retry-once was built for, in the shape ascension creates: TWO
// unique constraints are violated at the same moment, not one.
//
// Two creates into a freed slot both derive the same unclaimed predecessor, so
// the loser's insert violates one_alive_character_per_slot AND
// previous_character_id's inline UNIQUE. The retry only fires for a violation
// it recognises — if the chain constraint is the one Postgres reports, an
// unmapped error reaches a player as a 500 in exactly the case the retry
// exists to absorb.
//
// ⚑ Deterministic on purpose: an uncommitted rival heir holds the row lock, so
// the create under test blocks until it is committed and then loses for
// certain. The plain concurrency version passes whether or not the two ever
// actually collide.
func TestCreateCharacter_LosesTheHeirRaceWithoutSurfacingAConstraint(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	predecessor, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, predecessor.ID, "FrostShield")
	require.NoError(t, err)

	// A rival heir, claiming both the slot and the predecessor, held open.
	rival, err := db.Pool.Begin(ctx)
	require.NoError(t, err)
	_, err = rival.Exec(ctx,
		`INSERT INTO game.characters (account_id, slot_index, name, avatar, faction, previous_character_id)
		 VALUES ($1, 0, 'Wilma', 'default', 'aligned', $2)`, accountID, predecessor.ID)
	require.NoError(t, err)

	done := make(chan struct{})
	var created store.Character
	var createErr error
	go func() {
		defer close(done)
		created, createErr = db.CreateCharacter(ctx, character("Betty", accountID))
	}()

	// The create is now blocked on the rival's row locks; let it lose.
	require.Eventually(t, func() bool {
		return scalar[int](t, db.Pool,
			`SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND state = 'active'`) > 0
	}, 5*time.Second, 20*time.Millisecond, "the second create must be waiting on the rival's lock")
	require.NoError(t, rival.Commit(ctx))
	<-done

	require.NoError(t, createErr, "losing the heir race must be retried, never surfaced")
	assert.Equal(t, 1, created.SlotIndex, "the loser takes the next free slot")
	assert.True(t, scalar[bool](t, db.Pool,
		`SELECT previous_character_id IS NULL FROM game.characters WHERE id = $1`, created.ID),
		"the predecessor belongs to the winner")
}

//---------------------------------------------------------------------------
// D16 — what a bloodline hands its next life, resolved once at /select.
//---------------------------------------------------------------------------

func TestLoadBloodline_ReturnsTheSlotsUnlocksAndAscensionCount(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	slot := 1

	for _, step := range []struct{ name, key string }{
		{"Barney", "Paralyze"},
		{"Wilma", "FrostShield"},
	} {
		c := character(step.name, accountID)
		c.SlotIndex = &slot
		created, err := db.CreateCharacter(ctx, c)
		require.NoError(t, err)
		_, err = db.AscendCharacter(ctx, accountID, created.ID, step.key)
		require.NoError(t, err)
	}

	bloodline, err := db.LoadBloodline(ctx, accountID, slot)
	require.NoError(t, err)
	assert.Equal(t, []string{"FrostShield", "Paralyze"}, bloodline.Unlocks, "sorted, so a ticket is stable")
	assert.Equal(t, 2, bloodline.Ascensions)
}

// A first life reads as a bloodline with nothing in it — not as an error, and
// not as a nil that a caller has to remember to check.
func TestLoadBloodline_IsEmptyForAFreshSlot(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	bloodline, err := db.LoadBloodline(ctx, accountID, 0)
	require.NoError(t, err)
	assert.Empty(t, bloodline.Unlocks)
	assert.Zero(t, bloodline.Ascensions)
}

// D3: a slot IS the bloodline. Neither half may leak across slots or accounts.
func TestLoadBloodline_IsScopedToOneSlotOfOneAccount(t *testing.T) {
	db, ctx := freshSchema(t)
	mine := newAccount(t, db, "secret-a")
	theirs := newAccount(t, db, "secret-b")

	first, err := db.CreateCharacter(ctx, character("Barney", mine))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, mine, first.ID, "Paralyze")
	require.NoError(t, err)

	stranger, err := db.CreateCharacter(ctx, character("Wilma", theirs))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, theirs, stranger.ID, "FrostShield")
	require.NoError(t, err)

	mineSlot0, err := db.LoadBloodline(ctx, mine, 0)
	require.NoError(t, err)
	assert.Equal(t, []string{"Paralyze"}, mineSlot0.Unlocks)
	assert.Equal(t, 1, mineSlot0.Ascensions)

	mineSlot1, err := db.LoadBloodline(ctx, mine, 1)
	require.NoError(t, err)
	assert.Empty(t, mineSlot1.Unlocks, "a different slot is a different bloodline")
	assert.Zero(t, mineSlot1.Ascensions)
}

// ⚑ Ascensions counts SACRIFICED rows, never merely gone ones. A deleted
// character is character-select housekeeping; counting it would make
// "bloodline_ascensions >= 3" reachable by creating and deleting three
// characters, which is a gate a player could farm in a minute.
func TestLoadBloodline_DoesNotCountDeletedCharactersAsAscensions(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	deleted, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, deleted.ID))

	alive, err := db.CreateCharacter(ctx, character("Wilma", accountID))
	require.NoError(t, err)

	bloodline, err := db.LoadBloodline(ctx, accountID, 0)
	require.NoError(t, err)
	assert.Zero(t, bloodline.Ascensions, "neither the deleted life nor the living one has ascended")
	_ = alive
}

//---------------------------------------------------------------------------
// C2b — what CHARACTER SELECT needs, which is not what the ticket needs.
//---------------------------------------------------------------------------

// sacrificeInto spends one life in one slot and returns the row it retired, so
// a test can name the predecessor it expects a card to advertise.
//
// ⚑ It goes through CreateCharacter, never a hand-written INSERT: the heir's
// previous_character_id is derived INSIDE that transaction (C1/D15), and a slot
// re-occupied by hand would chain to nothing and fight the column's UNIQUE.
func sacrificeInto(t *testing.T, db *store.Store, accountID int64, slot int, name, key string) store.Character {
	t.Helper()
	c := character(name, accountID)
	c.SlotIndex = &slot
	created, err := db.CreateCharacter(context.Background(), c)
	require.NoError(t, err)
	_, err = db.AscendCharacter(context.Background(), accountID, created.ID, key)
	require.NoError(t, err)
	return created
}

// TestSlotBloodlines_ReportsEveryTouchedSlotOfOneAccount is the read the
// character-select list handler makes: every slot the account has a history in,
// in one round trip, with the name the newest card should say it continues.
func TestSlotBloodlines_ReportsEveryTouchedSlotOfOneAccount(t *testing.T) {
	db, ctx := freshSchema(t)
	mine := newAccount(t, db, "secret-a")
	theirs := newAccount(t, db, "secret-b")

	sacrificeInto(t, db, mine, 1, "Barney", "Paralyze")
	sacrificeInto(t, db, mine, 1, "Wilma", "FrostShield")
	sacrificeInto(t, db, mine, 2, "Betty", "Slow")
	sacrificeInto(t, db, theirs, 1, "Fred", "Haste")

	slots, err := db.SlotBloodlines(ctx, mine)
	require.NoError(t, err)

	require.Len(t, slots, 2, "only the slots this account has spent a life in")
	assert.Equal(t, []string{"FrostShield", "Paralyze"}, slots[1].Unlocks, "sorted, like LoadBloodline's")
	assert.Equal(t, 2, slots[1].Ascensions)
	// ⚑ The MOST RECENT life, not the founder (P16): "continue the bloodline of
	// X" means the life the heir directly follows.
	assert.Equal(t, "Wilma", slots[1].PredecessorName)

	assert.Equal(t, []string{"Slow"}, slots[2].Unlocks)
	assert.Equal(t, 1, slots[2].Ascensions)
	assert.Equal(t, "Betty", slots[2].PredecessorName)

	_, touched := slots[0]
	assert.False(t, touched, "a slot with no history is absent, not a zeroed entry")
}

// ⛑ D11'S PRIVACY LANDMINE, and it bites the slot card BEFORE the memorial.
// DiscardAnonymousAccount renames every row of the account to 'deleted_' || id,
// sacrificed ones included, because names are player-authored free text and
// erasure wins. D24: the name is simply absent — the bloodline still counts its
// lives and still hands over its gifts.
func TestSlotBloodlines_OmitsAnErasedPredecessorsName(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	sacrificeInto(t, db, accountID, 0, "Barney", "Paralyze")
	require.NoError(t, db.DiscardAnonymousAccount(ctx, accountID))

	slots, err := db.SlotBloodlines(ctx, accountID)
	require.NoError(t, err)
	assert.Empty(t, slots[0].PredecessorName, "an erased name never reaches a screen")
	assert.Equal(t, []string{"Paralyze"}, slots[0].Unlocks, "what the bloodline learned is not personal data")
	assert.Equal(t, 1, slots[0].Ascensions)
}

// ⚑ THE FILTER IS EXACT-MATCH, NOT A PREFIX TEST. The rename writes
// 'deleted_' || id; ValidateCharacterName reserves the prefix since
// plan-code-health.md C7 (2026-08-14), but rows named before that are
// grandfathered on a live database — a LIKE 'deleted_%' filter would erase
// such a player from their own bloodline's card. The fixture seeds the name
// through the store directly, which is also how a pre-C7 row exists.
func TestSlotBloodlines_KeepsAPlayerAuthoredNameThatLooksErased(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	// ⚑ The decoy is load-bearing: character ids are BIGSERIAL and freshSchema
	// resets the sequence, so without it the fixture's own row IS id 1 and the
	// name it is named after matches — which would make a broken exact-match
	// filter pass. Spending a life elsewhere first pushes the id off 1.
	sacrificeInto(t, db, accountID, 1, "Decoy", "Slow")
	created := sacrificeInto(t, db, accountID, 0, "deleted_1", "Paralyze")
	require.NotEqual(t, "deleted_1", "deleted_"+fmt.Sprint(created.ID),
		"the fixture only proves anything while the name and the row's own id differ")

	slots, err := db.SlotBloodlines(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, "deleted_1", slots[0].PredecessorName)
}

// A deleted life is character-select housekeeping, not a predecessor: it never
// reached the stone, so there is nothing for an heir to continue. Same rule
// LoadBloodline's ascension count already follows.
func TestSlotBloodlines_ADeletedLifeIsNeitherAnAscensionNorAPredecessor(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	gone, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, gone.ID))

	slots, err := db.SlotBloodlines(ctx, accountID)
	require.NoError(t, err)
	assert.Empty(t, slots, "deleting three characters must not read as three ascensions")
}

// An account that has never ascended is an empty map and no error — the
// ordinary answer for everyone who has not reached the stone yet, which on any
// given day is almost everyone.
func TestSlotBloodlines_IsEmptyForAnAccountWithNoHistory(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	slots, err := db.SlotBloodlines(ctx, accountID)
	require.NoError(t, err)
	assert.Empty(t, slots)
}

// TestAscendCharacter_TheSuccessorInheritsNothingButTheBloodline is §4.8's loss
// scope, asserted rather than assumed.
//
// ⚑ C1 WRITES NO WIPE CODE, and that is exactly why this test exists. Everything
// character-bound is keyed character_id, and the successor is a NEW ROW, so the
// wipe is structural — the only way to break it is to start SEEDING one of
// these tables at creation, which is a change that would look harmless in
// review. This is the test that would go red.
//
// ⚑ The camp-standing half of §4.8 is absent because camps are unbuilt. Per the
// plan's ownership note, ascension shipping first passes that assert to camps'
// own C1, which must add it here against the already-built transaction.
func TestAscendCharacter_TheSuccessorInheritsNothingButTheBloodline(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	predecessor, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	// A life fully lived: levels, a spellbook, a loadout, quest flags, a home
	// fire and a discovered one.
	lived := persist.CharacterState{
		CharacterID:         predecessor.ID,
		Level:               30,
		Experience:          98765,
		ActiveAuraSlot:      0,
		HomeCampfireID:      "village-fire",
		DiscoveredCampfires: []string{"forest-fire", "village-fire"},
		Spellbook:           map[int32]int{5: 4},
		Loadout:             []persist.LoadoutSlot{{Type: persist.SlotAura, Index: 0, SkillID: 5}},
		Flags:               map[string]json.RawMessage{"quests": json.RawMessage(`{"the-lost-lamp":"done"}`)},
	}
	require.NoError(t, db.SaveCharacter(ctx, lived))

	_, err = db.AscendCharacter(ctx, accountID, predecessor.ID, "FrostShield")
	require.NoError(t, err)

	heir, err := db.CreateCharacter(ctx, character("Wilma", accountID))
	require.NoError(t, err)

	fresh, err := db.LoadCharacterState(ctx, accountID, heir.ID)
	require.NoError(t, err)
	assert.Equal(t, 1, fresh.Level, "a successor starts at level 1")
	assert.Zero(t, fresh.Experience)
	assert.Empty(t, fresh.Spellbook, "no spellbook — and an empty one is what protects its creation seed")
	assert.Empty(t, fresh.Loadout)
	assert.Empty(t, fresh.Flags, "the quest ledger dies with the life that earned it")
	assert.Empty(t, fresh.DiscoveredCampfires, "the map is rediscovered")
	assert.Empty(t, fresh.HomeCampfireID, "and home is wherever it first dwells")

	// ⚑ THE CONTROL: the predecessor's rows are still there. Without this, every
	// assertion above would also pass against a bug that deleted the graveyard
	// character's children — which is the opposite failure, and the one that
	// would quietly empty the memorial.
	assert.Equal(t, 1, scalar[int](t, db.Pool,
		`SELECT count(*) FROM game.character_spellbook WHERE character_id = $1`, predecessor.ID))
	assert.Equal(t, 1, scalar[int](t, db.Pool,
		`SELECT count(*) FROM game.character_flags WHERE character_id = $1`, predecessor.ID))

	// And the one thing that DOES cross: the bloodline.
	assert.Equal(t, []string{"FrostShield"}, unlockKeys(t, db, accountID, heir.SlotIndex))
}

// TestBloodlineDrivesTheCatalogFilter composes the two halves of §6's "what can
// this bloodline still learn" query: the authored catalog and the rows the
// bloodline has spent. C2 renders the result; C1 is where the two halves have
// to agree about what an unlock key IS (D17: the skill's name, one namespace).
func TestBloodlineDrivesTheCatalogFilter(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	catalog, err := ascension.CatalogFromFS(fstest.MapFS{
		"frost-shield.json": {Data: []byte(`{"unlockKey":"FrostShield"}`)},
		"paralyze.json":     {Data: []byte(`{"unlockKey":"Paralyze"}`)},
	}, catalogTestSkills{}, catalogTestGates{})
	require.NoError(t, err)

	before, err := db.LoadBloodline(ctx, accountID, 0)
	require.NoError(t, err)
	assert.Len(t, catalog.Remaining(before.Unlocks), 2, "a fresh bloodline may learn anything")

	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	_, err = db.AscendCharacter(ctx, accountID, created.ID, "FrostShield")
	require.NoError(t, err)

	after, err := db.LoadBloodline(ctx, accountID, 0)
	require.NoError(t, err)
	remaining := catalog.Remaining(after.Unlocks)
	require.Len(t, remaining, 1, "a spent pick leaves the catalog forever (P4)")
	assert.Equal(t, "Paralyze", remaining[0].UnlockKey)
}

// catalogTestSkills resolves the two names above without a skill registry —
// this test is about the KEY agreeing across the two halves, not about skills.
type catalogTestSkills struct{}

func (catalogTestSkills) GetByName(name string) (*skills.SkillDefinition, error) {
	return &skills.SkillDefinition{Name: name}, nil
}

// catalogTestGates refuses every gate reference, which is the honest stub here:
// neither entry above carries a condition, so a gate resolver that resolved
// anything would be pretending this test says something about gates. If an
// entry ever grows one, this fails loudly rather than quietly resolving it.
type catalogTestGates struct{}

func (catalogTestGates) ResolveSpecies(name string) (mobs.MobID, error) {
	return 0, fmt.Errorf("this test authors no gates, but something asked for species %q", name)
}

func (catalogTestGates) CheckQuestStage(questID, stage string) error {
	return fmt.Errorf("this test authors no gates, but something asked for quest %q at %q", questID, stage)
}

// --- the graveyard (plan-ascension.md C3 step 5, D11/D25) ---
//
// ⭐ THE FIRST GRAVEYARD QUERY ANYONE HAS WRITTEN. The data and the name policy
// have existed since step 8a (AscendCharacter deliberately does NOT rewrite the
// name, unlike SoftDeleteCharacter, precisely so the memorial can list it), but
// nothing has ever read it back.

// ascend retires a character at a level, which is what puts a name on the stone.
func ascendAt(t *testing.T, db *store.Store, accountID int64, name string, level int) int64 {
	t.Helper()
	created, err := db.CreateCharacter(context.Background(), character(name, accountID))
	require.NoError(t, err)
	_, err = db.Pool.Exec(context.Background(),
		`UPDATE game.characters SET level = $2 WHERE id = $1`, created.ID, level)
	require.NoError(t, err)
	_, err = db.AscendCharacter(context.Background(), accountID, created.ID, "")
	require.NoError(t, err)
	return created.ID
}

// D25: one global list, every account's names, newest first. P24: the name and
// the level it was laid down at, and nothing else.
func TestAscendedNames_ListsEveryAccountsNamesNewestFirst(t *testing.T) {
	db, ctx := freshSchema(t)
	a := newAccount(t, db, "secret-a")
	b := newAccount(t, db, "secret-b")

	ascendAt(t, db, a, "Aelric", 30)
	ascendAt(t, db, b, "Maren", 30)
	ascendAt(t, db, a, "Torv", 28)

	yard, err := db.AscendedNames(ctx, 25)
	require.NoError(t, err)

	require.Len(t, yard.Names, 3, "the monument is not per-account (D25)")
	assert.Equal(t, []string{"Torv", "Maren", "Aelric"},
		[]string{yard.Names[0].Name, yard.Names[1].Name, yard.Names[2].Name},
		"newest first")
	assert.Equal(t, 28, yard.Names[0].Level, "the level it was laid down at (P24)")
	assert.Equal(t, a, yard.Names[0].AccountID, "who owns it, for D25's marker")
	assert.Equal(t, 3, yard.Total)
}

// ⛑ THE D11 PRIVACY LANDMINE, AND THE PIN THAT A PREFIX FILTER WOULD FAIL.
// DiscardAnonymousAccount renames EVERY row of an account to 'deleted_' || id,
// sacrificed ones included, because names are player-authored free text and
// erasure wins. So the memorial must omit them, and it must do so by EXACT
// MATCH against the expression the rename writes, never LIKE 'deleted_%':
// ValidateCharacterName reserves the prefix only since plan-code-health.md C7
// (2026-08-14), so a pre-C7 row can genuinely carry such a name, and a prefix
// test would cut that real person off the stone.
func TestAscendedNames_OmitsErasedNamesButKeepsARealDeletedSomething(t *testing.T) {
	db, ctx := freshSchema(t)
	erased := newAccount(t, db, "secret-erased")
	real := newAccount(t, db, "secret-real")

	ascendAt(t, db, erased, "Ghost", 30)
	ascendAt(t, db, real, "deleted_something", 30)

	require.NoError(t, db.DiscardAnonymousAccount(ctx, erased))

	yard, err := db.AscendedNames(ctx, 25)
	require.NoError(t, err)

	names := []string{}
	for _, n := range yard.Names {
		names = append(names, n.Name)
	}
	assert.NotContains(t, names, "Ghost", "an erased name is not on the monument")
	assert.Contains(t, names, "deleted_something",
		"a player who genuinely named themselves that keeps their place")
	assert.Equal(t, 1, yard.Total, "the count agrees with the list it describes")
}

// The living are not on the stone, and neither are the plainly deleted: only a
// SACRIFICED row is a name the bloodline laid down.
func TestAscendedNames_ListsOnlySacrificedRows(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	alive, err := db.CreateCharacter(ctx, character("Living", accountID))
	require.NoError(t, err)
	gone, err := db.CreateCharacter(ctx, character("Quitter", accountID))
	require.NoError(t, err)
	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, gone.ID))
	ascendAt(t, db, accountID, "Spent", 30)
	_ = alive

	yard, err := db.AscendedNames(ctx, 25)
	require.NoError(t, err)
	require.Len(t, yard.Names, 1)
	assert.Equal(t, "Spent", yard.Names[0].Name)
}

// ⚑ P27: the listing is CAPPED because a generated row carries its position as a
// ubyte, so the query returns the newest N and the TOTAL: the count is what
// lets the memorial say how many names it is not showing rather than quietly
// pretending the stone is short.
func TestAscendedNames_CapsTheListButCountsThemAll(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")
	for i := 0; i < 5; i++ {
		ascendAt(t, db, accountID, fmt.Sprintf("Name%d", i), 30)
	}

	yard, err := db.AscendedNames(ctx, 2)
	require.NoError(t, err)
	assert.Len(t, yard.Names, 2, "capped")
	assert.Equal(t, 5, yard.Total, "but the stone knows how many it carries")
	assert.Equal(t, "Name4", yard.Names[0].Name, "and the cap keeps the NEWEST")
}

// An empty graveyard is the ordinary state of a fresh database, not an error:
// every world starts here, exactly as an empty catalog does (D14's sibling).
func TestAscendedNames_EmptyGraveyardIsAnAnswer(t *testing.T) {
	db, ctx := freshSchema(t)

	yard, err := db.AscendedNames(ctx, 25)
	require.NoError(t, err)
	assert.Empty(t, yard.Names)
	assert.Zero(t, yard.Total)
}
