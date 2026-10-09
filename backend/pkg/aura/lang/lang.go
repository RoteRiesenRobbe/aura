// Package lang is the server half of localization (plan-localization.md).
//
// The server stays locale-free in the game loop (D1): it never formats a
// sentence for a player. What it does own is the CONTENT text, served over
// HTTP per locale:
//
//   - the English source is extracted from the authored api/ JSON at boot and
//     written, with generated translator notes, to api/lang/en/<domain>.arb
//     (D19; never hand-edited, L15);
//   - translations are ARB overlays in api/lang/<locale>/<domain>.arb (D3, D17),
//     keyed by the content's own stable ids (D20); a missing key falls back to
//     English at serve time (D13);
//   - every catalog is marshaled once PER LOCALE at boot (D6), and `?lang=`
//     picks one by BCP 47 truncation, unknown → en (D2 amendment (a)).
//
// The package is a leaf: it imports nothing from the game, so every content
// package may use its key builders.
package lang

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"path"
	"regexp"
	"sort"
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

// Bundle holds every loaded overlay: locale → key → text.
type Bundle struct {
	overlays map[string]map[string]string
	// stock links a dialogue key to its shared stock-phrase key (§8): a line
	// whose own German is missing falls back to the phrase's German.
	stock map[string]string
}

// NewBundle is an empty bundle (English only), for tests and tools.
func NewBundle() *Bundle {
	return &Bundle{overlays: map[string]map[string]string{}, stock: map[string]string{}}
}

// LinkStock records that key's English is the shared phrase stockName (§8).
func (b *Bundle) LinkStock(key, stockName string) { b.stock[key] = StockPhrase(stockName) }

// Set adds one translation (tests, tools).
func (b *Bundle) Set(locale, key, text string) {
	if b.overlays[locale] == nil {
		b.overlays[locale] = map[string]string{}
	}
	b.overlays[locale][key] = text
}

// Overlay returns a locale's loaded keys (read-only use).
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
		if stockKey, ok := b.stock[key]; ok {
			if s, ok := overlay[stockKey]; ok && s != "" {
				return s
			}
		}
		return english
	}
}

var keyPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.\-]*$`)

// ValidKey reports whether key is a well-formed content key.
func ValidKey(key string) bool { return keyPattern.MatchString(key) }

// LoadOverlays reads every api/lang/<locale>/*.arb except the generated
// English. A file that is not valid UTF-8 (L17: an ANSI save on Windows would
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
		if !dir.IsDir() || dir.Name() == Source {
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
// the Go twin of Locale.ts's pseudo(). ICU syntax ({placeholders}, <tags>) is
// left untouched, so a pseudo message still formats.
func Pseudo(text string) string {
	if text == "" {
		return text
	}
	var b strings.Builder
	depth := 0
	inTag := false
	for _, r := range text {
		switch {
		case r == '{':
			depth++
		case r == '}' && depth > 0:
			depth--
		case r == '<' && depth == 0:
			inTag = true
		case r == '>' && inTag:
			inTag = false
			b.WriteRune(r)
			continue
		}
		if depth == 0 && !inTag {
			if m, ok := pseudoMap[r]; ok {
				r = m
			}
		}
		b.WriteRune(r)
	}
	pad := (utf8.RuneCountInString(text)*35 + 99) / 100
	return "[" + b.String() + strings.Repeat("·", pad) + "]"
}

// ---------------------------------------------------------------- the source

// Placeholder is one ICU argument's translator note (D18).
type Placeholder struct {
	Name        string
	Type        string
	Description string
	Example     string
}

// Entry is one translatable content string: its key (D20), its English as an
// ICU message, and its generated note.
type Entry struct {
	Key          string
	Text         string
	Description  string
	Placeholders []Placeholder
	// Stock is the shared phrase this line's English matches (§8), or "".
	Stock string
}

// GenerateARB writes a domain's English source file (D19): `@@locale` first,
// then each message followed by its `@` metadata, in key order, LF only, no
// HTML escaping, so the bytes are stable across runs and machines (L16).
func GenerateARB(entries []Entry) []byte {
	sorted := append([]Entry(nil), entries...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Key < sorted[j].Key })
	var buf bytes.Buffer
	buf.WriteString("{\n  \"@@locale\": \"en\"")
	for _, e := range sorted {
		buf.WriteString(",\n  ")
		buf.WriteString(quote(e.Key))
		buf.WriteString(": ")
		buf.WriteString(quote(e.Text))
		buf.WriteString(",\n  ")
		buf.WriteString(quote("@" + e.Key))
		buf.WriteString(": {\n    \"description\": ")
		buf.WriteString(quote(e.Description))
		if e.Stock != "" {
			buf.WriteString(",\n    \"x_stock\": ")
			buf.WriteString(quote(e.Stock))
		}
		if len(e.Placeholders) > 0 {
			buf.WriteString(",\n    \"placeholders\": {")
			for i, p := range e.Placeholders {
				if i > 0 {
					buf.WriteString(",")
				}
				fmt.Fprintf(&buf, "\n      %s: {\"type\": %s, \"description\": %s, \"example\": %s}",
					quote(p.Name), quote(p.Type), quote(p.Description), quote(p.Example))
			}
			buf.WriteString("\n    }")
		}
		buf.WriteString("\n  }")
	}
	buf.WriteString("\n}\n")
	return buf.Bytes()
}

func quote(s string) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(s)
	return strings.TrimSuffix(buf.String(), "\n")
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

// The content keys, one builder per field, so a catalog and the generator can
// never spell one differently.
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
func MobNamePlural(mob string) string      { return "mob." + mob + ".namePlural" }
func SkillName(skill string) string        { return "skill." + skill + ".name" }
func SkillDescription(skill string) string { return "skill." + skill + ".description" }
func RegionTitle(region string) string     { return "region." + region + ".title" }
func RegionSubtitle(region string) string  { return "region." + region + ".subtitle" }
func ZoneName(zone string) string          { return "zone." + zone + ".name" }
func Conversation(id string) string        { return "conv." + id }
func StockPhrase(name string) string       { return "stock." + name }
