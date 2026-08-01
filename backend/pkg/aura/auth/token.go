package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// EnvJWTKey is the environment variable holding the HS512 signing secret. Named
// as a constant for the same reason store.EnvURL is: nothing should invent its
// own spelling, and it is a secret on the database-password tier — never
// conf.json, which is tracked (plan-accounts-implementation.md §0).
//
// ⚑ It must differ between local and live, and rotating the live one invalidates
// every session at once.
const EnvJWTKey = "AURA_JWT_KEY"

// TokenLifetime is how long an issued session token stays valid. [PLACEHOLDER]
//
// Short on purpose: it bounds the blast radius of a leaked token, and the client
// renews on a timer at roughly half of this, so a player never sees it expire
// (plan-accounts-implementation.md §7b "Session expiry mid-play").
const TokenLifetime = time.Hour

// tokenIssuer is stamped into every token and checked on every verify, so a
// token minted by something else with the same secret is not accepted here.
const tokenIssuer = "aura"

// minSecretBytes is the floor NewKeys enforces. The provisioning step generates
// 48 CSPRNG bytes base64-encoded (64 characters), comfortably above it; the
// floor exists to catch a hand-typed placeholder, which is the realistic
// failure — not to certify a good key.
const minSecretBytes = 32

// Signing is HS512 and nothing else. One service both mints and verifies, so a
// symmetric algorithm has no key-distribution problem; RS256 would be correct
// for shared infrastructure and this is unambiguously not that
// (plan-accounts-implementation.md §7).
var signingMethod = jwt.SigningMethodHS512

var (
	// ErrTokenInvalid covers a malformed token, a bad signature, a wrong
	// algorithm and a wrong issuer — deliberately one error, because none of
	// those distinctions is a thing the presenter should learn.
	ErrTokenInvalid = errors.New("auth: invalid session token")
	// ErrTokenExpired is separate because the CLIENT acts on it differently: an
	// expired token means log in again, everything else means something is wrong.
	ErrTokenExpired = errors.New("auth: session token has expired")
	// ErrStaleGeneration means the token predates a token_generation bump — the
	// account logged out, or had its password reset. See Verify.
	ErrStaleGeneration = errors.New("auth: session token has been revoked")
)

// Claims is the verified content of a session token.
type Claims struct {
	AccountID  int64
	Generation int
	IssuedAt   time.Time
	ExpiresAt  time.Time
}

// tokenClaims is the wire shape. The account id rides the standard `sub`
// registered claim; the generation is the one custom claim in the system.
type tokenClaims struct {
	Generation int `json:"gen"`
	jwt.RegisteredClaims
}

// Keys mints and verifies session tokens. One per process.
type Keys struct {
	secret   []byte
	lifetime time.Duration
}

// NewKeys builds the signer. lifetime is a parameter rather than a constant
// read from inside so tests can mint an already-expired token without waiting an
// hour or faking a clock; production passes TokenLifetime.
func NewKeys(secret []byte, lifetime time.Duration) (*Keys, error) {
	if len(secret) < minSecretBytes {
		return nil, fmt.Errorf("%s must be at least %d bytes and come from a CSPRNG; "+
			"anyone who can reproduce it can forge any session", EnvJWTKey, minSecretBytes)
	}
	if lifetime == 0 {
		return nil, fmt.Errorf("session token lifetime must be set")
	}
	return &Keys{secret: secret, lifetime: lifetime}, nil
}

// Issue mints a session token for an account at a given token_generation.
//
// ⚑ generation is stamped in at issue and compared on every verify. It is what
// makes logout actual revocation rather than a browser-local gesture: a JWT is
// self-contained, so without it the server has no way to cancel a token it has
// already signed (plan-accounts-schema.md §"Session revocation").
func (k *Keys) Issue(accountID int64, generation int) (string, error) {
	now := time.Now()
	claims := tokenClaims{
		Generation: generation,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(accountID, 10),
			Issuer:    tokenIssuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(k.lifetime)),
		},
	}
	signed, err := jwt.NewWithClaims(signingMethod, claims).SignedString(k.secret)
	if err != nil {
		return "", fmt.Errorf("signing a session token: %w", err)
	}
	return signed, nil
}

// Verify checks a token's signature and expiry AND compares its generation
// claim against currentGeneration, which the caller must read from
// account_credentials (store.TokenGeneration).
//
// ⚑ Taking the current generation as a required argument is the design: the
// comparison is what stops "silent refresh" from becoming "immortal session",
// and an API where the caller could forget it would eventually be called by
// someone who did. An ERASED account has no credentials row at all — that is the
// lookup's error, not this function's, and it must refuse just as firmly.
func (k *Keys) Verify(token string, currentGeneration int) (Claims, error) {
	var claims tokenClaims
	_, err := jwt.ParseWithClaims(token, &claims,
		func(*jwt.Token) (any, error) { return k.secret, nil },
		// ⚑ Pinning the accepted algorithm is not belt-and-braces: without it a
		// token carrying `alg: none`, or an HMAC token signed with what the
		// server thinks is a public key, is a standard forgery route.
		jwt.WithValidMethods([]string{signingMethod.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithIssuer(tokenIssuer),
	)
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return Claims{}, ErrTokenExpired
		}
		return Claims{}, ErrTokenInvalid
	}

	accountID, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil || accountID <= 0 {
		return Claims{}, ErrTokenInvalid
	}
	if claims.ExpiresAt == nil || claims.IssuedAt == nil {
		return Claims{}, ErrTokenInvalid
	}
	if claims.Generation != currentGeneration {
		return Claims{}, ErrStaleGeneration
	}

	return Claims{
		AccountID:  accountID,
		Generation: claims.Generation,
		IssuedAt:   claims.IssuedAt.Time,
		ExpiresAt:  claims.ExpiresAt.Time,
	}, nil
}

// Refresh verifies a token and mints a replacement — the server half of silent
// session refresh.
//
// ⚑ It is not a rubber stamp: it applies exactly the checks Verify does, so a
// token that was logged out elsewhere (generation bumped) or whose account was
// erased (no generation to look up) is refused here too. An EXPIRED token is
// also refused — the client renews at roughly half the lifetime, so reaching
// expiry means the session really did lapse.
func (k *Keys) Refresh(token string, currentGeneration int) (string, error) {
	claims, err := k.Verify(token, currentGeneration)
	if err != nil {
		return "", err
	}
	return k.Issue(claims.AccountID, claims.Generation)
}
