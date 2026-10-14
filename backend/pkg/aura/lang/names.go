package lang

import (
	"fmt"
	"regexp"
)

// plan-localization.md D24: a mob's display name carries its plural as ICU.
// The English shape is plain text, or exactly
// {count, plural, one {Wolf} other {Wolves}}; a translation may use every CLDR
// category its locale has (the client formats it, D1). The server itself stays
// locale-free and reads only the English singular, for its fallback strings.

var mobNamePlural = regexp.MustCompile(`^\{count, plural, one \{([^{}]*)\} other \{([^{}]*)\}\}$`)

// CheckMobName refuses an English mob name in any other shape (D24).
func CheckMobName(text string) error {
	if m := mobNamePlural.FindStringSubmatch(text); m != nil {
		for _, form := range m[1:] {
			if err := CheckAuthoredText(form); err != nil {
				return err
			}
		}
		return nil
	}
	if err := CheckAuthoredText(text); err != nil {
		return fmt.Errorf("%v; a mob name is plain text or exactly {count, plural, one {…} other {…}} (D24)", err)
	}
	return nil
}

// Singular is a mob name's `one` form, or the plain name.
func Singular(text string) string {
	if m := mobNamePlural.FindStringSubmatch(text); m != nil {
		return m[1]
	}
	return text
}

// HasPlural reports whether a mob name authors its plural forms.
func HasPlural(text string) bool { return mobNamePlural.MatchString(text) }
