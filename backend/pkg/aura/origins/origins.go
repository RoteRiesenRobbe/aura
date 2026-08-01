// Package origins holds the one origin allowlist aura's two browser-facing
// surfaces share: the WebSocket handshake's CheckOrigin, and the CORS headers on
// the credentialed /api endpoints.
//
// It is a package of its own for a single reason — ONE allowlist has to serve
// BOTH (backlog §43, implementation.md §7b). The two surfaces have no other
// relationship: pkg/aura/net knows nothing about HTTP APIs and pkg/aura/accounts
// knows nothing about WebSockets, so anywhere else the list would have had to be
// written down twice, and a second copy of a security policy is a policy that
// eventually disagrees with itself.
//
// ⚑ BOTH DEFAULTS THIS REPLACES WERE CORRECT UNTIL STEP 8a. `CheckOrigin`
// returned true for every origin and both content catalogs served
// `Access-Control-Allow-Origin: *` — right for a public, credential-free game,
// and vulnerabilities the instant a session cookie exists:
//
//   - WebSocket handshakes are NOT subject to CORS, so an open CheckOrigin means
//     any website can open a socket to aura and the browser will attach the
//     victim's cookie to the handshake (§43.1, Cross-Site WebSocket Hijacking).
//   - Browsers REJECT a wildcard origin outright on any request made with
//     `credentials: 'include'`, so the catalogs' pattern cannot be copied for the
//     auth endpoints even if one wanted to (§43.2).
//
// ⚑ The catalogs themselves keep their wildcard, deliberately: they are public
// read-only content, carry no credentials, and narrowing them would break the
// dev client for no gain.
package origins

import (
	"net/http"
	"net/url"
	"strings"
)

// Policy answers "may this origin talk to us".
//
// The zero value allows nothing, which is the right failure mode: a Policy
// somebody forgot to configure refuses browsers rather than admitting them.
type Policy struct {
	allowed map[string]bool
	// loopback admits http(s)://localhost and the loopback IPs on ANY port.
	//
	// ⚑ Gated on -dev, and it has to be: in development the client is served by
	// webpack on :2001 while aurad answers on :2000, so the ports genuinely
	// differ and cannot be enumerated up front. In production the frontend is
	// served by aurad itself, so there is exactly one real origin and no reason
	// for a loopback exception to exist.
	loopback bool
}

// New builds a policy from explicit origins plus an optional loopback
// exception. Entries are normalised (scheme + host + port, lowercased, no
// trailing slash) so an allowlist written as "https://Example.com/" still
// matches the "https://example.com" a browser actually sends.
func New(allowed []string, allowLoopback bool) *Policy {
	p := &Policy{allowed: map[string]bool{}, loopback: allowLoopback}
	for _, origin := range allowed {
		if normalised := normalise(origin); normalised != "" {
			p.allowed[normalised] = true
		}
	}
	return p
}

// Allows reports whether a specific Origin header value is permitted.
//
// ⚑ An EMPTY origin is not permitted here, and callers must not treat "no
// Origin header" as "empty origin" — see CheckRequest, where the distinction is
// the whole point.
func (p *Policy) Allows(origin string) bool {
	normalised := normalise(origin)
	if normalised == "" {
		return false
	}
	if p.allowed[normalised] {
		return true
	}
	return p.loopback && isLoopback(normalised)
}

// CheckRequest is the WebSocket upgrader's CheckOrigin.
//
// ⚑ A REQUEST WITH NO Origin HEADER IS ALLOWED, and that is not a hole. Every
// browser sends Origin on a WebSocket handshake, so an absent header means a
// non-browser client — which has no cookie jar for anyone to ride, and is
// exactly what the load-test harness and any command-line tool are. Refusing it
// would block those while blocking no attack.
func (p *Policy) CheckRequest(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	return p.Allows(origin)
}

// Origins lists the configured origins, for the boot log. An operator staring at
// a rejected connection needs to see what the server actually accepts.
func (p *Policy) Origins() []string {
	list := make([]string, 0, len(p.allowed))
	for origin := range p.allowed {
		list = append(list, origin)
	}
	return list
}

// LoopbackAllowed reports whether the dev exception is on, for the boot log.
func (p *Policy) LoopbackAllowed() bool { return p.loopback }

// normalise reduces an origin to the exact form a browser sends: lowercase
// scheme and host, explicit port preserved, nothing else. It returns "" for
// anything that is not a usable origin, including the literal "null" that
// sandboxed iframes and file:// pages send — which must never match an entry.
func normalise(origin string) string {
	origin = strings.TrimSpace(origin)
	if origin == "" || strings.EqualFold(origin, "null") {
		return ""
	}
	u, err := url.Parse(strings.TrimSuffix(origin, "/"))
	if err != nil || u.Host == "" {
		return ""
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https":
	default:
		return ""
	}
	return strings.ToLower(u.Scheme) + "://" + strings.ToLower(u.Host)
}

// isLoopback reports whether a normalised origin names this machine.
func isLoopback(normalised string) bool {
	host := normalised
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	// Strip the port, taking care with the bracketed IPv6 form.
	if strings.HasPrefix(host, "[") {
		if end := strings.Index(host, "]"); end >= 0 {
			host = host[1:end]
		}
	} else if i := strings.LastIndex(host, ":"); i >= 0 {
		host = host[:i]
	}
	switch host {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}
