package accounts_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/accounts"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/origins"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store/storetest"
)

// ⚑ Shares one test database with pkg/aura/store, and both roll the schema down
// and back up per test. `go test ./...` runs them in parallel, so without this
// lock each tears the other's schema out mid-run — which surfaces as "relation
// game.accounts does not exist" and reads like a broken migration.
func TestMain(m *testing.M) { os.Exit(storetest.RunSerialised(m)) }

// These tests drive the real endpoints against a real Postgres, for the same
// reason chunk 1a's do: the slot cap is a partial unique index, so the invariant
// IS the database and a fake would test the fake.
//
// ⚑ They skip when AURA_TEST_DB_URL is unset, so `go test ./...` still passes on
// a machine without Postgres — the precedent set by pkg/aura/net/net_test.go.
const testOrigin = "https://aura-game.test"

// harness is a browser: it holds cookies across requests the way one does, so
// "log in, then call something" is written the way it actually happens.
type harness struct {
	t        *testing.T
	handler  http.Handler
	db       *store.Store
	tickets  *auth.TicketStore
	sessions *auth.SessionRegistry

	cookies map[string]*http.Cookie
	// secret is the anonymous secret this "browser" holds in localStorage.
	secret string
	// remoteAddr is this client's source address. ⚑ It matters: the throttle's
	// per-IP axis is real, so two clients sharing an address share a delay — and
	// a timing measurement taken from one address would be measuring the throttle
	// rather than the thing under test.
	remoteAddr string
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	url := os.Getenv(store.EnvTestURL)
	if url == "" {
		t.Skipf("%s is not set; skipping the endpoint tests", store.EnvTestURL)
	}
	require.NoError(t, store.Rollback(url), "rolling back before the test")
	require.NoError(t, store.Migrate(url), "applying the migrations")
	t.Cleanup(func() { assert.NoError(t, store.Rollback(url), "rolling back after the test") })

	db, err := store.Open(context.Background(), url)
	require.NoError(t, err)
	t.Cleanup(db.Close)

	keys, err := auth.NewKeys([]byte(strings.Repeat("k", 48)), auth.TokenLifetime)
	require.NoError(t, err)

	h := &harness{
		t:        t,
		db:       db,
		tickets:  auth.NewTicketStore(auth.TicketTTL),
		sessions: auth.NewSessionRegistry(),
		cookies:  map[string]*http.Cookie{},
	}
	server, err := accounts.New(accounts.Config{
		Store:    db,
		Keys:     keys,
		Gate:     auth.NewGate(auth.DefaultGateSlots),
		Tickets:  h.tickets,
		Throttle: auth.NewThrottle(auth.ThrottleDecay),
		Sessions: h.sessions,
		Origins:  origins.New([]string{testOrigin}, false),

		MaxAliveCharacters: 3,
		DefaultAvatar:      "default",
		DefaultFaction:     "aligned",
	})
	require.NoError(t, err)
	h.handler = server.Handler()
	return h
}

type response struct {
	code int
	body map[string]any
}

func (r response) str(key string) string {
	s, _ := r.body[key].(string)
	return s
}

func (r response) errCode() string { return r.str("code") }

// do sends a request carrying whatever this browser currently holds.
func (h *harness) do(method, path string, body any) response {
	h.t.Helper()

	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(h.t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	r := httptest.NewRequest(method, path, reader)
	r.Header.Set("Content-Type", "application/json")
	r.Header.Set("Origin", testOrigin)
	r.RemoteAddr = h.remoteAddr
	if r.RemoteAddr == "" {
		r.RemoteAddr = "203.0.113.7:54321"
	}
	if h.secret != "" {
		r.Header.Set(accounts.AnonymousSecretHeader, h.secret)
	}
	for _, cookie := range h.cookies {
		r.AddCookie(cookie)
	}

	w := httptest.NewRecorder()
	h.handler.ServeHTTP(w, r)

	// Behave like a cookie jar, including honouring deletions — otherwise a
	// logout test would keep sending the cookie it was just told to drop, and
	// "logout works" would be untestable.
	for _, cookie := range w.Result().Cookies() {
		if cookie.MaxAge < 0 || cookie.Value == "" {
			delete(h.cookies, cookie.Name)
			continue
		}
		h.cookies[cookie.Name] = cookie
	}

	out := response{code: w.Code}
	if w.Body.Len() > 0 {
		_ = json.Unmarshal(w.Body.Bytes(), &out.body)
	}
	return out
}

// createCharacter is the common setup: create a character, remembering the
// anonymous secret the way the client would.
func (h *harness) createCharacter(name string) response {
	h.t.Helper()
	got := h.do(http.MethodPost, "/api/characters", map[string]any{"name": name})
	if secret := got.str("anonymousSecret"); secret != "" {
		h.secret = secret
	}
	return got
}

func (h *harness) characterID(got response) int64 {
	h.t.Helper()
	character, ok := got.body["character"].(map[string]any)
	require.True(h.t, ok, "response carries no character: %v", got.body)
	id, ok := character["id"].(float64)
	require.True(h.t, ok, "character carries no id: %v", character)
	return int64(id)
}

// TestAnonymousFirstCreation is the flow a first-ever player takes: no identity
// at all, one request, playing.
//
// ⚑ The raw secret appears in this response and NOWHERE ELSE, ever. The server
// stores its SHA-256, so a client that drops it has permanently lost the
// account — which is the whole argument for the registration nag.
func TestAnonymousFirstCreation(t *testing.T) {
	h := newHarness(t)

	created := h.createCharacter("Barney Rubble")
	require.Equal(t, http.StatusCreated, created.code, "%v", created.body)
	assert.NotEmpty(t, created.str("anonymousSecret"), "a new account hands back its secret once")

	listed := h.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code)
	characters, _ := listed.body["characters"].([]any)
	require.Len(t, characters, 1)
	assert.Equal(t, "Barney Rubble", characters[0].(map[string]any)["name"])
	assert.Equal(t, float64(3), listed.body["maxAliveCharacters"])
	assert.Equal(t, true, listed.body["hasProgress"])
	assert.Equal(t, false, listed.body["registered"], "creating a character does not register anyone")

	// A second character on the SAME account carries no new secret — the browser
	// already has one, and minting another would strand this account.
	second := h.createCharacter("Wilma Slaghoople")
	require.Equal(t, http.StatusCreated, second.code)
	assert.Empty(t, second.str("anonymousSecret"))
	assert.Equal(t, 1, scalarInt(t, h, `SELECT count(*) FROM game.accounts`))
}

// TestUnknownIdentityIsRefusedRatherThanReplaced pins the branch most likely to
// be written the wrong way.
//
// ⚑ A secret that no longer resolves must NOT fall through to "mint a new
// account". Doing so would silently strand whatever the old one held, at exactly
// the moment a player most needs to be told something went wrong.
func TestUnknownIdentityIsRefusedRatherThanReplaced(t *testing.T) {
	h := newHarness(t)
	h.secret = "a-secret-that-names-nothing"

	got := h.createCharacter("Barney")
	assert.Equal(t, http.StatusUnauthorized, got.code)
	assert.Equal(t, "session_expired", got.errCode())
	assert.Equal(t, 0, scalarInt(t, h, `SELECT count(*) FROM game.accounts`), "no account was minted")
}

// TestCharacterNameRules covers the validator at the endpoint, including the
// human-name rule ruled for 1c and the two conflicts that are player decisions
// rather than bugs.
func TestCharacterNameRules(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney Rubble").code)

	// ⚑ Case-insensitively unique, at the endpoint and not merely in the schema.
	taken := h.do(http.MethodPost, "/api/characters", map[string]any{"name": "barney rubble"})
	assert.Equal(t, http.StatusConflict, taken.code)
	assert.Equal(t, "name_taken", taken.errCode())
	assert.Equal(t, "That character name is taken.", taken.str("error"))

	for _, tc := range []struct{ name, value string }{
		{"too short", "Bo"},
		{"an emoji", "Bob🔥"},
		{"a doubled separator", "Barney  Rubble"},
		{"a trailing hyphen", "Barney-"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := h.do(http.MethodPost, "/api/characters", map[string]any{"name": tc.value})
			assert.Equal(t, http.StatusBadRequest, got.code)
			assert.Equal(t, "rule", got.errCode())
			// ⚑ The message is the SPECIFIC failed rule, shown verbatim — which is
			// only safe because it came from an *auth.RuleError.
			assert.NotEmpty(t, got.str("error"))
			assert.NotContains(t, got.str("error"), tc.value, "a rule message must not echo the input")
		})
	}
}

// TestSlotCapIsEnforcedAtTheEndpoint is the cap a player actually runs into.
func TestSlotCapIsEnforcedAtTheEndpoint(t *testing.T) {
	h := newHarness(t)
	for _, name := range []string{"Barney", "Wilma", "Betty"} {
		require.Equal(t, http.StatusCreated, h.createCharacter(name).code, name)
	}

	got := h.createCharacter("Tex")
	assert.Equal(t, http.StatusConflict, got.code)
	assert.Equal(t, "slots_full", got.errCode())
	assert.Equal(t, "All character slots are full.", got.str("error"))

	// Deleting one frees the slot, and the freed slot is the one reused.
	listed := h.do(http.MethodGet, "/api/characters", nil)
	characters, _ := listed.body["characters"].([]any)
	middle := int64(characters[1].(map[string]any)["id"].(float64))
	require.Equal(t, http.StatusOK, h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/delete", middle), nil).code)

	created := h.createCharacter("Tex")
	require.Equal(t, http.StatusCreated, created.code)
	assert.Equal(t, float64(1), created.body["character"].(map[string]any)["slotIndex"])
}

// TestHarnessPrefixIsReservedButUsable pins both halves of a rule whose obvious
// version is self-defeating.
//
// ⚑ A flat "reject hrnss_" would also stop the browser harness recreating its
// own characters every run, which is the entire reason the namespace exists. The
// rule is therefore conditional: a character may carry the prefix only when the
// creating account's username does — and registration rejects the prefix
// outright, so no player can ever get such a username.
func TestHarnessPrefixIsReservedButUsable(t *testing.T) {
	h := newHarness(t)

	refused := h.do(http.MethodPost, "/api/characters", map[string]any{"name": "hrnss_01_a"})
	assert.Equal(t, http.StatusBadRequest, refused.code, "anonymous callers may not claim the namespace")
	assert.Equal(t, "rule", refused.errCode())

	// A registered ordinary player cannot either.
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("player", "s3cret!pass").code)
	refused = h.do(http.MethodPost, "/api/characters", map[string]any{"name": "hrnss_01_b"})
	assert.Equal(t, http.StatusBadRequest, refused.code)

	// And registration itself refuses the prefix, which is why harness accounts
	// are SEEDED into the dev database rather than registered. (A fresh browser:
	// an already-registered caller would be refused before the name is even
	// looked at.)
	hopeful := newBrowser(h)
	require.Equal(t, http.StatusCreated, hopeful.createCharacter("Wilma").code)
	reserved := hopeful.register("hrnss_02", "s3cret!pass")
	assert.Equal(t, http.StatusBadRequest, reserved.code)
	assert.Equal(t, "rule", reserved.errCode())

	// A seeded harness account, by contrast, creates its own characters freely.
	seeded := seedHarnessAccount(t, h, "hrnss_01")
	h.cookies = map[string]*http.Cookie{}
	h.secret = seeded
	created := h.do(http.MethodPost, "/api/characters", map[string]any{"name": "hrnss_01_a"})
	assert.Equal(t, http.StatusCreated, created.code, "%v", created.body)
}

// register is the endpoint call, kept short because several tests need it.
func (h *harness) register(username, password string) response {
	h.t.Helper()
	return h.do(http.MethodPost, "/api/auth/register",
		map[string]any{"username": username, "password": password})
}

func (h *harness) login(username, password string) response {
	h.t.Helper()
	return h.do(http.MethodPost, "/api/auth/login",
		map[string]any{"username": username, "password": password})
}

// seedHarnessAccount inserts a reserved account directly, the way the dev seed
// script does — the registration endpoint refuses the name by design.
func seedHarnessAccount(t *testing.T, h *harness, username string) (secret string) {
	t.Helper()
	raw, key, err := auth.NewAnonymousSecret()
	require.NoError(t, err)

	tx, err := h.db.Pool.Begin(context.Background())
	require.NoError(t, err)
	accountID, err := store.CreateAnonymousAccount(context.Background(), tx, key)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(context.Background()))
	require.NoError(t, h.db.SetCredentials(context.Background(), accountID, username, "unused"))
	return raw
}

// TestRegisterUpgradesTheAccountInPlace is anonymous-first's payoff: signing up
// costs no progress, because it is the same account.
func TestRegisterUpgradesTheAccountInPlace(t *testing.T) {
	h := newHarness(t)
	created := h.createCharacter("Barney Rubble")
	require.Equal(t, http.StatusCreated, created.code)

	got := h.register("Barney", "s3cret!pass")
	require.Equal(t, http.StatusOK, got.code, "%v", got.body)
	assert.Equal(t, "Barney", got.str("username"))
	assert.NotZero(t, got.body["expiresInSeconds"])
	assert.NotEmpty(t, h.cookies["aura_session"], "registration starts a session")

	assert.Equal(t, 1, scalarInt(t, h, `SELECT count(*) FROM game.accounts`),
		"registration creates no second account")
	assert.Equal(t, 1, scalarInt(t, h,
		`SELECT count(*) FROM game.audit_log WHERE event = 'register'`))

	// The character is still there, now reachable by credentials too.
	h.secret = ""
	listed := h.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code)
	characters, _ := listed.body["characters"].([]any)
	require.Len(t, characters, 1, "the progress made anonymously survives registering")
	assert.Equal(t, true, listed.body["registered"])

	// Registering twice is refused rather than silently overwriting.
	assert.Equal(t, http.StatusConflict, h.register("Wilma", "s3cret!pass").code)
}

// TestUsernameTakenIsCaseInsensitive covers §5b's one accepted enumeration
// vector — a registration form has to say why it failed.
func TestUsernameTakenIsCaseInsensitive(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("bob", "s3cret!pass").code)

	// A second browser, a second anonymous account, the same username in
	// different case.
	other := newBrowser(h)
	require.Equal(t, http.StatusCreated, other.createCharacter("Wilma").code)
	got := other.register("Bob", "s3cret!pass")
	assert.Equal(t, http.StatusConflict, got.code)
	assert.Equal(t, "username_taken", got.errCode())
	assert.Equal(t, "That username is already taken.", got.str("error"))
}

// newBrowser is a second client against the same server — a different device,
// with its own cookie jar and its own localStorage.
func newBrowser(h *harness) *harness {
	return &harness{
		t: h.t, handler: h.handler, db: h.db, tickets: h.tickets, sessions: h.sessions,
		cookies: map[string]*http.Cookie{},
	}
}

// TestPasswordRulesAreEnforcedServerSide pins that the client-side check is a
// convenience and this one is the authority.
func TestPasswordRulesAreEnforcedServerSide(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)

	for _, tc := range []struct{ name, password string }{
		{"too short", "sh0rt!"},
		{"no special character", "longenoughbutplain"},
		// ⚑ The trailing-punctuation case: the special-character rule pushes users
		// to exactly this mutation, and it must fail as surely as "password" does.
		{"a blocklist entry wearing a bang", "password!"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := h.register("Barney", tc.password)
			assert.Equal(t, http.StatusBadRequest, got.code)
			assert.Equal(t, "rule", got.errCode())
			assert.NotContains(t, got.str("error"), tc.password, "never echo the password back")
		})
	}
}

// TestLoginRefusalsAreIndistinguishable is §5b's central constraint: no response
// may reveal whether an account exists.
func TestLoginRefusalsAreIndistinguishable(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	fresh := newBrowser(h)
	wrongPassword := fresh.login("barney", "wr0ng!pass")
	noSuchUser := fresh.login("nobody", "wr0ng!pass")

	assert.Equal(t, http.StatusUnauthorized, wrongPassword.code)
	assert.Equal(t, wrongPassword.code, noSuchUser.code)
	assert.Equal(t, "invalid_credentials", wrongPassword.errCode())
	assert.Equal(t, wrongPassword.errCode(), noSuchUser.errCode())
	assert.Equal(t, "Incorrect username or password.", wrongPassword.str("error"))
	assert.Equal(t, wrongPassword.str("error"), noSuchUser.str("error"))
	assert.Empty(t, fresh.cookies["aura_session"], "a refused login sets no session")

	// ⚑ And nothing is recorded. Failed logins are the one event an attacker
	// generates at will, so writing a row per attempt would make the audit table
	// an amplification target.
	assert.Equal(t, 0, scalarInt(t, h, `SELECT count(*) FROM game.audit_log WHERE event = 'login'`))
}

// TestLoginSucceedsAndIsAudited is the ordinary path.
func TestLoginSucceedsAndIsAudited(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	fresh := newBrowser(h)
	// Case-insensitive, because the username column is CITEXT and half a
	// guarantee is no guarantee.
	got := fresh.login("BARNEY", "s3cret!pass")
	require.Equal(t, http.StatusOK, got.code, "%v", got.body)
	assert.Equal(t, "barney", got.str("username"))
	assert.NotEmpty(t, fresh.cookies["aura_session"])

	listed := fresh.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code)
	characters, _ := listed.body["characters"].([]any)
	assert.Len(t, characters, 1, "the cookie alone reaches the account's characters")

	assert.Equal(t, 1, scalarInt(t, h, `SELECT count(*) FROM game.audit_log WHERE event = 'login'`))
}

// TestSessionCookieCarriesItsFlags pins the ruling that ships alongside the
// origin allowlist.
//
// ⚑ httpOnly keeps the token out of script's reach; SameSite=Lax stops it riding
// a cross-site request; Secure keeps it off plaintext. They were ruled TOGETHER
// with the CheckOrigin allowlist so that CSWSH protection never rests on
// SameSite alone — a CSRF attribute doing a job it was not designed for, which
// evaporates the day somebody sets SameSite=None to solve a CORS problem.
func TestSessionCookieCarriesItsFlags(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	cookie := h.cookies["aura_session"]
	require.NotNil(t, cookie)
	assert.True(t, cookie.HttpOnly, "the token must be out of reach of script")
	assert.True(t, cookie.Secure, "and off plaintext connections")
	assert.Equal(t, http.SameSiteLaxMode, cookie.SameSite)
	assert.Equal(t, "/", cookie.Path)
	assert.NotEmpty(t, cookie.Value)
}

// TestLogoutRevokesEveryToken is the difference between logging out and clearing
// a cookie.
//
// ⚑ A JWT is self-contained: clearing the cookie logs out THIS browser and does
// nothing to a token copied off the machine. Bumping token_generation is what
// cancels one already signed — so the test that matters is the one where a
// second browser holding the same token is refused too.
func TestLogoutRevokesEveryToken(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	// A second device holding a copy of the same session token.
	stolen := newBrowser(h)
	stolen.cookies["aura_session"] = h.cookies["aura_session"]
	require.Equal(t, http.StatusOK, stolen.do(http.MethodGet, "/api/characters", nil).code,
		"the copied token works before the logout")

	got := h.do(http.MethodPost, "/api/auth/logout", nil)
	require.Equal(t, http.StatusOK, got.code)
	assert.Empty(t, h.cookies["aura_session"], "this browser's cookie is cleared")
	assert.Equal(t, 1, scalarInt(t, h,
		`SELECT token_generation FROM game.account_credentials WHERE username = 'barney'`))

	refused := stolen.do(http.MethodGet, "/api/characters", nil)
	assert.Equal(t, http.StatusUnauthorized, refused.code, "the copied token is dead too")
	assert.Equal(t, "session_expired", refused.errCode())

	assert.Equal(t, 1, scalarInt(t, h, `SELECT count(*) FROM game.audit_log WHERE event = 'logout'`))
}

// TestRefreshRenewsButIsNotARubberStamp is the whole of silent refresh, both
// halves.
//
// ⚑ The REFUSAL is the half worth pinning. A refresh that always succeeds turns
// "never log a player out mid-fight" into "a stolen token lives forever with
// nothing able to stop it" — so refresh applies exactly the checks login does.
func TestRefreshRenewsButIsNotARubberStamp(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	got := h.do(http.MethodPost, "/api/session/refresh", nil)
	require.Equal(t, http.StatusOK, got.code, "%v", got.body)
	assert.Equal(t, "barney", got.str("username"))
	assert.NotEmpty(t, h.cookies["aura_session"])

	// A copy of the token, refreshed after the account logs out elsewhere.
	stolen := newBrowser(h)
	stolen.cookies["aura_session"] = h.cookies["aura_session"]
	require.Equal(t, http.StatusOK, h.do(http.MethodPost, "/api/auth/logout", nil).code)

	refused := stolen.do(http.MethodPost, "/api/session/refresh", nil)
	assert.Equal(t, http.StatusUnauthorized, refused.code, "a revoked session cannot renew itself")
	assert.Equal(t, "session_expired", refused.errCode())
	assert.Empty(t, stolen.cookies["aura_session"],
		"and the dead token is cleared, so a retrying client does not retry forever")

	// An erased account cannot refresh either — its credentials row is gone, so
	// there is no generation to compare against, and that must refuse rather than
	// default to zero.
	h2 := newHarness(t)
	require.Equal(t, http.StatusCreated, h2.createCharacter("Wilma").code)
	require.Equal(t, http.StatusOK, h2.register("wilma", "s3cret!pass").code)
	_, err := h2.db.Pool.Exec(context.Background(), `DELETE FROM game.account_credentials`)
	require.NoError(t, err)
	erased := h2.do(http.MethodPost, "/api/session/refresh", nil)
	assert.Equal(t, http.StatusUnauthorized, erased.code)
}

// TestSelectMintsATicketBoundToItsCharacter is the mechanism the whole
// authenticated-socket design rests on.
//
// ⚑ Ownership is proven HERE, over authenticated HTTP where the cookie
// unambiguously applies, and the character id comes OUT of the ticket. The
// socket carries no identity of its own, so a client cannot present a ticket for
// one character and ask to play another — there is nowhere to say which one.
func TestSelectMintsATicketBoundToItsCharacter(t *testing.T) {
	h := newHarness(t)
	created := h.createCharacter("Barney")
	require.Equal(t, http.StatusCreated, created.code)
	characterID := h.characterID(created)

	got := h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", characterID), nil)
	require.Equal(t, http.StatusOK, got.code, "%v", got.body)
	assert.Equal(t, float64(characterID), got.body["characterId"])
	assert.NotEmpty(t, got.str("ticket"))
	assert.Equal(t, float64(30), got.body["ticketTtlSeconds"])

	// The ticket resolves to exactly this account and character — chunk 3 is what
	// redeems one on Join, but the binding is minted here and is what makes that
	// redemption meaningful.
	ticket, err := h.tickets.Redeem(got.str("ticket"))
	require.NoError(t, err)
	assert.Equal(t, characterID, ticket.CharacterID)
	assert.NotZero(t, ticket.AccountID)

	// ⚑ The character's identity rides the ticket, and this assertion is what
	// keeps it there (PO 2026-08-01). Without it the game loop has to read the
	// database to answer a Join — a synchronous query inside a SINGLE-GOROUTINE
	// tick, for a row /select has already read a moment earlier to prove
	// ownership. Dropping these three fields would not fail any other test; it
	// would just quietly move a database round trip onto the hot path, or join
	// the player as a nameless character.
	assert.Equal(t, "Barney", ticket.Name)
	assert.NotEmpty(t, ticket.Avatar, "the avatar default must ride along too")
	assert.NotEmpty(t, ticket.Faction, "faction is NOT NULL and the game needs it at spawn")

	// Single use: a replayed ticket is worthless.
	_, err = h.tickets.Redeem(got.str("ticket"))
	assert.ErrorIs(t, err, auth.ErrTicketUnknown)
}

// TestSelectAndDeleteRefuseAnotherAccountsCharacter pins that ownership is not
// optional, on both endpoints that take an id.
//
// ⚑ Ids are BIGSERIAL — sequential and guessable — so this is the check standing
// between "I know a number" and "I play your character".
func TestSelectAndDeleteRefuseAnotherAccountsCharacter(t *testing.T) {
	h := newHarness(t)
	mine := h.createCharacter("Barney")
	require.Equal(t, http.StatusCreated, mine.code)
	characterID := h.characterID(mine)

	attacker := newBrowser(h)
	require.Equal(t, http.StatusCreated, attacker.createCharacter("Wilma").code)

	refused := attacker.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", characterID), nil)
	assert.Equal(t, http.StatusNotFound, refused.code, "not yours reads the same as not there")
	refused = attacker.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/delete", characterID), nil)
	assert.Equal(t, http.StatusNotFound, refused.code)

	// Still alive and still selectable by its owner.
	assert.Equal(t, http.StatusOK, h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", characterID), nil).code)
}

// TestSelectRefusesWhenTheAccountIsAlreadyPlaying is the "one live session per
// ACCOUNT" courtesy check.
//
// ⚑ IT IS TESTED ACROSS DIFFERENT CHARACTERS, and that is the entire point. A
// per-character implementation passes the obvious test — the same character
// twice — while happily letting one player run all three of theirs in three
// tabs. The scope is the account; which character is playing does not enter into
// it (implementation.md §5).
//
// ⚑ It is a courtesy: two tabs can call /select simultaneously and both pass,
// because a mint-time check cannot be atomic with a session that does not exist
// yet. `Join` claims the slot atomically, and chunk 3 owns that.
func TestSelectRefusesWhenTheAccountIsAlreadyPlaying(t *testing.T) {
	h := newHarness(t)
	first := h.createCharacter("Barney")
	require.Equal(t, http.StatusCreated, first.code)
	second := h.createCharacter("Wilma")
	require.Equal(t, http.StatusCreated, second.code)

	firstID, secondID := h.characterID(first), h.characterID(second)
	accountID := int64(scalarInt(t, h, `SELECT id FROM game.accounts LIMIT 1`))

	// The account enters the world as its FIRST character (what chunk 3's Join
	// will do).
	_, claimed := h.sessions.Claim(auth.Session{AccountID: accountID, CharacterID: firstID})
	require.True(t, claimed)

	refused := h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", secondID), nil)
	assert.Equal(t, http.StatusConflict, refused.code,
		"a DIFFERENT character of the same account must be refused too")
	assert.Equal(t, "already_logged_in", refused.errCode())
	assert.Equal(t, "This account is already logged in.", refused.str("error"))

	// The same character is equally refused — this is not a per-character rule.
	refused = h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", firstID), nil)
	assert.Equal(t, http.StatusConflict, refused.code)

	// Leaving the world frees it again.
	require.True(t, h.sessions.Release(accountID))
	assert.Equal(t, http.StatusOK, h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/select", secondID), nil).code)
}

// TestDeleteReleasesTheNameAndRefusesALiveCharacter covers the soft-delete
// endpoint.
func TestDeleteReleasesTheNameAndRefusesALiveCharacter(t *testing.T) {
	h := newHarness(t)
	created := h.createCharacter("Barney")
	require.Equal(t, http.StatusCreated, created.code)
	characterID := h.characterID(created)
	accountID := int64(scalarInt(t, h, `SELECT id FROM game.accounts LIMIT 1`))

	// ⚑ Refused while that character is in the world: deleting the row under a
	// live session leaves the game holding a character that no longer exists and
	// whose name has already gone to someone else.
	_, claimed := h.sessions.Claim(auth.Session{AccountID: accountID, CharacterID: characterID})
	require.True(t, claimed)
	refused := h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/delete", characterID), nil)
	assert.Equal(t, http.StatusConflict, refused.code)
	assert.Equal(t, "character_playing", refused.errCode())
	require.True(t, h.sessions.Release(accountID))

	got := h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/delete", characterID), nil)
	require.Equal(t, http.StatusOK, got.code)

	listed := h.do(http.MethodGet, "/api/characters", nil)
	characters, _ := listed.body["characters"].([]any)
	assert.Empty(t, characters)
	assert.Equal(t, false, listed.body["hasProgress"], "an emptied account has nothing to warn about")

	// The name is free immediately — which is what lets the browser harness do
	// delete-then-create and get a pristine character every run.
	assert.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)

	// A second delete of the same id finds nothing alive.
	assert.Equal(t, http.StatusNotFound,
		h.do(http.MethodPost, fmt.Sprintf("/api/characters/%d/delete", characterID), nil).code)
}

// TestLoginDiscardsTheAnonymousAccountOnlyWhenAsked covers §6's warning: the
// anonymous account is abandoned only after the player confirms it.
func TestLoginDiscardsTheAnonymousAccountOnlyWhenAsked(t *testing.T) {
	h := newHarness(t)
	// The account being logged into, made on another device.
	target := newBrowser(h)
	require.Equal(t, http.StatusCreated, target.createCharacter("Wilma").code)
	require.Equal(t, http.StatusOK, target.register("wilma", "s3cret!pass").code)

	// This browser has anonymous progress of its own.
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	anonymousSecret := h.secret

	// Logging in WITHOUT confirming leaves it alone — switching accounts must
	// never destroy the one you came from by accident.
	require.Equal(t, http.StatusOK, h.login("wilma", "s3cret!pass").code)
	credentials, err := h.db.CredentialsByAnonymousSecret(context.Background(),
		auth.AnonymousSecretKey(anonymousSecret))
	require.NoError(t, err, "the anonymous account is untouched")
	alive, err := h.db.AliveCharacters(context.Background(), credentials.AccountID)
	require.NoError(t, err)
	assert.Len(t, alive, 1)

	// Confirming discards it: characters soft-deleted, names released, the secret
	// unresolvable so it can never come back.
	again := newBrowser(h)
	again.secret = anonymousSecret
	got := again.do(http.MethodPost, "/api/auth/login",
		map[string]any{"username": "wilma", "password": "s3cret!pass", "discardAnonymous": true})
	require.Equal(t, http.StatusOK, got.code)

	_, err = h.db.CredentialsByAnonymousSecret(context.Background(), auth.AnonymousSecretKey(anonymousSecret))
	assert.ErrorIs(t, err, store.ErrNoAccount)
	assert.Equal(t, http.StatusCreated, again.do(http.MethodPost, "/api/characters",
		map[string]any{"name": "Barney"}).code, "the abandoned name is back in circulation")
}

// TestDiscardNeverTouchesTheAccountBeingLoggedInto covers the flow §6's discard
// must survive: registration LEAVES the anonymous secret in place, so a browser
// that registered and kept its local copy presents both credentials for the SAME
// account, and a discard there would erase the account the player just proved
// they own — on a bearer secret's authority alone.
//
// ⚑ WHAT ACTUALLY SAVES IT is store.DiscardAnonymousAccount's `AND username IS
// NULL`, not the handler's equality check. A mutation run removing the handler
// check left this test green, which is the finding rather than a gap: the
// account being logged into is by definition registered, so the store's guard
// catches it, and that guard IS mutation-pinned
// (TestDiscardRefusesARegisteredAccount). This test asserts the outcome; that
// one asserts the mechanism.
func TestDiscardNeverTouchesTheAccountBeingLoggedInto(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	fresh := newBrowser(h)
	fresh.secret = h.secret // the same account, by its still-valid anonymous secret
	got := fresh.do(http.MethodPost, "/api/auth/login",
		map[string]any{"username": "barney", "password": "s3cret!pass", "discardAnonymous": true})
	require.Equal(t, http.StatusOK, got.code)

	listed := fresh.do(http.MethodGet, "/api/characters", nil)
	require.Equal(t, http.StatusOK, listed.code)
	characters, _ := listed.body["characters"].([]any)
	assert.Len(t, characters, 1, "the account logged into must survive its own discard flag")
}

// TestLoginTimingDoesNotRevealWhetherAnAccountExists is the OTHER half of §5b's
// equalisation, and the half a handler can undo on its own.
//
// ⚑ Equal error messages are worthless against a stopwatch. If a missing
// username short-circuits before any password comparison, "no such user" returns
// in microseconds while "wrong password" takes a bcrypt round — and the
// distinction is readable from timing alone, at any failure count. auth.Gate
// makes the equalisation structural (pass hash == "" and it compares against a
// dummy), but a login handler that never calls it defeats that, which is exactly
// what this measures.
//
// ⚑ The two attempts come from DIFFERENT source addresses on purpose. Sharing
// one would put a throttle delay on the second and measure that instead.
func TestLoginTimingDoesNotRevealWhetherAnAccountExists(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	attempt := func(addr, username string) time.Duration {
		client := newBrowser(h)
		client.remoteAddr = addr
		started := time.Now()
		got := client.login(username, "wr0ng!pass")
		elapsed := time.Since(started)
		require.Equal(t, http.StatusUnauthorized, got.code)
		return elapsed
	}

	existing := attempt("198.51.100.1:1000", "barney")
	missing := attempt("198.51.100.2:1000", "nobody-at-all")

	// Both must actually pay for a hash. A short-circuit shows up as a
	// near-instant answer, so the floor is what catches it; the dev box measures
	// bcrypt cost 11 at ~263 ms, and 50 ms is far enough below that to survive a
	// faster machine while still being unreachable without hashing.
	assert.Greater(t, existing, 50*time.Millisecond, "an existing account costs a bcrypt round")
	assert.Greater(t, missing, 50*time.Millisecond,
		"and so must a username that names nothing — that is the dummy compare")

	// And they must cost roughly the SAME. A generous band, because this runs on
	// whatever machine CI has: the failure being guarded against is orders of
	// magnitude, not percentages.
	ratio := float64(existing) / float64(missing)
	assert.Greater(t, ratio, 0.25, "the two paths differ by more than a factor of four")
	assert.Less(t, ratio, 4.0, "the two paths differ by more than a factor of four")
}

// TestRepeatedFailuresAreThrottled pins that the progressive delay is applied at
// all, and that the first mistake is free.
//
// ⚑ The delay is applied AFTER the bcrypt comparison, never instead of it — a
// delay in place of the hash returns the moment it elapses and reopens the
// timing oracle from the other end. And it is applied BEFORE the failure is
// recorded, so an honest single typo costs nothing while a second attempt costs
// a second and it doubles from there.
//
// ⚑ No hard lockout, deliberately: a per-account lockout lets anyone who knows
// your username lock you out on purpose, which turns a defence into a griefing
// tool (GDD §9).
func TestRepeatedFailuresAreThrottled(t *testing.T) {
	h := newHarness(t)
	require.Equal(t, http.StatusCreated, h.createCharacter("Barney").code)
	require.Equal(t, http.StatusOK, h.register("barney", "s3cret!pass").code)

	client := newBrowser(h)
	client.remoteAddr = "198.51.100.9:1000"

	started := time.Now()
	require.Equal(t, http.StatusUnauthorized, client.login("barney", "wr0ng!pass").code)
	first := time.Since(started)

	started = time.Now()
	require.Equal(t, http.StatusUnauthorized, client.login("barney", "wr0ng!pass").code)
	second := time.Since(started)

	assert.Less(t, first, time.Second, "a single honest typo must not cost a wait")
	assert.GreaterOrEqual(t, second, time.Second, "a second consecutive failure waits")

	// A correct password still works — no lockout — and clears the counters.
	started = time.Now()
	require.Equal(t, http.StatusOK, client.login("barney", "s3cret!pass").code)
	assert.Less(t, time.Since(started), time.Second, "success is never delayed")
}

// scalarInt runs a one-value query against the test database.
func scalarInt(t *testing.T, h *harness, sql string, args ...any) int {
	t.Helper()
	var v int
	require.NoError(t, h.db.Pool.QueryRow(context.Background(), sql, args...).Scan(&v), sql)
	return v
}
