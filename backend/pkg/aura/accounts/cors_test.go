package accounts_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/accounts"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/origins"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// The CORS layer needs no database: every assertion below is answered before any
// handler runs, which is exactly the property being tested. So these run on
// every machine, unlike the endpoint tests.
func corsHandler(t *testing.T) http.Handler {
	t.Helper()
	keys, err := auth.NewKeys([]byte(strings.Repeat("k", 48)), auth.TokenLifetime)
	require.NoError(t, err)

	server, err := accounts.New(accounts.Config{
		// A Store value with no pool: reaching it would panic, and nothing in
		// these tests may reach it. That is the point — a refused origin must be
		// refused before a single query.
		Store:              &store.Store{},
		Keys:               keys,
		Gate:               auth.NewGate(1),
		Tickets:            auth.NewTicketStore(auth.TicketTTL),
		Throttle:           auth.NewThrottle(auth.ThrottleDecay),
		Sessions:           auth.NewSessionRegistry(),
		Origins:            origins.New([]string{"https://aura-game.test"}, false),
		MaxAliveCharacters: 3,
		DefaultAvatar:      "default",
		DefaultFaction:     "aligned",
	})
	require.NoError(t, err)
	return server.Handler()
}

func send(handler http.Handler, method, path, origin string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	if origin != "" {
		r.Header.Set("Origin", origin)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

// TestCredentialedEndpointsEchoASpecificOrigin covers backlog §43.2.
//
// ⚑ THE CATALOGS' WILDCARD CANNOT BE COPIED HERE, and that is not a style
// preference: browsers REJECT `Access-Control-Allow-Origin: *` outright on any
// request made with `credentials: 'include'`. Since the catalogs are the only
// in-repo precedent for an HTTP endpoint, copying them is the mistake this test
// exists to catch.
func TestCredentialedEndpointsEchoASpecificOrigin(t *testing.T) {
	handler := corsHandler(t)

	w := send(handler, http.MethodOptions, "/api/auth/login", "https://aura-game.test")
	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, "https://aura-game.test", w.Header().Get("Access-Control-Allow-Origin"))
	assert.NotEqual(t, "*", w.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"),
		"without this the browser discards the response of a credentialed request")
	assert.Contains(t, w.Header().Get("Vary"), "Origin",
		"the response varies by origin, so a cache must not share it across origins")

	// ⚑ The anonymous-secret header has to be preflight-approved, or every
	// cross-origin request carrying it fails — which in dev is all of them.
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), accounts.AnonymousSecretHeader)
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Headers"), "Content-Type")
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "POST")
}

// TestUnknownOriginIsRefusedOutright is the part that is protection rather than
// convenience.
//
// ⚑ Omitting the CORS headers only stops a browser handing the RESPONSE to an
// attacker's script — the request still executes, and a cross-site form POST is
// a "simple" request that is never preflighted at all. For state-changing
// endpoints the refusal is the guard; the headers are the ergonomics.
func TestUnknownOriginIsRefusedOutright(t *testing.T) {
	handler := corsHandler(t)

	for _, origin := range []string{
		"https://evil.test",
		"https://aura-game.test.evil.test",
		"http://aura-game.test",
		"null",
	} {
		t.Run(origin, func(t *testing.T) {
			w := send(handler, http.MethodPost, "/api/auth/login", origin)
			assert.Equal(t, http.StatusForbidden, w.Code)
			assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
			assert.Contains(t, w.Body.String(), "forbidden_origin")
		})
	}

	// The preflight is refused too, so a browser never even sends the real one.
	w := send(handler, http.MethodOptions, "/api/auth/login", "https://evil.test")
	assert.Equal(t, http.StatusForbidden, w.Code)
}

// TestNoOriginHeaderIsAllowedThrough pins the deliberate exception.
//
// A request with no Origin is a non-browser client — curl, a probe, a Go test —
// which carries no ambient cookie for anyone to ride. It reaches the handler,
// which then refuses it on its own merits (no identity), and that 401 rather
// than a 403 is what shows the CORS layer let it past.
func TestNoOriginHeaderIsAllowedThrough(t *testing.T) {
	handler := corsHandler(t)

	w := send(handler, http.MethodPost, "/api/session/refresh", "")
	assert.Equal(t, http.StatusUnauthorized, w.Code, "refused by the handler, not by CORS")
	assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"), "and no CORS headers to echo")
}

// TestUnroutedApiPathsDoNotLeak checks the subtree's edges: an unknown path
// under /api answers rather than falling through to the frontend file server.
func TestUnroutedApiPathsDoNotLeak(t *testing.T) {
	handler := corsHandler(t)

	assert.Equal(t, http.StatusNotFound, send(handler, http.MethodPost, "/api/nope", "https://aura-game.test").Code)
	// Right path, wrong method.
	assert.Equal(t, http.StatusMethodNotAllowed,
		send(handler, http.MethodGet, "/api/auth/login", "https://aura-game.test").Code)

	// ⚑ A malformed id answers 401, not 400 — identity is checked BEFORE the path
	// is parsed, so an unauthenticated caller learns nothing about which ids the
	// server would have accepted.
	assert.Equal(t, http.StatusUnauthorized,
		send(handler, http.MethodPost, "/api/characters/notanumber/select", "https://aura-game.test").Code)
}
