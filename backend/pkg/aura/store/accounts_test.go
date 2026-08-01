package store_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// TestSetCredentialsIsAnUpgrade pins the shape of registration.
//
// ⚑ AN UPDATE, NEVER AN INSERT. The account already exists — the player has been
// on it since their first character — so registering adds credentials to the row
// they were already playing, which is exactly what makes signing up cost no
// progress. Anything that inserted a second account here would orphan
// everything they had done, silently and irreversibly.
func TestSetCredentialsIsAnUpgrade(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "lookup-key")

	before, err := db.CredentialsByAccount(ctx, accountID)
	require.NoError(t, err)
	assert.False(t, before.Registered(), "an account starts anonymous but playable")

	require.NoError(t, db.SetCredentials(ctx, accountID, "Barney", "hashed"))

	after, err := db.CredentialsByAccount(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, accountID, after.AccountID, "the same account, upgraded")
	assert.Equal(t, "Barney", after.Username)
	assert.Equal(t, "hashed", after.PasswordHash)
	assert.Equal(t, 1, scalar[int](t, db.Pool, `SELECT count(*) FROM game.accounts`),
		"registration creates no second account")

	// ⚑ The anonymous secret SURVIVES registration, so a browser holding both
	// still resolves — which is why the lookup returns the whole credentials row
	// rather than a bare id, and why the login path must never assume "resolved
	// by secret" means "anonymous".
	bySecret, err := db.CredentialsByAnonymousSecret(ctx, "lookup-key")
	require.NoError(t, err)
	assert.Equal(t, accountID, bySecret.AccountID)
	assert.True(t, bySecret.Registered())

	// A second registration on the same account is refused rather than silently
	// overwriting the username someone is logging in with.
	assert.ErrorIs(t, db.SetCredentials(ctx, accountID, "Wilma", "hashed"), store.ErrAlreadyRegistered)
}

// TestUsernamesAreCaseInsensitivelyUnique is the endpoint-level half of what
// CITEXT buys: `Bob` cannot register over `bob`.
func TestUsernamesAreCaseInsensitivelyUnique(t *testing.T) {
	db, ctx := freshSchema(t)
	first := newAccount(t, db, "first")
	second := newAccount(t, db, "second")

	require.NoError(t, db.SetCredentials(ctx, first, "bob", "hashed"))
	assert.ErrorIs(t, db.SetCredentials(ctx, second, "Bob", "hashed"), store.ErrUsernameTaken)
	assert.ErrorIs(t, db.SetCredentials(ctx, second, "BOB", "hashed"), store.ErrUsernameTaken)

	// And the login lookup is case-insensitive in the same direction, or half the
	// guarantee would be decorative.
	found, err := db.CredentialsByUsername(ctx, "BoB")
	require.NoError(t, err)
	assert.Equal(t, first, found.AccountID)
}

// TestMissingCredentialsMeanErased pins the reading that keeps revocation
// honest.
//
// ⚑ No credentials row means ERASED, not "not yet registered": the row is
// INSERTED with the account and only erasure DELETEs it. A caller treating its
// absence as "generation 0" would revive every token that account ever held —
// which is the single most valuable thing an attacker could get out of an
// erasure.
func TestMissingCredentialsMeanErased(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "lookup-key")
	require.NoError(t, db.SetCredentials(ctx, accountID, "barney", "hashed"))

	// The account had a generation to compare against...
	generation, err := db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, 0, generation)

	// ...and after erasure it has none at all, on every route in.
	_, err = db.Pool.Exec(ctx, `DELETE FROM game.account_credentials WHERE account_id = $1`, accountID)
	require.NoError(t, err)

	_, err = db.TokenGeneration(ctx, accountID)
	assert.ErrorIs(t, err, store.ErrNoAccount)
	_, err = db.CredentialsByAccount(ctx, accountID)
	assert.ErrorIs(t, err, store.ErrNoAccount)
	_, err = db.CredentialsByUsername(ctx, "barney")
	assert.ErrorIs(t, err, store.ErrNoAccount, "erasure releases the username too")
	_, err = db.CredentialsByAnonymousSecret(ctx, "lookup-key")
	assert.ErrorIs(t, err, store.ErrNoAccount, "and the old secret can never resolve again")

	// The account row itself stays, so the succession chain remains intact.
	assert.Equal(t, 1, scalar[int](t, db.Pool, `SELECT count(*) FROM game.accounts WHERE id = $1`, accountID))
}

// TestHasProgress covers §6's predicate on both cases it has to tell apart.
//
// ⚑ The unlock half is what stops it rotting. Sacrifice does not exist yet, so
// today "has progress" and "has a character" agree — and the day it ships, an
// account whose only character was sacrificed would read as empty and be
// discarded silently, unlocks and all, if this only counted characters.
func TestHasProgress(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	has, err := db.HasProgress(ctx, accountID)
	require.NoError(t, err)
	assert.False(t, has, "a fresh anonymous account is empty")

	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)
	has, err = db.HasProgress(ctx, accountID)
	require.NoError(t, err)
	assert.True(t, has, "an alive character is progress")

	require.NoError(t, db.SoftDeleteCharacter(ctx, accountID, created.ID))
	has, err = db.HasProgress(ctx, accountID)
	require.NoError(t, err)
	assert.False(t, has, "a deleted character is not")

	// A bloodline unlock outlives every character in its slot — that is the whole
	// point of the table — so an account holding one is never empty.
	_, err = db.Pool.Exec(ctx,
		`INSERT INTO game.bloodline_unlocks (account_id, slot_index, unlock_key) VALUES ($1, 0, 'test')`,
		accountID)
	require.NoError(t, err)
	has, err = db.HasProgress(ctx, accountID)
	require.NoError(t, err)
	assert.True(t, has, "an unlock is progress even with no characters left")
}

// TestDiscardAnonymousAccount is §6's discard: logging into a different account
// from a browser that carries an anonymous secret, after the player confirms.
func TestDiscardAnonymousAccount(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "abandoned")
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	require.NoError(t, db.DiscardAnonymousAccount(ctx, accountID))

	// The characters are soft-deleted and their names released...
	alive, err := db.AliveCharacters(ctx, accountID)
	require.NoError(t, err)
	assert.Empty(t, alive)
	assert.NotEqual(t, "Barney", scalar[string](t, db.Pool,
		`SELECT name FROM game.characters WHERE id = $1`, created.ID))
	reclaimed, err := db.CreateCharacter(ctx, character("Barney", newAccount(t, db, "somebody-else")))
	assert.NoError(t, err, "the abandoned name goes back into circulation")
	assert.NotZero(t, reclaimed.ID)

	// ...the credentials row is gone, so the stale local secret can never resolve
	// to this account again — which is the difference between abandoning it and
	// merely walking away from it...
	_, err = db.CredentialsByAnonymousSecret(ctx, "abandoned")
	assert.ErrorIs(t, err, store.ErrNoAccount)

	// ...and the account row survives, anonymised, so nothing referencing it
	// breaks.
	assert.False(t, scalar[bool](t, db.Pool,
		`SELECT anonymised_at IS NULL FROM game.accounts WHERE id = $1`, accountID))
}

// TestDiscardRefusesARegisteredAccount pins the guard that keeps §6's discard
// from being an unauthenticated way to erase somebody.
//
// ⚑ The path is reachable from a request that names an account by a BEARER
// SECRET alone, and registration leaves that secret in place — so without this
// refusal, presenting a registered account's leftover anonymous secret while
// logging in elsewhere would wipe it.
func TestDiscardRefusesARegisteredAccount(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "still-here")
	require.NoError(t, db.SetCredentials(ctx, accountID, "barney", "hashed"))
	created, err := db.CreateCharacter(ctx, character("Barney", accountID))
	require.NoError(t, err)

	assert.ErrorIs(t, db.DiscardAnonymousAccount(ctx, accountID), store.ErrNotAnonymous)

	// Nothing moved: the credentials, the character and the name are all intact.
	credentials, err := db.CredentialsByAccount(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, "barney", credentials.Username)
	found, err := db.AliveCharacter(ctx, accountID, created.ID)
	require.NoError(t, err)
	assert.Equal(t, "Barney", found.Name)
}

// TestAuditLogRecordsSuccessesOnly is the shape of the operator's support tool.
//
// ⚑ The absence of failed logins is the designed part: an attacker generates
// those at will, so a row per attempt would turn an audit trail into an
// amplification target against the same database the autosave path uses.
func TestAuditLogRecordsSuccessesOnly(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	require.NoError(t, db.RecordAuditEvent(ctx, accountID, store.AuditRegister, "203.0.113.7"))
	require.NoError(t, db.RecordAuditEvent(ctx, accountID, store.AuditLogin, "2001:db8::1"))
	// An unknown or unparseable source must not fail the write — the row still
	// answers "did this account log in at all".
	require.NoError(t, db.RecordAuditEvent(ctx, accountID, store.AuditLogout, "not-an-ip"))
	require.NoError(t, db.RecordAuditEvent(ctx, accountID, store.AuditLogout, ""))

	assert.Equal(t, 4, scalar[int](t, db.Pool, `SELECT count(*) FROM game.audit_log WHERE account_id = $1`, accountID))
	assert.Equal(t, 2, scalar[int](t, db.Pool, `SELECT count(*) FROM game.audit_log WHERE source_ip IS NULL`),
		"an unparseable address is stored NULL rather than rejected")
	assert.Equal(t, "203.0.113.7", scalar[string](t, db.Pool,
		`SELECT host(source_ip) FROM game.audit_log WHERE event = $1`, store.AuditRegister))
}

// TestBumpTokenGenerationRevokes pins the primitive logout depends on.
func TestBumpTokenGenerationRevokes(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := newAccount(t, db, "secret")

	next, err := db.BumpTokenGeneration(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, 1, next)

	current, err := db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, 1, current, "the bump is what every later verify compares against")
}
