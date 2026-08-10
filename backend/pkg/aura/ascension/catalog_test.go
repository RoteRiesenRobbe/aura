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

	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
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

	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.NoError(t, err)
	assert.Empty(t, catalog.All())
}

func TestCatalogFromFS_UnknownSkillIsABootError(t *testing.T) {
	fsys := fstest.MapFS{"ghost.json": {Data: []byte(`{"unlockKey":"NoSuchSkill"}`)}}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "NoSuchSkill")
}

func TestCatalogFromFS_MissingUnlockKeyIsABootError(t *testing.T) {
	fsys := fstest.MapFS{"nameless.json": {Data: []byte(`{"conditions":[]}`)}}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
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

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Paralyze")
}

// D13 cut prices and scoring. Authoring one must hard-fail rather than sit in
// the file looking honoured — the same reason every other content loader sets
// DisallowUnknownFields.
func TestCatalogFromFS_RejectsUnknownField(t *testing.T) {
	fsys := fstest.MapFS{"priced.json": {Data: []byte(`{"unlockKey":"Paralyze","price":3}`)}}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
}

// D18: the gate is a list of conditions in the SHIPPED mobs vocabulary, ANDed.
func TestCatalogFromFS_ParsesConditions(t *testing.T) {
	fsys := fstest.MapFS{
		"gated.json": {Data: []byte(`{"unlockKey":"Paralyze","conditions":[{"kind":"minLevel","value":30}]}`)},
	}

	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
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

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "steps_walked")
}

// The shared vocabulary is genuinely shared: quest_at_stage's own validation
// applies here without being re-implemented.
func TestCatalogFromFS_QuestConditionNeedsItsPayload(t *testing.T) {
	fsys := fstest.MapFS{
		"gated.json": {Data: []byte(`{"unlockKey":"Paralyze","conditions":[{"kind":"quest_at_stage"}]}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
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
	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.NoError(t, err)

	assert.Len(t, catalog.Remaining(nil), 1)
}

func catalogOf(t *testing.T, keys ...string) Catalog {
	t.Helper()
	fsys := fstest.MapFS{}
	for _, k := range keys {
		fsys[k+".json"] = &fstest.MapFile{Data: []byte(fmt.Sprintf(`{"unlockKey":%q}`, k))}
	}
	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.NoError(t, err)
	return catalog
}

// ⭐ The catalog is ADDRESSED ON THE WIRE (plan-ascension.md §12.4 C2a step 3):
// a generated row carries its position in All() as a `ubyte` OptionIndex, and
// index 254 is reserved for D14's empty-pick "Ascend" row. So a 255th entry
// would alias index 254 and hand a player the wrong reward, silently, for the
// one row nobody tested. Boot is where that has to be refused.
func TestCatalogFromFS_RefusesMoreEntriesThanTheWireCanAddress(t *testing.T) {
	files := fstest.MapFS{}
	stub := stubSkills{}
	for i := 0; i <= MaxEntries; i++ { // one too many
		name := fmt.Sprintf("Reward%03d", i)
		stub[name] = &skills.SkillDefinition{ID: skills.SkillID(500 + i), Name: name, MaxLevel: 1}
		files[fmt.Sprintf("%s.json", name)] = &fstest.MapFile{
			Data: []byte(fmt.Sprintf(`{"unlockKey": %q}`, name)),
		}
	}

	_, err := CatalogFromFS(files, stub, allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "254", "the refusal names the reserved index")
}

func TestCatalogFromFS_AcceptsExactlyTheAddressableMaximum(t *testing.T) {
	files := fstest.MapFS{}
	stub := stubSkills{}
	for i := 0; i < MaxEntries; i++ {
		name := fmt.Sprintf("Reward%03d", i)
		stub[name] = &skills.SkillDefinition{ID: skills.SkillID(500 + i), Name: name, MaxLevel: 1}
		files[fmt.Sprintf("%s.json", name)] = &fstest.MapFile{
			Data: []byte(fmt.Sprintf(`{"unlockKey": %q}`, name)),
		}
	}

	c, err := CatalogFromFS(files, stub, allGates())
	require.NoError(t, err)
	assert.Len(t, c.All(), MaxEntries)
}

// --- gate cross-validation (plan-ascension.md §13 step 2, finding 2) ---

// stubGates is the narrow gate half: a species table and a quest table, both
// explicit, so a test that resolves something says which content it resolved
// against.
type stubGates struct {
	species map[string]mobs.MobID
	stages  map[string][]string
}

func (g stubGates) ResolveSpecies(name string) (mobs.MobID, error) {
	if id, ok := g.species[name]; ok {
		return id, nil
	}
	return 0, fmt.Errorf("mob %q not found", name)
}

func (g stubGates) CheckQuestStage(questID, stage string) error {
	stages, ok := g.stages[questID]
	if !ok {
		return fmt.Errorf("quest_at_stage names quest %q, which no quest file defines", questID)
	}
	switch stage {
	case mobs.QuestStageNotStarted, mobs.QuestStageCompleted:
		return nil
	}
	for _, s := range stages {
		if s == stage {
			return nil
		}
	}
	return fmt.Errorf("quest_at_stage names stage %q, which quest %q does not define", stage, questID)
}

func allGates() stubGates {
	return stubGates{
		species: map[string]mobs.MobID{"DireWolf": 12},
		stages:  map[string][]string{"the-lost-lamp": {"searching"}},
	}
}

// ⭐ The directed hunt resolves at LOAD, which is the whole of finding 2's fix:
// the catalog is the ONE surface whose conditions nothing checked, because
// quests.CrossValidate walks mob nodes and stops there.
func TestCatalogFromFS_ResolvesAHuntGatesSpecies(t *testing.T) {
	fsys := fstest.MapFS{
		"hunt.json": {Data: []byte(
			`{"unlockKey":"Paralyze","conditions":[{"kind":"kills_this_life","species":"DireWolf","value":20}]}`)},
	}

	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.NoError(t, err)
	require.Len(t, catalog.All(), 1)

	cond := catalog.All()[0].Conditions[0]
	assert.Equal(t, mobs.ConditionKillsThisLife, cond.Kind)
	assert.Equal(t, "DireWolf", cond.Species)
	assert.Equal(t, mobs.MobID(12), cond.SpeciesID,
		"an unresolved species makes the entry permanently unpickable")
}

// ⛑ THE FAILURE THIS WHOLE STEP EXISTS FOR. Before it, a typo'd species parsed
// green and conditionsPass answered false forever: the entry rendered locked,
// unpickable, and indistinguishable from a gate that is merely hard.
func TestCatalogFromFS_UnknownHuntSpeciesIsABootError(t *testing.T) {
	fsys := fstest.MapFS{
		"hunt.json": {Data: []byte(
			`{"unlockKey":"Paralyze","conditions":[{"kind":"kills_this_life","species":"DireWulf","value":20}]}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "DireWulf", "the error names the typo")
	assert.Contains(t, err.Error(), "hunt.json", "and the file that made it")
}

// The same hole on the quest half, and this one is the gate C3 actually authors
// (P8: the third mechanism reuses the SHIPPED vocabulary rather than a new kind).
func TestCatalogFromFS_UnknownQuestIsABootError(t *testing.T) {
	fsys := fstest.MapFS{
		"lamp.json": {Data: []byte(
			`{"unlockKey":"Paralyze","conditions":[{"kind":"quest_at_stage","quest":"the-lost-lantern","stage":"completed"}]}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "the-lost-lantern")
}

func TestCatalogFromFS_UnknownQuestStageIsABootError(t *testing.T) {
	fsys := fstest.MapFS{
		"lamp.json": {Data: []byte(
			`{"unlockKey":"Paralyze","conditions":[{"kind":"quest_at_stage","quest":"the-lost-lamp","stage":"nosuchstage"}]}`)},
	}

	_, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "nosuchstage")
}

// ⭐ P8 PROVEN AT THE LOADER: C3's third gated entry is the shipped
// quest_at_stage plus the `completed` sentinel, NOT a new `quest_completed`
// kind. If this ever needed a new kind, D18's "the shipped vocabulary is
// genuinely reused" claim was false.
func TestCatalogFromFS_TheCompletedSentinelIsAValidGate(t *testing.T) {
	fsys := fstest.MapFS{
		"lamp.json": {Data: []byte(
			`{"unlockKey":"Paralyze","conditions":[{"kind":"quest_at_stage","quest":"the-lost-lamp","stage":"completed"}]}`)},
	}

	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.NoError(t, err)
	require.Len(t, catalog.All(), 1)
	assert.True(t, catalog.All()[0].Gated())
}

// ⚑ `_comment` is the house convention in EVERY other content directory
// (mobs, skills, quests, factions all parse and discard it), and this loader was
// the one that would have refused it: DisallowUnknownFields plus a struct
// without the field means an author following the repo's own style gets a boot
// failure reading `unknown field "_comment"`. Authoring rationale belongs beside
// the data here as much as anywhere else, and this catalog's entries carry the
// D1 parity argument for the reward they name.
func TestCatalogFromFS_AcceptsTheHouseCommentConvention(t *testing.T) {
	fsys := fstest.MapFS{
		"paralyze.json": {Data: []byte(`{"_comment":"why this reward exists","unlockKey":"Paralyze"}`)},
	}

	catalog, err := CatalogFromFS(fsys, allSkills(), allGates())
	require.NoError(t, err)
	require.Len(t, catalog.All(), 1)
	assert.Equal(t, "Paralyze", catalog.All()[0].UnlockKey)
}
