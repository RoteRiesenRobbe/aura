// Package lang is the server half of localization (plan-localization.md).
//
// The server stays locale-free in the game loop (D1): it never formats a
// sentence for a player. What it does own is the CONTENT text, served over
// HTTP per locale:
//
//   - the English is AUTHORED in api/lang/en/<domain>.arb (D27, C5a), and the
//     content JSON keeps structure and ids; EnglishFS joins the two as the
//     loaders read a file (english.go);
//   - translations are ARB overlays in api/lang/<locale>/<domain>.arb (D3, D17),
//     keyed by the content's own stable ids (D20) in dotted keys (D29); a
//     missing key falls back to English at serve time (D13);
//   - every catalog is marshaled once PER LOCALE at boot (D6), and `?lang=`
//     picks one by BCP 47 truncation, unknown → en (D2 amendment (a)).
//
// The package is a leaf: it imports nothing from the game, so every content
// package may use its key builders.
package lang

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"strings"
	"unicode/utf8"
)

const (
	// Source is the authored language.
	Source = "en"
	// PseudoLocale is the dev-only pseudo-locale (D21), served only on an
	// explicit request, never negotiated to.
	PseudoLocale = "en-XA"
)

// Served is every locale a payload is built for at boot.
var Served = []string{Source, "de", PseudoLocale}

// Negotiate maps a requested tag to a served locale by truncation
// (`de-AT` → `de`); the pseudo-locale only by exact name; anything else → en.
func Negotiate(requested string) string {
	tag := strings.TrimSpace(requested)
	if strings.EqualFold(tag, PseudoLocale) {
		return PseudoLocale
	}
	for tag != "" {
		for _, l := range Served {
			if l != PseudoLocale && strings.EqualFold(l, tag) {
				return l
			}
		}
		cut := strings.LastIndex(tag, "-")
		if cut <= 0 {
			break
		}
		tag = tag[:cut]
	}
	return Source
}

// Tr resolves one content string: its key and its English.
type Tr func(key, english string) string

// Identity is the English translator.
func Identity(_ string, english string) string { return english }

// Bundle holds every loaded ARB: locale → key → text, English included (D27).
type Bundle struct {
	overlays map[string]map[string]string
}

// NewBundle is an empty bundle, for tests and tools.
func NewBundle() *Bundle {
	return &Bundle{overlays: map[string]map[string]string{}}
}

// Set adds one translation (tests, tools).
func (b *Bundle) Set(locale, key, text string) {
	if b.overlays[locale] == nil {
		b.overlays[locale] = map[string]string{}
	}
	b.overlays[locale][key] = text
}

// Overlay returns a locale's loaded keys (read-only use); Overlay(Source) is
// the English.
func (b *Bundle) Overlay(locale string) map[string]string { return b.overlays[locale] }

// For is the translator for one served locale.
func (b *Bundle) For(locale string) Tr {
	switch locale {
	case Source:
		return Identity
	case PseudoLocale:
		return func(_ string, english string) string { return Pseudo(english) }
	}
	overlay := b.overlays[locale]
	return func(key, english string) string {
		if s, ok := overlay[key]; ok && s != "" {
			return s
		}
		return english
	}
}

var keyPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]*(\.[A-Za-z0-9_-]+)*$`)

// ValidKey reports whether key is a well-formed content key (D29): dot-separated
// parts of letters, digits, '-' and '_', a letter first.
func ValidKey(key string) bool { return keyPattern.MatchString(key) }

// LoadOverlays reads every api/lang/<locale>/*.arb, English included. A file that is not valid UTF-8 (L17: an ANSI save on Windows would
// otherwise load as U+FFFD with boot green), malformed JSON, a non-string
// message or a malformed key refuses the boot, naming the file. A key that
// matches no content (an orphan) is NOT a boot failure: it is never looked up,
// and the completeness test names it (PO 2026-10-07).
func LoadOverlays(fsys fs.FS) (*Bundle, error) {
	b := NewBundle()
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return nil, err
	}
	for _, dir := range entries {
		if !dir.IsDir() {
			continue
		}
		locale := dir.Name()
		files, err := fs.Glob(fsys, path.Join(locale, "*.arb"))
		if err != nil {
			return nil, err
		}
		for _, file := range files {
			messages, err := ReadARB(fsys, file)
			if err != nil {
				return nil, err
			}
			for k, v := range messages {
				b.Set(locale, k, v)
			}
		}
	}
	return b, nil
}

// ReadARB reads one ARB file's messages (the `@` metadata dropped).
func ReadARB(fsys fs.FS, file string) (map[string]string, error) {
	raw, err := fs.ReadFile(fsys, file)
	if err != nil {
		return nil, err
	}
	if !utf8.Valid(raw) {
		return nil, fmt.Errorf("lang/%s is not valid UTF-8 (saved as ANSI? use UTF-8 without BOM)", file)
	}
	var doc map[string]json.RawMessage
	if err := json.Unmarshal(raw, &doc); err != nil {
		return nil, fmt.Errorf("lang/%s: %w", file, err)
	}
	out := make(map[string]string, len(doc))
	for k, v := range doc {
		if strings.HasPrefix(k, "@") {
			continue
		}
		if !ValidKey(k) {
			return nil, fmt.Errorf("lang/%s: malformed key %q", file, k)
		}
		var s string
		if err := json.Unmarshal(v, &s); err != nil {
			return nil, fmt.Errorf("lang/%s: %s is not a string", file, k)
		}
		out[k] = s
	}
	return out, nil
}

// Handler serves a payload built once per served locale at boot, chosen by
// `?lang=` (unknown → en). Mirrors the catalogs' wildcard CORS: public
// read-only content.
func Handler(b *Bundle, build func(tr Tr) ([]byte, error)) (http.Handler, error) {
	payloads := make(map[string][]byte, len(Served))
	for _, locale := range Served {
		p, err := build(b.For(locale))
		if err != nil {
			return nil, fmt.Errorf("locale %s: %w", locale, err)
		}
		payloads[locale] = p
	}
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Vary", "Accept-Language")
		w.Write(payloads[Negotiate(req.URL.Query().Get("lang"))])
	}), nil
}

// ---------------------------------------------------------------- pseudo D21

var pseudoMap = map[rune]rune{
	'a': 'á', 'b': 'ƀ', 'c': 'ç', 'd': 'ð', 'e': 'é', 'f': 'ƒ', 'g': 'ĝ', 'h': 'ĥ', 'i': 'í', 'j': 'ĵ', 'k': 'ķ', 'l': 'ļ', 'm': 'ɱ',
	'n': 'ñ', 'o': 'ó', 'p': 'þ', 'q': 'ǫ', 'r': 'ŕ', 's': 'š', 't': 'ţ', 'u': 'ú', 'v': 'ṽ', 'w': 'ŵ', 'x': 'ẋ', 'y': 'ý', 'z': 'ž',
	'A': 'Á', 'B': 'Ɓ', 'C': 'Ç', 'D': 'Ð', 'E': 'É', 'F': 'Ƒ', 'G': 'Ĝ', 'H': 'Ĥ', 'I': 'Í', 'J': 'Ĵ', 'K': 'Ķ', 'L': 'Ļ', 'M': 'Ṁ',
	'N': 'Ñ', 'O': 'Ó', 'P': 'Þ', 'Q': 'Ǫ', 'R': 'Ŕ', 'S': 'Š', 'T': 'Ţ', 'U': 'Ú', 'V': 'Ṽ', 'W': 'Ŵ', 'X': 'Ẋ', 'Y': 'Ý', 'Z': 'Ž',
}

// Pseudo is English with accented letters, ~35 % padding and brackets (D21),
// the Go twin of Locale.ts's pseudo(). ICU syntax is left untouched, so a
// pseudo message still formats: an argument ({n, number}), a plural or select's
// keyword and category names, and <tags>. The TEXT inside a plural or select
// branch is transformed like any other text (L21: a mob name's
// {count, plural, one {Wolf} other {Wolves}} is words a player reads).
func Pseudo(text string) string {
	if text == "" {
		return text
	}
	var b strings.Builder
	rs := []rune(text)
	for i := 0; i < len(rs); {
		i = pseudoMessage(&b, rs, i)
		if i < len(rs) { // a stray '}' at the top: keep it and go on
			b.WriteRune(rs[i])
			i++
		}
	}
	pad := (utf8.RuneCountInString(text)*35 + 99) / 100
	return "[" + b.String() + strings.Repeat("·", pad) + "]"
}

// pseudoMessage writes message text from rs[i:] until an unmatched '}' (the
// end of a branch) and returns the index of that '}' (or len(rs)).
func pseudoMessage(b *strings.Builder, rs []rune, i int) int {
	inTag := false
	for i < len(rs) {
		r := rs[i]
		switch {
		case r == '}':
			return i
		case r == '{':
			i = pseudoArgument(b, rs, i)
			continue
		case r == '<':
			inTag = true
		case r == '>' && inTag:
			inTag = false
		case !inTag:
			if m, ok := pseudoMap[r]; ok {
				r = m
			}
		}
		b.WriteRune(r)
		i++
	}
	return i
}

// pseudoArgument copies one {argument ...} starting at rs[i] == '{' and returns
// the index after its closing '}'. A plural or select argument's branches are
// messages and are transformed; anything else is copied verbatim.
func pseudoArgument(b *strings.Builder, rs []rune, i int) int {
	start := i
	depth := 0
	commas := 0
	j := i
	for ; j < len(rs); j++ {
		if rs[j] == '{' {
			depth++
		} else if rs[j] == '}' {
			depth--
			if depth == 0 {
				break
			}
		} else if rs[j] == ',' && depth == 1 {
			commas++
			if commas == 2 {
				break
			}
		}
	}
	if j >= len(rs) || rs[j] == '}' {
		// A simple argument ({mob}, {n, number}): syntax only.
		end := j + 1
		if end > len(rs) {
			end = len(rs)
		}
		b.WriteString(string(rs[start:end]))
		return end
	}
	kind := strings.TrimSpace(string(rs[start+1 : j]))
	if c := strings.Index(kind, ","); c >= 0 {
		kind = strings.TrimSpace(kind[c+1:])
	}
	if kind != "plural" && kind != "select" && kind != "selectordinal" {
		// Not a branching argument: copy through its closing brace.
		depth = 0
		for k := start; k < len(rs); k++ {
			if rs[k] == '{' {
				depth++
			} else if rs[k] == '}' {
				depth--
				if depth == 0 {
					b.WriteString(string(rs[start : k+1]))
					return k + 1
				}
			}
		}
		b.WriteString(string(rs[start:]))
		return len(rs)
	}
	// {name, plural, <cat> {msg} <cat> {msg} ...}
	b.WriteString(string(rs[start : j+1]))
	k := j + 1
	for k < len(rs) {
		switch rs[k] {
		case '}':
			b.WriteRune('}')
			return k + 1
		case '{':
			b.WriteRune('{')
			k = pseudoMessage(b, rs, k+1)
			if k < len(rs) {
				b.WriteRune('}')
				k++
			}
		default:
			b.WriteRune(rs[k]) // a category name, an offset, whitespace
			k++
		}
	}
	return k
}

// ---------------------------------------------------------------- entries

// Entry is one translatable content string: its key (D20, D29) and its English
// as an ICU message.
type Entry struct {
	Key  string
	Text string
}

// ---------------------------------------------------------------- ICU (L14)

var placeholderPattern = regexp.MustCompile(`\{([A-Za-z][A-Za-z0-9_]*)(?:, number)?\}`)

// CheckAuthoredText refuses authored English that would not survive as an ICU
// message (L14, revised 2026-10-06: refuse, never escape): a `{` or `}` outside
// the field's known placeholders, an apostrophe directly before a brace, and
// `<`/`>` (ICU rich-text tags in intl-messageformat).
func CheckAuthoredText(text string, allowed ...string) error {
	stripped := placeholderPattern.ReplaceAllStringFunc(text, func(m string) string {
		name := placeholderPattern.FindStringSubmatch(m)[1]
		for _, a := range allowed {
			if a == name {
				return ""
			}
		}
		return m
	})
	if strings.ContainsAny(stripped, "{}") {
		return fmt.Errorf("contains '{' or '}' outside its placeholders %v", allowed)
	}
	if strings.Contains(text, "'{") || strings.Contains(text, "'}") {
		return fmt.Errorf("an apostrophe directly before a brace starts an ICU quote")
	}
	if strings.ContainsAny(text, "<>") {
		return fmt.Errorf("contains '<' or '>', which ICU reads as a tag")
	}
	return nil
}

// NumberPlaceholders rewrites the authored `{n}`/`{m}` count placeholders to
// `{n, number}` (D16: every number a player sees is locale-formatted; authors
// keep writing `{n}/{m}`).
func NumberPlaceholders(text string, names ...string) string {
	for _, n := range names {
		text = strings.ReplaceAll(text, "{"+n+"}", "{"+n+", number}")
	}
	return text
}

// ---------------------------------------------------------------- keys (D20)

// The content keys, one builder per field, so a catalog, a hydration and a
// check can never spell one differently: dotted parts, each id exactly as
// authored (D29, revised 2026-10-12). tools/lang/content-text.mjs is the JS twin
// (the editor and the extract tool).
func QuestTitle(questID string) string { return "quest." + questID + ".title" }
func QuestJournal(questID, stageID string) string {
	return "quest." + questID + "." + stageID + ".journal"
}
func QuestStageTracker(questID, stageID string) string {
	return "quest." + questID + "." + stageID + ".tracker"
}
func QuestObjectiveTracker(questID, stageID, kind, target string) string {
	return "quest." + questID + "." + stageID + "." + kind + "." + target + ".tracker"
}
func MobName(mob string) string            { return "mob." + mob + ".name" }
func SkillName(skill string) string        { return "skill." + skill + ".name" }
func SkillDescription(skill string) string { return "skill." + skill + ".description" }
func RegionTitle(region string) string     { return "region." + region + ".title" }
func RegionSubtitle(region string) string  { return "region." + region + ".subtitle" }
func ZoneName(zone string) string          { return "zone." + zone + ".name" }
func AppearanceName(item string) string    { return "appearance." + item + ".name" }

// The words a door shows (plan-passages.md D6): an exit's own, keyed by its
// id, and a destination's, keyed by its anchor name. All optional.
func ExitTitle(exit string) string    { return "exit." + exit + ".title" }
func ExitText(exit string) string     { return "exit." + exit + ".text" }
func ExitGo(exit string) string       { return "exit." + exit + ".go" }
func AnchorText(anchor string) string { return "anchor." + anchor + ".text" }

// The words every exit of one look says by default (D12).
func ExitLookText(look string) string { return "exit-look." + look + ".text" }
func ExitLookGo(look string) string   { return "exit-look." + look + ".go" }

// Conversation is a dialogue line's key: its NPC (the mob's name) and its slug,
// unique within that NPC (D27).
func Conversation(npc, slug string) string { return "conv." + npc + "." + slug }

// StockPrefix starts every shared phrase's key (D28).
const StockPrefix = "stock."

// StockPhrase is a shared phrase's key (D28).
func StockPhrase(name string) string { return StockPrefix + name }

// SkillArg is the one argument a dialogue line may carry: the name of the
// skill its teach_skill grant teaches (stock.teach-skill, 2026-10-15).
const SkillArg = "skill"

// FillSkill is a teach line's English with {skill} filled in. Plain
// replacement is exact: CheckAuthoredText refuses every other brace.
func FillSkill(text, skillName string) string {
	return strings.ReplaceAll(text, "{"+SkillArg+"}", skillName)
}
