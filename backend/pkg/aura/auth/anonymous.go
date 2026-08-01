package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

// anonymousSecretBytes is the raw secret size: 256 bits of CSPRNG output, the
// generation rule the schema doc applies to every lookup token.
const anonymousSecretBytes = 32

// NewAnonymousSecret mints the token that IS an anonymous account's identity,
// returning the raw secret and the lookup key to store beside it.
//
// ⚑ The raw value goes to the browser exactly once and is never stored
// server-side; the lookup key is what account_credentials.anonymous_secret_sha256
// holds. Handing back both, from one call, is what stops a caller storing the
// raw token by accident — there is no second function that would let them.
//
// ⚑ IT IS A BEARER TOKEN THAT CANNOT BE ROTATED OR REVOKED. There is no "change
// my anonymous secret" flow and no password to reset, so any disclosure is
// permanent account takeover. That is not an argument against anonymous play —
// it is the argument FOR the registration nag (implementation.md §7).
func NewAnonymousSecret() (raw, lookupKey string, err error) {
	buf := make([]byte, anonymousSecretBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generating an anonymous secret: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(buf)
	return raw, AnonymousSecretKey(raw), nil
}

// AnonymousSecretKey derives the lookup key a presented secret must be found
// by — the SHA-256 of the raw token, hex-encoded.
//
// ⚑ SHA-256 IS CORRECT HERE, NOT A COMPROMISE, and this is the trap the schema
// doc's §"Hashing: lookup keys vs. verifiers" exists to close. The client
// presents only this token; there is no username to find the row by first, so
// the stored value must be DETERMINISTIC. bcrypt embeds a per-row salt, which
// makes `WHERE col = bcrypt(input)` match nothing, ever. Slow hashing defends
// low-entropy human-chosen inputs; this is 256 bits of CSPRNG output, so hash
// speed buys an attacker nothing and indexability is the whole requirement.
//
// ⚑ "Hardening" this column to bcrypt would therefore not merely slow the
// anonymous path down — it would break it, and on the way it would put every
// anonymous player through the bcrypt Gate (see the note on Gate).
func AnonymousSecretKey(raw string) string {
	return sha256Hex(raw)
}

// sha256Hex is the one lookup-key derivation in the package. Both callers — the
// anonymous secret and the play ticket — hash a high-entropy CSPRNG token for
// exactly the same reason, so they share the code as well as the rule.
func sha256Hex(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
