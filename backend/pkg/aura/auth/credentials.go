package auth

import (
	"strings"
	"unicode"
)

// The credential rules. PO-ruled and final, not placeholders —
// plan-accounts-implementation.md §7 "Password rules".
const (
	UsernameMinLength = 3
	UsernameMaxLength = 32
	PasswordMinLength = 8

	// CharacterNameMaxLength promotes the server's existing silent truncation
	// (sys/state.go clips a Join name at 20) into a validation error. Same
	// reasoning as MaxPasswordBytes: a limit the player cannot see is a limit
	// that surprises them.
	CharacterNameMinLength = 3
	CharacterNameMaxLength = 20

	// HarnessPrefix is reserved for the browser harness (plan-accounts-frontend.md
	// §11). Registration rejects it outright so no player can ever claim the
	// namespace; character creation allows it ONLY for an account whose username
	// already carries it, which is what lets the harness recreate its own
	// characters every run. Matched case-insensitively, like every other name
	// check in this file.
	HarnessPrefix = "hrnss_"
)

// RuleError is a validation failure whose Message is safe to show a player
// verbatim.
//
// The type exists to make that safety visible at the call site: §5b requires
// that no message reveal whether an account exists, and requires the *specific*
// failed rule rather than the whole list. A bare error string gives a handler no
// way to tell "this is a player-facing sentence" from "this is an internal
// cause that must be logged and replaced with a generic apology".
type RuleError struct{ Message string }

func (e *RuleError) Error() string { return e.Message }

// The rules, as sentinels. Compare with errors.Is.
//
// ⚑ The blocklist error deliberately does NOT name which entry matched, per
// §5b: "that password is too common" rather than echoing the guess back.
var (
	ErrUsernameLength   = &RuleError{"Usernames must be between 3 and 32 characters."}
	ErrUsernameCharset  = &RuleError{"Usernames may only contain letters, numbers, underscores and hyphens."}
	ErrUsernameReserved = &RuleError{"That username is not available."}

	ErrPasswordLength  = &RuleError{"Passwords must be at least 8 characters."}
	ErrPasswordTooLong = &RuleError{"Passwords must be at most 72 bytes long."}
	ErrPasswordSpecial = &RuleError{"Passwords must contain at least one special character."}
	ErrPasswordCommon  = &RuleError{"That password is too common. Please choose another."}

	ErrCharacterNameLength     = &RuleError{"Character names must be between 3 and 20 characters."}
	ErrCharacterNameWhitespace = &RuleError{"Character names may not start or end with a space."}
	ErrCharacterNameControl    = &RuleError{"Character names may not contain control characters."}
	ErrCharacterNameReserved   = &RuleError{"That character name is not available."}
)

// passwordBlocklist is the load-bearing half of the password rules. NIST
// SP 800-63B's central recommendation is exactly this — screen candidates
// against known-weak and sequential values, because those are what attackers
// try first.
//
// ⚑ Entries shorter than PasswordMinLength are not dead: matching happens after
// normalisation, so "monkey!!" (8 characters, passes the length and
// special-character rules) normalises to "monkey" and is caught here.
//
// Deliberately short and extensible. It is a floor against the obvious, not a
// breach corpus.
var passwordBlocklist = map[string]bool{
	"password":    true,
	"passwort":    true,
	"passw0rd":    true,
	"12345678":    true,
	"123456789":   true,
	"1234567890":  true,
	"87654321":    true,
	"abcdefgh":    true,
	"qwerty":      true,
	"qwertyui":    true,
	"qwertyuiop":  true,
	"qwertz":      true,
	"asdfghjk":    true,
	"asdfghjkl":   true,
	"iloveyou":    true,
	"letmein":     true,
	"welcome":     true,
	"monkey":      true,
	"dragon":      true,
	"sunshine":    true,
	"princess":    true,
	"football":    true,
	"baseball":    true,
	"admin":       true,
	"aura":        true,
	"aurahunter":  true,
	"berryhunter": true,
}

// ValidateUsername applies the registration rules to a username.
//
// ⚑ It rejects the harness prefix outright. That is the registration half of the
// rule; the character-creation half is in ValidateCharacterName and is
// deliberately different.
func ValidateUsername(username string) error {
	runes := []rune(username)
	if len(runes) < UsernameMinLength || len(runes) > UsernameMaxLength {
		return ErrUsernameLength
	}
	for _, r := range runes {
		if !isUsernameRune(r) {
			return ErrUsernameCharset
		}
	}
	if hasHarnessPrefix(username) {
		return ErrUsernameReserved
	}
	return nil
}

func isUsernameRune(r rune) bool {
	switch {
	case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
		return true
	case r == '_', r == '-':
		return true
	}
	return false
}

// ValidatePassword applies the password rules. username may be empty when there
// is none to compare against; when present, the password may not simply be it.
func ValidatePassword(password, username string) error {
	if len([]rune(password)) < PasswordMinLength {
		return ErrPasswordLength
	}
	// Bytes, not runes: bcrypt's 72 is a byte limit, so a password of 40
	// multi-byte characters can pass the length rule and still be truncated.
	if len(password) > MaxPasswordBytes {
		return ErrPasswordTooLong
	}
	if !hasSpecialRune(password) {
		return ErrPasswordSpecial
	}

	normalised := normalisePassword(password)
	if passwordBlocklist[normalised] {
		return ErrPasswordCommon
	}
	if username != "" && normalised == normalisePassword(username) {
		return ErrPasswordCommon
	}
	return nil
}

// hasSpecialRune reports whether the password carries at least one
// non-alphanumeric character.
//
// ⚑ This requirement runs AGAINST the NIST guidance the blocklist follows —
// mandatory character classes push users toward predictable mutations without
// materially adding entropy. The PO ruled for it anyway; the tension is
// recorded in plan-accounts-implementation.md §7 rather than hidden, and
// normalisePassword exists precisely because of the mutation it provokes.
func hasSpecialRune(password string) bool {
	for _, r := range password {
		if !unicode.IsLetter(r) && !unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

// normalisePassword lowercases and strips TRAILING punctuation before the
// blocklist is consulted.
//
// ⚑ This is the whole reason the blocklist still works. The special-character
// rule above pushes a meaningful share of real users to "password!", which
// sails through a blocklist check that "password" would have failed — the rule
// meant to strengthen passwords otherwise defeats the rule that actually stops
// the guessed ones (plan-accounts-implementation.md §7).
//
// Trailing punctuation only, deliberately: stripping digits too would start
// rewriting passwords rather than undoing a known mutation.
func normalisePassword(password string) string {
	lower := strings.ToLower(password)
	return strings.TrimRightFunc(lower, func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

// ValidateCharacterName applies the character-name rules. callerUsername is the
// username of the account creating the character, or "" when the account is
// anonymous.
//
// ⚑ The harness-prefix rule reads "no username ⇒ no prefix", not "no username ⇒
// unchecked". The anonymous branch has nothing to compare against, and falling
// through to allow would hand the reserved namespace to anyone who declines to
// register — which is every player, by design (plan-accounts-implementation.md
// §7).
//
// ⚑ The CHARSET is deliberately permissive: length, surrounding whitespace and
// control characters are checked, but "Barney Rubble" and "M'reth" are allowed.
// No plan rules character-name composition, and inventing a policy here would
// be a silent design decision. Chunk 1c owns tightening it if the PO wants it.
func ValidateCharacterName(name, callerUsername string) error {
	runes := []rune(name)
	if len(runes) < CharacterNameMinLength || len(runes) > CharacterNameMaxLength {
		return ErrCharacterNameLength
	}
	if strings.TrimSpace(name) != name {
		return ErrCharacterNameWhitespace
	}
	for _, r := range runes {
		if unicode.IsControl(r) {
			return ErrCharacterNameControl
		}
	}
	if hasHarnessPrefix(name) && !hasHarnessPrefix(callerUsername) {
		return ErrCharacterNameReserved
	}
	return nil
}

// hasHarnessPrefix matches case-insensitively — usernames are CITEXT, so
// "HRNSS_01" and "hrnss_01" are the same account and must be the same answer
// here. A case-sensitive check would leave the namespace open to anyone who
// pressed shift.
func hasHarnessPrefix(name string) bool {
	return strings.HasPrefix(strings.ToLower(name), HarnessPrefix)
}
