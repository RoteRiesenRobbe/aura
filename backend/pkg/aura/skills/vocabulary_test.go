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
	Comment      string              `json:"_comment"`
	Categories   []string            `json:"categories"`
	TopLevelKeys []string            `json:"topLevelKeys"`
	EffectKeys   map[string][]string `json:"effectKeys"`
	// EffectCategories is the C3 rider (PO 2026-09-12): which skill categories
	// may author each effect type. It carries the loader's third refusal to the
	// editor so the type picker can filter by the skill's category instead of
	// offering all 34 flat and alphabetical, which is how a stat_multiplier
	// reached an active aura and did nothing.
	EffectCategories map[string][]string `json:"effectCategories"`
	CostKeys         []string            `json:"costKeys"`
	RenamedKeys      map[string]string   `json:"renamedKeys"`
	FactionScoped    []string            `json:"factionScoped"`
	DamageTypes      []string            `json:"damageTypes"`
	ResistWildcard   string              `json:"resistWildcard"`
	// The `visual` vocabulary (plan-skill-vfx.md C0). Six lists, the same
	// generated-not-typed rule as effectKeys: the seven kinds are engine code,
	// so a kind, a trigger or a tunable added in Go reaches the editor and its
	// smoke script without anybody retyping it, and a stale copy is impossible.
	VisualKinds          []string            `json:"visualKinds"`
	VisualTriggers       []string            `json:"visualTriggers"`
	VisualKeys           map[string][]string `json:"visualKeys"`
	VisualTriggersByKind map[string][]string `json:"visualTriggersByKind"`
	// VisualCurves is keyed by KIND (C2a): an impact and a beam read the same
	// `curve` key from different sets, so one flat list would let the editor
	// offer a beam envelope on an impact and the loader would refuse it.
	VisualCurves  map[string][]string `json:"visualCurves"`
	VisualMotions []string            `json:"visualMotions"`
	// The three rules the editor's layer builder needs to offer only what
	// loads (plan-skill-vfx.md §12f.5 C3b, piece A): which moments each skill
	// category may author (D2), the `count` ceiling per kind, and the effect
	// types an `applied` layer needs one of. Go keeps owning them; the picker
	// only reads them, and the seam refuses whatever a stale state slips past.
	VisualTriggersByCategory map[string][]string `json:"visualTriggersByCategory"`
	VisualCountMaxByKind     map[string]int      `json:"visualCountMaxByKind"`
	VisualAppliedEffectTypes []string            `json:"visualAppliedEffectTypes"`
}

// topLevelKeys reflects skillDefinition's json tags in struct order: the 16
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

	categoriesByType := make(map[string][]string, len(effectTypeMap))
	for name, effectType := range effectTypeMap {
		legal := legalCategoryNames(effectType)
		require.NotEmpty(t, legal, "effect type %q has no effectCategories entry - the editor would offer it on every category", name)
		categoriesByType[name] = legal
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

	// The visual tables must describe the same seven kinds from every side, or
	// the editor would offer a kind it cannot render keys for (or refuse one
	// the loader accepts) and the drift would be silent in both directions.
	for _, kind := range visualKinds {
		_, hasKeys := visualKeysByKind[kind]
		require.True(t, hasKeys, "visual kind %q has no visualKeysByKind entry - the editor could author nothing on it", kind)
		triggers, hasTriggers := visualTriggersByKind[kind]
		require.True(t, hasTriggers, "visual kind %q has no visualTriggersByKind entry - it could be authored at no moment at all", kind)
		for _, on := range triggers {
			require.Contains(t, visualTriggers, on, "visual kind %q names trigger %q, which is not one of the triggers", kind, on)
		}
	}
	require.ElementsMatch(t, visualKinds, mapKeys(visualKeysByKind), "visualKeysByKind must name exactly the kinds")
	require.ElementsMatch(t, visualKinds, mapKeys(visualTriggersByKind), "visualTriggersByKind must name exactly the kinds")

	// The curve table is keyed by kind and is deliberately PARTIAL (only the
	// kinds that read `curve`), so the pin is against the key table rather
	// than against the kind list: a curve row nothing can author and a kind
	// reading `curve` with no set are both silent in the editor.
	for _, kind := range visualKinds {
		readsCurve := slices.Contains(visualKeysByKind[kind], "curve")
		_, hasCurves := visualCurvesByKind[kind]
		require.Equal(t, readsCurve, hasCurves,
			"visual kind %q reads curve=%v but has a visualCurvesByKind row=%v", kind, readsCurve, hasCurves)
	}
	for kind := range visualCurvesByKind {
		require.Contains(t, visualKinds, kind, "visualCurvesByKind names %q, which is not a visual kind", kind)
	}

	// The builder's three rules (C3b). Every category needs a moment row (or
	// the editor could author no look on it), every moment named is a real
	// trigger, a count ceiling only makes sense on a kind that reads `count`,
	// and every applied type must be a named effect type.
	require.ElementsMatch(t, sortedKeys(skillCategoryMap), mapKeys(visualTriggersByCategory),
		"visualTriggersByCategory must name exactly the skill categories")
	for category, moments := range visualTriggersByCategory {
		require.NotEmpty(t, moments, "skill category %q has an empty visualTriggersByCategory row", category)
		for _, on := range moments {
			require.Contains(t, visualTriggers, on, "visualTriggersByCategory.%s names %q, which is not one of the triggers", category, on)
		}
	}
	for kind, ceiling := range visualCountMaxByKind {
		require.Contains(t, visualKinds, kind, "visualCountMaxByKind names %q, which is not a visual kind", kind)
		require.True(t, slices.Contains(visualKeysByKind[kind], "count"),
			"visualCountMaxByKind caps kind %q, which does not read count", kind)
		require.GreaterOrEqual(t, ceiling, 1, "visualCountMaxByKind.%s is below the count floor of 1", kind)
	}
	appliedTypes := make([]string, 0, len(overTimeEffectTypes))
	for _, effectType := range overTimeEffectTypes {
		name, ok := effectTypeNames[effectType]
		require.True(t, ok, "overTimeEffectTypes names an effect type with no JSON name")
		_, known := effectTypeMap[name]
		require.True(t, known, "over-time effect type %q is not a fixture effect type", name)
		appliedTypes = append(appliedTypes, name)
	}
	slices.Sort(appliedTypes)

	return skillVocabulary{
		Comment:          vocabularyComment,
		Categories:       sortedKeys(skillCategoryMap),
		TopLevelKeys:     topLevelKeys(),
		EffectKeys:       keysByType,
		EffectCategories: categoriesByType,
		CostKeys:         keysCost,
		RenamedKeys:      renamedEffectKeys,
		FactionScoped:    factionScoped,
		DamageTypes:      sortedKeys(DamageTypes),
		ResistWildcard:   ResistWildcard,
		// Deliberately NOT sorted, like effectKeys: the LIST order is §4.1's
		// and the per-kind key order is common-then-payload, which is the
		// order the editor's form will draw. (The two maps still marshal
		// alphabetically, as effectKeys does; only their values keep order.)
		VisualKinds:          visualKinds,
		VisualTriggers:       visualTriggers,
		VisualKeys:           visualKeysByKind,
		VisualTriggersByKind: visualTriggersByKind,
		VisualCurves:         visualCurvesByKind,
		VisualMotions:        visualMotions,
		// Map values keep Go's order (ambient, fired, hit, applied); the
		// applied list is sorted because it is a set, not a sequence.
		VisualTriggersByCategory: visualTriggersByCategory,
		VisualCountMaxByKind:     visualCountMaxByKind,
		VisualAppliedEffectTypes: appliedTypes,
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

	// The same universe once more for the category table: a type the editor can
	// render but not place would fall back to "offer it everywhere", which is
	// the flat picker the rider exists to end.
	var fixtureEffectCategories map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(vocabulary["effectCategories"], &fixtureEffectCategories))
	assert.ElementsMatch(t, sharedEffectTypes, mapKeys(fixtureEffectCategories),
		"effectCategories must cover exactly the effect types shared-constants lists")
}

func readTopLevel(t *testing.T, path string) map[string]json.RawMessage {
	t.Helper()
	raw, err := os.ReadFile(path)
	require.NoError(t, err)
	var out map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}
