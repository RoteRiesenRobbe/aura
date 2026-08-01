package accounts

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

type credentialsRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
	// DiscardAnonymous confirms §6's warning: the anonymous account whose secret
	// rides this request is abandoned as part of logging into a different one.
	//
	// ⚑ Login IGNORES the anonymous secret unless this is set. Switching accounts
	// must never destroy the one you came from by accident, and the client only
	// sets this after the player has confirmed a warning naming what is lost.
	// Login endpoint only; register upgrades the current account and destroys
	// nothing.
	DiscardAnonymous bool `json:"discardAnonymous,omitempty"`
}

type sessionResponse struct {
	Username string `json:"username"`
	// ExpiresInSeconds lets the client schedule its silent refresh at roughly
	// half the lifetime without hardcoding the server's number.
	ExpiresInSeconds int `json:"expiresInSeconds"`
}

// handleRegister attaches a username and password to the account the player is
// already using.
//
// ⚑ IT UPGRADES, IT DOES NOT CREATE. The account already exists — the player has
// been on it since they made their first character — so registration is an
// UPDATE of one row, and that is precisely what makes signing up cost no
// progress. Anything that created a second account here would silently orphan
// everything they had done.
func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body credentialsRequest
	if !decodeBody(w, r, &body) {
		return
	}
	who, ok := s.requireCaller(w, r)
	if !ok {
		return
	}
	if who.registered() {
		refuse(w, http.StatusConflict, codeAlreadyRegistered, msgAlreadyRegistered)
		return
	}

	// ⚑ Registration rejects the harness prefix outright (ValidateUsername), so
	// no player can ever claim that namespace — which is exactly why the harness
	// accounts are SEEDED into the dev database rather than registered
	// (plan-accounts-frontend.md §11).
	if err := auth.ValidateUsername(body.Username); err != nil {
		refuseRule(w, err)
		return
	}
	// The password may not simply be the username; passing it is what makes that
	// rule checkable at all.
	if err := auth.ValidatePassword(body.Password, body.Username); err != nil {
		refuseRule(w, err)
		return
	}

	hash, err := s.cfg.Gate.Hash(r.Context(), body.Password)
	if errors.Is(err, auth.ErrBusy) {
		// ⚑ Not a failure of the credentials — the hash never ran. 503, and no
		// throttle step: the server was busy, not the player wrong.
		refuse(w, http.StatusServiceUnavailable, codeBusy, msgBusy)
		return
	}
	if err != nil {
		fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, err)
		return
	}

	ip := clientIP(r)
	err = s.cfg.Store.SetCredentials(r.Context(), who.accountID, body.Username, hash)
	switch {
	case errors.Is(err, store.ErrUsernameTaken):
		// ⚑ The one message that unavoidably confirms an account exists — a
		// registration form has to say why it failed. §5b answers that with rate
		// limiting rather than ambiguity, so a taken username costs a throttle
		// step on the IP axis, the same currency a failed login costs.
		s.cfg.Throttle.Wait(r.Context(), ip, 0)
		s.cfg.Throttle.Fail(ip, 0)
		refuse(w, http.StatusConflict, codeUsernameTaken, msgUsernameTaken)
		return
	case errors.Is(err, store.ErrAlreadyRegistered):
		refuse(w, http.StatusConflict, codeAlreadyRegistered, msgAlreadyRegistered)
		return
	case err != nil:
		failStore(w, r, err, "setting credentials")
		return
	}

	s.startSession(w, r, who.accountID, body.Username, store.AuditRegister)
}

// handleLogin verifies credentials and starts a session.
func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body credentialsRequest
	if !decodeBody(w, r, &body) {
		return
	}
	ip := clientIP(r)

	// ⚑ A MISSING USERNAME MUST NOT SHORT-CIRCUIT. The lookup failing is not a
	// reason to skip the comparison — it is the reason the comparison has to
	// happen anyway, against an empty hash, so that "no such user" costs the same
	// quarter-second as "wrong password". §5b equalises the two MESSAGES, and
	// that is worthless against a stopwatch unless the timings match too
	// (implementation.md §7b).
	credentials, err := s.cfg.Store.CredentialsByUsername(r.Context(), body.Username)
	switch {
	case errors.Is(err, store.ErrNoAccount):
		credentials = store.Credentials{} // empty hash ⇒ auth.Gate.Verify runs the dummy compare
	case err != nil:
		failStore(w, r, err, "reading credentials for login")
		return
	}

	match, err := s.cfg.Gate.Verify(r.Context(), credentials.PasswordHash, body.Password)
	if errors.Is(err, auth.ErrBusy) {
		// ⚑ The comparison never happened, so this is emphatically NOT a failed
		// login. Calling Fail here would burn throttle steps against innocent
		// players for the server's own load, and tell them their password is
		// wrong while doing it.
		refuse(w, http.StatusServiceUnavailable, codeBusy, msgBusy)
		return
	}
	if err != nil {
		fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, err)
		return
	}

	if !match {
		// ⚑ WAIT COMES AFTER THE BCRYPT COMPARISON, never instead of it — a delay
		// in place of the hash returns the moment it elapses and reopens the
		// timing oracle from the other end (auth.Throttle.Wait).
		//
		// ⚑ And it comes BEFORE Fail, so the delay reflects the failures BEFORE
		// this one: a single honest typo costs nothing, the second attempt costs a
		// second, and it doubles from there. Recording first would make every
		// first mistake wait.
		s.cfg.Throttle.Wait(r.Context(), ip, credentials.AccountID)
		s.cfg.Throttle.Fail(ip, credentials.AccountID)
		refuse(w, http.StatusUnauthorized, codeInvalidLogin, msgInvalidLogin)
		return
	}

	s.cfg.Throttle.Succeed(ip, credentials.AccountID)

	// §6: abandon the anonymous account this browser was on, but only when the
	// player has confirmed it, and never the account they just logged into.
	if body.DiscardAnonymous {
		s.discardPresentedAnonymousAccount(r, credentials.AccountID)
	}

	s.startSession(w, r, credentials.AccountID, credentials.Username, store.AuditLogin)
}

// discardPresentedAnonymousAccount runs §6's discard on the anonymous secret
// this request carried, if any.
//
// ⚑ THE AUTHORITY IS store.DiscardAnonymousAccount's `AND username IS NULL`, not
// the equality check below — a mutation run proved it. Deleting the check leaves
// the "log in as yourself from a browser still holding your own old secret" case
// safe anyway, because registration leaves the anonymous secret in place, so
// that account is registered and the store refuses it. The check is an EARLY
// OUT: it skips a write that would always fail and a warning that would fire on
// a perfectly ordinary login. Do not mistake it for the guard.
//
// ⚑ Failures are logged, not surfaced. The login itself succeeded; refusing it
// because some housekeeping did not would be the worse outcome, and the leftover
// account is inert either way (its characters stay, unreachable, until an
// operator looks).
func (s *Server) discardPresentedAnonymousAccount(r *http.Request, loggedInAccountID int64) {
	secret := r.Header.Get(AnonymousSecretHeader)
	if secret == "" {
		return
	}
	credentials, err := s.cfg.Store.CredentialsByAnonymousSecret(r.Context(), auth.AnonymousSecretKey(secret))
	if err != nil {
		// Unknown secret: nothing to discard, and nothing worth reporting.
		if !errors.Is(err, store.ErrNoAccount) {
			slog.Warn("could not resolve an anonymous secret while discarding", slog.Any("err", err))
		}
		return
	}
	if credentials.AccountID == loggedInAccountID {
		return
	}
	if err := s.cfg.Store.DiscardAnonymousAccount(r.Context(), credentials.AccountID); err != nil {
		// ErrNotAnonymous is the guard doing its job on a registered account.
		slog.Warn("could not discard an anonymous account",
			slog.Int64("account_id", credentials.AccountID), slog.Any("err", err))
	}
}

// handleLogout revokes every token for the account and clears this browser's
// cookie.
//
// ⚑ THE BUMP IS THE REVOCATION. Clearing the cookie logs out this browser and
// does nothing whatsoever to a token copied off the machine — a JWT is
// self-contained, so bumping token_generation is the only thing that can cancel
// one already signed (plan-accounts-schema.md §"Session revocation").
//
// ⚑ Ending the account's live WORLD session is specified and is NOT done here —
// see the package comment. It needs the session registry wired into
// sys/state.go, which is chunk 3.
func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	who, ok := s.requireCaller(w, r)
	if !ok {
		return
	}
	if !who.viaJWT {
		// An anonymous account has no session to end. "Logging out" of one would
		// mean discarding the local secret, which is permanent abandonment wearing
		// the most routine label in software — deliberately not offered
		// (plan-accounts-frontend.md §5.3).
		refuse(w, http.StatusBadRequest, codeBadRequest, msgBadRequest)
		return
	}

	if _, err := s.cfg.Store.BumpTokenGeneration(r.Context(), who.accountID); err != nil {
		// ⚑ Clear the cookie anyway. A logout that leaves the browser holding a
		// token because a write failed is the worst of both outcomes; the token
		// stays valid either way, and at least this browser is signed out.
		s.clearSessionCookie(w)
		failStore(w, r, err, "revoking sessions on logout")
		return
	}
	s.clearSessionCookie(w)
	s.audit(r.Context(), who.accountID, store.AuditLogout, clientIP(r))
	writeJSON(w, http.StatusOK, map[string]bool{"loggedOut": true})
}

// startSession issues the token, sets the cookie and records the audit row —
// the tail both register and login share, so the two cannot drift in what a
// successful authentication does.
func (s *Server) startSession(w http.ResponseWriter, r *http.Request, accountID int64, username, event string) {
	// The generation is re-read rather than assumed: it may have been bumped
	// between this account's last logout and now, and a token stamped with a
	// stale one would be rejected by the very next request that used it.
	credentials, err := s.cfg.Store.CredentialsByAccount(r.Context(), accountID)
	if err != nil {
		failStore(w, r, err, "reading the token generation")
		return
	}
	token, err := s.cfg.Keys.Issue(accountID, credentials.TokenGeneration)
	if err != nil {
		fail(w, r, http.StatusInternalServerError, codeInternal, msgGeneric, err)
		return
	}

	s.setSessionCookie(w, token)
	s.audit(r.Context(), accountID, event, clientIP(r))
	writeJSON(w, http.StatusOK, sessionResponse{
		Username:         username,
		ExpiresInSeconds: int(auth.TokenLifetime.Seconds()),
	})
}

// audit records a SUCCESSFUL account event, and never fails the request.
//
// ⚑ A login that worked must not become a 500 because an audit insert did not —
// the player authenticated, and the support trail is the thing that degraded.
// The failure goes to the server log, which is where an operator would be
// looking for the missing row anyway.
//
// ⚑ Successes only. Failed logins are the throttle's business: they are the one
// event an attacker generates at will, so writing a row per attempt would make
// this table an amplification target (implementation.md §0).
func (s *Server) audit(ctx context.Context, accountID int64, event, ip string) {
	if err := s.cfg.Store.RecordAuditEvent(ctx, accountID, event, ip); err != nil {
		slog.Warn("could not record an audit event",
			slog.String("event", event), slog.Int64("account_id", accountID), slog.Any("err", err))
	}
}
