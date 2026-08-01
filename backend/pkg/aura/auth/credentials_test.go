package auth_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/auth"
)

func TestValidateUsername(t *testing.T) {
	cases := []struct {
		name     string
		username string
		want     error
	}{
		{"ordinary", "barney", nil},
		{"digits and separators", "Barney_Rubble-2", nil},
		{"at the minimum", "abc", nil},
		{"at the maximum", strings.Repeat("a", 32), nil},

		{"too short", "ab", auth.ErrUsernameLength},
		{"empty", "", auth.ErrUsernameLength},
		{"too long", strings.Repeat("a", 33), auth.ErrUsernameLength},
		{"spaces", "barney rubble", auth.ErrUsernameCharset},
		{"punctuation", "barney!", auth.ErrUsernameCharset},
		{"an email", "barney@bedrock.example", auth.ErrUsernameCharset},
		{"non-ascii", "bärney", auth.ErrUsernameCharset},

		// Registration rejects the harness namespace outright — no player can
		// ever claim it, however they capitalise it.
		{"the harness prefix", "hrnss_01", auth.ErrUsernameReserved},
		{"the harness prefix, shouted", "HRNSS_01", auth.ErrUsernameReserved},
		{"the harness prefix, mixed", "Hrnss_01", auth.ErrUsernameReserved},
		// Not the prefix: the underscore is part of it.
		{"merely starting with hrnss", "hrnssmith", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.ErrorIs(t, auth.ValidateUsername(tc.username), tc.want)
		})
	}
}

// TestValidatePassword is the table the PO's rules live in.
//
// ⚑ The trailing-punctuation rows are the ones worth reading. The
// special-character requirement pushes real users to "password!", and a
// blocklist consulted before normalisation would wave through exactly the
// password it exists to stop — the composition rule defeating the rule that does
// the work (plan-accounts-implementation.md §7).
func TestValidatePassword(t *testing.T) {
	cases := []struct {
		name     string
		password string
		username string
		want     error
	}{
		{"ordinary", "brontosaurus!", "barney", nil},
		{"at the minimum length", "abcdefg!", "barney", nil},
		{"special character anywhere", "!brontosaurus", "barney", nil},
		{"a space counts as special", "quarry stone", "barney", nil},
		{"72 bytes exactly", strings.Repeat("a", 71) + "!", "barney", nil},

		{"too short", "abc!", "barney", auth.ErrPasswordLength},
		{"empty", "", "barney", auth.ErrPasswordLength},
		{"73 bytes", strings.Repeat("a", 72) + "!", "barney", auth.ErrPasswordTooLong},
		// Bytes, not runes: 40 two-byte characters pass the length rule and would
		// still be truncated by bcrypt.
		{"under 72 runes but over 72 bytes", strings.Repeat("ä", 40) + "!", "barney", auth.ErrPasswordTooLong},
		{"no special character", "brontosaurus", "barney", auth.ErrPasswordSpecial},
		{"letters and digits only", "bronto12", "barney", auth.ErrPasswordSpecial},

		{"a blocklisted password", "password", "barney", auth.ErrPasswordSpecial},
		{"blocklisted, wearing a bang", "password!", "barney", auth.ErrPasswordCommon},
		{"blocklisted, shouted", "PASSWORD!", "barney", auth.ErrPasswordCommon},
		{"blocklisted, several marks", "password!?!", "barney", auth.ErrPasswordCommon},
		{"a keyboard run", "qwertyui!", "barney", auth.ErrPasswordCommon},
		{"a digit sequence", "12345678!", "barney", auth.ErrPasswordCommon},
		{"short entry padded to length", "monkey!!", "barney", auth.ErrPasswordCommon},
		{"the game's own name", "aurahunter!", "barney", auth.ErrPasswordCommon},

		{"the username itself", "barneyrubble!", "barneyrubble", auth.ErrPasswordCommon},
		{"the username, different case", "BarneyRubble!", "barneyrubble", auth.ErrPasswordCommon},
		// The rule is "the username itself", not "contains the username" — a
		// password merely built around it is the player's business.
		{"the username with more around it", "barney-quarry!", "barney", nil},
		// No username to compare against (anonymous, or a password change) must
		// not crash or accidentally match.
		{"no username supplied", "brontosaurus!", "", nil},

		// Digits are deliberately NOT stripped: undoing a known mutation is one
		// thing, rewriting the password to find a match is another.
		{"blocklist entry with a digit suffix", "password1!", "barney", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.ErrorIs(t, auth.ValidatePassword(tc.password, tc.username), tc.want)
		})
	}
}

// TestValidateCharacterName covers the half of the harness rule that is NOT the
// same as registration's.
//
// ⚑ The anonymous row is the one that matters. "No username" must read as "no
// prefix", not as "nothing to compare against, so allow" — otherwise the
// reserved namespace belongs to anyone who declines to register, which is every
// player by design (plan-accounts-implementation.md §7).
func TestValidateCharacterName(t *testing.T) {
	cases := []struct {
		name           string
		characterName  string
		callerUsername string
		want           error
	}{
		{"ordinary", "Barney", "barney", nil},
		{"anonymous account", "Barney", "", nil},
		// The four shapes the human-name rule exists to keep (PO 2026-08-01).
		// ⚑ The first is what NameGenerator.generate() actually emits, so a rule
		// rejecting it would have the game proposing names it then refuses.
		{"a space inside", "Barney Rubble", "barney", nil},
		{"an apostrophe", "M'reth", "barney", nil},
		{"a typographic apostrophe", "M’reth", "barney", nil},
		{"a hyphen", "Grimm-Ash", "barney", nil},
		{"a non-ASCII letter", "Zoë", "barney", nil},
		{"a digit", "Barney2", "barney", nil},
		{"at the maximum", strings.Repeat("a", 20), "barney", nil},

		{"too short", "Bo", "barney", auth.ErrCharacterNameLength},
		{"empty", "", "barney", auth.ErrCharacterNameLength},
		{"over the wire limit", strings.Repeat("a", 21), "barney", auth.ErrCharacterNameLength},

		// ⚑ Charset rejections that need no rule of their own: an emoji is a
		// symbol, zalgo is a combining MARK and an RTL override is a FORMAT
		// character — none is a letter or a digit, so one loop refuses all three.
		{"an emoji", "Bob🔥", "barney", auth.ErrCharacterNameCharset},
		{"combining marks", "B̸o̸b̸", "barney", auth.ErrCharacterNameCharset},
		{"a right-to-left override", "Bob‮eht", "barney", auth.ErrCharacterNameCharset},
		{"a zero-width space", "Bo​b", "barney", auth.ErrCharacterNameCharset},
		{"circled letters", "Ⓐⓤⓡⓐ", "barney", auth.ErrCharacterNameCharset},
		{"a newline inside", "Bar\nney", "barney", auth.ErrCharacterNameCharset},
		{"punctuation", "Bob!", "barney", auth.ErrCharacterNameCharset},

		{"leading space", " Barney", "barney", auth.ErrCharacterNameShape},
		{"trailing space", "Barney ", "barney", auth.ErrCharacterNameShape},
		{"leading hyphen", "-Barney", "barney", auth.ErrCharacterNameShape},
		{"trailing apostrophe", "Barney'", "barney", auth.ErrCharacterNameShape},
		{"a doubled space", "Barney  Rubble", "barney", auth.ErrCharacterNameShape},
		{"mixed doubled separators", "Barney -Rubble", "barney", auth.ErrCharacterNameShape},
		{"separators only", "---", "barney", auth.ErrCharacterNameShape},

		{"the prefix, from a player", "hrnss_01_a", "barney", auth.ErrCharacterNameReserved},
		{"the prefix, from anonymous", "hrnss_01_a", "", auth.ErrCharacterNameReserved},
		{"the prefix, shouted, from anonymous", "HRNSS_01_A", "", auth.ErrCharacterNameReserved},
		// The harness recreating its own characters every run is the reason the
		// rule is conditional rather than a flat rejection.
		{"the prefix, from a harness account", "hrnss_01_a", "hrnss_01", nil},
		{"the prefix, harness account cased differently", "hrnss_01_a", "HRNSS_01", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.ErrorIs(t, auth.ValidateCharacterName(tc.characterName, tc.callerUsername), tc.want)
		})
	}
}

// TestRuleErrorsAreSafeToShow pins §5b's constraint on the messages themselves:
// a validation failure is shown to the player verbatim, so none of them may
// echo the input back. Echoing is how "that password is too common" would turn
// into a log line or an error banner carrying the password.
func TestRuleErrorsAreSafeToShow(t *testing.T) {
	secret := "qwertyui!"
	err := auth.ValidatePassword(secret, "barney")
	assert.ErrorIs(t, err, auth.ErrPasswordCommon)
	assert.NotContains(t, err.Error(), secret, "a rule error must never echo the password")

	// And it carries the marker type, which is how a handler tells "this sentence
	// is for the player" from "this cause must be logged and replaced with a
	// generic apology".
	var rule *auth.RuleError
	assert.ErrorAs(t, err, &rule)
}
