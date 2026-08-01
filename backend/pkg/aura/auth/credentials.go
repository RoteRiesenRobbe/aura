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

	ErrCharacterNameLength   = &RuleError{"Character names must be between 3 and 20 characters."}
	ErrCharacterNameCharset  = &RuleError{"Character names may only contain letters, numbers, spaces, apostrophes, hyphens and underscores."}
	ErrCharacterNameShape    = &RuleError{"Character names must begin and end with a letter or number, and may not repeat a space, apostrophe, hyphen or underscore."}
	ErrCharacterNameReserved = &RuleError{"That character name is not available."}
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
// ⚑ It rejects the harness prefix in production, which is what reserves the
// namespace from real players. allowHarnessNames (set from -dev, same flag
// ValidateCharacterName takes) opens it, so the harness can register the
// throwaway accounts its login/register/logout script needs.
//
// ⚑ That is not merely symmetry: without it those accounts must carry ORDINARY
// usernames, and an ordinary username is indistinguishable from a real player's
// — so `harnessdb -cleanup` could not remove them, and every run would leave a
// credentialed account behind forever. The prefix is what makes the residue
// identifiable, and cleanup is the reason the prefix has to be reachable.
func ValidateUsername(username string, allowHarnessNames bool) error {
	runes := []rune(username)
	if len(runes) < UsernameMinLength || len(runes) > UsernameMaxLength {
		return ErrUsernameLength
	}
	for _, r := range runes {
		if !isUsernameRune(r) {
			return ErrUsernameCharset
		}
	}
	if hasHarnessPrefix(username) && !allowHarnessNames {
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
// ⚑ THE CHARSET IS THE "HUMAN NAME" RULE (PO 2026-08-01, chunk 1c). 1b shipped
// length/whitespace/control checks and deliberately invented no composition
// rule, leaving the call open; this is that call. Letters of any script and
// digits, joined by single interior separators, beginning and ending on a
// letter or digit:
//
//	Barney Rubble ✓   M'reth ✓   Zoë ✓   Grimm-Ash ✓   hrnss_01_a ✓
//	Barney  Rubble ✗ (repeated separator)      -Bob- ✗ (separator at the edge)
//	Bob🔥 ✗            B̸o̸b̸ ✗ (combining marks)   Bob<RLO>eht ✗
//
// The rejections need no code of their own: emoji are symbols, zalgo is a
// combining MARK, and an RTL override is a FORMAT character — none of them is a
// letter or a digit, so the one charset loop refuses all three.
//
// ⚑ Consequence worth stating rather than discovering: requiring precomposed
// characters excludes scripts that cannot be written without combining marks
// (Devanagari, Hebrew niqqud, Thai). Latin, Greek and Cyrillic diacritics all
// have precomposed forms, so "Zoë" typed on any ordinary keyboard passes while
// the same name in decomposed form does not. The fix, if a player ever needs
// it, is NFC normalisation plus a per-base mark limit — not loosening the loop.
//
// ⚑ `_` IS A SEPARATOR BECAUSE OF THE HARNESS. "hrnss_01_a" has to be a legal
// character name (plan-accounts-frontend.md §11), and carving out an exemption
// for the prefix would give the harness a name shape no player could hold —
// exactly the special case the prefix rule itself avoids.
// allowHarnessNames opens the reserved prefix to an account that does NOT carry
// it — set only under -dev (plan-accounts-frontend.md §10b ruling 2).
//
// ⚑ IT IS A DEV-MODE FLAG AND NOT "the account is anonymous", which is the
// obvious-looking version and is wrong. Harness clients and load bots mint
// their identity through the anonymous path, so keying on "no username" looks
// equivalent — but EVERY new player is anonymous at exactly that moment, so it
// would hand the reserved namespace to the entire playerbase and turn the
// collision guarantee back into a coincidence. Production refuses the prefix
// outright, which is strictly stronger than before this flag existed.
func ValidateCharacterName(name, callerUsername string, allowHarnessNames bool) error {
	runes := []rune(name)
	if len(runes) < CharacterNameMinLength || len(runes) > CharacterNameMaxLength {
		return ErrCharacterNameLength
	}
	for _, r := range runes {
		if !isNameCoreRune(r) && !isNameSeparatorRune(r) {
			return ErrCharacterNameCharset
		}
	}
	if !isNameCoreRune(runes[0]) || !isNameCoreRune(runes[len(runes)-1]) {
		return ErrCharacterNameShape
	}
	for i := 1; i < len(runes); i++ {
		if isNameSeparatorRune(runes[i]) && isNameSeparatorRune(runes[i-1]) {
			return ErrCharacterNameShape
		}
	}
	if hasHarnessPrefix(name) && !hasHarnessPrefix(callerUsername) && !allowHarnessNames {
		return ErrCharacterNameReserved
	}
	return nil
}

// isNameCoreRune reports whether r may begin or end a character name.
func isNameCoreRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

// isNameSeparatorRune reports whether r may sit BETWEEN two core runes.
//
// ⚑ U+2019 is accepted alongside the plain apostrophe because phone keyboards
// and word processors substitute it silently. Rejecting it would read as "the
// game does not like my name" rather than as a rule.
func isNameSeparatorRune(r rune) bool {
	switch r {
	case ' ', '\'', '’', '-', '_':
		return true
	}
	return false
}

// hasHarnessPrefix matches case-insensitively — usernames are CITEXT, so
// "HRNSS_01" and "hrnss_01" are the same account and must be the same answer
// here. A case-sensitive check would leave the namespace open to anyone who
// pressed shift.
func hasHarnessPrefix(name string) bool {
	return strings.HasPrefix(strings.ToLower(name), HarnessPrefix)
}
