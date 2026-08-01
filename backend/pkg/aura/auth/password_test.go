package auth_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

func testGate() *auth.Gate { return auth.NewGate(auth.DefaultGateSlots) }

func TestHashAndVerifyRoundTrip(t *testing.T) {
	const password = "brontosaurus!"
	gate, ctx := testGate(), context.Background()

	hash, err := gate.Hash(ctx, password)
	require.NoError(t, err)
	assert.NotContains(t, hash, password, "the hash must not carry the password")

	ok, err := gate.Verify(ctx, hash, password)
	require.NoError(t, err)
	assert.True(t, ok)

	ok, err = gate.Verify(ctx, hash, "brontosaurus")
	require.NoError(t, err)
	assert.False(t, ok, "a near miss is still a miss")

	ok, err = gate.Verify(ctx, hash, "Brontosaurus!")
	require.NoError(t, err)
	assert.False(t, ok, "passwords are case-sensitive, unlike usernames")

	// Salted, so the same password hashes differently every time — which is also
	// why a bcrypt column can never be a lookup key
	// (plan-accounts-schema.md §"Hashing: lookup keys vs. verifiers").
	second, err := gate.Hash(ctx, password)
	require.NoError(t, err)
	assert.NotEqual(t, hash, second, "bcrypt salts each hash")

	ok, err = gate.Verify(ctx, second, password)
	require.NoError(t, err)
	assert.True(t, ok)
}

// TestHashRejectsOverLongPasswords pins the backstop behind ValidatePassword.
// bcrypt TRUNCATES silently past 72 bytes, so without this a 100-character
// password and its first 72 characters are the same credential.
func TestHashRejectsOverLongPasswords(t *testing.T) {
	gate, ctx := testGate(), context.Background()
	atLimit := strings.Repeat("a", auth.MaxPasswordBytes)

	_, err := gate.Hash(ctx, atLimit)
	assert.NoError(t, err, "72 bytes is allowed")

	_, err = gate.Hash(ctx, atLimit+"a")
	assert.ErrorIs(t, err, auth.ErrPasswordTooLong)
}

// TestMissingAccountStillCostsABcryptCompare is the timing-equalisation test —
// called out in the plan as easy to regress later and worth pinning explicitly.
//
// §5b makes "no such user" and "wrong password" produce the same message. That
// is worthless if one of them returns in microseconds: the distinction is then
// readable from the response time alone, and account enumeration is back.
//
// ⚑ The threshold is deliberately loose. A regression here is not a 20 % drift,
// it is a short circuit — bcrypt at the configured cost takes hundreds of
// milliseconds and a `return false` takes nanoseconds, so anything short of
// "same order of magnitude" catches it without making the test a timing race on
// a loaded CI box.
func TestMissingAccountStillCostsABcryptCompare(t *testing.T) {
	gate, ctx := testGate(), context.Background()

	hash, err := gate.Hash(ctx, "brontosaurus!")
	require.NoError(t, err)

	start := time.Now()
	ok, err := gate.Verify(ctx, hash, "wrong password")
	require.NoError(t, err)
	assert.False(t, ok)
	wrongPassword := time.Since(start)

	start = time.Now()
	ok, err = gate.Verify(ctx, "", "wrong password")
	require.NoError(t, err)
	assert.False(t, ok, "an empty hash means no such account")
	noSuchAccount := time.Since(start)

	assert.Greater(t, noSuchAccount*2, wrongPassword,
		"the no-such-account path (%v) must cost roughly what a real comparison costs (%v), "+
			"or login timing leaks whether an account exists", noSuchAccount, wrongPassword)
}

// TestGateRefusesRatherThanQueueingForever covers the case the gate exists for:
// more logins arrive than the box can hash at once.
//
// ⚑ The assertion that matters is the SHAPE of the refusal. A full gate reports
// ErrBusy with match=false, and a handler must not read that as "wrong
// password" — doing so tells the player their credentials are bad because the
// server was busy, and burns a throttle step against them for the server's own
// load.
func TestGateRefusesRatherThanQueueingForever(t *testing.T) {
	gate := auth.NewGate(1)

	// Occupy the only slot with a real hash, then arrive with a request whose
	// deadline has already passed.
	busy := make(chan struct{})
	go func() {
		defer close(busy)
		_, _ = gate.Hash(context.Background(), "brontosaurus!")
	}()

	expired, cancel := context.WithCancel(context.Background())
	cancel()

	match, err := gate.Verify(expired, "", "brontosaurus!")
	assert.ErrorIs(t, err, auth.ErrBusy)
	assert.False(t, match, "a refusal is not a match either — but the error is what the caller must read")

	_, err = gate.Hash(expired, "brontosaurus!")
	assert.ErrorIs(t, err, auth.ErrBusy)

	<-busy
	// And the gate is reusable once the slot frees.
	_, err = gate.Hash(context.Background(), "brontosaurus!")
	assert.NoError(t, err)
}
