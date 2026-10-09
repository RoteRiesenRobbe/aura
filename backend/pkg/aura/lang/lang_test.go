package lang

import (
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNegotiate_TruncatesAndFallsBackToEnglish(t *testing.T) {
	assert.Equal(t, "de", Negotiate("de-AT"))
	assert.Equal(t, "de", Negotiate("DE"))
	assert.Equal(t, "en", Negotiate("fr"))
	assert.Equal(t, "en", Negotiate(""))
	assert.Equal(t, PseudoLocale, Negotiate("en-XA"))
	// The pseudo-locale is never reached by truncation.
	assert.Equal(t, "en", Negotiate("en-XA-x"))
}

func TestPseudo_AccentsTextButNotICUSyntax(t *testing.T) {
	out := Pseudo("Kill {n, number} <b>wolves</b>")
	assert.True(t, strings.HasPrefix(out, "[Ķíļļ {n, number} <b>ŵóļṽéš</b>"), out)
	assert.True(t, strings.HasSuffix(out, "·]"), out)
}

func TestLoadOverlays_RefusesNonUTF8ByFileName(t *testing.T) {
	fsys := fstest.MapFS{"de/quests.arb": {Data: []byte("{\"a.b\": \"W\xf6lfe\"}")}}
	_, err := LoadOverlays(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "de/quests.arb")
	assert.Contains(t, err.Error(), "UTF-8")
}

func TestLoadOverlays_RefusesAMalformedKey(t *testing.T) {
	fsys := fstest.MapFS{"de/quests.arb": {Data: []byte(`{"bad key": "x"}`)}}
	_, err := LoadOverlays(fsys)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bad key")
}

func TestLoadOverlays_SkipsTheGeneratedEnglishAndMetadata(t *testing.T) {
	fsys := fstest.MapFS{
		"en/quests.arb": {Data: []byte(`{"q.title": "Wolves"}`)},
		"de/quests.arb": {Data: []byte(`{"@@locale": "de", "q.title": "Wölfe", "@q.title": {"description": "x"}}`)},
		// An orphan is not a boot failure (PO 2026-10-07): it is never looked up.
		"de/other.arb": {Data: []byte(`{"gone.key": "Weg"}`)},
	}
	b, err := LoadOverlays(fsys)
	require.NoError(t, err)
	assert.Equal(t, "Wölfe", b.For("de")("q.title", "Wolves"))
	assert.Equal(t, "Wolves", b.For("en")("q.title", "Wolves"))
	assert.Equal(t, "Missing", b.For("de")("q.other", "Missing"), "a missing key falls back to English (D13)")
	assert.Nil(t, b.Overlay("en"))
}

func TestBundle_StockPhraseFallback(t *testing.T) {
	b := NewBundle()
	b.Set("de", StockPhrase("quest-accept"), "Mach ich.")
	b.LinkStock(Conversation("a1"), "quest-accept")
	b.LinkStock(Conversation("a2"), "quest-accept")
	b.Set("de", Conversation("a2"), "Wird erledigt.")
	assert.Equal(t, "Mach ich.", b.For("de")(Conversation("a1"), "I'll do it."))
	assert.Equal(t, "Wird erledigt.", b.For("de")(Conversation("a2"), "I'll do it."), "a line's own German overrides the phrase")
}

func TestHandler_MarshalsOncePerLocaleAndNegotiates(t *testing.T) {
	b := NewBundle()
	b.Set("de", "k", "Hallo")
	builds := 0
	h, err := Handler(b, func(tr Tr) ([]byte, error) {
		builds++
		return []byte(tr("k", "Hello")), nil
	})
	require.NoError(t, err)
	assert.Equal(t, len(Served), builds, "built once per served locale, at construction")
	get := func(q string) string {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest("GET", "/x"+q, nil))
		body, _ := io.ReadAll(rec.Body)
		return string(body)
	}
	assert.Equal(t, "Hallo", get("?lang=de-AT"))
	assert.Equal(t, "Hello", get("?lang=fr"))
	assert.Equal(t, "Hello", get(""))
	assert.Equal(t, get("?lang=de"), get("?lang=de"), "byte-stable across requests")
	assert.Equal(t, len(Served), builds)
}

func TestCheckAuthoredText(t *testing.T) {
	assert.NoError(t, CheckAuthoredText("{n}/{m} wolves slain", "n", "m"))
	assert.NoError(t, CheckAuthoredText("{n, number}/{m, number} wolves", "n", "m"))
	assert.NoError(t, CheckAuthoredText("Wrecker's Bluff"))
	assert.Error(t, CheckAuthoredText("a {stray} brace"))
	assert.Error(t, CheckAuthoredText("odd '{n}' quote", "n"))
	assert.Error(t, CheckAuthoredText("a <tag> here"))
}

func TestGenerateARB_IsStableAndUnescaped(t *testing.T) {
	entries := []Entry{
		{Key: "b.key", Text: "<x> & \"y\"", Description: "B"},
		{Key: "a.key", Text: "{n, number} wolves", Description: "A",
			Placeholders: []Placeholder{{Name: "n", Type: "int", Description: "count", Example: "3"}}},
	}
	out := string(GenerateARB(entries))
	assert.Equal(t, out, string(GenerateARB(entries)))
	assert.True(t, strings.Index(out, "a.key") < strings.Index(out, "b.key"), "key order")
	assert.Contains(t, out, `"<x> & \"y\""`, "no HTML escaping")
	assert.NotContains(t, out, "\r")
}
