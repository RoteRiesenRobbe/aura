package accounts

import (
	"context"
	"errors"
	"net"
	"net/http"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/store"
)

// AnonymousSecretHeader is a TOMBSTONE. Nothing sends it and nothing reads it.
//
// ⚑ IT IS KEPT SO THE TESTS CAN NAME WHAT MUST NOT COME BACK (backlog §46).
// Until 2026-08-03 the anonymous secret rode this header on EVERY request, which
// made it a second way to prove who you are — so resolveCaller needed a
// precedence rule, and that rule is where the two-tab logout bug lived: with the
// browser-wide cookie cleared by another tab, a leftover localStorage entry
// silently became the identity and logout answered "That request could not be
// understood."
//
// ⚑ The secret is a RECOVERY credential, not a session credential. It is spent
// once at POST /api/session/anonymous — presented at a login endpoint, the way a
// password is — and the ordinary session cookie carries every request after
// that. Re-adding it here would restore both the precedence rule and the bug
// class, and would put the product's least revocable credential back into every
// request log, devtools panel and error report.
const AnonymousSecretHeader = "X-Aura-Anonymous-Secret"

// sessionCookieName holds the JWT.
const sessionCookieName = "aura_session"

var (
	// errNoIdentity means nothing was presented at all — a first-ever visitor.
	// Distinct from errSessionStale because the client acts on them differently:
	// this one shows the creation form, that one says the session ended.
	errNoIdentity = errors.New("accounts: no identity presented")
	// errSessionStale means something WAS presented and no longer resolves:
	// expired, revoked by a token_generation bump, erased, or an anonymous secret
	// that names no account.
	errSessionStale = errors.New("accounts: the presented identity no longer resolves")
)

// caller is who is making a request.
type caller struct {
	accountID int64
	// username is empty for an anonymous account. It is carried because the
	// harness-prefix rule needs it: a character named hrnss_* is legal only when
	// the creating account's username is too.
	username string
}

func (c caller) registered() bool { return c.username != "" }

// resolveCaller identifies the requester from the session cookie.
//
// ⚑ ONE CREDENTIAL, ONE BRANCH (backlog §46). This used to fall back to the
// anonymous-secret header, which meant the server had two ways to be told who
// you are and therefore needed a precedence rule between them. Deleting the
// second way deletes the rule, and with it the whole class of bug where a stale
// localStorage entry answers for a request the cookie should have owned.
//
// ⚑ Anonymous players are NOT an exception any more: they hold an ordinary
// session too, issued by character creation or by the exchange endpoint. That is
// what makes this a single branch rather than a shorter version of the old one.
func (s *Server) resolveCaller(ctx context.Context, r *http.Request) (caller, error) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || cookie.Value == "" {
		return caller{}, errNoIdentity
	}
	return s.callerFromToken(ctx, cookie.Value)
}

// callerFromToken verifies a session token against the account's CURRENT
// token_generation.
//
// ⚑ The generation is read from the database on every request, and that is the
// point of the whole mechanism: a JWT is self-contained, so without this
// comparison the server has no way to cancel a token it has already signed.
// Logout bumps the number; every token issued before the bump then fails here.
//
// ⚑ A MISSING CREDENTIALS ROW IS A REFUSAL, never "generation 0". Absence means
// ERASED — the row is inserted with the account and only erasure removes it — so
// reading it as a default would resurrect every token that account ever held.
func (s *Server) callerFromToken(ctx context.Context, token string) (caller, error) {
	// ⚑ Unverified, and used for exactly one thing: choosing whose generation to
	// read. Verify below is what actually decides anything, and it is handed the
	// id IT parsed, not this one.
	unverifiedID, err := auth.UnverifiedAccountID(token)
	if err != nil {
		return caller{}, errSessionStale
	}

	credentials, err := s.cfg.Store.CredentialsByAccount(ctx, unverifiedID)
	if errors.Is(err, store.ErrNoAccount) {
		return caller{}, errSessionStale
	}
	if err != nil {
		return caller{}, err
	}

	claims, err := s.cfg.Keys.Verify(token, credentials.TokenGeneration)
	if err != nil {
		return caller{}, errSessionStale
	}
	return caller{accountID: claims.AccountID, username: credentials.Username}, nil
}

// callerFromAnonymousSecret resolves the localStorage secret.
//
// The raw secret is hashed here and never travels further: store sees a lookup
// key, and nothing below this line could log the token even by accident.
//
// ⚑ ONE CALLER, AND THAT IS THE POINT: handleAnonymousSession. This is no longer
// part of resolving an ordinary request — it is the lookup behind a login-shaped
// endpoint, in the same position CredentialsByUsername occupies for a password.
func (s *Server) callerFromAnonymousSecret(ctx context.Context, secret string) (caller, error) {
	credentials, err := s.cfg.Store.CredentialsByAnonymousSecret(ctx, auth.AnonymousSecretKey(secret))
	if errors.Is(err, store.ErrNoAccount) {
		return caller{}, errSessionStale
	}
	if err != nil {
		return caller{}, err
	}
	return caller{accountID: credentials.AccountID, username: credentials.Username}, nil
}

// requireCaller resolves an identity or writes the refusal itself, returning ok
// so the handler can simply return.
func (s *Server) requireCaller(w http.ResponseWriter, r *http.Request) (caller, bool) {
	who, err := s.resolveCaller(r.Context(), r)
	switch {
	case errors.Is(err, errNoIdentity):
		refuse(w, http.StatusUnauthorized, codeNoIdentity, msgSignedOut)
		return caller{}, false
	case errors.Is(err, errSessionStale):
		refuse(w, http.StatusUnauthorized, codeSessionExpired, msgSignedOut)
		return caller{}, false
	case err != nil:
		failStore(w, r, err, "resolving the caller's identity")
		return caller{}, false
	}
	return who, true
}

// setSessionCookie writes the JWT.
//
// ⚑ THE FLAGS ARE THE RULING, not defaults: httpOnly keeps the token out of
// reach of script (which is what makes an XSS a smaller problem than it would
// otherwise be), Secure keeps it off plaintext connections, and SameSite=Lax
// stops it riding a cross-site request. They ship in the same chunk as the
// CheckOrigin allowlist deliberately — with the cookie first, CSWSH protection
// would rest on SameSite alone, which is a CSRF attribute doing a job it was
// never designed for and which evaporates the day someone sets SameSite=None to
// solve a CORS problem (implementation.md §7b).
//
// ⚑ Secure is UNCONDITIONAL, including in dev, and a -dev escape hatch is
// exactly the weakening §7b warns about. Browsers treat http://localhost as a
// secure context and accept Secure cookies there, so local development works;
// serving the dev client from a LAN IP over plain http would not, and that is
// the correct outcome rather than a reason to relax the flag.
//
// ⚑ THE BROWSER HALF OF THAT IS DOCUMENTED BUT NOT VERIFIED HERE. Chunk 1c had
// no browser to drive (Playwright is not installed on the dev box), and two
// non-browser clients — curl and .NET's HttpClient — both correctly refuse to
// send a Secure cookie over http, which is what a Go test with httptest does not
// model. So this is the first thing chunk 2 should confirm in a real browser,
// and if it does not hold, the fix is to serve the dev client over https or from
// aurad's own origin — not to drop the flag.
func (s *Server) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(auth.TokenLifetime.Seconds()),
	})
}

// clearSessionCookie removes it. Every attribute except the value has to match
// the cookie being replaced, or the browser keeps the original alongside it.
//
// ⚑ Clearing a cookie is NOT revocation — it logs out this browser and does
// nothing to a token copied off the machine. That is what the token_generation
// bump beside every call to this is for.
func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// clientIP is the throttle's per-source axis and the audit log's source_ip.
//
// ⚑ IT DELIBERATELY IGNORES X-Forwarded-For. aurad terminates TLS itself and
// there is no reverse proxy in the deploy path, so that header would be
// attacker-controlled — and a throttle keyed on a spoofable value is a throttle
// with no per-source axis at all. ⚑ If a proxy is ever put in front, this is the
// line that has to change, and until it does every request would key on the
// proxy's address, making the per-IP axis global.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
