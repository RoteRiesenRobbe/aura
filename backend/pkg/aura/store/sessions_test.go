package store_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// seedAccount creates an account with an anonymous credentials row — the normal
// state of every account before registration.
func seedAccount(t *testing.T, db *store.Store, secret string) int64 {
	t.Helper()
	id := scalar[int64](t, db.Pool, `INSERT INTO game.accounts DEFAULT VALUES RETURNING id`)
	_, err := db.Pool.Exec(context.Background(),
		`INSERT INTO game.account_credentials (account_id, anonymous_secret_sha256) VALUES ($1, $2)`, id, secret)
	require.NoError(t, err)
	return id
}

func TestTokenGeneration(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := seedAccount(t, db, "sha-1")

	generation, err := db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, 0, generation, "a new account starts at generation 0")

	bumped, err := db.BumpTokenGeneration(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, 1, bumped)

	generation, err = db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	assert.Equal(t, 1, generation, "the bump persists")

	// An account nobody created, and an account whose credentials were erased,
	// are the same answer.
	_, err = db.TokenGeneration(ctx, 999999)
	assert.ErrorIs(t, err, store.ErrNoAccount)
	_, err = db.BumpTokenGeneration(ctx, 999999)
	assert.ErrorIs(t, err, store.ErrNoAccount)
}

// TestSessionRevocationRoundTrip walks the whole primitive against the real
// column: issue, verify, revoke, refuse.
//
// It exists because the two halves are individually convincing and jointly
// wrong if the claim and the column ever disagree — auth's own tests pass a
// generation in by hand, and the store's tests never mint a token. This is the
// one place they meet.
func TestSessionRevocationRoundTrip(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := seedAccount(t, db, "sha-2")

	keys, err := auth.NewKeys([]byte("a-signing-key-of-entirely-adequate-length"), auth.TokenLifetime)
	require.NoError(t, err)

	generation, err := db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	token, err := keys.Issue(accountID, generation)
	require.NoError(t, err)

	// Playing: the session verifies against what the database currently says.
	current, err := db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	claims, err := keys.Verify(token, current)
	require.NoError(t, err)
	assert.Equal(t, accountID, claims.AccountID)

	// Logging out bumps the generation — the point being that this kills a copy
	// of the token taken off the machine, which clearing a cookie does not.
	_, err = db.BumpTokenGeneration(ctx, accountID)
	require.NoError(t, err)

	current, err = db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	_, err = keys.Verify(token, current)
	assert.ErrorIs(t, err, auth.ErrStaleGeneration, "a logged-out token must not verify")
	_, err = keys.Refresh(token, current)
	assert.ErrorIs(t, err, auth.ErrStaleGeneration, "and must not be renewable, or logout is not revocation")

	// ⚑ ERASURE is the other refusal, and it fails differently: there is no row,
	// so there is no generation to compare against. A caller that treated a
	// missing credentials row as "generation 0" would resurrect every token an
	// erased account ever held.
	_, err = db.Pool.Exec(ctx, `DELETE FROM game.account_credentials WHERE account_id = $1`, accountID)
	require.NoError(t, err)

	_, err = db.TokenGeneration(ctx, accountID)
	assert.ErrorIs(t, err, store.ErrNoAccount, "an erased account has no generation, and the session ends there")
}

// TestRefreshCannotOutliveItsToken guards the other end of silent refresh: an
// expired token is not renewable, so the mechanism cannot turn a lapsed session
// into a permanent one.
func TestRefreshCannotOutliveItsToken(t *testing.T) {
	db, ctx := freshSchema(t)
	accountID := seedAccount(t, db, "sha-3")

	expired, err := auth.NewKeys([]byte("a-signing-key-of-entirely-adequate-length"), -time.Minute)
	require.NoError(t, err)
	stale, err := expired.Issue(accountID, 0)
	require.NoError(t, err)

	keys, err := auth.NewKeys([]byte("a-signing-key-of-entirely-adequate-length"), auth.TokenLifetime)
	require.NoError(t, err)

	generation, err := db.TokenGeneration(ctx, accountID)
	require.NoError(t, err)
	_, err = keys.Refresh(stale, generation)
	assert.ErrorIs(t, err, auth.ErrTokenExpired)
}
