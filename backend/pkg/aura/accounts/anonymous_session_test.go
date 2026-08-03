package accounts_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestTheHeaderIsNoLongerAnIdentity pins the rule this change DELETED, which is
// the one a later reader is most likely to put back.
//
// ⚑ The anonymous secret used to authenticate every ordinary request, which is
// why resolveCaller needed a precedence rule ("the JWT wins") — and that rule is
// where the 2026-08-02 logout bug lived. The secret is a RECOVERY credential
// now: it opens a session at one endpoint and means nothing anywhere else.
func TestTheHeaderIsNoLongerAnIdentity(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney Rubble").code)
	require.NotEmpty(t, h.secret)

	// A stale client: it holds the secret, has no session cookie, and ATTACHES
	// THE OLD HEADER to everything the way every client did before §46.
	//
	// ⚑ Sending it is the whole point. If this browser merely held the secret
	// without presenting it, restoring the header branch in resolveCaller would
	// leave this test green — it would be asserting that the harness stopped
	// sending a header, not that the server stopped reading one.
	returning := newBrowser(h)
	returning.secret = h.secret
	returning.sendsLegacyHeader = true

	listed := returning.do(http.MethodGet, "/api/characters", nil)
	assert.Equal(t, http.StatusUnauthorized, listed.code, "the header alone authenticates nothing")
	assert.Equal(t, "no_identity", listed.errCode())

	// ⚑ And /session reports "nobody", not "someone". Answering hasAccount here
	// would put the client straight back to trusting the header.
	session := returning.do(http.MethodGet, "/api/session", nil)
	require.Equal(t, http.StatusOK, session.code)
	assert.Equal(t, false, session.body["hasAccount"])
}

// TestExchangeTurnsASecretIntoASession is the new front door for a returning
// anonymous player.
func TestExchangeTurnsASecretIntoASession(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney Rubble").code)
	secret := h.secret

	returning := newBrowser(h)
	exchanged := returning.exchange(secret)
	require.Equal(t, http.StatusOK, exchanged.code, "%v", exchanged.body)
	assert.NotZero(t, exchanged.body["expiresInSeconds"], "the client schedules its refresh off this")
	assert.Empty(t, exchanged.str("username"), "an anonymous account has no username to report")

	// The cookie is what carries the identity from here on, and it is an
	// ORDINARY session cookie — same flags, same expiry, same revocation.
	require.Contains(t, returning.cookies, "aura_session")

	session := returning.do(http.MethodGet, "/api/session", nil)
	require.Equal(t, http.StatusOK, session.code)
	assert.Equal(t, true, session.body["hasAccount"])
	assert.Equal(t, false, session.body["registered"])
	assert.Equal(t, true, session.body["hasProgress"])

	// And it reaches the character list, which the bare secret could not.
	listed := returning.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code)
	characters, _ := listed.body["characters"].([]any)
	require.Len(t, characters, 1)
	assert.Equal(t, "Barney Rubble", characters[0].(map[string]any)["name"])
}

// TestExchangeRefusesASecretThatNamesNothing keeps the branch the creation
// endpoint used to own.
//
// ⚑ It must REFUSE, never mint. Falling through to a new account would strand
// whatever the old one held, at exactly the moment the player most needs to be
// told something went wrong — and the client reads this refusal as permission to
// forget the stored secret, so answering it wrongly destroys an account.
func TestExchangeRefusesASecretThatNamesNothing(t *testing.T) {
	h := newHarness(t)

	got := h.exchange("a-secret-that-names-nothing")
	assert.Equal(t, http.StatusUnauthorized, got.code)
	assert.Equal(t, "session_expired", got.errCode())
	assert.Equal(t, 0, scalarInt(t, h, `SELECT count(*) FROM game.accounts`), "no account was minted")
	assert.NotContains(t, h.cookies, "aura_session")
}

// TestExchangeRefusesAnEmptySecret — the body is a credential, so an absent one
// is a bad request rather than a lookup of the empty string.
func TestExchangeRefusesAnEmptySecret(t *testing.T) {
	h := newHarness(t)

	got := h.do(http.MethodPost, "/api/session/anonymous", map[string]any{"anonymousSecret": ""})
	assert.Equal(t, http.StatusUnauthorized, got.code)
	assert.Equal(t, "no_identity", got.errCode())
}

// TestCreationHandsBackBothASecretAndASession is what keeps a brand-new player
// off the exchange path entirely: they leave creation already signed in.
func TestCreationHandsBackBothASecretAndASession(t *testing.T) {
	h := newHarness(t)

	created := h.createCharacter("Barney Rubble")
	require.Equal(t, http.StatusCreated, created.code, "%v", created.body)
	assert.NotEmpty(t, created.str("anonymousSecret"), "the secret is still handed back exactly once")
	require.Contains(t, h.cookies, "aura_session", "creation now starts the session too")

	// The proof the cookie is doing the work: drop the secret and carry on.
	h.secret = ""
	listed := h.do(http.MethodGet, "/api/characters", nil)
	assert.Equal(t, http.StatusOK, listed.code)
}

// TestExchangingWhileRegisteredIsHarmless covers the leftover case §5.3 tries to
// prevent but cannot guarantee: registration deliberately leaves the anonymous
// secret in place, so a browser can still hold one.
//
// ⚑ It resolves to the SAME account — registration upgrades a row, it does not
// create a second one — so this can only ever re-open the session the player
// already had. That is why no special guard is needed here.
func TestExchangingWhileRegisteredIsHarmless(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney Rubble").code)
	require.Equal(t, http.StatusOK, h.register("barney", "quarry stone!").code)

	returning := newBrowser(h)
	got := returning.exchange(h.secret)
	require.Equal(t, http.StatusOK, got.code, "%v", got.body)

	session := returning.do(http.MethodGet, "/api/session", nil)
	assert.Equal(t, true, session.body["registered"], "it is the same account, now registered")
	assert.Equal(t, "barney", session.body["username"])
	assert.Equal(t, 1, scalarInt(t, h, `SELECT count(*) FROM game.accounts`))
}
