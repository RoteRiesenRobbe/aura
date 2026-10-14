package lang

import (
	"encoding/json"
	"io"
	"net/http/httptest"
	"os"
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

// L21: a plural branch is TEXT, so the pseudo-locale marks it; the argument,
// the `plural` keyword and the category names are syntax and stay.
func TestPseudo_TransformsTheTextInsidePluralBranches(t *testing.T) {
	out := Pseudo("{count, plural, one {Wolf} other {Wolves}}")
	assert.True(t, strings.HasPrefix(out, "[{count, plural, one {Ŵóļƒ} other {Ŵóļṽéš}}"), out)
	nested := Pseudo("{n, number} {m, plural, =0 {none} other {{mob} slain}}")
	assert.Contains(t, nested, "{n, number} {m, plural, =0 {ñóñé} other {{mob} šļáíñ}}")
}

func TestMobNames_TheEnglishShape(t *testing.T) {
	// D24: plain text, or exactly one/other on `count`.
	assert.NoError(t, CheckMobName("Farmer"))
	assert.NoError(t, CheckMobName("{count, plural, one {Wolf} other {Wolves}}"))
	assert.Error(t, CheckMobName("{count, plural, one {Wolf} few {Wolfs} other {Wolves}}"), "English has two forms")
	assert.Error(t, CheckMobName("{n, plural, one {Wolf} other {Wolves}}"), "the argument is count")
	assert.Error(t, CheckMobName("{count, select, one {Wolf} other {Wolves}}"))
	assert.Error(t, CheckMobName("A {stray} brace"))

	assert.Equal(t, "Wolf", Singular("{count, plural, one {Wolf} other {Wolves}}"))
	assert.Equal(t, "Farmer", Singular("Farmer"))
	assert.True(t, HasPlural("{count, plural, one {Wolf} other {Wolves}}"))
	assert.False(t, HasPlural("Farmer"))
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

func TestLoadOverlays_LoadsEveryLocaleIncludingEnglish(t *testing.T) {
	fsys := fstest.MapFS{
		"en/quests.arb": {Data: []byte(`{"@@locale": "en", "q_title": "Wolves", "@q_title": {"description": "x"}}`)},
		"de/quests.arb": {Data: []byte(`{"@@locale": "de", "q_title": "Wölfe", "@q_title": {"description": "x"}}`)},
		// An orphan is not a boot failure (PO 2026-10-07): it is never looked up.
		"de/other.arb": {Data: []byte(`{"gone_key": "Weg"}`)},
	}
	b, err := LoadOverlays(fsys)
	require.NoError(t, err)
	assert.Equal(t, "Wölfe", b.For("de")("q_title", "Wolves"))
	assert.Equal(t, "Wolves", b.For("en")("q_title", "Wolves"))
	assert.Equal(t, "Missing", b.For("de")("q_other", "Missing"), "a missing key falls back to English (D13)")
	assert.Equal(t, map[string]string{"q_title": "Wolves"}, b.Overlay(Source), "D27: English is authored in its ARB")
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

func TestKeys_AreDottedWithIdsAsAuthored(t *testing.T) {
	// D29 (revised 2026-10-12): dotted parts, each id exactly as authored.
	for key, want := range map[string]string{
		QuestTitle("wolves-on-the-road"):                                               "quest.wolves-on-the-road.title",
		QuestJournal("wolves-on-the-road", "cull"):                                     "quest.wolves-on-the-road.cull.journal",
		QuestStageTracker("q", "report-back"):                                          "quest.q.report-back.tracker",
		QuestObjectiveTracker("dinner-for-the-family", "gather", "talk_to", "Hendrik"): "quest.dinner-for-the-family.gather.talk_to.Hendrik.tracker",
		MobName("AlphaWolf"):                                                           "mob.AlphaWolf.name",
		SkillName("Aegis"):                                                             "skill.Aegis.name",
		SkillDescription("Aegis"):                                                      "skill.Aegis.description",
		RegionTitle("saltgrass"):                                                       "region.saltgrass.title",
		RegionSubtitle("saltgrass"):                                                    "region.saltgrass.subtitle",
		ZoneName("koboldCave"):                                                         "zone.koboldCave.name",
		Conversation("Farmer", "ill-do-it"):                                            "conv.Farmer.ill-do-it",
		StockPhrase("quest-accept"):                                                    "stock.quest-accept",
	} {
		assert.Equal(t, want, key)
		assert.True(t, ValidKey(key), key)
	}
	assert.False(t, ValidKey("quest..title"), "an empty part")
	assert.False(t, ValidKey("quest.q."), "a trailing dot")
	assert.False(t, ValidKey("conv.a b"), "a space")
	assert.False(t, ValidKey("_lead"))
}

// The JS twin (tools/lang/content-text.mjs, the editor and the extract tool)
// spells every key from the same fixture, so the two cannot drift apart.
func TestKeys_AgreeWithTheJSTwin(t *testing.T) {
	raw, err := os.ReadFile("../../../../tools/lang/testdata/keys.json")
	require.NoError(t, err)
	var fixture []struct {
		Builder string
		Args    []string
		Key     string
	}
	require.NoError(t, json.Unmarshal(raw, &fixture))
	builders := map[string]func(a []string) string{
		"questTitle":            func(a []string) string { return QuestTitle(a[0]) },
		"questJournal":          func(a []string) string { return QuestJournal(a[0], a[1]) },
		"questStageTracker":     func(a []string) string { return QuestStageTracker(a[0], a[1]) },
		"questObjectiveTracker": func(a []string) string { return QuestObjectiveTracker(a[0], a[1], a[2], a[3]) },
		"mobName":               func(a []string) string { return MobName(a[0]) },
		"skillName":             func(a []string) string { return SkillName(a[0]) },
		"skillDescription":      func(a []string) string { return SkillDescription(a[0]) },
		"regionTitle":           func(a []string) string { return RegionTitle(a[0]) },
		"regionSubtitle":        func(a []string) string { return RegionSubtitle(a[0]) },
		"zoneName":              func(a []string) string { return ZoneName(a[0]) },
		"conversation":          func(a []string) string { return Conversation(a[0], a[1]) },
		"stock":                 func(a []string) string { return StockPhrase(a[0]) },
	}
	require.Len(t, fixture, len(builders), "every builder is in the fixture")
	for _, f := range fixture {
		build, ok := builders[f.Builder]
		require.True(t, ok, f.Builder)
		assert.Equal(t, f.Key, build(f.Args), f.Builder)
	}
}
