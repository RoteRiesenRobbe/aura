package ascension

import (
	"fmt"
	"testing"
	"testing/fstest"

	"github.com/RoteRiesenRobbe/aura/pkg/aura/items/mobs"
	"github.com/RoteRiesenRobbe/aura/pkg/aura/skills"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var (
	defFrostShield = &skills.SkillDefinition{ID: 137, Name: "FrostShield", Category: skills.SkillCategoryPassive, MaxLevel: 5}
	defParalyze    = &skills.SkillDefinition{ID: 140, Name: "Paralyze", Category: skills.SkillCategoryCooldown, MaxLevel: 5}
)

// stubSkills is the narrow resolver half of skills.Registry, so a catalog test
// needs no skill JSON.
type stubSkills map[string]*skills.SkillDefinition

func (s stubSkills) GetByName(name string) (*skills.SkillDefinition, error) {
	if d, ok := s[name]; ok {
		return d, nil
	}
	return nil, fmt.Errorf("skill %q not found", name)
}

func allSkills() stubSkills {
	return stubSkills{defFrostShield.Name: defFrostShield, defParalyze.Name: defParalyze}
}

func TestCatalogFromFS_LoadsEntriesAndResolvesSkills(t *testing.T) {
	fsys := fstest.MapFS{
		"frost-shield.json": {Data: []byte(`{"unlockKey":"FrostShield"}`)},
		"paralyze.json":     {Data: []byte(`{"unlockKey":"Paralyze"}`)},
	}

	catalog, err := CatalogFromFS(fsys, allSkills())
	require.NoError(t, err)
	require.Len(t, catalog.All(), 2)

	byKey := map[string]Entry{}
	for _, e := range catalog.All() {
		byKey[e.UnlockKey] = e
	}
	require.Contains(t, byKey, "FrostShield")
	assert.Equal(t, defFrostShield, byKey["FrostShield"].Skill)
	assert.Empty(t, byKey["FrostShield"].Conditions)
}

// The C1 state of api/ascension/ is README-only: entries arrive in C3. An empty
// catalog is a legal world, not a boot failure — and D14 says an exhausted
// catalog still ascends, so "no entries" can never be an error here.
func TestCatalogFromFS_EmptyDirectoryLoadsCleanly(t *testing.T) {
	fsys := fstest.MapFS{"README.md": {Data: []byte("# ascension rewards")}}

	catalog, err := CatalogFromFS(fsys, allSkills())
	require.NoError(t, err)
	assert.Empty(t, catalog.All())
}

func TestCatalogFromFS_UnknownSkillIsABootError(t *testing.T) {
	fsys := fstest.MapFS{"ghost.json": {Data: []byte(`{"unlockKey":"NoSuchSkill"}`)}}

	_, err := CatalogFromFS(fsys, allSkills())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "NoSuchSkill")
}

func TestCatalogFromFS_MissingUnlockKeyIsABootError(t *testing.T) {
	fsys := fstest.MapFS{"nameless.json": {Data: []byte(`{"conditions":[]}`)}}

	_, err := CatalogFromFS(fsys, allSkills())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unlockKey")
}

// Two entries naming one skill would put two rows in front of a player that
// spend the same bloodline_unlocks primary key — the second is unpickable
// forever, silently.
func TestCatalogFromFS_DuplicateUnlockKeyIsABootError(t *testing.T) {
	fsys := fstest.MapFS{
		"a.json": {Data: []byte(`{"unlockKey":"Paralyze"}`)},
		"b.json": {Data: []byte(`{"unlockKey":"Paralyze"}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Paralyze")
}

// D13 cut prices and scoring. Authoring one must hard-fail rather than sit in
// the file looking honoured — the same reason every other content loader sets
// DisallowUnknownFields.
func TestCatalogFromFS_RejectsUnknownField(t *testing.T) {
	fsys := fstest.MapFS{"priced.json": {Data: []byte(`{"unlockKey":"Paralyze","price":3}`)}}

	_, err := CatalogFromFS(fsys, allSkills())
	require.Error(t, err)
}

// D18: the gate is a list of conditions in the SHIPPED mobs vocabulary, ANDed.
func TestCatalogFromFS_ParsesConditions(t *testing.T) {
	fsys := fstest.MapFS{
		"gated.json": {Data: []byte(`{"unlockKey":"Paralyze","conditions":[{"kind":"minLevel","value":30}]}`)},
	}

	catalog, err := CatalogFromFS(fsys, allSkills())
	require.NoError(t, err)
	require.Len(t, catalog.All(), 1)
	require.Len(t, catalog.All()[0].Conditions, 1)
	assert.Equal(t, mobs.ConditionMinLevel, catalog.All()[0].Conditions[0].Kind)
	assert.Equal(t, 30, catalog.All()[0].Conditions[0].Value)
}

// Refused at boot following conditionKinds' existing discipline: conditionsPass
// fails CLOSED, so a kind nothing evaluates is a permanently locked row.
func TestCatalogFromFS_UnknownConditionKindIsABootError(t *testing.T) {
	fsys := fstest.MapFS{
		"gated.json": {Data: []byte(`{"unlockKey":"Paralyze","conditions":[{"kind":"steps_walked","value":10}]}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "steps_walked")
}

// The shared vocabulary is genuinely shared: quest_at_stage's own validation
// applies here without being re-implemented.
func TestCatalogFromFS_QuestConditionNeedsItsPayload(t *testing.T) {
	fsys := fstest.MapFS{
		"gated.json": {Data: []byte(`{"unlockKey":"Paralyze","conditions":[{"kind":"quest_at_stage"}]}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "quest_at_stage")
}

// Remaining is "what can this bloodline still learn" — the catalog minus the
// rows already in game.bloodline_unlocks (P4: a taken entry is gone forever).
func TestRemaining_DropsTakenKeys(t *testing.T) {
	catalog := catalogOf(t, "FrostShield", "Paralyze")

	remaining := catalog.Remaining([]string{"FrostShield"})
	require.Len(t, remaining, 1)
	assert.Equal(t, "Paralyze", remaining[0].UnlockKey)
}

func TestRemaining_NoneTakenKeepsEverything(t *testing.T) {
	catalog := catalogOf(t, "FrostShield", "Paralyze")

	assert.Len(t, catalog.Remaining(nil), 2)
}

// D14: spending the catalog is a legal end state, not an error.
func TestRemaining_EverythingTakenIsEmptyNotAnError(t *testing.T) {
	catalog := catalogOf(t, "FrostShield", "Paralyze")

	assert.Empty(t, catalog.Remaining([]string{"Paralyze", "FrostShield"}))
}

// An unlock_key that no longer matches any entry (a retired reward) must not
// drop a live entry with it.
func TestRemaining_IgnoresUnknownTakenKeys(t *testing.T) {
	catalog := catalogOf(t, "FrostShield")

	assert.Len(t, catalog.Remaining([]string{"RetiredReward"}), 1)
}

// Gates are NOT Remaining's business — a locked entry is still unlearned, and
// C2 renders it locked. Filtering it out here would make a gated entry
// indistinguishable from an exhausted catalog (D18's tightening of D14).
func TestRemaining_KeepsGatedEntries(t *testing.T) {
	fsys := fstest.MapFS{
		"gated.json": {Data: []byte(`{"unlockKey":"Paralyze","conditions":[{"kind":"minLevel","value":30}]}`)},
	}
	catalog, err := CatalogFromFS(fsys, allSkills())
	require.NoError(t, err)

	assert.Len(t, catalog.Remaining(nil), 1)
}

func catalogOf(t *testing.T, keys ...string) Catalog {
	t.Helper()
	fsys := fstest.MapFS{}
	for _, k := range keys {
		fsys[k+".json"] = &fstest.MapFile{Data: []byte(fmt.Sprintf(`{"unlockKey":%q}`, k))}
	}
	catalog, err := CatalogFromFS(fsys, allSkills())
	require.NoError(t, err)
	return catalog
}
