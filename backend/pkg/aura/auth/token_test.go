package auth_test

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

// A 48-byte secret, the size the provisioning step generates.
var testSecret = []byte(strings.Repeat("s3cr3t-signing-key", 4))

func testKeys(t *testing.T, lifetime time.Duration) *auth.Keys {
	t.Helper()
	keys, err := auth.NewKeys(testSecret, lifetime)
	require.NoError(t, err)
	return keys
}

func TestIssueAndVerifyRoundTrip(t *testing.T) {
	keys := testKeys(t, auth.TokenLifetime)

	token, err := keys.Issue(42, 7)
	require.NoError(t, err)

	claims, err := keys.Verify(token, 7)
	require.NoError(t, err)
	assert.Equal(t, int64(42), claims.AccountID)
	assert.Equal(t, 7, claims.Generation)
	assert.WithinDuration(t, time.Now().Add(auth.TokenLifetime), claims.ExpiresAt, time.Minute)
}

func TestNewKeysRejectsAWeakSecret(t *testing.T) {
	_, err := auth.NewKeys([]byte("hunter2"), auth.TokenLifetime)
	require.Error(t, err)
	assert.Contains(t, err.Error(), auth.EnvJWTKey, "the error must name the variable that has to be fixed")

	_, err = auth.NewKeys(nil, auth.TokenLifetime)
	assert.Error(t, err)
}

// TestVerifyRefusesAStaleGeneration is the revocation primitive doing its job:
// a token minted before a token_generation bump is dead, even though its
// signature is perfect and it has not expired.
//
// ⚑ This is what makes logout revocation rather than a browser-local gesture. A
// JWT is self-contained, so clearing a cookie does nothing to a copy taken off
// the machine (plan-accounts-schema.md §"Session revocation").
func TestVerifyRefusesAStaleGeneration(t *testing.T) {
	keys := testKeys(t, auth.TokenLifetime)

	token, err := keys.Issue(42, 3)
	require.NoError(t, err)

	_, err = keys.Verify(token, 3)
	require.NoError(t, err, "the token is valid at the generation it was issued for")

	// The account logs out, which bumps the generation.
	_, err = keys.Verify(token, 4)
	assert.ErrorIs(t, err, auth.ErrStaleGeneration)

	// A token from the FUTURE is refused too — not a real case, but the check is
	// an equality rather than a "not older than", and a >= would let a token
	// survive a rollback of the counter.
	future, err := keys.Issue(42, 9)
	require.NoError(t, err)
	assert.ErrorIs(t, mustErr(keys.Verify(future, 4)), auth.ErrStaleGeneration)
}

func TestVerifyRefusesAnExpiredToken(t *testing.T) {
	// A negative lifetime mints a token that expired before it existed — which
	// is why the lifetime is a constructor parameter rather than a constant read
	// from inside.
	expired := testKeys(t, -time.Minute)
	token, err := expired.Issue(42, 0)
	require.NoError(t, err)

	keys := testKeys(t, auth.TokenLifetime)
	assert.ErrorIs(t, mustErr(keys.Verify(token, 0)), auth.ErrTokenExpired)
}

func TestVerifyRefusesForgeries(t *testing.T) {
	keys := testKeys(t, auth.TokenLifetime)
	valid, err := keys.Issue(42, 0)
	require.NoError(t, err)

	t.Run("a different signing key", func(t *testing.T) {
		other, err := auth.NewKeys([]byte(strings.Repeat("another-signing-key", 4)), auth.TokenLifetime)
		require.NoError(t, err)
		assert.ErrorIs(t, mustErr(other.Verify(valid, 0)), auth.ErrTokenInvalid)
	})

	t.Run("a tampered payload", func(t *testing.T) {
		parts := strings.Split(valid, ".")
		require.Len(t, parts, 3)
		assert.ErrorIs(t, mustErr(keys.Verify(parts[0]+"."+parts[1]+"x."+parts[2], 0)), auth.ErrTokenInvalid)
	})

	t.Run("not a token at all", func(t *testing.T) {
		assert.ErrorIs(t, mustErr(keys.Verify("", 0)), auth.ErrTokenInvalid)
		assert.ErrorIs(t, mustErr(keys.Verify("nonsense", 0)), auth.ErrTokenInvalid)
	})

	// ⚑ The two algorithm-confusion routes, and they are NOT closed by the same
	// thing — mutation-tested, because the obvious assumption is wrong. Deleting
	// WithValidMethods leaves the alg-none case still rejected (golang-jwt refuses
	// SigningMethodNone unless the keyfunc explicitly opts in) and lets the HS256
	// forgery straight through. So the HS256 row is the one that pins the
	// algorithm allowlist; the alg-none row pins a library behaviour aura depends
	// on but does not own.
	t.Run("alg none", func(t *testing.T) {
		forged, err := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{
			"sub": "42",
			"gen": 0,
			"iss": "aura",
			"exp": time.Now().Add(time.Hour).Unix(),
			"iat": time.Now().Unix(),
		}).SignedString(jwt.UnsafeAllowNoneSignatureType)
		require.NoError(t, err)
		assert.ErrorIs(t, mustErr(keys.Verify(forged, 0)), auth.ErrTokenInvalid)
	})

	t.Run("a weaker HMAC with the same secret", func(t *testing.T) {
		forged, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "42",
			"gen": 0,
			"iss": "aura",
			"exp": time.Now().Add(time.Hour).Unix(),
			"iat": time.Now().Unix(),
		}).SignedString(testSecret)
		require.NoError(t, err)
		assert.ErrorIs(t, mustErr(keys.Verify(forged, 0)), auth.ErrTokenInvalid)
	})

	t.Run("another service's token, same secret", func(t *testing.T) {
		forged, err := jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{
			"sub": "42",
			"gen": 0,
			"iss": "somewhere-else",
			"exp": time.Now().Add(time.Hour).Unix(),
			"iat": time.Now().Unix(),
		}).SignedString(testSecret)
		require.NoError(t, err)
		assert.ErrorIs(t, mustErr(keys.Verify(forged, 0)), auth.ErrTokenInvalid)
	})

	t.Run("no expiry at all", func(t *testing.T) {
		forged, err := jwt.NewWithClaims(jwt.SigningMethodHS512, jwt.MapClaims{
			"sub": "42",
			"gen": 0,
			"iss": "aura",
			"iat": time.Now().Unix(),
		}).SignedString(testSecret)
		require.NoError(t, err)
		assert.ErrorIs(t, mustErr(keys.Verify(forged, 0)), auth.ErrTokenInvalid,
			"a token without an expiry is an immortal session")
	})
}

// TestRefresh covers silent session refresh from both ends.
//
// ⚑ The REFUSALS are the point. The success path is obvious and will be built
// correctly; without the refusals, "silent refresh" quietly becomes "immortal
// session" — and it will look like it works
// (plan-accounts-implementation.md §7b).
func TestRefresh(t *testing.T) {
	keys := testKeys(t, auth.TokenLifetime)

	token, err := keys.Issue(42, 3)
	require.NoError(t, err)

	t.Run("a valid token renews", func(t *testing.T) {
		renewed, err := keys.Refresh(token, 3)
		require.NoError(t, err)

		claims, err := keys.Verify(renewed, 3)
		require.NoError(t, err)
		assert.Equal(t, int64(42), claims.AccountID)
		assert.Equal(t, 3, claims.Generation, "the renewed token carries the generation forward")
	})

	t.Run("a logged-out session is refused", func(t *testing.T) {
		// Logout bumped the account to generation 4.
		_, err := keys.Refresh(token, 4)
		assert.ErrorIs(t, err, auth.ErrStaleGeneration)
	})

	t.Run("an expired token is refused", func(t *testing.T) {
		expired := testKeys(t, -time.Minute)
		stale, err := expired.Issue(42, 3)
		require.NoError(t, err)

		_, err = keys.Refresh(stale, 3)
		assert.ErrorIs(t, err, auth.ErrTokenExpired, "refresh is not a resurrection")
	})

	t.Run("a forged token is refused", func(t *testing.T) {
		_, err := keys.Refresh("nonsense", 3)
		assert.ErrorIs(t, err, auth.ErrTokenInvalid)
	})
}

// mustErr discards a two-value result's value so an ErrorIs assertion reads on
// one line.
func mustErr[T any](_ T, err error) error { return err }
