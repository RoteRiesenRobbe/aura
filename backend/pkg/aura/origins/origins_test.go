package origins_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/origins"
)

// TestAllowsMatchesExactOrigins is the allowlist doing its ordinary job: the
// origins that were configured, and nothing adjacent to them.
//
// ⚑ The near-misses are the point. A prefix match would admit
// "https://aura-game.duckdns.org.evil.test", and a port-blind match would admit
// anything on the same host — both are how an allowlist ends up allowing what it
// was written to exclude.
func TestAllowsMatchesExactOrigins(t *testing.T) {
	policy := origins.New([]string{"https://aura-game.duckdns.org", "https://staging.example.test:8443"}, false)

	for _, origin := range []string{
		"https://aura-game.duckdns.org",
		"HTTPS://AURA-GAME.DUCKDNS.ORG", // browsers send lowercase; be liberal anyway
		"https://aura-game.duckdns.org/",
		"https://staging.example.test:8443",
	} {
		assert.True(t, policy.Allows(origin), "%s should be allowed", origin)
	}

	for _, origin := range []string{
		"http://aura-game.duckdns.org",              // wrong scheme
		"https://aura-game.duckdns.org.evil.test",   // suffix attack
		"https://evil.test/aura-game.duckdns.org",   // path, not host
		"https://aura-game.duckdns.org:8443",        // wrong port
		"https://staging.example.test",              // port omitted
		"http://localhost:2001",                     // loopback is off here
		"null",                                      // sandboxed iframe / file://
		"",                                          // absent
		"file:///c:/tmp/index.html",                 // non-http scheme
		"ftp://aura-game.duckdns.org",               //
		"https://aura-game.duckdns.org evil.test",   // whitespace smuggling
		"https://user:pass@aura-game.duckdns.org:1", // userinfo + wrong port
	} {
		assert.False(t, policy.Allows(origin), "%s should be refused", origin)
	}
}

// TestLoopbackIsPortBlindAndOptional pins the dev exception, both halves.
//
// ⚑ It is port-blind ON PURPOSE — webpack serves the client on :2001 while aurad
// answers on :2000, so the origin cannot be enumerated up front — and it is
// gated on -dev, because in production aurad serves the client itself and there
// is exactly one real origin.
func TestLoopbackIsPortBlindAndOptional(t *testing.T) {
	dev := origins.New(nil, true)
	for _, origin := range []string{
		"http://localhost:2001",
		"http://localhost:2000",
		"http://127.0.0.1:5173",
		"https://localhost",
		"http://[::1]:2001",
	} {
		assert.True(t, dev.Allows(origin), "%s should be allowed in dev", origin)
	}
	// Names that merely LOOK like loopback are not loopback.
	for _, origin := range []string{
		"http://localhost.evil.test",
		"http://127.0.0.1.evil.test",
		"http://notlocalhost",
	} {
		assert.False(t, dev.Allows(origin), "%s is not loopback", origin)
	}

	prod := origins.New(nil, false)
	assert.False(t, prod.Allows("http://localhost:2001"), "the loopback exception must be off without -dev")
}

// TestZeroPolicyAllowsNothing pins the failure mode of a policy nobody
// configured: it refuses browsers rather than admitting them.
func TestZeroPolicyAllowsNothing(t *testing.T) {
	var zero origins.Policy
	assert.False(t, zero.Allows("https://aura-game.duckdns.org"))
	assert.False(t, zero.Allows("http://localhost:2001"))
}

// TestCheckRequestIsTheWebSocketGuard covers backlog §43.1 — the Cross-Site
// WebSocket Hijacking hole that `CheckOrigin: return true` opens the moment a
// session cookie exists.
//
// ⚑ WebSocket handshakes are NOT subject to CORS, so this function is the only
// gate on that path: no preflight and no Access-Control-* header intervenes, and
// the browser attaches the victim's cookie to a handshake any page can start.
func TestCheckRequestIsTheWebSocketGuard(t *testing.T) {
	policy := origins.New([]string{"https://aura-game.duckdns.org"}, false)

	withOrigin := func(origin string) *http.Request {
		r := httptest.NewRequest(http.MethodGet, "/game", nil)
		if origin != "" {
			r.Header.Set("Origin", origin)
		}
		return r
	}

	assert.True(t, policy.CheckRequest(withOrigin("https://aura-game.duckdns.org")))
	assert.False(t, policy.CheckRequest(withOrigin("https://evil.test")),
		"an attacker's page must not be able to open a game socket")

	// ⚑ NO Origin HEADER IS ALLOWED, and that is not a hole. Every browser sends
	// one on a WebSocket handshake, so an absent header means a non-browser
	// client — which has no cookie jar to ride. Refusing it would break the load
	// bot and every command-line tool while blocking no attack.
	assert.True(t, policy.CheckRequest(withOrigin("")),
		"a non-browser client sends no Origin and must still connect")
}
