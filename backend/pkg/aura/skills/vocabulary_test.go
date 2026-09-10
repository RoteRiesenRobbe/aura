package skills

import (
	"encoding/json"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/golden"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// plan-content-editor.md §B4.2 / C0: api/skill-vocabulary.json is the content
// editor's copy of this package's authoring vocabulary, and this test is its
// only writer. §B3 is the reason it exists: a per-type field list typed into
// the editor by hand goes stale the moment an effect-types chunk lands, and
// the failure is silent (the new key simply cannot be authored). Here a new
// key, type or vocabulary word reddens `go test` until the fixture is
// regenerated, and the regenerated fixture reaches the editor with no further
// hand work.
//
// ⚑ The complement rule: api/shared-constants.json already carries
// effectTypes, selectors, gateKeys and statNames (they ride the wire and the
// client restates them, so they are a two-sided contract). No list lives in
// both files; TestVocabulary_ComplementsSharedConstants enforces that, and the
// editor merges the two at read time.
//
// Not loaded by the game: the file sits at api/ root, and cp-defs copies
// directories only, so it needs no embed entry.
const (
	vocabularyPath      = "../../../../api/skill-vocabulary.json"
	sharedConstantsPath = "../../../../api/shared-constants.json"
	vocabularyUpdateEnv = "UPDATE_SKILL_VOCABULARY"
)

const vocabularyComment = "GENERATED FILE, do not hand-edit: written by " +
	"`UPDATE_SKILL_VOCABULARY=1 go test -count=1 ./pkg/aura/skills/` " +
	"(backend/pkg/aura/skills/vocabulary_test.go), which is its single writer. " +
	"Go owns this vocabulary, so the Go tables are the source and this file is the copy. " +
	"Complement rule: everything here is what api/shared-constants.json does NOT carry - " +
	"effectTypes, selectors, gateKeys and statNames live there and no list appears in both; " +
	"a reader merges the two. Read by tools/content-editor (server.mjs + smoke.mjs) to " +
	"render the skill form from Go's own key table (plan-content-editor.md B3/B4.2). " +
	"Not loaded by the game: no cp-defs, no embed entry."

// skillVocabulary is a struct rather than a map so the generated file keeps a
// readable order; a map would sort every key alphabetically.
type skillVocabulary struct {
	Comment        string              `json:"_comment"`
	Categories     []string            `json:"categories"`
	TopLevelKeys   []string            `json:"topLevelKeys"`
	EffectKeys     map[string][]string `json:"effectKeys"`
	CostKeys       []string            `json:"costKeys"`
	RenamedKeys    map[string]string   `json:"renamedKeys"`
	FactionScoped  []string            `json:"factionScoped"`
	DamageTypes    []string            `json:"damageTypes"`
	ResistWildcard string              `json:"resistWildcard"`
}

// topLevelKeys reflects skillDefinition's json tags in struct order: the 15
// keys the editor is allowed to write. The loader parses skill JSON WITHOUT
// DisallowUnknownFields (definition.go, factionScopedEffects' comment), so a
// typo'd top-level key vanishes in silence; a form that only ever writes these
// closes that door for tool-authored files (§B10 L10).
func topLevelKeys() []string {
	def := reflect.TypeOf(skillDefinition{})
	keys := make([]string, 0, def.NumField())
	for i := 0; i < def.NumField(); i++ {
		tag := def.Field(i).Tag.Get("json")
		name, _, _ := strings.Cut(tag, ",")
		if name == "" || name == "-" {
			continue
		}
		keys = append(keys, name)
	}
	return keys
}

func sortedKeys[V any](m map[string]V) []string {
	keys := mapKeys(m)
	slices.Sort(keys)
	return keys
}

func buildSkillVocabulary(t *testing.T) skillVocabulary {
	t.Helper()

	// Keyed by NAME, not by EffectType: the enum marshals to an integer as a
	// map key, and effectTypeNames (catalog.go) is the one reverse map.
	keysByType := make(map[string][]string, len(effectTypeMap))
	for name, effectType := range effectTypeMap {
		keys, ok := effectKeys[effectType]
		require.True(t, ok, "effect type %q has no effectKeys entry - parsing it would refuse every payload key", name)
		if keys == nil {
			keys = []string{}
		}
		// Deliberately NOT sorted: mergeKeys order is shared-groups-then-payload,
		// and the editor's form renders its field groups from it.
		keysByType[name] = keys
	}

	factionScoped := make([]string, 0, len(factionScopedEffects))
	for effectType, required := range factionScopedEffects {
		if !required {
			continue
		}
		name, ok := effectTypeNames[effectType]
		require.True(t, ok, "factionScopedEffects names an effect type with no JSON name")
		factionScoped = append(factionScoped, name)
	}
	slices.Sort(factionScoped)

	return skillVocabulary{
		Comment:        vocabularyComment,
		Categories:     sortedKeys(skillCategoryMap),
		TopLevelKeys:   topLevelKeys(),
		EffectKeys:     keysByType,
		CostKeys:       keysCost,
		RenamedKeys:    renamedEffectKeys,
		FactionScoped:  factionScoped,
		DamageTypes:    sortedKeys(DamageTypes),
		ResistWildcard: ResistWildcard,
	}
}

func TestVocabulary_FixtureMatchesTheLiveTables(t *testing.T) {
	golden.Check(t, vocabularyPath, vocabularyUpdateEnv, buildSkillVocabulary(t))
}

// The complement rule, asserted from the files themselves rather than from the
// Go tables: a list that drifted into both places would have two writers and
// one of them would go stale unnoticed. The second half pins that the two
// files describe the SAME universe of effect types.
func TestVocabulary_ComplementsSharedConstants(t *testing.T) {
	vocabulary := readTopLevel(t, vocabularyPath)
	shared := readTopLevel(t, sharedConstantsPath)

	for key := range vocabulary {
		if strings.HasPrefix(key, "_") {
			continue
		}
		_, both := shared[key]
		assert.False(t, both,
			"%q is in BOTH api/skill-vocabulary.json and api/shared-constants.json - the complement rule gives every list exactly one home, and the editor merges the two at read time", key)
	}

	var fixtureEffectKeys map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(vocabulary["effectKeys"], &fixtureEffectKeys))
	var sharedEffectTypes []string
	require.NoError(t, json.Unmarshal(shared["effectTypes"], &sharedEffectTypes))
	assert.ElementsMatch(t, sharedEffectTypes, mapKeys(fixtureEffectKeys),
		"the two fixtures disagree on which effect types exist - effectKeys must cover exactly the effectTypes shared-constants lists")
}

func readTopLevel(t *testing.T, path string) map[string]json.RawMessage {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var out map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}
