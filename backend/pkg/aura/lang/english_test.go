package lang

import (
	"encoding/json"
	"io/fs"
	"testing"
	"testing/fstest"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-localization.md C5a (D27): the content JSON keeps structure and ids,
// its English lives in api/lang/en/, and the loaders read the two joined.

func hydrated(t *testing.T, domain Domain, file string, en map[string]string) map[string]any {
	t.Helper()
	out, err := Hydrate(domain, []byte(file), en)
	require.NoError(t, err)
	var v map[string]any
	require.NoError(t, json.Unmarshal(out, &v))
	return v
}

func TestHydrate_FillsEveryQuestTextField(t *testing.T) {
	en := map[string]string{
		"quest_wolves_on_the_road_title":                         "Wolves on the Road",
		"quest_wolves_on_the_road_cull_journal":                  "Kill the wolves.",
		"quest_wolves_on_the_road_cull_tracker":                  "{n, number}/{m, number} wolves slain",
		"quest_wolves_on_the_road_report_journal":                "Report back.",
		"quest_wolves_on_the_road_report_talk_to_Farmer_tracker": "Talk to the Farmer",
	}
	q := hydrated(t, DomainQuest, `{"id": "wolves-on-the-road", "level": 3, "stages": [
		{"id": "cull", "objectives": [{"kind": "kill", "species": "Wolf", "count": 8}], "next": "report"},
		{"id": "report", "objectives": [{"kind": "talk_to", "npc": "Farmer"}], "next": "cull"}]}`, en)
	assert.Equal(t, "Wolves on the Road", q["title"])
	stages := q["stages"].([]any)
	cull := stages[0].(map[string]any)
	assert.Equal(t, "Kill the wolves.", cull["journal"])
	assert.Equal(t, "{n}/{m} wolves slain", cull["tracker"], "a tracker reaches the quest loader in its authored {n}/{m} form")
	report := stages[1].(map[string]any)
	_, hasTracker := report["tracker"]
	assert.False(t, hasTracker, "an optional field without English stays absent")
	talk := report["objectives"].([]any)[0].(map[string]any)
	assert.Equal(t, "Talk to the Farmer", talk["tracker"])
	assert.Equal(t, float64(3), q["level"], "numbers survive")
}

func TestHydrate_FillsDialogueAndCarriesTheFullKeyAsTheID(t *testing.T) {
	en := map[string]string{
		"mob_Farmer_name":               "Farmer",
		"conv_Farmer_i_work_this_field": "I work this field.",
		"conv_Farmer_about_the_boars":   "About the boars...",
		"conv_Farmer_good_hunting":      "Good hunting.",
		"conv_Farmer_shoo":              "Shoo!",
		"stock_ask_task":                "Do you have a task for me?",
		"stock_good":                    "Good.",
	}
	m := hydrated(t, DomainMob, `{"name": "Farmer", "interaction": {
		"ambient": [{"id": "shoo"}],
		"nodes": [{"id": "root",
			"lines": [{"id": "i_work_this_field"}, {"stock": "good"}],
			"options": [
				{"stock": "ask_task", "next": "root"},
				{"id": "about_the_boars", "grants": [{"id": "good_hunting", "kind": "offer_quest", "quest": "q"}, {"kind": "grant_xp", "xp": 5}]},
				{"next": "root"}]}]}}`, en)
	assert.Equal(t, "Farmer", m["displayName"])
	inter := m["interaction"].(map[string]any)
	assert.Equal(t, []any{map[string]any{"id": "conv_Farmer_shoo", "text": "Shoo!"}}, inter["ambient"])
	node := inter["nodes"].([]any)[0].(map[string]any)
	assert.Equal(t, []any{
		map[string]any{"id": "conv_Farmer_i_work_this_field", "text": "I work this field."},
		map[string]any{"id": "stock_good", "text": "Good."},
	}, node["lines"])
	opts := node["options"].([]any)
	stock := opts[0].(map[string]any)
	assert.Equal(t, "stock_ask_task", stock["id"])
	assert.Equal(t, "Do you have a task for me?", stock["text"])
	_, hasStock := stock["stock"]
	assert.False(t, hasStock, "the loader sees an id, never the stock reference")
	own := opts[1].(map[string]any)
	assert.Equal(t, "About the boars...", own["text"])
	grants := own["grants"].([]any)
	assert.Equal(t, "Good hunting.", grants[0].(map[string]any)["line"])
	assert.Equal(t, "conv_Farmer_good_hunting", grants[0].(map[string]any)["id"])
	_, followerLine := grants[1].(map[string]any)["line"]
	assert.False(t, followerLine, "a bundle's follower grant is never spoken and carries no line")
	_, plainText := opts[2].(map[string]any)["text"]
	assert.False(t, plainText, "a row with no id has no authored text (a teach row is labelled by its skill)")
}

func TestHydrate_SkillsAndRegions(t *testing.T) {
	en := map[string]string{
		"skill_LongRangeStrike_name":        "Long-Range Strike",
		"skill_LongRangeStrike_description": "Hits far.",
		"skill_Heal_name":                   "Heal",
		"region_saltgrass_title":            "Saltgrass Strand",
		"region_saltgrass_subtitle":         "Sea and Salt",
		"region_farmlands_title":            "Farmlands",
	}
	s := hydrated(t, DomainSkill, `{"id": 1, "name": "LongRangeStrike"}`, en)
	assert.Equal(t, "Long-Range Strike", s["displayName"])
	assert.Equal(t, "Hits far.", s["description"])
	h := hydrated(t, DomainSkill, `{"id": 2, "name": "Heal"}`, en)
	_, hasDescription := h["description"]
	assert.False(t, hasDescription)
	r := hydrated(t, DomainRegions, `{"regions": [{"id": "saltgrass"}, {"id": "farmlands"}]}`, en)
	list := r["regions"].([]any)
	assert.Equal(t, map[string]any{"id": "saltgrass", "title": "Saltgrass Strand", "subtitle": "Sea and Salt"}, list[0])
	assert.Equal(t, map[string]any{"id": "farmlands", "title": "Farmlands"}, list[1])
}

func TestHydrate_RefusesInlineEnglishAndMissingEnglish(t *testing.T) {
	en := map[string]string{"quest_q_title": "Q", "mob_Farmer_name": "Farmer"}
	for name, c := range map[string]struct {
		domain Domain
		file   string
		want   []string
	}{
		"inline title":         {DomainQuest, `{"id": "q", "title": "Q", "stages": []}`, []string{"inline English", "title", "extract-english"}},
		"missing journal":      {DomainQuest, `{"id": "q", "stages": [{"id": "s"}]}`, []string{"no English", "quest_q_s_journal"}},
		"inline line":          {DomainMob, `{"name": "Farmer", "interaction": {"nodes": [{"id": "root", "lines": [{"id": "x", "text": "Hi"}]}]}}`, []string{"inline English", "root"}},
		"bare string line":     {DomainMob, `{"name": "Farmer", "interaction": {"nodes": [{"id": "root", "lines": ["Hi"]}]}}`, []string{"inline English"}},
		"line without English": {DomainMob, `{"name": "Farmer", "interaction": {"nodes": [{"id": "root", "lines": [{"id": "hello"}]}]}}`, []string{"no English", "conv_Farmer_hello"}},
		"unknown stock":        {DomainMob, `{"name": "Farmer", "interaction": {"nodes": [{"id": "root", "lines": [{"stock": "nope"}]}]}}`, []string{"no English", "stock_nope"}},
		"id and stock":         {DomainMob, `{"name": "Farmer", "interaction": {"nodes": [{"id": "root", "options": [{"id": "a", "stock": "b"}]}]}}`, []string{"both"}},
		"mob without a name":   {DomainMob, `{"name": "Wolf"}`, []string{"no English", "mob_Wolf_name"}},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := Hydrate(c.domain, []byte(c.file), en)
			require.Error(t, err)
			for _, w := range c.want {
				assert.Contains(t, err.Error(), w)
			}
		})
	}
}

func TestHydrate_LeavesUnparsableJSONToItsLoader(t *testing.T) {
	// The loader's own decoder reports the syntax error with its offset.
	out, err := Hydrate(DomainQuest, []byte(`{"id": `), nil)
	require.NoError(t, err)
	assert.Equal(t, `{"id": `, string(out))
}

func TestEnglishFS_HydratesJSONOnReadAndPassesTheRestThrough(t *testing.T) {
	content := fstest.MapFS{
		"wolves.json": {Data: []byte(`{"id": "wolves", "stages": [{"id": "cull"}]}`)},
		"README.md":   {Data: []byte("notes")},
		"sub/x.json":  {Data: []byte(`{"id": "x", "stages": []}`)},
	}
	langFS := fstest.MapFS{"en/quests.arb": {Data: []byte(`{"@@locale": "en",
		"quest_wolves_title": "Wolves", "quest_wolves_cull_journal": "Cull.", "quest_x_title": "X"}`)}}
	fsys := EnglishFS(content, DomainQuest, EnglishFrom(langFS))
	raw, err := fs.ReadFile(fsys, "wolves.json")
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"title":"Wolves"`)
	readme, err := fs.ReadFile(fsys, "README.md")
	require.NoError(t, err)
	assert.Equal(t, "notes", string(readme))
	var walked []string
	require.NoError(t, fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if !d.IsDir() {
			walked = append(walked, p)
		}
		return err
	}))
	assert.ElementsMatch(t, []string{"wolves.json", "README.md", "sub/x.json"}, walked)
	sub, err := fs.Sub(fsys, "sub")
	require.NoError(t, err)
	x, err := fs.ReadFile(sub, "x.json")
	require.NoError(t, err)
	assert.Contains(t, string(x), `"title":"X"`, "fs.Sub keeps hydrating")
}
