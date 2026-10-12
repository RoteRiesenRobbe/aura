package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"path"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// plan-localization.md D25, D26, D30: the translation state of every locale,
// computed ONCE here and read by both the completeness test
// (TestLangGermanIsCompleteAndCurrent) and the content editor's "German owed"
// panel (`aurad -lang-status`), never by a JS port.
//
//   - missing: a content key with no translation;
//   - outdated: a translation whose English changed since it was made (D20,
//     the <locale>/<domain>.translated-from.json record);
//   - allowlisted: either of the above, excused by <locale>/allowlist.json;
//   - tooLong: a text over its key's x-maxLength (D30), English included.
//
// German is the strict language: its test fails on any of these (D26); a later
// language only reports.

type localeStatus struct {
	Missing     []string `json:"missing"`
	Outdated    []string `json:"outdated"`
	Allowlisted []string `json:"allowlisted"`
	TooLong     []string `json:"tooLong"`
}

// langStatus reports every locale directory under the lang tree, English first
// (which can only be too long).
func langStatus(c loadedContent, langFS fs.FS) (map[string]*localeStatus, error) {
	limits, err := maxLengths(langFS)
	if err != nil {
		return nil, err
	}
	dirs, err := fs.ReadDir(langFS, ".")
	if err != nil {
		return nil, err
	}
	out := map[string]*localeStatus{}
	for _, dir := range dirs {
		if !dir.IsDir() {
			continue
		}
		locale := dir.Name()
		st := &localeStatus{Missing: []string{}, Outdated: []string{}, Allowlisted: []string{}, TooLong: []string{}}
		out[locale] = st
		overlay := c.langBundle.Overlay(locale)
		allow := map[string]bool{}
		if raw, err := fs.ReadFile(langFS, path.Join(locale, "allowlist.json")); err == nil {
			var keys []string
			if err := json.Unmarshal(raw, &keys); err != nil {
				return nil, fmt.Errorf("lang/%s/allowlist.json: %w", locale, err)
			}
			for _, k := range keys {
				allow[k] = true
			}
		}
		for _, d := range langDomains {
			record := map[string]string{}
			if raw, err := fs.ReadFile(langFS, path.Join(locale, d.name+".translated-from.json")); err == nil {
				if err := json.Unmarshal(raw, &record); err != nil {
					return nil, fmt.Errorf("lang/%s/%s.translated-from.json: %w", locale, d.name, err)
				}
			}
			for _, e := range c.langEntries[d.name] {
				text := overlay[e.Key]
				if locale == lang.Source {
					text = e.Text
				} else if text == "" {
					if allow[e.Key] {
						st.Allowlisted = append(st.Allowlisted, e.Key)
					} else {
						st.Missing = append(st.Missing, e.Key)
					}
					continue
				} else if record[e.Key] != e.Text {
					if allow[e.Key] {
						st.Allowlisted = append(st.Allowlisted, e.Key)
					} else {
						st.Outdated = append(st.Outdated, fmt.Sprintf("%s: was %q, now %q", e.Key, record[e.Key], e.Text))
					}
				}
				if limit, ok := limits[e.Key]; ok && visibleLength(text) > limit {
					st.TooLong = append(st.TooLong, fmt.Sprintf("%s: %d characters, at most %d: %q", e.Key, visibleLength(text), limit, text))
				}
			}
		}
		sort.Strings(st.Missing)
		sort.Strings(st.Outdated)
		sort.Strings(st.Allowlisted)
		sort.Strings(st.TooLong)
	}
	return out, nil
}

// maxLengths reads every English key's optional x-maxLength (D30).
func maxLengths(langFS fs.FS) (map[string]int, error) {
	files, err := fs.Glob(langFS, path.Join(lang.Source, "*.arb"))
	if err != nil {
		return nil, err
	}
	out := map[string]int{}
	for _, f := range files {
		raw, err := fs.ReadFile(langFS, f)
		if err != nil {
			return nil, err
		}
		var doc map[string]json.RawMessage
		if err := json.Unmarshal(raw, &doc); err != nil {
			return nil, fmt.Errorf("lang/%s: %w", f, err)
		}
		for k, v := range doc {
			if !strings.HasPrefix(k, "@") || k == "@@locale" {
				continue
			}
			var meta struct {
				MaxLength int `json:"x-maxLength"`
			}
			if json.Unmarshal(v, &meta) == nil && meta.MaxLength > 0 {
				out[strings.TrimPrefix(k, "@")] = meta.MaxLength
			}
		}
	}
	return out, nil
}

// visibleLength counts what a player reads, in characters (a proxy: the face
// is proportional, D30): for a plural name, its longest form.
func visibleLength(text string) int {
	if !strings.HasPrefix(text, "{count, plural,") {
		return utf8.RuneCountInString(text)
	}
	longest := 0
	depth, start := 0, 0
	for i, r := range text {
		switch r {
		case '{':
			depth++
			if depth == 2 {
				start = i + 1
			}
		case '}':
			if depth == 2 {
				if n := utf8.RuneCountInString(text[start:i]); n > longest {
					longest = n
				}
			}
			depth--
		}
	}
	return longest
}

// langStatusMain is `aurad -lang-status`: load the content as a boot would,
// print every locale's status as JSON and exit 0, or the content findings and
// exit 1. It needs no database, like -validate.
func langStatusMain(w io.Writer, contentDir, startZone string, debugZones bool) int {
	src := embeddedContent()
	if contentDir != "" {
		disk, err := diskContent(contentDir)
		if err != nil {
			fmt.Fprintf(w, "content: %v\n", err)
			return validateExitFindings
		}
		src = disk
	}
	if debugZones {
		var err error
		if src, err = useDebugZones(src); err != nil {
			fmt.Fprintf(w, "content: %v\n", err)
			return validateExitFindings
		}
	}
	config, err := validateConf()
	if err != nil {
		fmt.Fprintf(w, "config: %v\n", err)
		return validateExitBroken
	}
	loaded, findings := loadContent(src, config, resolveStartZone(startZone, debugZones, config.Game.StartZone))
	if len(findings) > 0 {
		for _, f := range findings {
			fmt.Fprintln(w, f)
		}
		return validateExitFindings
	}
	status, err := langStatus(loaded, src.lang)
	if err != nil {
		fmt.Fprintf(w, "lang: %v\n", err)
		return validateExitBroken
	}
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	if err := enc.Encode(status); err != nil {
		return validateExitBroken
	}
	return validateExitClean
}
