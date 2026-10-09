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

	"github.com/RoteRiesenRobbe/aura/pkg/aura/lang"
)

// plan-localization.md C1, the content pins:
//   - the generated English source files are not stale (D19, L15);
//   - every English key has its German, except the allowlist (D13);
//   - no German key is an orphan (D13, a TEST failure, never a boot failure);
//   - no German translation is outdated against its English (D20).
//
// Regenerate the English sources after a content edit, and the translated-from
// records after checking the German:
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

func TestLangEnglishSourcesAreFresh(t *testing.T) {
	loaded := loadLangContent(t)
	for _, d := range langDomains {
		file := filepath.Join(langDir, "en", d.name+".arb")
		want := lang.GenerateARB(loaded.langEntries[d.name])
		if updateLang {
			require.NoError(t, os.MkdirAll(filepath.Dir(file), 0o755))
			require.NoError(t, os.WriteFile(file, want, 0o644))
			continue
		}
		got, err := os.ReadFile(file)
		require.NoError(t, err, "api/lang/en/%s.arb is missing; run UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/", d.name)
		got = bytes.ReplaceAll(got, []byte("\r\n"), []byte("\n"))
		require.True(t, bytes.Equal(want, got),
			"api/lang/en/%s.arb is stale (never hand-edit it, L15); run UPDATE_LANG=1 go test -count=1 -run TestLang ./cmd/aurad/", d.name)
	}
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
	allow := readAllowlist(t, "de")
	german := loaded.langBundle.Overlay("de")
	var missing, orphans, outdated []string
	allKeys := map[string]bool{}
	for _, d := range langDomains {
		domainKeys := map[string]bool{}
		sourcePath := filepath.Join(langDir, "de", d.name+".source.json")
		record := map[string]string{}
		if raw, err := os.ReadFile(sourcePath); err == nil {
			require.NoError(t, json.Unmarshal(raw, &record))
		}
		fresh := map[string]string{}
		for _, e := range loaded.langEntries[d.name] {
			allKeys[e.Key] = true
			domainKeys[e.Key] = true
			own, hasOwn := german[e.Key]
			stockGerman := e.Stock != "" && german[lang.StockPhrase(e.Stock)] != ""
			if !hasOwn && !stockGerman {
				if !allow[e.Key] {
					missing = append(missing, e.Key)
				}
				continue
			}
			if hasOwn && own != "" {
				fresh[e.Key] = e.Text
				if record[e.Key] != e.Text && !allow[e.Key] {
					outdated = append(outdated, fmt.Sprintf("%s: was %q, now %q", e.Key, record[e.Key], e.Text))
				}
			}
		}
		if updateLang && len(fresh) > 0 {
			writeSortedJSON(t, sourcePath, fresh)
		}
	}
	for k := range german {
		if !allKeys[k] && !strings.HasPrefix(k, "stock.") {
			orphans = append(orphans, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(orphans)
	sort.Strings(outdated)
	if updateLang {
		outdated = nil
	}
	require.Empty(t, orphans, "German keys that match no content (deleted content or a typo)")
	require.Empty(t, outdated, "German translated from an older English (D20); check it, then UPDATE_LANG=1")
	require.Empty(t, missing, "English keys with no German and not on api/lang/de/allowlist.json (D13)")
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
