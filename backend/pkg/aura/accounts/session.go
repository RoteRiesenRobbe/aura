package accounts

import (
	"errors"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// sessionStateResponse answers "who am I, and what is true of me right now".
//
// ⚑ Everything here USED TO RIDE THE CHARACTER LIST, and that was the defect
// this endpoint exists to fix: three of the four fields have nothing to do with
// characters, one caller fetched the whole list purely to read Username and
// threw the characters away, and a cold load with nobody signed in had to be
// answered with 401 — an ERROR STANDING IN FOR AN ANSWER, which the browser
// logs on every clean start and two harness scripts had to filter out.
type sessionStateResponse struct {
	// HasAccount is false for a first-ever visitor and for an identity that no
	// longer resolves. ⚑ It is the client's cue to forget any stored anonymous
	// secret: if a secret were good, this would be true.
	HasAccount bool `json:"hasAccount"`
	// Registered gates Logout and the registration nag (§5.3, §5.4).
	Registered bool   `json:"registered"`
	Username   string `json:"username,omitempty"`
	// HasProgress answers §6's "is this anonymous account worth warning about".
	// ⚑ Server-answered because inferring it from the character list is right
	// today and wrong the day sacrifice ships, when an account whose only
	// character was sacrificed still holds bloodline unlocks.
	HasProgress bool `json:"hasProgress"`
	// PlayingCharacterID is the account's live world session, 0 for none — what
	// character-select needs to stop offering Play and Delete for a character
	// that is standing in the world in another tab.
	PlayingCharacterID int64 `json:"playingCharacterId,omitempty"`
}

// handleSession answers who the caller is. It is a pure READ: no token is
// issued, no cookie is set, nothing is recorded.
//
// ⚑ IT NEVER REFUSES FOR WANT OF AN IDENTITY. "Nobody is signed in" is an
// ordinary state of the product — it is what every first-ever visitor is — so it
// is reported as a fact with a 200, not as a failed request. /session/refresh is
// the opposite by design: it mints, so it must refuse.
func (s *Server) handleSession(w http.ResponseWriter, r *http.Request) {
	who, err := s.resolveCaller(r.Context(), r)
	switch {
	case errors.Is(err, errNoIdentity):
		writeJSON(w, http.StatusOK, sessionStateResponse{})
		return
	case errors.Is(err, errSessionStale):
		// ⚑ The one thing this endpoint changes, and it only ever REMOVES a dead
		// credential. A stale cookie SHADOWS a perfectly good anonymous secret —
		// resolveCaller prefers the cookie and never reaches the header — so
		// leaving it in place would strand a returning guest behind a token that
		// can no longer work. It is unrefreshable by then either way: Keys.Refresh
		// goes through Verify, which rejects an expired token.
		s.clearSessionCookie(w)
		writeJSON(w, http.StatusOK, sessionStateResponse{})
		return
	case err != nil:
		failStore(w, r, err, "resolving the caller's identity")
		return
	}

	hasProgress, err := s.cfg.Store.HasProgress(r.Context(), who.accountID)
	if err != nil {
		failStore(w, r, err, "checking an account for progress")
		return
	}
	var playingCharacterID int64
	if live, playing := s.cfg.Sessions.Connected(who.accountID); playing {
		playingCharacterID = live.CharacterID
	}

	writeJSON(w, http.StatusOK, sessionStateResponse{
		HasAccount:         true,
		Registered:         who.registered(),
		Username:           who.username,
		HasProgress:        hasProgress,
		PlayingCharacterID: playingCharacterID,
	})
}

// anonymousSessionRequest presents a stored anonymous secret.
//
// ⚑ IN THE BODY, not a header, and that is the whole of backlog §46. A credential
// belongs in the request that spends it; putting this one on every request is
// what gave the server two ways to identify a caller.
type anonymousSessionRequest struct {
	AnonymousSecret string `json:"anonymousSecret"`
}

// handleAnonymousSession exchanges a stored anonymous secret for an ordinary
// session — the returning-guest equivalent of typing a password.
//
// ⚑ THE SECRET IS SPENT HERE AND NOWHERE ELSE. Before this endpoint it rode
// every request as an ambient credential, which put the product's least
// revocable secret into every proxy log and devtools panel, and forced
// resolveCaller to arbitrate between two identities. Now it is presented once,
// against one endpoint, and what leaves is a cookie that expires and can be
// revoked.
//
// ⚑ It is NOT behind auth.Gate. That exists to bound bcrypt concurrency, and
// there is no bcrypt here: the secret is 32 CSPRNG bytes looked up by its
// SHA-256, so it is unguessable rather than merely expensive to guess. The
// per-IP throttle still applies, because an endpoint that turns a string into a
// session should not be free to hammer.
//
// ⚑ No username axis for the throttle, deliberately. There is no account named
// until the lookup succeeds, and throttling on the presented secret would key on
// attacker-chosen input.
func (s *Server) handleAnonymousSession(w http.ResponseWriter, r *http.Request) {
	var body anonymousSessionRequest
	if !decodeBody(w, r, &body) {
		return
	}
	if body.AnonymousSecret == "" {
		refuse(w, http.StatusUnauthorized, codeNoIdentity, msgSignedOut)
		return
	}

	ip := clientIP(r)
	who, err := s.callerFromAnonymousSecret(r.Context(), body.AnonymousSecret)
	switch {
	case errors.Is(err, errSessionStale):
		// ⚑ REFUSE, never mint. A secret that names no account is a dead identity,
		// and falling through to "make a new one" would strand whatever the old
		// account held at exactly the moment the player needs to be told.
		//
		// ⚑ The client reads this refusal as permission to forget its stored
		// secret, so this branch must only be reached when the lookup genuinely
		// found nothing — a database error below must NOT arrive here.
		s.cfg.Throttle.Wait(r.Context(), ip, 0)
		s.cfg.Throttle.Fail(ip, 0)
		refuse(w, http.StatusUnauthorized, codeSessionExpired, msgSignedOut)
		return
	case err != nil:
		failStore(w, r, err, "resolving an anonymous secret")
		return
	}
	s.cfg.Throttle.Succeed(ip, 0)

	s.startSession(w, r, who.accountID, who.username, store.AuditAnonymousSession)
}

// handleRefresh is the server half of silent session refresh: a still-valid
// token is exchanged for a fresh one, so a token expiring mid-fight never throws
// a player back to a login screen.
//
// ⚑ IT IS NOT A RUBBER STAMP, and that is the difference between "silent
// refresh" and "immortal session". It applies exactly the checks a login does —
// signature, expiry, issuer, and the account's CURRENT token_generation — so a
// session logged out elsewhere, revoked, or belonging to an erased account is
// refused here too. Without that stopping condition a stolen token could be
// renewed forever with nothing able to intervene
// (implementation.md §7b, schema doc §"Session revocation").
//
// ⚑ No audit row. The audit log records account events an operator would
// investigate; a refresh is the client's own timer firing twice an hour per
// player, and logging it would bury the events that matter under it.
func (s *Server) handleRefresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		refuse(w, http.StatusUnauthorized, codeNoIdentity, msgSignedOut)
		return
	}

	// Unverified, and used only to choose whose generation to read — see
	// auth.UnverifiedAccountID. Refresh below is what decides anything.
	accountID, err := auth.UnverifiedAccountID(cookie.Value)
	if err != nil {
		s.refuseStaleSession(w)
		return
	}

	credentials, err := s.cfg.Store.CredentialsByAccount(r.Context(), accountID)
	if errors.Is(err, store.ErrNoAccount) {
		// ⚑ ERASED, not "not yet registered". Refusing is the point: reading the
		// absence as generation 0 would revive every token the account ever held.
		s.refuseStaleSession(w)
		return
	}
	if err != nil {
		failStore(w, r, err, "reading the token generation for refresh")
		return
	}

	fresh, err := s.cfg.Keys.Refresh(cookie.Value, credentials.TokenGeneration)
	if err != nil {
		s.refuseStaleSession(w)
		return
	}

	s.setSessionCookie(w, fresh)
	writeJSON(w, http.StatusOK, sessionResponse{
		Username:         credentials.Username,
		ExpiresInSeconds: int(auth.TokenLifetime.Seconds()),
	})
}

// refuseStaleSession answers a token that will never be refreshable again, and
// clears it on the way out.
//
// ⚑ Clearing matters: leaving a permanently refused token in the browser makes
// every subsequent request carry a credential that cannot work, so a client that
// retries — which §7b asks it to do, because a network blip must not log anyone
// out — would retry forever against a corpse.
func (s *Server) refuseStaleSession(w http.ResponseWriter) {
	s.clearSessionCookie(w)
	refuse(w, http.StatusUnauthorized, codeSessionExpired, msgSignedOut)
}
