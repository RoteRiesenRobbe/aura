// Package accounts is the HTTP/JSON surface for identity: character CRUD,
// register/login/logout, character selection and silent session refresh — the
// eight endpoints of step 8a chunk 1c (plan-accounts-frontend.md §3).
//
// ⚑ IT DEPENDS ON store + auth + origins AND NOTHING ELSE FROM AURA. That is an
// invariant, not an accident (plan-accounts-frontend.md §10, invariant ③): it is
// what keeps moving auth to a separate machine a deploy decision rather than a
// refactor. Two related rules travel with it:
//
//   - The game server never sees a credential. No password and no JWT reaches the
//     game path; the play ticket minted here is the only thing that crosses, and
//     it proves (account, character) and nothing else.
//   - The ticket stays opaque outside package auth. Bytes in, bytes out. Nothing
//     here parses one or derives anything from it, which is what would keep a
//     later swap from an in-memory map to a signed ticket contained to one file.
//
// ⚑ The tempting violation is /select's live-session check. It stays a COURTESY —
// its purpose is telling a player at character-select rather than after
// character-select appears to have worked. `Join` remains the authority, and its
// claim has to be atomic (chunk 3), because two tabs can both pass this check.
//
// ⚑ One specified behaviour is NOT here, deliberately: logout is meant to end
// the account's live world session as well as revoke its tokens. Ending a
// session means closing a socket the game owns, and the session registry is not
// wired into sys/state.go until chunk 3 — so logout revokes, and chunk 3 makes
// it disconnect. Releasing the registry slot here without closing the socket
// would be worse than not touching it: it would free the account's slot while
// the player is still in the world, which is the one thing the registry exists
// to prevent.
package accounts

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/origins"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// maxBodyBytes bounds a request body. Every payload here is a handful of short
// strings, so this is generous by two orders of magnitude and exists only so an
// unbounded upload cannot become a cheap way to make the server allocate.
const maxBodyBytes = 4 << 10

// preflightMaxAge is how long a browser may cache a preflight result. Ten
// minutes keeps an OPTIONS round trip off every request without making an
// allowlist change take an awkwardly long time to take effect.
const preflightMaxAge = "600"

// Config is everything the endpoints need. Every field is required; New refuses
// a partial one rather than nil-panicking on the first request that needs it.
type Config struct {
	Store    *store.Store
	Keys     *auth.Keys
	Gate     *auth.Gate
	Tickets  *auth.TicketStore
	Throttle *auth.Throttle
	Sessions *auth.SessionRegistry
	Origins  *origins.Policy

	// MaxAliveCharacters is game.player.maxAliveCharacters.
	MaxAliveCharacters int

	// DefaultAvatar and DefaultFaction are [PLACEHOLDER] constants.
	//
	// ⚑ Both columns are NOT NULL and neither has a chooser: avatars are their
	// own feature (plan-avatar-system.md) and player.Faction() is hardcoded to
	// aligned, so there is no player-facing choice to record yet. Creation
	// therefore stamps a constant, and the day either picker lands it becomes a
	// request field rather than a schema change.
	DefaultAvatar  string
	DefaultFaction string
}

// Server holds the endpoints.
type Server struct {
	cfg Config
	mux *http.ServeMux
}

// New validates the wiring and builds the routes.
func New(cfg Config) (*Server, error) {
	switch {
	case cfg.Store == nil:
		return nil, errors.New("accounts: no database")
	case cfg.Keys == nil:
		return nil, errors.New("accounts: no session keys")
	case cfg.Gate == nil:
		return nil, errors.New("accounts: no password gate")
	case cfg.Tickets == nil:
		return nil, errors.New("accounts: no play-ticket store")
	case cfg.Throttle == nil:
		return nil, errors.New("accounts: no failed-login throttle")
	case cfg.Sessions == nil:
		return nil, errors.New("accounts: no session registry")
	case cfg.Origins == nil:
		return nil, errors.New("accounts: no origin allowlist")
	case cfg.MaxAliveCharacters < 1:
		return nil, fmt.Errorf("accounts: maxAliveCharacters must be at least 1, got %d", cfg.MaxAliveCharacters)
	case cfg.DefaultAvatar == "" || cfg.DefaultFaction == "":
		return nil, errors.New("accounts: characters need a default avatar and faction")
	}

	s := &Server{cfg: cfg, mux: http.NewServeMux()}
	s.mux.HandleFunc("POST /api/characters", s.handleCreateCharacter)
	s.mux.HandleFunc("GET /api/characters", s.handleListCharacters)
	s.mux.HandleFunc("POST /api/characters/{id}/delete", s.handleDeleteCharacter)
	s.mux.HandleFunc("POST /api/characters/{id}/select", s.handleSelectCharacter)
	s.mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	s.mux.HandleFunc("POST /api/auth/logout", s.handleLogout)
	s.mux.HandleFunc("POST /api/session/refresh", s.handleRefresh)
	return s, nil
}

// Handler is the whole /api subtree, CORS included. Mount it at "/api/".
func (s *Server) Handler() http.Handler {
	return s.withCORS(s.mux)
}

// withCORS applies the allowlist to every request in the subtree.
//
// ⚑ AN UNKNOWN ORIGIN IS REFUSED OUTRIGHT, not merely served without CORS
// headers. Omitting the headers stops a browser handing the RESPONSE to the
// attacker's script, but the request still executes — and a cross-site form POST
// is a "simple" request that never gets preflighted, so for a state-changing
// endpoint the refusal is the protection and the headers are only the
// convenience. Cookies are `SameSite=Lax` as well; §7b ruled both together
// precisely so neither is the only thing standing there.
//
// ⚑ A request with NO Origin header passes through. Non-browser clients (curl,
// a test, a monitoring probe) send none and carry no ambient cookie to abuse;
// browsers always send one on a cross-origin request, and on same-origin POSTs
// too. Treating absent as forbidden would break every command-line call while
// blocking nothing.
func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if !s.cfg.Origins.Allows(origin) {
				refuse(w, http.StatusForbidden, codeForbiddenOrigin, msgForbiddenOrigin)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			// ⚑ Required for a credentialed request, and the reason the catalogs'
			// wildcard cannot be copied here: a browser rejects `*` outright when
			// the request was made with `credentials: 'include'`.
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			// The response varies by Origin, so a shared cache must not serve one
			// origin's response to another.
			w.Header().Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, "+AnonymousSecretHeader)
			w.Header().Set("Access-Control-Max-Age", preflightMaxAge)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		next.ServeHTTP(w, r)
	})
}
