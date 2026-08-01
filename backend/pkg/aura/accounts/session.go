package accounts

import (
	"errors"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

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
