package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// plan-localization.md C1 + C5a, the content pins:
//   - every English key belongs to content, in its domain's file, and carries
//     a translator note (D27, D18); a content string without English refuses
//     the boot itself;
//   - every English key has its German, except the allowlist (D13);
//   - no German key is an orphan (D13, a TEST failure, never a boot failure);
//   - no German translation is outdated against its English (D20).
//
// After checking the German, rewrite the translated-from records:
//
//	UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/
//
// ⚑ -count=1: a content edit does not invalidate the Go test cache (L3).

const langDir = "../../../api/lang"

func loadLangContent(t *testing.T) loadedContent {
	t.Helper()
	src, err := diskContent("../../../api")
	require.NoError(t, err)
	config := mustDefaultConfig(t)
	loaded, findings := loadContent(src, config, config.Game.StartZone)
	require.Empty(t, findings)
	return loaded
}

var updateLang = os.Getenv("UPDATE_LANG") != ""

func TestLangEnglishBelongsToContentAndCarriesNotes(t *testing.T) {
	loaded := loadLangContent(t)
	inDomain := map[string]string{}
	for _, d := range langDomains {
		for _, e := range loaded.langEntries[d.name] {
			inDomain[e.Key] = d.name
		}
	}
	var orphans, misplaced, unnoted []string
	for _, d := range langDomains {
		raw, err := os.ReadFile(filepath.Join(langDir, "en", d.name+".arb"))
		require.NoError(t, err)
		var doc map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(raw, &doc))
		for k := range doc {
			if strings.HasPrefix(k, "@") {
				continue
			}
			if domain, ok := inDomain[k]; !ok {
				orphans = append(orphans, d.name+": "+k)
			} else if domain != d.name {
				misplaced = append(misplaced, fmt.Sprintf("%s is in en/%s.arb, its content is %s", k, d.name, domain))
			}
			var meta struct {
				Description string `json:"description"`
			}
			if note, ok := doc["@"+k]; !ok || json.Unmarshal(note, &meta) != nil || meta.Description == "" {
				unnoted = append(unnoted, d.name+": "+k)
			}
		}
	}
	sort.Strings(orphans)
	sort.Strings(misplaced)
	sort.Strings(unnoted)
	require.Empty(t, orphans, "English keys that match no content (deleted content, a renamed id, or a typo); remove them")
	require.Empty(t, misplaced, "English keys in the wrong domain file")
	require.Empty(t, unnoted, "English keys without a translator note (D18)")
}

func readAllowlist(t *testing.T, locale string) map[string]bool {
	t.Helper()
	out := map[string]bool{}
	raw, err := os.ReadFile(filepath.Join(langDir, locale, "allowlist.json"))
	if os.IsNotExist(err) {
		return out
	}
	require.NoError(t, err)
	var keys []string
	require.NoError(t, json.Unmarshal(raw, &keys))
	for _, k := range keys {
		out[k] = true
	}
	return out
}

func TestLangGermanIsCompleteAndCurrent(t *testing.T) {
	loaded := loadLangContent(t)
	src, err := diskContent("../../../api")
	require.NoError(t, err)
	// ONE status function for this pin and the editor's "German owed" panel
	// (aurad -lang-status, D25): German is the strict language (D26).
	status, err := langStatus(loaded, src.lang)
	require.NoError(t, err)
	de := status["de"]
	require.NotNil(t, de)

	german := loaded.langBundle.Overlay("de")
	allKeys := map[string]bool{}
	for _, d := range langDomains {
		fresh := map[string]string{}
		for _, e := range loaded.langEntries[d.name] {
			allKeys[e.Key] = true
			if german[e.Key] != "" {
				fresh[e.Key] = e.Text
			}
		}
		if updateLang && len(fresh) > 0 {
			writeSortedJSON(t, filepath.Join(langDir, "de", d.name+".translated-from.json"), fresh)
		}
	}
	var orphans []string
	for k := range german {
		if !allKeys[k] {
			orphans = append(orphans, k)
		}
	}
	sort.Strings(orphans)
	require.Empty(t, orphans, "German keys that match no content (deleted content or a typo)")
	if !updateLang {
		require.Empty(t, de.Outdated, "German translated from an older English (D20); check it, then UPDATE_LANG=1")
	}
	require.Empty(t, de.Missing, "English keys with no German and not on api/lang/de/allowlist.json (D13)")
	require.Empty(t, de.TooLong, "German over its length limit (D30)")
	require.Empty(t, status["en"].TooLong, "English over its length limit (D30)")
}

func writeSortedJSON(t *testing.T, file string, m map[string]string) {
	t.Helper()
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var buf bytes.Buffer
	buf.WriteString("{")
	for i, k := range keys {
		if i > 0 {
			buf.WriteString(",")
		}
		kb, _ := json.Marshal(k)
		vb, _ := json.Marshal(m[k])
		buf.WriteString("\n  " + string(kb) + ": " + string(vb))
	}
	buf.WriteString("\n}\n")
	require.NoError(t, os.WriteFile(file, buf.Bytes(), 0o644))
}
